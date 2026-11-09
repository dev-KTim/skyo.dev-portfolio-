/* ==========================================================================
   skyo.dev — main.js
   Entry point: feature detection, adaptive particle budget, wiring the
   engine + director + UI together. Everything degrades: no WebGL means a
   fully readable static site (body.no-webgl), reduced motion means zero
   animation but a still 3D frame per section.
   ========================================================================== */

(() => {
  "use strict";

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Particle budget scaled to the device
  const narrow = window.innerWidth < 1024;
  const count = narrow ? 1500 : 2400;

  let engine = null;
  try {
    const canvas = document.getElementById("gl");
    engine = new SKYO.Engine(canvas, { count, post: true });
  } catch (err) {
    engine = null;
    document.body.classList.add("no-webgl");
  }

  SKYO.UI.init({ reduced, noWebgl: !engine });

  if (engine) {
    SKYO.app = {
      engine,
      director: new SKYO.Director(engine, { reduced }),
    };
  }
})();
