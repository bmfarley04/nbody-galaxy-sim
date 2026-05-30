import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const MODES = {
    GPU: 'gpu',
    CPU: 'cpu'
};

const MODE_SETTINGS = {
    [MODES.GPU]: {
        label: 'GPU',
        defaultParticles: 500000,
        minParticles: 500000,
        maxParticles: 20000000,
        particleStep: 10000
    },
    [MODES.CPU]: {
        label: 'CPU',
        defaultParticles: 20000,
        minParticles: 1000,
        maxParticles: 80000,
        particleStep: 1000
    }
};

const PRESETS = {
    SPIRAL_GALAXY: 'spiral-galaxy',
    DISK_GALAXY: 'disk-galaxy',
    ELLIPTICAL_GALAXY: 'elliptical-galaxy',
    DOUBLE_SPIRAL_GALAXY: 'double-spiral-galaxy',
    UNIVERSE: 'universe',
    GALAXY_COLLISION: 'galaxy-collision'
};

const PRESET_INDEX = {
    [PRESETS.SPIRAL_GALAXY]: 0,
    [PRESETS.DISK_GALAXY]: 1,
    [PRESETS.ELLIPTICAL_GALAXY]: 2,
    [PRESETS.DOUBLE_SPIRAL_GALAXY]: 3,
    [PRESETS.UNIVERSE]: 4,
    [PRESETS.GALAXY_COLLISION]: 5
};

const PRESET_DEFAULTS = {
    [PRESETS.SPIRAL_GALAXY]: { gravity: 0.8, deltaTime: 0.003, blackHoleMass: 100, samples: 56, timeScale: 0.22, camera: { x: 0, y: 44, z: 32 } },
    [PRESETS.DISK_GALAXY]: { gravity: 0.75, deltaTime: 0.003, blackHoleMass: 120, samples: 48, timeScale: 0.16, camera: { x: 0, y: 50, z: 36 } },
    [PRESETS.ELLIPTICAL_GALAXY]: { gravity: 0.55, deltaTime: 0.003, blackHoleMass: 60, samples: 40, timeScale: 0.1, camera: { x: 0, y: 28, z: 56 } },
    [PRESETS.DOUBLE_SPIRAL_GALAXY]: { gravity: 0.8, deltaTime: 0.003, blackHoleMass: 110, samples: 56, timeScale: 0.22, camera: { x: 0, y: 50, z: 36 } },
    [PRESETS.UNIVERSE]: { gravity: 1.0, deltaTime: 0.001, blackHoleMass: 0, samples: 128, particles: 500000, timeScale: 1.0, camera: { x: 0, y: 9, z: 36 } },
    [PRESETS.GALAXY_COLLISION]: { gravity: 0.62, deltaTime: 0.001, blackHoleMass: 140, samples: 64, timeScale: 0.14, camera: { x: 0, y: 52, z: 68 } }
};

const PRESET_PARTICLE_SETTINGS = {
    [PRESETS.UNIVERSE]: {
        [MODES.GPU]: {
            defaultParticles: 500000,
            minParticles: 500000,
            maxParticles: 20000000,
            particleStep: 10000
        },
        [MODES.CPU]: {
            defaultParticles: 30000,
            minParticles: 10000,
            maxParticles: 120000,
            particleStep: 1000
        }
    }
};

const COLOR_SCHEMES = {
    NEBULA: 'nebula',
    EMBER: 'ember',
    SPECTRUM: 'spectrum',
    AURORA: 'aurora',
    STELLAR: 'stellar'
};

const COLOR_SCHEME_INDEX = {
    [COLOR_SCHEMES.NEBULA]: 0,
    [COLOR_SCHEMES.EMBER]: 1,
    [COLOR_SCHEMES.SPECTRUM]: 2,
    [COLOR_SCHEMES.AURORA]: 3,
    [COLOR_SCHEMES.STELLAR]: 4
};

const LANDING_PARTICLES = 7800;
const GITHUB_URL = 'https://github.com/bmfarley04/nbody-galaxy-sim';
const DEFAULT_BLOOM_STRENGTH = 0.22;
const UNIVERSE_BLOOM_STRENGTH = 0.06;

const canvas = document.querySelector('#simulation');
const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance'
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 200000);
camera.position.set(0, 0, 100);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 1;
controls.maxDistance = 200000;
controls.zoomSpeed = 1.4;
controls.rotateSpeed = 0.75;
controls.panSpeed = 0.5;
controls.screenSpacePanning = true;
controls.enabled = false;

const renderPass = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth * 0.6, window.innerHeight * 0.6), DEFAULT_BLOOM_STRENGTH, 0.18, 0.32);
const composer = new EffectComposer(renderer);
composer.addPass(renderPass);
composer.addPass(bloomPass);

let bloomEnabled = true;
let bloomStrength = DEFAULT_BLOOM_STRENGTH;
let particleBrightness = 2;
let particleBrightnessVariation = true;
let activeEngine = null;
let particleSystem = null;
let geometry = null;
let material = null;
let currentMode = MODES.GPU;
let currentPreset = PRESETS.SPIRAL_GALAXY;
let currentColorScheme = COLOR_SCHEMES.NEBULA;
let particleCount = MODE_SETTINGS[MODES.GPU].defaultParticles;
let gravity = PRESET_DEFAULTS[currentPreset].gravity;
let deltaTime = PRESET_DEFAULTS[currentPreset].deltaTime;
let blackHoleMass = PRESET_DEFAULTS[currentPreset].blackHoleMass;
let sampleCount = PRESET_DEFAULTS[currentPreset].samples;
let simulationStarted = false;
let landingBackdrop = null;
let physicsMs = 0;
let renderMs = 0;

const ui = {
    body: document.body,
    landing: document.getElementById('landing'),
    launchButtons: document.querySelectorAll('[data-launch-mode]'),
    hud: document.getElementById('fps-counter'),
    controlPanel: document.getElementById('control-panel'),
    hudToggle: document.getElementById('toggle-hud'),
    controlPanelToggle: document.getElementById('toggle-controls'),
    mode: document.getElementById('engine-mode'),
    preset: document.getElementById('preset-selector'),
    colorScheme: document.getElementById('color-scheme'),
    particleSlider: document.getElementById('particle-slider'),
    particleLabel: document.getElementById('particle-count'),
    gravitySlider: document.getElementById('g-slider'),
    gravityLabel: document.getElementById('g-value'),
    timestepSlider: document.getElementById('timestep-slider'),
    timestepLabel: document.getElementById('timestep-value'),
    blackHoleSlider: document.getElementById('blackhole-mass'),
    blackHoleLabel: document.getElementById('blackhole-mass-value'),
    sampleSlider: document.getElementById('sample-count'),
    sampleLabel: document.getElementById('sample-count-value'),
    bloom: document.getElementById('bloom-enabled'),
    bloomStrength: document.getElementById('bloom-strength'),
    bloomStrengthLabel: document.getElementById('bloom-strength-value'),
    particleBrightness: document.getElementById('particle-brightness'),
    particleBrightnessLabel: document.getElementById('particle-brightness-value'),
    particleBrightnessVariation: document.getElementById('particle-brightness-variation'),
    cameraDistance: document.getElementById('camera-distance'),
    fps: document.getElementById('fps-value'),
    hudParticles: document.getElementById('hud-particle-count'),
    hudMode: document.getElementById('hud-mode'),
    hudPhysics: document.getElementById('hud-physics-ms'),
    hudRender: document.getElementById('hud-render-ms')
};

const githubLink = ui.landing?.querySelector('.github-link');
if (githubLink) {
    githubLink.href = GITHUB_URL;
}

function bindPanelVisibility(toggle, panel) {
    if (!toggle || !panel) {
        return;
    }

    toggle.addEventListener('click', () => {
        const isVisible = !panel.classList.toggle('is-collapsed');
        toggle.setAttribute('aria-pressed', isVisible.toString());
    });
}

bindPanelVisibility(ui.hudToggle, ui.hud);
bindPanelVisibility(ui.controlPanelToggle, ui.controlPanel);

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function formatCount(value) {
    return new Intl.NumberFormat('en-US').format(value);
}

function getParticleSettings(mode = currentMode, preset = currentPreset) {
    return PRESET_PARTICLE_SETTINGS[preset]?.[mode] || MODE_SETTINGS[mode];
}

function getParticleVisuals() {
    const densityRatio = 30000 / Math.max(1, particleCount);
    const pointSize = currentPreset === PRESETS.UNIVERSE ? 2.4 : 2;
    const alphaScale = currentMode === MODES.GPU
        ? clamp(Math.pow(densityRatio, 0.45) * 0.75, 0.12, 0.75)
        : clamp(Math.pow(densityRatio, 0.35) * 0.75, 0.28, 0.75);

    return { pointSize, alphaScale };
}

function defaultBrightnessForPreset(preset) {
    return preset === PRESETS.UNIVERSE ? 1.5 : 2;
}

function defaultBloomStrengthForPreset(preset) {
    return preset === PRESETS.UNIVERSE ? UNIVERSE_BLOOM_STRENGTH : DEFAULT_BLOOM_STRENGTH;
}

function updateControlsFromState() {
    const modeConfig = getParticleSettings();

    ui.particleSlider.min = modeConfig.minParticles;
    ui.particleSlider.max = modeConfig.maxParticles;
    ui.particleSlider.step = modeConfig.particleStep;
    ui.particleSlider.value = particleCount;
    ui.particleLabel.textContent = formatCount(particleCount);
    ui.gravitySlider.value = gravity;
    ui.gravityLabel.textContent = gravity.toFixed(2);
    ui.timestepSlider.value = deltaTime;
    ui.timestepLabel.textContent = deltaTime.toFixed(3);
    ui.blackHoleSlider.value = blackHoleMass;
    ui.blackHoleLabel.textContent = Math.round(blackHoleMass).toString();
    ui.sampleSlider.value = sampleCount;
    ui.sampleLabel.textContent = sampleCount.toString();
    ui.sampleSlider.disabled = currentMode !== MODES.GPU;
    ui.bloom.checked = bloomEnabled;
    ui.bloomStrength.value = bloomStrength;
    ui.bloomStrengthLabel.textContent = bloomStrength.toFixed(2);
    ui.particleBrightness.value = particleBrightness;
    ui.particleBrightnessLabel.textContent = particleBrightness.toFixed(2);
    ui.particleBrightnessVariation.checked = particleBrightnessVariation;
    ui.colorScheme.value = currentColorScheme;
    ui.hudParticles.textContent = formatCount(particleCount);
    ui.hudMode.textContent = MODE_SETTINGS[currentMode].label;
}

function textureSizeFor(count) {
    return Math.ceil(Math.sqrt(count));
}

function randomInDisk(radius) {
    const r = Math.sqrt(Math.random()) * radius;
    const angle = Math.random() * Math.PI * 2;
    return { r, angle, x: r * Math.cos(angle), z: r * Math.sin(angle) };
}

function randomSignedPow(power = 1) {
    return (Math.random() < 0.5 ? -1 : 1) * Math.pow(Math.random(), power);
}

function spiralArmAngle(arm, armCount, radius, winding, jitterPower, jitterWidth) {
    const armBase = (Math.PI * 2 * arm) / armCount;
    const logarithmicWind = Math.log(radius + 0.75) * winding;
    return armBase + logarithmicWind + randomSignedPow(jitterPower) * jitterWidth;
}

function universePulseScale(count) {
    return 3.18;
}

function universeGravityScale(count) {
    return clamp(Math.sqrt(30000 / Math.max(1, count)), 0.32, 1);
}

function randomInSphere(radius = 1) {
    let x = 0;
    let y = 0;
    let z = 0;

    do {
        x = Math.random() * 2 - 1;
        y = Math.random() * 2 - 1;
        z = Math.random() * 2 - 1;
    } while (x * x + y * y + z * z > 1);

    return { x: x * radius, y: y * radius, z: z * radius };
}

class LandingBackdrop {
    constructor(count = LANDING_PARTICLES) {
        this.count = count;
        this.positions = new Float32Array(count * 3);
        this.radii = new Float32Array(count);
        this.angles = new Float32Array(count);
        this.speeds = new Float32Array(count);
        this.heights = new Float32Array(count);
        this.colors = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            const base = i * 3;
            const isCore = Math.random() < 0.16;
            const isDust = !isCore && Math.random() < 0.34;
            const armCount = 4;
            const arm = i % armCount;
            const radius = isCore
                ? Math.pow(Math.random(), 0.42) * 4.2 + 0.25
                : Math.pow(Math.random(), 0.6) * 30 + 1.5;
            const armAngle = (arm / armCount) * Math.PI * 2 + Math.log(radius + 1) * 1.55;
            const angle = isCore
                ? Math.random() * Math.PI * 2
                : isDust
                    ? Math.random() * Math.PI * 2 + Math.log(radius + 1) * 0.18
                    : armAngle + randomSignedPow(1.35) * (0.36 - Math.min(radius / 30, 1) * 0.18);
            const height = randomSignedPow(2.1) * (isCore ? 0.8 : 0.18 + radius * 0.016);
            const heat = 1 - Math.min(radius / 28, 1);

            this.radii[i] = radius;
            this.angles[i] = angle;
            this.speeds[i] = (isCore ? 0.08 : 0.052) / Math.sqrt(radius) + Math.random() * 0.005;
            this.heights[i] = height;

            this.positions[base] = Math.cos(angle) * radius;
            this.positions[base + 1] = height;
            this.positions[base + 2] = Math.sin(angle) * radius;

            this.colors[base] = isCore ? 1 : 0.2 + heat * 0.72 + (isDust ? 0.08 : 0);
            this.colors[base + 1] = isCore ? 0.78 : 0.4 + heat * 0.4;
            this.colors[base + 2] = isCore ? 0.48 : 0.9 - heat * 0.34;
        }

        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
        this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100000);

        this.material = new THREE.PointsMaterial({
            size: 0.068,
            vertexColors: true,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true
        });

        this.points = new THREE.Points(this.geometry, this.material);
        this.points.rotation.x = -0.72;
        this.points.rotation.z = 0.12;
        this.points.position.y = -3.2;
        scene.add(this.points);
    }

    step(timeSeconds) {
        for (let i = 0; i < this.count; i++) {
            const base = i * 3;
            const radius = this.radii[i];
            const angle = this.angles[i] + timeSeconds * this.speeds[i];
            const shimmer = Math.sin(timeSeconds * 0.6 + i * 0.017) * 0.05;

            this.positions[base] = Math.cos(angle) * radius;
            this.positions[base + 1] = this.heights[i] + shimmer;
            this.positions[base + 2] = Math.sin(angle) * radius;
        }

        this.points.rotation.y = timeSeconds * 0.025;
        this.geometry.attributes.position.needsUpdate = true;
    }

    dispose() {
        scene.remove(this.points);
        this.geometry.dispose();
        this.material.dispose();
    }
}

function fillGalaxyPreset(preset, count) {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
        const base = i * 3;
        let x = 0;
        let y = 0;
        let z = 0;
        let vx = 0;
        let vy = 0;
        let vz = 0;

        if (preset === PRESETS.SPIRAL_GALAXY) {
            const radius = 11.5;
            const isBulge = Math.random() < 0.12;
            const isDust = !isBulge && Math.random() < 0.46;
            const armCount = 3;
            const r = isBulge ? Math.pow(Math.random(), 0.55) * 2.3 : Math.pow(Math.random(), 0.58) * radius;
            const arm = i % armCount;
            const normalizedRadius = r / radius;
            const width = 0.36 * (1 - Math.pow(normalizedRadius, 1.45)) + 0.12;
            const angle = isBulge
                ? Math.random() * Math.PI * 2
                : isDust
                    ? Math.random() * Math.PI * 2 + Math.log(r + 0.75) * 0.18
                    : spiralArmAngle(arm, armCount, r, 2.15, 1.4, width);
            const orbitSpeed = Math.sqrt(98 / Math.max(r, 0.55)) * (isBulge ? 0.42 : 1.0);
            const drift = (Math.random() - 0.5) * (isDust ? 0.18 : 0.07);

            x = r * Math.cos(angle);
            z = r * Math.sin(angle);
            y = randomSignedPow(2.2) * (isBulge ? 0.9 : 0.12 + 0.36 * (1 - normalizedRadius));
            vx = -orbitSpeed * Math.sin(angle) + Math.cos(angle) * drift;
            vz = orbitSpeed * Math.cos(angle) + Math.sin(angle) * drift;
            vy = (Math.random() - 0.5) * (isBulge ? 0.09 : 0.022);
        } else if (preset === PRESETS.DISK_GALAXY) {
            const point = randomInDisk(10);
            const speed = 12 * Math.sqrt(1 / Math.max(point.r, 0.2));
            x = point.x;
            z = point.z;
            y = (Math.random() - 0.5) * 0.5;
            vx = -speed * Math.sin(point.angle);
            vz = speed * Math.cos(point.angle);
        } else if (preset === PRESETS.ELLIPTICAL_GALAXY) {
            const u = Math.random() * Math.PI * 2;
            const v = Math.random() * Math.PI;
            const r = Math.pow(Math.random(), 1 / 3) * 8;
            x = r * Math.sin(v) * Math.cos(u);
            y = r * Math.sin(v) * Math.sin(u) * 0.7;
            z = r * Math.cos(v);
            const speed = 8 * (1 - Math.sqrt(r / 8));
            vx = (Math.random() - 0.5) * speed;
            vy = (Math.random() - 0.5) * speed;
            vz = (Math.random() - 0.5) * speed;
        } else if (preset === PRESETS.DOUBLE_SPIRAL_GALAXY) {
            const radius = 12.5;
            const isBulge = Math.random() < 0.1;
            const isDust = !isBulge && Math.random() < 0.38;
            const r = isBulge ? Math.pow(Math.random(), 0.55) * 2 : Math.pow(Math.random(), 0.54) * radius;
            const arm = i % 2;
            const normalizedRadius = r / radius;
            const angle = isBulge
                ? Math.random() * Math.PI * 2
                : isDust
                    ? Math.random() * Math.PI * 2 + Math.log(r + 0.75) * 0.12
                    : spiralArmAngle(arm, 2, r, 2.45, 1.35, 0.32 * (1 - Math.pow(normalizedRadius, 1.35)) + 0.1);
            const speed = Math.sqrt(100 / Math.max(r, 0.55)) * (isBulge ? 0.42 : 1.0);
            const drift = (Math.random() - 0.5) * (isDust ? 0.16 : 0.065);

            x = r * Math.cos(angle);
            z = r * Math.sin(angle);
            y = randomSignedPow(2.2) * (isBulge ? 0.75 : 0.1 + 0.24 * Math.sqrt(1 - normalizedRadius));
            vx = -speed * Math.sin(angle) + Math.cos(angle) * drift;
            vz = speed * Math.cos(angle) + Math.sin(angle) * drift;
            vy = (Math.random() - 0.5) * (isBulge ? 0.08 : 0.028);
        } else if (preset === PRESETS.UNIVERSE) {
            const point = randomInSphere(2);
            x = point.x;
            y = point.y;
            z = point.z;
            const pulseScale = universePulseScale(count);
            vx = pulseScale * x;
            vy = pulseScale * y;
            vz = pulseScale * z;
        } else if (preset === PRESETS.GALAXY_COLLISION) {
            const left = i < count / 2;
            const radius = left ? 6.8 : 7.8;
            const point = randomInDisk(radius);
            const angle = point.angle + (left ? 0.25 : -0.35);
            const speed = (left ? 9.5 : 8.4) * Math.sqrt(1 / Math.max(point.r, 0.45));
            const centerX = left ? -8.0 : 8.0;
            const centerY = left ? -0.6 : 0.8;
            const centerZ = left ? -1.3 : 1.3;
            const tilt = left ? 0.32 : -0.24;

            x = centerX + point.r * Math.cos(angle);
            y = centerY + point.r * Math.sin(angle) * tilt + randomSignedPow(2.2) * 0.16;
            z = centerZ + point.r * Math.sin(angle);
            vx = -speed * Math.sin(angle) + (left ? 2.35 : -2.35);
            vy = speed * Math.cos(angle) * tilt + (left ? 0.16 : -0.16);
            vz = speed * Math.cos(angle) + (left ? 0.42 : -0.42);
        }

        positions[base] = x;
        positions[base + 1] = y;
        positions[base + 2] = z;
        velocities[base] = vx;
        velocities[base + 1] = vy;
        velocities[base + 2] = vz;
    }

    return { positions, velocities };
}

const positionFragmentShader = `
    uniform float deltaTime;
    uniform float particleCount;
    uniform int presetType;

    void main() {
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        float index = gl_FragCoord.x - 0.5 + (gl_FragCoord.y - 0.5) * resolution.x;
        vec4 positionData = texture2D(texturePosition, uv);
        vec4 velocityData = texture2D(textureVelocity, uv);

        if (index >= particleCount || positionData.w < 0.5) {
            gl_FragColor = positionData;
            return;
        }

        vec3 position = positionData.xyz + velocityData.xyz * deltaTime;

        gl_FragColor = vec4(position, positionData.w);
    }
`;

const velocityFragmentShader = `
    uniform float deltaTime;
    uniform float gravity;
    uniform float blackHoleMass;
    uniform float particleCount;
    uniform float time;
    uniform int sampleCount;
    uniform int presetType;

    const int MAX_SAMPLES = 384;
    const float SOFTENING = 0.12;

    vec2 uvFromIndex(float index) {
        float x = mod(index, resolution.x);
        float y = floor(index / resolution.x);
        return (vec2(x, y) + 0.5) / resolution.xy;
    }

    float rand(float value) {
        return fract(sin(value * 12.9898) * 43758.5453123);
    }

    vec3 attractorForce(vec3 position, vec3 target, float mass) {
        vec3 delta = target - position;
        float distSq = dot(delta, delta) + SOFTENING;
        float invDist = inversesqrt(distSq);
        float force = gravity * mass / distSq;
        return delta * invDist * force;
    }

    void main() {
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        float index = gl_FragCoord.x - 0.5 + (gl_FragCoord.y - 0.5) * resolution.x;
        vec4 positionData = texture2D(texturePosition, uv);
        vec4 velocityData = texture2D(textureVelocity, uv);

        if (index >= particleCount || positionData.w < 0.5) {
            gl_FragColor = velocityData;
            return;
        }

        vec3 position = positionData.xyz;
        vec3 velocity = velocityData.xyz;
        vec3 acceleration = vec3(0.0);

        if (presetType == 5) {
            acceleration += attractorForce(position, vec3(-3.0, 0.0, 0.0), blackHoleMass * 0.65);
            acceleration += attractorForce(position, vec3(3.0, 5.0, 0.0), blackHoleMass * 0.65);
        } else if (presetType != 4) {
            acceleration += attractorForce(position, vec3(0.0), blackHoleMass);
        }

        if (presetType == 0 || presetType == 1 || presetType == 3) {
            acceleration.y += -position.y * 0.16 - velocity.y * 0.045;
        }

        float neighborScale = 0.042;
        float neighborCap = 0.24;
        float activeFraction = 0.8;

        if (presetType == 2) {
            neighborScale = 0.028;
            neighborCap = 0.18;
        } else if (presetType == 0 || presetType == 1 || presetType == 3) {
            neighborScale = 0.018;
            neighborCap = 0.08;
        } else if (presetType == 4) {
            float densityScale = clamp(sqrt(30000.0 / max(1.0, particleCount)), 0.32, 1.0);
            neighborScale = densityScale;
            neighborCap = mix(5.5, 15.0, densityScale);
            activeFraction = 0.05;
        } else if (presetType == 5) {
            neighborScale = 0.052;
            neighborCap = 0.26;
            activeFraction = 0.55;
        }

        float activeCount = max(1.0, floor(particleCount * activeFraction));

        for (int i = 0; i < MAX_SAMPLES; i++) {
            if (i >= sampleCount) break;

            float sampleIndex = 0.0;

            if (presetType == 4) {
                sampleIndex = floor((float(i) + 0.5) * activeCount / max(1.0, float(sampleCount)));
            } else {
                float seed = rand(index * 0.013 + float(i) * 37.719);
                sampleIndex = mod(float(i * 977 + 13) + floor(seed * activeCount), activeCount);
            }

            vec4 samplePosition = texture2D(texturePosition, uvFromIndex(sampleIndex));
            vec3 delta = samplePosition.xyz - position;
            float distSq = dot(delta, delta) + SOFTENING;
            float invDist = inversesqrt(distSq);
            float influence = gravity * neighborScale / distSq;
            acceleration += delta * invDist * min(influence, neighborCap);
        }

        velocity += acceleration * deltaTime;
        if (presetType == 0 || presetType == 1 || presetType == 3) {
            velocity *= 0.99985;
        } else if (presetType == 2) {
            velocity *= 0.9992;
        } else if (presetType == 4) {
            velocity *= 1.0;
        } else {
            velocity *= 0.99965;
        }
        gl_FragColor = vec4(velocity, min(length(acceleration), 4.0));
    }
`;

const gpuParticleVertexShader = `
    uniform sampler2D texturePosition;
    uniform sampler2D textureVelocity;
    uniform float pointSize;

    attribute vec2 reference;
    varying float vAcceleration;
    varying float vDepthFade;
    varying float vRadius;
    varying float vSpeed;
    varying float vSeed;

    float hash(vec3 value) {
        return fract(sin(dot(value, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    }

    void main() {
        vec4 positionData = texture2D(texturePosition, reference);
        vec4 velocityData = texture2D(textureVelocity, reference);
        vec4 mvPosition = modelViewMatrix * vec4(positionData.xyz, 1.0);

        vAcceleration = velocityData.w;
        vDepthFade = clamp(1.0 - (-mvPosition.z / 700.0), 0.25, 1.0);
        vRadius = length(positionData.xyz);
        vSpeed = length(velocityData.xyz);
        vSeed = hash(positionData.xyz + vec3(reference, 0.0));

        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = pointSize;
    }
`;

const cpuParticleVertexShader = `
    uniform float pointSize;
    attribute vec3 acceleration;
    varying float vAcceleration;
    varying float vDepthFade;
    varying float vRadius;
    varying float vSpeed;
    varying float vSeed;

    float hash(vec3 value) {
        return fract(sin(dot(value, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    }

    void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vAcceleration = length(acceleration);
        vDepthFade = clamp(1.0 - (-mvPosition.z / 700.0), 0.25, 1.0);
        vRadius = length(position);
        vSpeed = length(acceleration) * 0.5;
        vSeed = hash(position);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = pointSize;
    }
`;

const particleFragmentShader = `
    uniform float alphaScale;
    uniform float brightness;
    uniform int brightnessVariation;
    uniform int presetType;
    uniform int colorScheme;

    varying float vAcceleration;
    varying float vDepthFade;
    varying float vRadius;
    varying float vSpeed;
    varying float vSeed;

    void main() {
        vec2 coord = gl_PointCoord - vec2(0.5);
        float radius = length(coord);
        if (radius > 0.5) discard;

        float core = smoothstep(0.5, 0.0, radius);
        float halo = pow(max(0.0, 1.0 - radius * 2.0), 1.55);
        float intensity = core * 0.78 + halo * 0.46;
        float brightnessAlpha = clamp(brightness, 0.35, 2.1);
        float bodyBrightness = brightnessVariation == 1 ? 0.86 + vSeed * 0.28 : 1.0;

        if (presetType == 4) {
            vec3 lowAccelerationColor = vec3(0.05, 0.06, 0.24);
            vec3 roseFilamentColor = vec3(0.64, 0.32, 0.92);
            vec3 highAccelerationColor = vec3(1.0, 0.38, 0.12);
            float heat = clamp(vAcceleration / 1.0, 0.0, 1.0);
            vec3 color = mix(lowAccelerationColor, roseFilamentColor, smoothstep(0.04, 0.45, heat));

            if (colorScheme == 1) {
                lowAccelerationColor = vec3(0.22, 0.08, 0.42);
                roseFilamentColor = vec3(0.92, 0.56, 1.0);
                highAccelerationColor = vec3(1.0, 0.32, 0.12);
                color = mix(lowAccelerationColor, roseFilamentColor, smoothstep(0.02, 0.36, heat));
            } else if (colorScheme == 2) {
                lowAccelerationColor = vec3(0.012, 0.063, 0.988);
                roseFilamentColor = vec3(1.0, 0.12, 0.52);
                highAccelerationColor = vec3(1.0, 0.62, 0.19);
                color = mix(lowAccelerationColor, roseFilamentColor, smoothstep(0.04, 0.45, heat));
            } else if (colorScheme == 3) {
                lowAccelerationColor = vec3(0.02, 0.16, 0.28);
                roseFilamentColor = vec3(0.28, 0.92, 0.88);
                highAccelerationColor = vec3(0.96, 0.74, 0.22);
                color = mix(lowAccelerationColor, roseFilamentColor, smoothstep(0.03, 0.42, heat));
            } else if (colorScheme == 4) {
                lowAccelerationColor = vec3(0.12, 0.14, 0.30);
                roseFilamentColor = vec3(0.94, 0.86, 0.62);
                highAccelerationColor = vec3(1.0, 0.58, 0.18);
                color = mix(lowAccelerationColor, roseFilamentColor, smoothstep(0.04, 0.46, heat));
            }

            color = mix(color, highAccelerationColor, smoothstep(0.36, 1.0, heat));
            color *= (0.72 + heat * 1.9 + vSeed * 0.18) * bodyBrightness * brightness;
            gl_FragColor = vec4(color, clamp(intensity, 0.08, 1.0) * alphaScale * vDepthFade * brightnessAlpha * bodyBrightness);
            return;
        }

        vec3 deepBlue = vec3(0.06, 0.22, 1.0);
        vec3 cyan = vec3(0.16, 0.72, 1.0);
        vec3 violet = vec3(0.62, 0.22, 1.0);
        vec3 rose = vec3(1.0, 0.28, 0.74);
        vec3 star = vec3(0.72, 0.80, 1.0);
        vec3 warm = vec3(1.0, 0.48, 0.12);

        float coreWarmth = 1.0 - smoothstep(1.1, 10.5, vRadius);
        float kineticWarmth = smoothstep(4.0, 16.0, vSpeed);
        float accelerationWarmth = smoothstep(0.65, 4.5, vAcceleration);
        float heat = clamp(coreWarmth * 0.58 + kineticWarmth * 0.24 + accelerationWarmth * 0.16, 0.0, 1.0);
        float outer = smoothstep(2.4, 18.0, vRadius);
        float cyanBias = (1.0 - outer) * (0.22 + vSeed * 0.18);
        float violetBias = outer * (0.34 + vSeed * 0.42);
        float roseBias = smoothstep(0.20, 0.72, heat) * smoothstep(0.14, 0.88, vSeed) * 0.48;

        vec3 color = mix(deepBlue, cyan, clamp(cyanBias, 0.0, 0.46));

        if (colorScheme == 0) {
            vec3 midnight = vec3(0.012, 0.024, 0.13);
            vec3 indigo = vec3(0.055, 0.11, 0.38);
            vec3 blueFog = vec3(0.16, 0.24, 0.66);
            vec3 purpleFog = vec3(0.40, 0.22, 0.68);
            vec3 hotPink = vec3(0.90, 0.30, 0.54);
            vec3 amber = vec3(1.0, 0.42, 0.09);
            vec3 whiteHot = vec3(1.0, 0.88, 0.70);
            float knot = smoothstep(0.40, 0.98, heat) * (0.55 + vSeed * 0.45);

            color = mix(midnight, indigo, clamp(outer * 0.54 + vSeed * 0.18, 0.0, 0.76));
            color = mix(color, blueFog, clamp(outer * 0.36 + smoothstep(0.08, 0.50, heat) * 0.18, 0.0, 0.58));
            color = mix(color, purpleFog, clamp(violetBias * 0.46 + smoothstep(0.18, 0.62, heat) * 0.18, 0.0, 0.46));
            color = mix(color, hotPink, smoothstep(0.34, 0.78, heat) * 0.20);
            color = mix(color, amber, knot * 0.68);
            color = mix(color, whiteHot, smoothstep(0.72, 1.0, heat) * 0.34);
        } else if (colorScheme == 1) {
            vec3 deepPurple = vec3(0.18, 0.06, 0.40);
            vec3 royalPurple = vec3(0.58, 0.18, 1.0);
            vec3 pearl = vec3(0.96, 0.90, 1.0);
            vec3 ember = vec3(1.0, 0.34, 0.12);
            vec3 red = vec3(1.0, 0.13, 0.08);

            color = mix(deepPurple, royalPurple, clamp(violetBias + vSeed * 0.22, 0.0, 0.92));
            color = mix(color, rose, roseBias * 0.62);
            color = mix(color, pearl, smoothstep(0.22, 0.68, heat) * 0.48);
            color = mix(color, ember, smoothstep(0.36, 0.94, heat) * 0.74);
            color = mix(color, red, smoothstep(0.72, 1.0, heat) * 0.34);
        } else if (colorScheme == 2) {
            color = mix(color, violet, clamp(violetBias + smoothstep(0.10, 0.50, heat) * 0.46, 0.0, 0.88));
            color = mix(color, rose, roseBias);
            color = mix(color, star, smoothstep(0.20, 0.72, heat) * 0.34);
            color = mix(color, warm, smoothstep(0.34, 1.0, heat) * 0.86);
        } else if (colorScheme == 3) {
            vec3 deepTeal = vec3(0.02, 0.14, 0.22);
            vec3 aqua = vec3(0.16, 0.92, 0.88);
            vec3 lavender = vec3(0.64, 0.34, 1.0);
            vec3 gold = vec3(1.0, 0.72, 0.24);

            color = mix(deepTeal, aqua, clamp(cyanBias + smoothstep(0.08, 0.48, heat) * 0.28, 0.0, 0.72));
            color = mix(color, lavender, clamp(violetBias * 0.76 + roseBias * 0.34, 0.0, 0.72));
            color = mix(color, gold, smoothstep(0.44, 1.0, heat) * 0.62);
        } else {
            vec3 ink = vec3(0.08, 0.09, 0.18);
            vec3 blueWhite = vec3(0.62, 0.76, 1.0);
            vec3 cream = vec3(1.0, 0.90, 0.64);
            vec3 gold = vec3(1.0, 0.58, 0.16);

            color = mix(ink, blueWhite, clamp(cyanBias + outer * 0.20, 0.0, 0.62));
            color = mix(color, cream, smoothstep(0.16, 0.68, heat) * 0.54);
            color = mix(color, gold, smoothstep(0.48, 1.0, heat) * 0.74);
        }

        color *= (0.88 + vSeed * 0.24) * bodyBrightness * brightness;

        gl_FragColor = vec4(color, clamp(intensity, 0.06, 1.0) * alphaScale * vDepthFade * brightnessAlpha * bodyBrightness);
    }
`;

class GPUEngine {
    constructor(data) {
        this.count = particleCount;
        this.startTime = performance.now() * 0.001;
        this.textureSize = textureSizeFor(this.count);
        this.gpuCompute = new GPUComputationRenderer(this.textureSize, this.textureSize, renderer);
        this.positionTexture = this.gpuCompute.createTexture();
        this.velocityTexture = this.gpuCompute.createTexture();

        this.fillTextures(data.positions, data.velocities);

        this.velocityVariable = this.gpuCompute.addVariable('textureVelocity', velocityFragmentShader, this.velocityTexture);
        this.positionVariable = this.gpuCompute.addVariable('texturePosition', positionFragmentShader, this.positionTexture);

        this.gpuCompute.setVariableDependencies(this.velocityVariable, [this.positionVariable, this.velocityVariable]);
        this.gpuCompute.setVariableDependencies(this.positionVariable, [this.positionVariable, this.velocityVariable]);

        this.velocityUniforms = this.velocityVariable.material.uniforms;
        this.positionUniforms = this.positionVariable.material.uniforms;

        this.velocityUniforms.deltaTime = { value: deltaTime };
        this.velocityUniforms.gravity = { value: gravity };
        this.velocityUniforms.blackHoleMass = { value: blackHoleMass };
        this.velocityUniforms.particleCount = { value: this.count };
        this.velocityUniforms.time = { value: 0 };
        this.velocityUniforms.sampleCount = { value: sampleCount };
        this.velocityUniforms.presetType = { value: PRESET_INDEX[currentPreset] };
        this.positionUniforms.deltaTime = { value: deltaTime };
        this.positionUniforms.particleCount = { value: this.count };
        this.positionUniforms.presetType = { value: PRESET_INDEX[currentPreset] };

        const error = this.gpuCompute.init();
        if (error) throw new Error(error);
    }

    fillTextures(positions, velocities) {
        const positionData = this.positionTexture.image.data;
        const velocityData = this.velocityTexture.image.data;

        for (let i = 0; i < this.textureSize * this.textureSize; i++) {
            const base3 = i * 3;
            const base4 = i * 4;

            if (i < this.count) {
                positionData[base4] = positions[base3];
                positionData[base4 + 1] = positions[base3 + 1];
                positionData[base4 + 2] = positions[base3 + 2];
                positionData[base4 + 3] = 1;

                velocityData[base4] = velocities[base3];
                velocityData[base4 + 1] = velocities[base3 + 1];
                velocityData[base4 + 2] = velocities[base3 + 2];
                velocityData[base4 + 3] = 0;
            } else {
                positionData[base4] = 0;
                positionData[base4 + 1] = 0;
                positionData[base4 + 2] = 0;
                positionData[base4 + 3] = 0;
                velocityData[base4] = 0;
                velocityData[base4 + 1] = 0;
                velocityData[base4 + 2] = 0;
                velocityData[base4 + 3] = 0;
            }
        }
    }

    createParticleSystem() {
        const references = new Float32Array(this.count * 2);
        const vertices = new Float32Array(this.count * 3);

        for (let i = 0; i < this.count; i++) {
            references[i * 2] = (i % this.textureSize + 0.5) / this.textureSize;
            references[i * 2 + 1] = (Math.floor(i / this.textureSize) + 0.5) / this.textureSize;
        }

        geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geometry.setAttribute('reference', new THREE.BufferAttribute(references, 2));
        geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100000);

        material = new THREE.ShaderMaterial({
            uniforms: {
                texturePosition: { value: this.gpuCompute.getCurrentRenderTarget(this.positionVariable).texture },
                textureVelocity: { value: this.gpuCompute.getCurrentRenderTarget(this.velocityVariable).texture },
                pointSize: { value: getParticleVisuals().pointSize },
                alphaScale: { value: getParticleVisuals().alphaScale },
                brightness: { value: particleBrightness },
                brightnessVariation: { value: particleBrightnessVariation ? 1 : 0 },
                presetType: { value: PRESET_INDEX[currentPreset] },
                colorScheme: { value: COLOR_SCHEME_INDEX[currentColorScheme] }
            },
            vertexShader: gpuParticleVertexShader,
            fragmentShader: particleFragmentShader,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        particleSystem = new THREE.Points(geometry, material);
        particleSystem.frustumCulled = false;
        scene.add(particleSystem);
    }

    step(timeSeconds) {
        const start = performance.now();
        const effectiveDeltaTime = deltaTime * PRESET_DEFAULTS[currentPreset].timeScale;
        const isUniverse = currentPreset === PRESETS.UNIVERSE;
        const densityT = clamp((particleCount - 30000) / 1018576, 0, 1);
        const universeSampleCount = Math.round(128 + densityT * 256);

        this.velocityUniforms.deltaTime.value = effectiveDeltaTime;
        this.velocityUniforms.gravity.value = isUniverse ? gravity * universeGravityScale(particleCount) : gravity;
        this.velocityUniforms.blackHoleMass.value = blackHoleMass;
        this.velocityUniforms.time.value = timeSeconds - this.startTime;
        this.velocityUniforms.sampleCount.value = isUniverse ? Math.max(sampleCount, universeSampleCount) : sampleCount;
        this.velocityUniforms.presetType.value = PRESET_INDEX[currentPreset];
        this.positionUniforms.deltaTime.value = effectiveDeltaTime;
        this.positionUniforms.presetType.value = PRESET_INDEX[currentPreset];
        this.gpuCompute.compute();

        material.uniforms.texturePosition.value = this.gpuCompute.getCurrentRenderTarget(this.positionVariable).texture;
        material.uniforms.textureVelocity.value = this.gpuCompute.getCurrentRenderTarget(this.velocityVariable).texture;
        physicsMs = performance.now() - start;
    }

    dispose() {
        this.gpuCompute.dispose();
    }
}

class CPUEngine {
    constructor(data) {
        this.count = particleCount;
        this.worker = new Worker(new URL('./simulation.worker.js', import.meta.url), { type: 'module' });
        this.pending = false;
        this.ready = false;
        this.positionBufferPool = [];
        this.accelerationBufferPool = [];
        this.renderPositions = data.positions.slice();
        this.renderAccelerations = new Float32Array(this.count * 3);

        this.worker.onmessage = (event) => {
            const message = event.data;

            if (message.type === 'ready') {
                this.ready = true;
                return;
            }

            if (message.type === 'frame') {
                this.renderPositions.set(new Float32Array(message.positions));
                this.renderAccelerations.set(new Float32Array(message.accelerations));
                this.positionBufferPool.push(message.positions);
                this.accelerationBufferPool.push(message.accelerations);
                geometry.attributes.position.needsUpdate = true;
                geometry.attributes.acceleration.needsUpdate = true;
                physicsMs = message.physicsMs;
                this.pending = false;
            }
        };

        this.worker.postMessage({
            type: 'init',
            particleCount: this.count,
            positions: data.positions.buffer,
            velocities: data.velocities.buffer
        }, [data.positions.buffer, data.velocities.buffer]);
    }

    createParticleSystem() {
        geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(this.renderPositions, 3));
        geometry.setAttribute('acceleration', new THREE.BufferAttribute(this.renderAccelerations, 3));
        geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100000);

        material = new THREE.ShaderMaterial({
            uniforms: {
                pointSize: { value: getParticleVisuals().pointSize },
                alphaScale: { value: getParticleVisuals().alphaScale },
                brightness: { value: particleBrightness },
                brightnessVariation: { value: particleBrightnessVariation ? 1 : 0 },
                presetType: { value: PRESET_INDEX[currentPreset] },
                colorScheme: { value: COLOR_SCHEME_INDEX[currentColorScheme] }
            },
            vertexShader: cpuParticleVertexShader,
            fragmentShader: particleFragmentShader,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        particleSystem = new THREE.Points(geometry, material);
        particleSystem.frustumCulled = false;
        scene.add(particleSystem);
    }

    step(timeSeconds = 0) {
        if (!this.ready || this.pending) return;

        this.pending = true;
        const outputPositions = this.positionBufferPool.pop() || new ArrayBuffer(this.count * 3 * Float32Array.BYTES_PER_ELEMENT);
        const outputAccelerations = this.accelerationBufferPool.pop() || new ArrayBuffer(this.count * 3 * Float32Array.BYTES_PER_ELEMENT);

        this.worker.postMessage({
            type: 'step',
            deltaTime,
            gravity,
            blackHoleMass,
            preset: currentPreset,
            time: timeSeconds,
            outputPositionBuffer: outputPositions,
            outputAccelerationBuffer: outputAccelerations
        }, [outputPositions, outputAccelerations]);
    }

    dispose() {
        this.worker.terminate();
    }
}

function disposeParticleSystem() {
    if (activeEngine) {
        activeEngine.dispose();
        activeEngine = null;
    }

    if (particleSystem) {
        scene.remove(particleSystem);
        particleSystem = null;
    }

    if (geometry) {
        geometry.dispose();
        geometry = null;
    }

    if (material) {
        material.dispose();
        material = null;
    }
}

function initializeSimulation() {
    disposeParticleSystem();

    const data = fillGalaxyPreset(currentPreset, particleCount);

    try {
        if (currentMode === MODES.GPU) {
            activeEngine = new GPUEngine(data);
        } else {
            activeEngine = new CPUEngine(data);
        }
    } catch (error) {
        console.warn('GPU mode failed; falling back to CPU mode.', error);
        currentMode = MODES.CPU;
        const fallbackConfig = getParticleSettings(MODES.CPU, currentPreset);
        particleCount = Math.min(fallbackConfig.defaultParticles, fallbackConfig.maxParticles);
        ui.mode.value = currentMode;
        updateControlsFromState();
        activeEngine = new CPUEngine(fillGalaxyPreset(currentPreset, particleCount));
    }

    activeEngine.createParticleSystem();
    updateControlsFromState();
}

function initializeLandingBackdrop() {
    camera.position.set(0, 18, 48);
    camera.lookAt(0, 0, 0);
    bloomPass.strength = 0.18;
    landingBackdrop = new LandingBackdrop();
}

function startSimulation(mode) {
    if (simulationStarted) return;

    simulationStarted = true;
    currentMode = mode;
    currentPreset = PRESETS.SPIRAL_GALAXY;
    currentColorScheme = COLOR_SCHEMES.NEBULA;
    const modeConfig = getParticleSettings(currentMode, currentPreset);
    particleCount = modeConfig.defaultParticles;
    bloomEnabled = true;
    bloomStrength = defaultBloomStrengthForPreset(currentPreset);
    particleBrightness = defaultBrightnessForPreset(currentPreset);
    particleBrightnessVariation = true;
    gravity = PRESET_DEFAULTS[currentPreset].gravity;
    deltaTime = PRESET_DEFAULTS[currentPreset].deltaTime;
    blackHoleMass = PRESET_DEFAULTS[currentPreset].blackHoleMass;
    sampleCount = PRESET_DEFAULTS[currentPreset].samples;

    ui.mode.value = currentMode;
    ui.preset.value = currentPreset;
    ui.colorScheme.value = currentColorScheme;
    ui.body.classList.remove('landing-active');
    ui.body.classList.add('sim-ready');
    controls.enabled = true;

    if (landingBackdrop) {
        landingBackdrop.dispose();
        landingBackdrop = null;
    }

    applyPresetDefaults(currentPreset);
    updateControlsFromState();
    initializeSimulation();
}

function applyPresetDefaults(preset) {
    const defaults = PRESET_DEFAULTS[preset];
    gravity = defaults.gravity;
    deltaTime = defaults.deltaTime;
    blackHoleMass = defaults.blackHoleMass;
    sampleCount = defaults.samples;
    particleBrightness = defaultBrightnessForPreset(preset);
    bloomStrength = defaultBloomStrengthForPreset(preset);
    if (defaults.particles) {
        particleCount = defaults.particles;
    }
    camera.position.set(defaults.camera.x, defaults.camera.y, defaults.camera.z);
    controls.target.set(0, 0, 0);
    controls.update();
}

function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(width, height);
    composer.setSize(width, height);
    bloomPass.setSize(width * 0.6, height * 0.6);
}

ui.launchButtons.forEach((button) => {
    button.addEventListener('click', () => {
        const mode = button.dataset.launchMode === MODES.CPU ? MODES.CPU : MODES.GPU;
        startSimulation(mode);
    });
});

ui.mode.addEventListener('change', () => {
    const previousMode = currentMode;
    const previousConfig = getParticleSettings(previousMode, currentPreset);
    currentMode = ui.mode.value;
    const modeConfig = getParticleSettings(currentMode, currentPreset);

    if (particleCount === previousConfig.defaultParticles) {
        particleCount = modeConfig.defaultParticles;
    } else if (particleCount < modeConfig.minParticles || particleCount > modeConfig.maxParticles) {
        particleCount = modeConfig.defaultParticles;
    } else {
        particleCount = clamp(particleCount, modeConfig.minParticles, modeConfig.maxParticles);
    }

    initializeSimulation();
});

ui.preset.addEventListener('change', () => {
    currentPreset = ui.preset.value;
    applyPresetDefaults(currentPreset);
    initializeSimulation();
});

ui.colorScheme.addEventListener('change', () => {
    currentColorScheme = ui.colorScheme.value;
    updateControlsFromState();
});

ui.particleSlider.addEventListener('input', () => {
    particleCount = parseInt(ui.particleSlider.value, 10);
    initializeSimulation();
});

ui.gravitySlider.addEventListener('input', () => {
    gravity = parseFloat(ui.gravitySlider.value);
    updateControlsFromState();
});

ui.timestepSlider.addEventListener('input', () => {
    deltaTime = parseFloat(ui.timestepSlider.value);
    updateControlsFromState();
});

ui.blackHoleSlider.addEventListener('input', () => {
    blackHoleMass = parseFloat(ui.blackHoleSlider.value);
    updateControlsFromState();
});

ui.sampleSlider.addEventListener('input', () => {
    sampleCount = parseInt(ui.sampleSlider.value, 10);
    updateControlsFromState();
});

ui.bloom.addEventListener('change', () => {
    bloomEnabled = ui.bloom.checked;
});

ui.bloomStrength.addEventListener('input', () => {
    bloomStrength = parseFloat(ui.bloomStrength.value);
    bloomPass.strength = bloomStrength;
    updateControlsFromState();
});

ui.particleBrightness.addEventListener('input', () => {
    particleBrightness = parseFloat(ui.particleBrightness.value);
    updateControlsFromState();
});

ui.particleBrightnessVariation.addEventListener('change', () => {
    particleBrightnessVariation = ui.particleBrightnessVariation.checked;
    updateControlsFromState();
});

window.addEventListener('resize', resize);

let frameCount = 0;
let lastFpsTime = performance.now();

function updateStats() {
    frameCount++;
    const now = performance.now();

    if (now - lastFpsTime >= 500) {
        ui.fps.textContent = Math.round((frameCount * 1000) / (now - lastFpsTime)).toString();
        ui.hudParticles.textContent = formatCount(particleCount);
        ui.hudMode.textContent = MODE_SETTINGS[currentMode].label;
        ui.hudPhysics.textContent = `${physicsMs.toFixed(1)} ms`;
        ui.hudRender.textContent = `${renderMs.toFixed(1)} ms`;
        frameCount = 0;
        lastFpsTime = now;
    }
}

function animate(timeMs) {
    requestAnimationFrame(animate);

    if (simulationStarted) {
        controls.update();
    }

    landingBackdrop?.step(timeMs * 0.001);
    activeEngine?.step(timeMs * 0.001);

    const distance = camera.position.length();
    ui.cameraDistance.textContent = distance.toFixed(2);

    if (material?.uniforms?.pointSize && material?.uniforms?.alphaScale) {
        const visuals = getParticleVisuals();
        material.uniforms.pointSize.value = visuals.pointSize;
        material.uniforms.alphaScale.value = visuals.alphaScale;
        if (material.uniforms.presetType) {
            material.uniforms.presetType.value = PRESET_INDEX[currentPreset];
        }
        if (material.uniforms.colorScheme) {
            material.uniforms.colorScheme.value = COLOR_SCHEME_INDEX[currentColorScheme];
        }
        if (material.uniforms.brightness) {
            material.uniforms.brightness.value = particleBrightness;
        }
        if (material.uniforms.brightnessVariation) {
            material.uniforms.brightnessVariation.value = particleBrightnessVariation ? 1 : 0;
        }
    }

    bloomPass.strength = bloomStrength;

    const renderStart = performance.now();
    if (bloomEnabled) {
        composer.render();
    } else {
        renderer.render(scene, camera);
    }
    renderMs = performance.now() - renderStart;

    updateStats();
}

initializeLandingBackdrop();
updateControlsFromState();
animate();

window.addEventListener('unload', () => {
    disposeParticleSystem();
});
