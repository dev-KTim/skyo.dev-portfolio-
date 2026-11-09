# Design

A night walk through an underground city, told in scroll-pinned chapters. Pixel-synthwave
developer terminal on top (Pixelify Sans display, DM Mono body, violet surface, cyan signal,
magenta sparks), a raymarched neon underworld underneath. Derived from portfolio v1.x
(#141414 / #732FAC / #943adf / #0dffeb) and committed as the brand system in v2.0; v4.0
adds the places.

## v4.0: the places

Every chapter is a place. The page is one long walk: you enter a tunnel, go down into a
server basement, walk along a graffiti wall, stop in a hall full of tags, cross a metro
platform and come out on a rooftop. Scrolling moves the camera forward through the rooms.

| Chapter | Place | Room (shader) | Particle scene |
|---|---|---|---|
| `#hero` | tunnel entrance | tiled arch, magenta + cyan wall neon, wet floor, pipes | the brain mural (every neuron a repo, clickable) |
| `#now` | basement, server room | concrete box, fluorescent tubes, cable light at floor level | server rack with blinking LEDs |
| `#projects` | wall of fame | wide brick hall, pillars, high neon, dense graffiti | one wireframe model per project (phone, peaks, lock, cloud, die, play) |
| `#skills` | hall of tags | brick hall, pillars, violet + magenta neon | dust (the DOM tag wall is the content) |
| `#path` | line 1, all stops | tiled platform arch, cyan edge line, bright tubes | metro map with six stops |
| `#contact` | rooftop | open: wet roof, night sky with a haze at the horizon | skyline, sun, antenna beacon |

### Pinned chapters

`.chapter` is `calc(var(--len) * 100vh)` tall and holds one sticky `.stage` of `100dvh`. The
director maps `scrollY` to a chapter and a local progress `0..1`, which drives the camera, the
scene morph, the hero exit, the horizontal project track (vertical scroll pans the cards; the
model in the left frame morphs per card) and the tag wall. Reduced motion and no-WebGL unpin
everything into a plain vertical page via CSS only.

### The room (environment shader)

One fullscreen fragment shader raymarches a signed-distance corridor: floor at `y = -1`,
walls at `|x| = W`, ceiling either flat or an arch, optional square pillars every tube
spacing, optional pipes in the top corners, or fully open for the rooftop. Materials are
procedural: tiles, bricks or concrete with grime noise. Lights: two neon strips along the
walls (emissive + inverse-square light on surfaces), fluorescent tubes on the ceiling every
3.4 units, skylight on the rooftop. The floor is wet: a real one-bounce reflection with a
noise puddle mask and fresnel. Fog is exponential. The room renders at half resolution and
is copied into the scene target before the particles; the bloom pass makes the neon glow.

Room parameters live in `SKYO.Director.ROOMS` and are lerped between places as you scroll,
so a tunnel widens into a hall and the brick fades in.

### Graffiti

Procedural throw-ups on the walls: every 3 units along a wall a cell may hold a piece. A piece
is four leaning rounded-box letters (some with counters) in a signed-distance union, with a
gradient fill from the spray palette (magenta, cyan, violet, lavender, acid green, orange), a
white outline, a dark drop shadow, drips below the letters and overspray halo. Density per
place via `graffiti` (0 on the rooftop, 1 on the wall of fame).

### Hall of tags

The toolbox is a 2D canvas. Each skill is rendered to an offscreen glyph mask, sampled into
spray dots ordered left to right like a can pass, and painted in as the chapter scrolls
(scrubbable: scroll back and the paint lifts). Drop shadow first, colour, 8% overspray, then
drips once a word is 72% done. Hold the pointer to spray with your own can; the can colour
cycles on release.

## Color

Strategy: **Committed** — violet carries the surface, cyan is the signal colour.

| Token | Value | Role |
|---|---|---|
| `--bg` | `oklch(17% 0.025 300)` | page background (violet-tinted near-black, never `#000`) |
| `--bg-raised` | `oklch(21% 0.035 298)` | panels, nav, signs |
| `--card` | `oklch(28% 0.07 296)` | cards |
| `--violet` | `#943adf` | primary brand, borders, glows, sign plates |
| `--violet-deep` | `#732fac` | filled surfaces |
| `--indigo` | `#6a4bf6` | secondary, gradients |
| `--cyan` | `#0dffeb` | accent: headings, links, caret, focus. Signal only |
| `--magenta` | `#e100ff` | sparks, neon, spray |
| `--text` | `oklch(93% 0.02 300)` | body text |
| `--text-dim` | `oklch(72% 0.04 298)` | secondary text |

Spray cans (shader + tag wall only): magenta `#e100ff`, cyan `#0dffeb`, violet `#943adf`,
lavender `#cfc7ff`, acid green `#6cff73`, orange `#ff8c38`.

## Typography

- **Display**: Pixelify Sans (400–700). Headings, buttons, tags. `.spray` adds an SVG
  displacement filter (rough spray edge) and soft overspray text-shadow.
- **Body/UI**: DM Mono (400, 500). All body copy, prompts, labels, the HUD.
- Fluid scale: body 1rem/1.7, h2 `clamp(2rem, 4.5vw, 3.25rem)`, hero h1 `clamp(3.25rem, 9vw, 7.25rem)`.
- The terminal prompt appears once in the hero (`./introduce --me`) and as the fixed HUD
  `tim@skyo:~/<place>$` with a progress bar. Sections carry a place sign instead of eyebrows.

## Depth & Motion

- Camera anchoring is a lens shift in clip space, so a model parked over a DOM column keeps
  its perspective.
- Easing: `cubic-bezier(0.22, 1, 0.36, 1)`. Damped camera (`1 - exp(-λ dt)`), no springs.
- Animate only transforms/opacity in the DOM. Scroll reveals via IntersectionObserver;
  chapter-driven stagger via `.is-active`.
- Everything gated behind `prefers-reduced-motion`: no morphs, no pinning, no spray
  animation (the wall is fully painted), static room.

## Components

- **Place sign**: enamel plate, mono uppercase, 2px violet border, slight rotation, hard
  offset shadow, one paint drip.
- **Stage frame**: four corner brackets around the 3D model with a mono readout.
- **Pixel button**: Pixelify label, 2px border, hard offset shadow, magnetic hover.
- **Project card**: no box on desktop (the wall is the surface); scrim box on narrow screens.
- **Chips**: mono label, 1px border, pill.
- **HUD**: fixed bottom-left prompt pill with the current place and chapter progress.

## Z scale

0 canvas · 1 vignette · 2 content · 3 grain · 5 neuron labels · 8 HUD · 10 nav ·
15 mobile menu · 20 privacy banner · 30 boot · 50 scroll progress · 60 skip link.
