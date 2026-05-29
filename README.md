Hello!

This is an updated version of the project I made for my algorithms class a couple years ago - i changed it to have a unique CPU version and a GPU version. The CPU version uses a web worker and I moved from the JS GPU library to actual shader code for the GPU version, as well as making a couple aesthetic changes. 

Access this project here:
https://nbody-galaxy.pages.dev/

To run this project locally:

```sh
npm install
npm run dev
```

To build it for production:

```sh
npm run build
```

Once it's running, the UI is pretty intuitive. You can alter variables such as the number of particles, the force of gravity, and more from the UI sliders. Additionally, you can choose from a variety of pre-sets to choose one of 4 galaxy simulations, a galaxy collision, or an expanding universe simulation. 

If it's running too slow, try changing the particle count or swapping to the CPU version instead of the GPU version. 

Try playing with the number of particles in the simulation, especially in larger scales ones like the universe expansion simulation. 

I took some inspiration from the visuals of N0rvel's galaxy simulation - you can find his project here!
https://galaxym.ovh/
