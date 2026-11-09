# skyo.dev — portfolio v4.0

Personal portfolio of Tim Kolesnikov. Hand-written in vanilla HTML, CSS and JavaScript:
no frameworks, no libraries, no build step, no cookies, no tracking, no external requests
(fonts are self-hosted).

v4 is a night walk through an underground city. Every chapter is a place, pinned while you
scroll, and the camera moves through it:

tunnel entrance (a neon brain mural, every neuron a GitHub repo) → basement server room
(where I work: ADMIN INTELLIGENCE, Ulm) → wall of fame (six project models on a brick wall,
horizontal pan) → hall of tags (the toolbox sprayed on as you scroll, spray your own) →
metro line (the path so far as a subway map) → rooftop (contact).

Under the hood, one WebGL canvas with two hand-written layers:

- a **raymarched room**: signed-distance corridors with neon strips, fluorescent tubes,
  tiles, bricks, pillars, pipes, procedural graffiti, a wet floor with real reflections
  and fog, rendered at half resolution;
- a **particle pool** (~2,400 points + wireframe edges) that morphs scene to scene on the
  GPU: brain → server rack → phone / peaks / padlock / cloud / die / play → metro map →
  skyline;
- plus a **bloom pass** (downsample, separable gaussian, chromatic spread) over both.

Files:

- `index.html` — the site
- `styles/main.css` — design system & all styling (see `DESIGN.md`)
- `Javascript/math3d.js` — mat4 / RNG / noise / easing
- `Javascript/engine.js` — WebGL renderer: environment shader, particle morphing, bloom
- `Javascript/scenes.js` — procedural geometry for every particle scene
- `Javascript/director.js` — scroll choreography, rooms per place, camera, HUD, labels
- `Javascript/ui.js` — boot, typewriter, reveals, tilt, tag wall, nav, banner
- `Javascript/main.js` — entry point & feature detection
- `fonts/` — self-hosted Pixelify Sans + DM Mono (woff2)
- `impressum.html` / `privacy-policy.html` — German legal pages (`styles/legal.css`)

Everything respects `prefers-reduced-motion` (no pinning, no morphs, static room), and the
site stays fully readable without WebGL (`body.no-webgl` unpins everything).

Local preview: any static server, e.g. `python3 -m http.server 8741`.
