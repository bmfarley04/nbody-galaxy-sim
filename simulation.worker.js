let particleCount = 0;
let positions = null;
let velocities = null;
let accelerations = null;

const MAX_CPU_NEIGHBORS = 56;
const SOFTENING = 0.12;
const CELL_SIZE = 1.6;
const GRID_RADIUS = 48;

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function universeGravityScale(count) {
    return clamp(Math.sqrt(30000 / Math.max(1, count)), 0.32, 1);
}

function cellKey(x, y, z) {
    const ix = Math.floor((x + GRID_RADIUS) / CELL_SIZE);
    const iy = Math.floor((y + GRID_RADIUS) / CELL_SIZE);
    const iz = Math.floor((z + GRID_RADIUS) / CELL_SIZE);
    return `${ix},${iy},${iz}`;
}

function addAttractorForce(index, ax, ay, az, mass, gravity) {
    if (mass <= 0) return [0, 0, 0];

    const base = index * 3;
    const dx = ax - positions[base];
    const dy = ay - positions[base + 1];
    const dz = az - positions[base + 2];
    const distSq = dx * dx + dy * dy + dz * dz + SOFTENING;
    const invDist = 1 / Math.sqrt(distSq);
    const force = gravity * mass * invDist * invDist;

    return [dx * invDist * force, dy * invDist * force, dz * invDist * force];
}

function buildGrid() {
    const grid = new Map();

    for (let i = 0; i < particleCount; i++) {
        const base = i * 3;
        const key = cellKey(positions[base], positions[base + 1], positions[base + 2]);
        let bucket = grid.get(key);

        if (!bucket) {
            bucket = [];
            grid.set(key, bucket);
        }

        bucket.push(i);
    }

    return grid;
}

function accumulateNeighborForce(index, grid, gravity, preset) {
    const base = index * 3;
    const px = positions[base];
    const py = positions[base + 1];
    const pz = positions[base + 2];
    const originKey = cellKey(px, py, pz).split(',').map(Number);
    const isUniverse = preset === 'universe';
    let fx = 0;
    let fy = 0;
    let fz = 0;
    let visits = 0;

    for (let dxCell = -1; dxCell <= 1; dxCell++) {
        for (let dyCell = -1; dyCell <= 1; dyCell++) {
            for (let dzCell = -1; dzCell <= 1; dzCell++) {
                const key = `${originKey[0] + dxCell},${originKey[1] + dyCell},${originKey[2] + dzCell}`;
                const bucket = grid.get(key);
                if (!bucket) continue;

                const stride = Math.max(1, Math.ceil(bucket.length / 12));
                const offset = index % stride;

                for (let b = offset; b < bucket.length; b += stride) {
                    const other = bucket[b];
                    if (other === index) continue;

                    const otherBase = other * 3;
                    const rx = positions[otherBase] - px;
                    const ry = positions[otherBase + 1] - py;
                    const rz = positions[otherBase + 2] - pz;
                    const distSq = rx * rx + ry * ry + rz * rz + SOFTENING;
                    const invDist = 1 / Math.sqrt(distSq);
                    const universeScale = universeGravityScale(particleCount);
                    const force = isUniverse
                        ? Math.min(5.5 + (15 - 5.5) * universeScale, gravity * universeScale * invDist * invDist)
                        : Math.min(6, gravity * 0.08 * invDist * invDist);

                    fx += rx * invDist * force;
                    fy += ry * invDist * force;
                    fz += rz * invDist * force;

                    visits++;
                    if (visits >= MAX_CPU_NEIGHBORS) return [fx, fy, fz];
                }
            }
        }
    }

    return [fx, fy, fz];
}

function stepSimulation(options) {
    const {
        deltaTime,
        gravity,
        blackHoleMass,
        preset,
        outputPositionBuffer,
        outputAccelerationBuffer
    } = options;
    const start = performance.now();
    const grid = buildGrid();

    for (let i = 0; i < particleCount; i++) {
        const base = i * 3;
        let fx = 0;
        let fy = 0;
        let fz = 0;

        if (preset === 'galaxy-collision') {
            const a = addAttractorForce(i, -3, 0, 0, blackHoleMass * 0.65, gravity);
            const b = addAttractorForce(i, 3, 5, 0, blackHoleMass * 0.65, gravity);
            fx += a[0] + b[0];
            fy += a[1] + b[1];
            fz += a[2] + b[2];
        } else if (preset !== 'universe') {
            const central = addAttractorForce(i, 0, 0, 0, blackHoleMass, gravity);
            fx += central[0];
            fy += central[1];
            fz += central[2];
        }

        const neighbor = accumulateNeighborForce(i, grid, gravity, preset);
        fx += neighbor[0];
        fy += neighbor[1];
        fz += neighbor[2];

        accelerations[base] = fx;
        accelerations[base + 1] = fy;
        accelerations[base + 2] = fz;
    }

    for (let i = 0; i < particleCount; i++) {
        const base = i * 3;
        velocities[base] += accelerations[base] * deltaTime;
        velocities[base + 1] += accelerations[base + 1] * deltaTime;
        velocities[base + 2] += accelerations[base + 2] * deltaTime;

        if (preset !== 'universe') {
            velocities[base] *= 0.9996;
            velocities[base + 1] *= 0.9996;
            velocities[base + 2] *= 0.9996;
        }

        positions[base] += velocities[base] * deltaTime;
        positions[base + 1] += velocities[base + 1] * deltaTime;
        positions[base + 2] += velocities[base + 2] * deltaTime;
    }

    const outputPositions = outputPositionBuffer
        ? new Float32Array(outputPositionBuffer)
        : new Float32Array(particleCount * 3);
    const outputAccelerations = outputAccelerationBuffer
        ? new Float32Array(outputAccelerationBuffer)
        : new Float32Array(particleCount * 3);

    outputPositions.set(positions);
    outputAccelerations.set(accelerations);

    self.postMessage({
        type: 'frame',
        positions: outputPositions.buffer,
        accelerations: outputAccelerations.buffer,
        physicsMs: performance.now() - start
    }, [outputPositions.buffer, outputAccelerations.buffer]);
}

self.onmessage = (event) => {
    const message = event.data;

    if (message.type === 'init') {
        particleCount = message.particleCount;
        positions = new Float32Array(message.positions);
        velocities = new Float32Array(message.velocities);
        accelerations = new Float32Array(particleCount * 3);
        self.postMessage({ type: 'ready' });
        return;
    }

    if (message.type === 'step' && positions && velocities) {
        stepSimulation(message);
    }
};
