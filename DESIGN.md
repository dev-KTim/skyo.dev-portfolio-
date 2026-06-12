# Design

Pixel-synthwave developer terminal. Dark violet space scene, neon violet/cyan glow, pixel display type over mono body, layered mountain horizon, perspective grid floor. Derived from portfolio v1.x (#141414 / #732FAC / #943adf / #0dffeb, Pixelify Sans + mono) and committed as the brand system in v2.0.

## Color

Strategy: **Committed** — violet carries the surface, cyan is the signal color.

| Token | Value | Role |
|---|---|---|
| `--bg` | `oklch(17% 0.025 300)` ≈ `#15111e` | page background (violet-tinted near-black, never `#000`) |
| `--bg-raised` | `oklch(21% 0.035 298)` ≈ `#1e1730` | panels, nav, terminal windows |
| `--card` | `oklch(28% 0.07 296)` ≈ `#2c1e4e` | cards (from v1 `#362354`) |
| `--violet` | `#943adf` | primary brand, borders, glows |
| `--violet-deep` | `#732fac` | filled surfaces, bubbles |
| `--indigo` | `#6a4bf6` | secondary, gradients, "me" bubbles |
| `--cyan` | `#0dffeb` | accent: headings, links, caret, focus. Signal only, never body text blocks |
| `--magenta` | `#e100ff` | rare sparks (glitch shadows, gradient ends) |
| `--text` | `oklch(93% 0.02 300)` ≈ `#ece7f7` | body text |
| `--text-dim` | `oklch(72% 0.04 298)` ≈ `#a99dc9` | secondary text |

Glow shadows use the violet family (`0 0 Npx` soft shadows), the v1 signature.

## Typography

- **Display**: Pixelify Sans (400–700). Headings, buttons, big numbers. The brand voice.
- **Body/UI**: DM Mono (400, 500). All body copy, prompts, code, labels.
- Fluid scale, ratio ≥1.3: body 1rem/1.7 → h2 `clamp(2rem, 4.5vw, 3.25rem)` → hero h1 `clamp(3.25rem, 10vw, 7.5rem)`.
- Section grammar: a mono terminal prompt line (`tim@skyo:~$ …`) above each Pixelify heading. Deliberate, named system: "the prompt".
- Body line length ≤ 70ch.

## Depth & Motion

- 3D via `perspective` + `transform-style: preserve-3d`: pointer-tracked tilt cards with specular glare (`--gx/--gy` radial), inner layers on `translateZ`.
- Easing: `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out-quint family). No bounce, no elastic.
- Animate only transforms/opacity (exception: the timeline line uses `scaleY`).
- Scroll reveals: rise + slight `rotateX`, staggered, via IntersectionObserver.
- Everything gated behind `prefers-reduced-motion`; static fallbacks required.

## Components

- **Terminal window**: `--bg-raised`, 1px violet border, titlebar with three dots + mono filename.
- **Chat bubbles**: question = `--violet-deep` left-aligned, answer = `--indigo` right-aligned, 17px radius heritage rounded to 14px.
- **Pixel button**: Pixelify label, 2px border, hard offset shadow (retro), magnetic hover.
- **Tilt card**: rounded 24px, violet border that brightens on hover, glare layer, glow shadow.
- **Skill chip**: mono label, 1px border, marquee belt.

## Scene assets

Layered mountain peaks (inline SVG, fills from peak tokens `#241b3e / #2c1e4e / #3a2766`), canvas starfield, CSS perspective grid floor, radial horizon glow. Heritage Haikei SVGs live in `Design SVGS/`.
