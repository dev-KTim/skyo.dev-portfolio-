/* ==========================================================================
   skyo.dev — scenes.js
   Procedural geometry. Every scene fills the SAME pool of N particles
   (positions, colors, sizes) plus a wireframe edge list, so the engine can
   morph any scene into any other 1:1.

   Scenes: nebula, brain, rack, phone, peaks, lock, cloud, die, play, path, horizon
   ========================================================================== */

window.SKYO = window.SKYO || {};

SKYO.Scenes = (() => {
  "use strict";
  const M = SKYO.M;

  const VIOLET  = [0.58, 0.23, 0.87];
  const DEEP    = [0.42, 0.17, 0.63];
  const INDIGO  = [0.42, 0.29, 0.96];
  const CYAN    = [0.05, 1.00, 0.92];
  const MAGENTA = [0.88, 0.00, 1.00];
  const LAV     = [0.81, 0.78, 1.00];

  const cache = {};

  const alloc = (N) => ({
    pos: new Float32Array(N * 3),
    col: new Float32Array(N * 3),
    size: new Float32Array(N),
    _edges: [],
  });

  const put = (s, i, p, c, sz) => {
    s.pos[i * 3] = p[0]; s.pos[i * 3 + 1] = p[1]; s.pos[i * 3 + 2] = p[2];
    s.col[i * 3] = c[0]; s.col[i * 3 + 1] = c[1]; s.col[i * 3 + 2] = c[2];
    s.size[i] = sz;
  };

  const mixc = (a, b, t) => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];

  const finish = (s) => {
    s.edges = new Uint16Array(s._edges);
    delete s._edges;
    return s;
  };

  /* Uniform direction on a sphere. */
  const sphereDir = (r) => {
    const u = r() * 2 - 1;
    const phi = r() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    return [s * Math.cos(phi), u, s * Math.sin(phi)];
  };

  /* Sample points along a polyline, chaining wireframe edges as it goes. */
  const polyline = (s, pts, i0, count, color, sz, withEdges) => {
    let total = 0;
    for (let k = 0; k < pts.length - 1; k++) {
      total += Math.hypot(
        pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1], pts[k + 1][2] - pts[k][2]);
    }
    let prev = -1;
    for (let j = 0; j < count; j++) {
      let d = (j / Math.max(count - 1, 1)) * total, k = 0;
      let seg = Math.hypot(
        pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]);
      while (d > seg && k < pts.length - 2) {
        d -= seg; k++;
        seg = Math.hypot(
          pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1], pts[k + 1][2] - pts[k][2]);
      }
      const t = seg > 0 ? d / seg : 0;
      const p = [
        M.lerp(pts[k][0], pts[k + 1][0], t),
        M.lerp(pts[k][1], pts[k + 1][1], t),
        M.lerp(pts[k][2], pts[k + 1][2], t),
      ];
      put(s, i0 + j, p, color, sz);
      if (withEdges && prev >= 0) s._edges.push(prev, i0 + j);
      prev = i0 + j;
    }
    return i0 + count;
  };

  /* Closed rounded-rectangle polyline in the z=0 plane (half extents w, h). */
  const roundedRect = (w, h, rad, steps) => {
    const pts = [];
    const seg = (cx, cy, a0, a1) => {
      for (let k = 0; k <= steps; k++) {
        const a = a0 + (a1 - a0) * (k / steps);
        pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, 0]);
      }
    };
    seg(w - rad, h - rad, 0, Math.PI / 2);
    seg(-(w - rad), h - rad, Math.PI / 2, Math.PI);
    seg(-(w - rad), -(h - rad), Math.PI, Math.PI * 1.5);
    seg(w - rad, -(h - rad), Math.PI * 1.5, Math.PI * 2);
    pts.push(pts[0]);
    return pts;
  };

  /* 12 wireframe edges of a box with half extents (w, h, d), centred at cy. */
  const boxEdges = (s, i, w, h, d, cy, per, color, sz) => {
    const C = [
      [-w, cy - h, -d], [w, cy - h, -d], [w, cy - h, d], [-w, cy - h, d],
      [-w, cy + h, -d], [w, cy + h, -d], [w, cy + h, d], [-w, cy + h, d],
    ];
    for (const [a, b] of [
      [0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ]) {
      i = polyline(s, [C[a], C[b]], i, per, color, sz, true);
    }
    return i;
  };

  /* ---------------- nebula: loose star dust ---------------- */

  const buildNebula = (N) => {
    const s = alloc(N);
    const r = M.rng(21);
    for (let i = 0; i < N; i++) {
      const d = sphereDir(r);
      const rad = 1.6 + r() * 3.4;
      const p = [d[0] * rad * 1.6, d[1] * rad, d[2] * rad];
      const roll = r();
      const c = roll < 0.08 ? CYAN : roll < 0.14 ? MAGENTA : roll < 0.5 ? LAV : DEEP;
      put(s, i, p, c, 1.2 + r() * 2.2);
    }
    return finish(s);
  };

  /* ---------------- brain: the hero ---------------- */

  /* Wrinkled cortex radius along a direction; shared with node placement. */
  const cortexPoint = (d) => {
    const R = [0.98, 0.82, 1.18]; // width, height, length
    let x = d[0] * R[0], y = d[1] * R[1], z = d[2] * R[2];
    const wr = 1 + 0.085 * (M.noise3(x * 2.6 + 9, y * 2.6, z * 2.6) * 2 - 1)
                 + 0.045 * (M.noise3(x * 6 + 40, y * 6, z * 6) * 2 - 1);
    x *= wr; y *= wr; z *= wr;
    // interhemispheric fissure
    const sign = x >= 0 ? 1 : -1;
    x = sign * (Math.abs(x) * 0.92 + 0.07);
    // flatter underside
    if (y < -0.5) y = -0.5 - (y + 0.5) * 0.45;
    return [x, y, z];
  };

  const NODE_DIRS = {
    "p-kivideos":      [0.30, 0.70, 0.78],
    "p-portfolio":     [0.78, 0.62, -0.05],
    "p-aegiscrypt":    [-0.80, 0.40, 0.55],
    "p-cweather":      [0.70, 0.10, -0.75],
    "p-numberguesser": [-0.55, 0.30, -0.85],
    "p-youtubecopy":   [-0.30, 0.95, -0.10],
  };
  const NODE_LABELS = {
    "p-kivideos": "ki-videos (private)",
    "p-portfolio": "skyo.dev",
    "p-aegiscrypt": "aegiscrypt",
    "p-cweather": "c-weather",
    "p-numberguesser": "number-guesser",
    "p-youtubecopy": "youtube-copy",
  };
  const NODE_COUNT = Object.keys(NODE_DIRS).length;

  const norm = (v) => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  };

  const buildBrain = (N) => {
    const s = alloc(N);
    const r = M.rng(4242);

    const nCortex = Math.floor(N * 0.70);
    const nCereb = Math.floor(N * 0.11);
    const nStem = Math.floor(N * 0.02);
    let i = 0;

    const cortexIdx = [];
    for (; i < nCortex; i++) {
      const p = cortexPoint(sphereDir(r));
      const t = M.clamp((p[1] + 0.9) / 1.8, 0, 1); // darker below, brighter on top
      let c = mixc(DEEP, VIOLET, t);
      const roll = r();
      if (roll < 0.06) c = CYAN;
      else if (roll < 0.09) c = INDIGO;
      put(s, i, p, c, 2.1 + r() * 1.9);
      cortexIdx.push(i);
    }

    // cerebellum: smaller, tighter wrinkles, lower back
    for (; i < nCortex + nCereb; i++) {
      const d = sphereDir(r);
      let p = [d[0] * 0.46, d[1] * 0.30, d[2] * 0.36];
      const wr = 1 + 0.10 * (M.noise3(p[0] * 9, p[1] * 9 + 3, p[2] * 9) * 2 - 1);
      p = [p[0] * wr, p[1] * wr - 0.52, p[2] * wr - 0.88];
      put(s, i, p, mixc(DEEP, INDIGO, r() * 0.6), 1.5 + r() * 1.2);
    }

    // brainstem
    for (; i < nCortex + nCereb + nStem; i++) {
      const t = r();
      const a = r() * Math.PI * 2;
      const rad = 0.10 + r() * 0.04;
      put(s, i, [
        Math.cos(a) * rad,
        -0.45 - t * 0.42,
        -0.55 - t * 0.28 + Math.sin(a) * rad,
      ], DEEP, 1.4 + r());
    }

    // the tunnel: arched rings receding behind the mural, joined by four rails
    const arch = (z) => {
      const pts = [];
      const W = 2.3, Y0 = -1.5, Y1 = 0.6, R = 1.1;
      pts.push([-W, Y0, z], [-W, Y1, z]);
      for (let k = 1; k < 12; k++) {
        const a = Math.PI - (k / 12) * Math.PI;
        pts.push([Math.cos(a) * W, Y1 + Math.sin(a) * R, z]);
      }
      pts.push([W, Y1, z], [W, Y0, z]);
      return pts;
    };
    const rings = 7;
    const ringPts = [];
    for (let k = 0; k < rings && i < N - NODE_COUNT - 60; k++) {
      const z = -1.4 - k * 0.95;
      const fade = 1 - k / rings;
      const pts = arch(z);
      ringPts.push(pts);
      i = polyline(s, pts, i, 34, mixc([0.16, 0.08, 0.26], DEEP, fade), 1.1 + fade * 0.5, true);
    }
    for (const idx of [0, 1, 7, 13, 14]) {
      if (ringPts.length < 2) break;
      const rail = ringPts.map((pts) => pts[idx]);
      i = polyline(s, rail, i, Math.min(28, N - NODE_COUNT - i), DEEP, 1.0, true);
    }
    // leftover: dust in the tunnel air
    for (; i < N - NODE_COUNT; i++) {
      const d = sphereDir(r);
      const rad = 1.7 + r() * 1.6;
      put(s, i, [d[0] * rad, d[1] * rad * 0.8, d[2] * rad], DEEP, 1 + r() * 1.4);
    }

    // synapses: nearest-neighbour wiring across a cortex subset
    const sub = [];
    for (let k = 0; k < cortexIdx.length; k += 4) sub.push(cortexIdx[k]);
    const maxEdges = 620;
    let edges = 0;
    for (let a = 0; a < sub.length && edges < maxEdges; a++) {
      let best = -1, bd = 0.34 * 0.34;
      const ia = sub[a];
      for (let b = a + 1; b < Math.min(a + 40, sub.length); b++) {
        const ib = sub[b];
        const dx = s.pos[ia * 3] - s.pos[ib * 3];
        const dy = s.pos[ia * 3 + 1] - s.pos[ib * 3 + 1];
        const dz = s.pos[ia * 3 + 2] - s.pos[ib * 3 + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < bd && d2 > 0.02) { bd = d2; best = ib; }
      }
      if (best >= 0) { s._edges.push(ia, best); edges++; }
    }

    // project neurons: the last particles, big & cyan
    s.nodes = [];
    let ni = N - NODE_COUNT;
    for (const id of Object.keys(NODE_DIRS)) {
      const p = cortexPoint(norm(NODE_DIRS[id]));
      const out = 1.04; // sit just above the surface
      const pp = [p[0] * out, p[1] * out, p[2] * out];
      put(s, ni, pp, CYAN, 7.5);
      s.nodes.push({ id, label: NODE_LABELS[id], pos: pp, particle: ni });
      ni++;
    }
    return finish(s);
  };

  /* ---------------- peaks: the skyo logo as low-poly terrain ---------------- */

  const buildPeaks = (N) => {
    const s = alloc(N);
    const r = M.rng(77);
    const GX = 24, GZ = 10;
    const H = (x, z) => {
      const n = M.noise3(x * 1.15 + 3.7, 0, z * 1.4 + 8.2);
      const ridge = 1 - Math.abs(n * 2 - 1);
      return Math.pow(ridge, 2.1) * 1.15 - 0.55;
    };

    // grid nodes + wireframe
    const gidx = [];
    let i = 0;
    for (let gz = 0; gz < GZ; gz++) {
      for (let gx = 0; gx < GX; gx++) {
        const x = (gx / (GX - 1) - 0.5) * 2.9;
        const z = (gz / (GZ - 1) - 0.5) * 2.0;
        const y = H(x, z);
        const t = M.clamp((y + 0.55) / 1.1, 0, 1);
        put(s, i, [x, y, z], mixc(DEEP, VIOLET, t), 1.8 + t * 1.6);
        gidx.push(i);
        if (gx > 0) s._edges.push(i - 1, i);
        if (gz > 0) s._edges.push(i - GX, i);
        i++;
      }
    }

    // extra scatter riding the surface
    const nScatter = N - i - 3;
    for (let j = 0; j < nScatter; j++, i++) {
      const x = (r() - 0.5) * 2.9;
      const z = (r() - 0.5) * 2.0;
      const y = H(x, z) + r() * 0.02;
      const t = M.clamp((y + 0.55) / 1.1, 0, 1);
      put(s, i, [x, y, z], t > 0.72 ? mixc(VIOLET, LAV, (t - 0.72) * 2.5) : DEEP, 1 + t * 1.6);
    }

    // the two cyan pixel-stars from the favicon, plus one bonus
    put(s, i++, [-0.75, 0.95, -0.2], CYAN, 5);
    put(s, i++, [0.85, 1.05, 0.1], CYAN, 4);
    put(s, i++, [0.15, 1.25, -0.4], LAV, 3);
    return finish(s);
  };

  /* ---------------- lock: AegisCrypt ---------------- */

  const buildLock = (N) => {
    const s = alloc(N);
    const r = M.rng(1001);
    const bx = 0.66, byT = 0.08, byB = -0.92, bz = 0.30;
    let i = 0;

    // body faces (scatter)
    const nBody = Math.floor(N * 0.42);
    for (let j = 0; j < nBody; j++, i++) {
      const f = (r() * 6) | 0;
      const u = r() * 2 - 1, v = r() * 2 - 1;
      let p;
      if (f === 0) p = [u * bx, byB + (v * 0.5 + 0.5) * (byT - byB), bz];
      else if (f === 1) p = [u * bx, byB + (v * 0.5 + 0.5) * (byT - byB), -bz];
      else if (f === 2) p = [bx, byB + (v * 0.5 + 0.5) * (byT - byB), u * bz];
      else if (f === 3) p = [-bx, byB + (v * 0.5 + 0.5) * (byT - byB), u * bz];
      else if (f === 4) p = [u * bx, byT, v * bz];
      else p = [u * bx, byB, v * bz];
      put(s, i, p, mixc(DEEP, VIOLET, r() * 0.8), 1.3 + r() * 1.2);
    }

    // body wireframe: 12 box edges as dense chains
    const C = [
      [-bx, byB, -bz], [bx, byB, -bz], [bx, byB, bz], [-bx, byB, bz],
      [-bx, byT, -bz], [bx, byT, -bz], [bx, byT, bz], [-bx, byT, bz],
    ];
    const boxEdges = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];
    for (const [a, b] of boxEdges) {
      i = polyline(s, [C[a], C[b]], i, 7, VIOLET, 1.8, true);
    }

    // shackle: torus arc + straight legs
    const shk = [];
    const R = 0.42, lift = byT;
    for (let k = 0; k <= 26; k++) {
      const a = Math.PI * (k / 26);
      shk.push([Math.cos(a) * -R, lift + Math.sin(a) * R + 0.02, 0]);
    }
    const shackle = [[-R, lift - 0.16, 0], ...shk.reverse(), [R, lift - 0.16, 0]];
    i = polyline(s, shackle, i, Math.floor(N * 0.16), LAV, 2.0, true);

    // keyhole: circle + slot on the front face
    const hole = [];
    for (let k = 0; k <= 18; k++) {
      const a = Math.PI * 2 * (k / 18);
      hole.push([Math.cos(a) * 0.13, -0.30 + Math.sin(a) * 0.13, bz + 0.01]);
    }
    i = polyline(s, hole, i, 40, CYAN, 2.2, true);
    i = polyline(s, [[0, -0.40, bz + 0.01], [0, -0.62, bz + 0.01]], i, 12, CYAN, 2.2, true);

    // rest: faint aura
    for (; i < N; i++) {
      const d = sphereDir(r);
      put(s, i, [d[0] * (1.5 + r()), d[1] * (1.2 + r()) - 0.3, d[2] * (1.5 + r())], DEEP, 1 + r());
    }
    return finish(s);
  };

  /* ---------------- cloud: C-weather ---------------- */

  const buildCloud = (N) => {
    const s = alloc(N);
    const r = M.rng(2024);
    const blobs = [
      [-0.62, 0.02, 0, 0.38], [-0.15, 0.22, 0.08, 0.46], [0.35, 0.16, -0.05, 0.42],
      [0.68, -0.02, 0.04, 0.30], [0.05, -0.02, -0.1, 0.44],
    ];
    let i = 0;
    const nCloud = Math.floor(N * 0.62);
    for (let j = 0; j < nCloud; j++) {
      const b = blobs[(r() * blobs.length) | 0];
      const d = sphereDir(r);
      let p = [b[0] + d[0] * b[3], b[1] + d[1] * b[3] * 0.8, b[2] + d[2] * b[3] * 0.8];
      if (p[1] < -0.18) p[1] = -0.18 - (p[1] + 0.18) * 0.15; // flat base
      let inside = false;
      for (const o of blobs) {
        if (o === b) continue;
        const dx = p[0] - o[0], dy = p[1] - o[1], dz = p[2] - o[2];
        if (dx * dx + dy * dy + dz * dz < o[3] * o[3] * 0.75) { inside = true; break; }
      }
      if (inside) continue;
      const t = M.clamp((p[1] + 0.2) / 0.8, 0, 1);
      put(s, i++, p, mixc(INDIGO, LAV, t), 1.6 + r() * 1.6);
    }

    // rain: short dashed cyan streaks under the cloud
    const rainBudget = Math.floor(N * 0.22);
    const perCol = 6;
    const nRainCols = Math.floor(rainBudget / perCol);
    for (let cIdx = 0; cIdx < nRainCols; cIdx++) {
      const x = (r() - 0.5) * 1.5;
      const z = (r() - 0.5) * 0.7;
      const y0 = -0.34 - r() * 0.5;
      for (let k = 0; k < perCol && i < N - 1; k++) {
        const y = y0 - k * 0.07;
        put(s, i, [x, y, z], CYAN, 1.6);
        if (k % 2 === 1) s._edges.push(i - 1, i); // dashes
        i++;
      }
    }

    // aura
    for (; i < N; i++) {
      const d = sphereDir(r);
      put(s, i, [d[0] * 2 * (1 + r()), d[1] * 1.4 * (1 + r()), d[2] * 2], DEEP, 1 + r());
    }
    return finish(s);
  };

  /* ---------------- die: Number-Guesser ---------------- */

  const buildDie = (N) => {
    const s = alloc(N);
    const r = M.rng(66);
    const e = 0.62;
    let i = 0;

    // faces scatter
    const nFace = Math.floor(N * 0.42);
    for (let j = 0; j < nFace; j++, i++) {
      const f = (r() * 6) | 0;
      const u = (r() * 2 - 1) * e, v = (r() * 2 - 1) * e;
      const p = f === 0 ? [u, v, e] : f === 1 ? [u, v, -e]
        : f === 2 ? [e, u, v] : f === 3 ? [-e, u, v]
        : f === 4 ? [u, e, v] : [u, -e, v];
      put(s, i, p, mixc(DEEP, VIOLET, 0.35 + r() * 0.5), 1.2 + r());
    }

    // cube wireframe
    const V = [
      [-e, -e, -e], [e, -e, -e], [e, -e, e], [-e, -e, e],
      [-e, e, -e], [e, e, -e], [e, e, e], [-e, e, e],
    ];
    for (const [a, b] of [
      [0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ]) {
      i = polyline(s, [V[a], V[b]], i, 8, VIOLET, 1.9, true);
    }

    // pips (1 top, 6 bottom, 3 front, 4 back, 5 right, 2 left)
    const pip = (cx, cy, cz, nx, ny, nz) => {
      const per = 18;
      for (let k = 0; k < per && i < N; k++, i++) {
        const a = r() * Math.PI * 2, rad = Math.sqrt(r()) * 0.11;
        let p;
        if (nx) p = [cx, cy + Math.cos(a) * rad, cz + Math.sin(a) * rad];
        else if (ny) p = [cx + Math.cos(a) * rad, cy, cz + Math.sin(a) * rad];
        else p = [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, cz];
        put(s, i, p, CYAN, 3.4);
      }
    };
    const g = 0.30, f = e + 0.015;
    pip(0, f, 0, 0, 1, 0); // 1
    for (const [x, z] of [[-g, -g], [-g, 0], [-g, g], [g, -g], [g, 0], [g, g]]) pip(x, -f, z, 0, 1, 0); // 6
    for (const [x, y] of [[-g, -g], [0, 0], [g, g]]) pip(x, y, f, 0, 0, 1); // 3
    for (const [x, y] of [[-g, -g], [-g, g], [g, -g], [g, g]]) pip(x, y, -f, 0, 0, 1); // 4
    for (const [y, z] of [[-g, -g], [-g, g], [0, 0], [g, -g], [g, g]]) pip(f, y, z, 1, 0, 0); // 5
    for (const [y, z] of [[-g, -g], [g, g]]) pip(-f, y, z, 1, 0, 0); // 2

    for (; i < N; i++) {
      const d = sphereDir(r);
      put(s, i, [d[0] * (1.6 + r()), d[1] * (1.4 + r()), d[2] * (1.6 + r())], DEEP, 1 + r());
    }
    return finish(s);
  };

  /* ---------------- play: YouTube-Copy ---------------- */

  const buildPlay = (N) => {
    const s = alloc(N);
    const r = M.rng(314);
    let i = 0;

    // rounded-rect screen outline, front & back slab
    const outline = roundedRect(0.98, 0.66, 0.2, 5);
    const front = outline.map((p) => [p[0], p[1], 0.14]);
    const back = outline.map((p) => [p[0], p[1], -0.14]);
    i = polyline(s, front, i, Math.floor(N * 0.16), VIOLET, 1.9, true);
    i = polyline(s, back, i, Math.floor(N * 0.12), DEEP, 1.5, true);

    // play triangle prism
    const tri = [[-0.22, 0.3, 0], [0.38, 0, 0], [-0.22, -0.3, 0], [-0.22, 0.3, 0]];
    const triF = tri.map((p) => [p[0], p[1], 0.15]);
    const triB = tri.map((p) => [p[0], p[1], -0.15]);
    i = polyline(s, triF, i, Math.floor(N * 0.10), CYAN, 2.3, true);
    i = polyline(s, triB, i, Math.floor(N * 0.07), CYAN, 1.7, true);

    // triangle fill scatter
    const nFill = Math.floor(N * 0.22);
    for (let j = 0; j < nFill && i < N; j++, i++) {
      let a = r(), b = r();
      if (a + b > 1) { a = 1 - a; b = 1 - b; }
      const p0 = tri[0], p1 = tri[1], p2 = tri[2];
      put(s, i, [
        p0[0] + (p1[0] - p0[0]) * a + (p2[0] - p0[0]) * b,
        p0[1] + (p1[1] - p0[1]) * a + (p2[1] - p0[1]) * b,
        (r() - 0.5) * 0.26,
      ], mixc(CYAN, INDIGO, r() * 0.5), 1.4 + r());
    }

    for (; i < N; i++) {
      const d = sphereDir(r);
      put(s, i, [d[0] * (1.7 + r()), d[1] * (1.3 + r()), d[2] * (1.5 + r())], DEEP, 1 + r());
    }
    return finish(s);
  };

  /* ---------------- path: the metro map ---------------- */

  const buildPath = (N) => {
    const s = alloc(N);
    const r = M.rng(555);
    let i = 0;

    // thick line = two parallel polylines
    const thick = (pts, count, color, sz, off) => {
      const a = pts.map((p) => [p[0], p[1] + off, p[2]]);
      const b = pts.map((p) => [p[0], p[1] - off, p[2]]);
      i = polyline(s, a, i, count, color, sz, true);
      i = polyline(s, b, i, count, color, sz, true);
    };

    // line 1 (violet): the main route, 45-degree bends, six stops
    const line1 = [
      [-1.6, -0.95, 0], [-1.05, -0.95, 0], [-0.6, -0.5, 0], [0.0, -0.5, 0],
      [0.45, -0.05, 0], [0.95, -0.05, 0], [1.3, 0.3, 0], [1.65, 0.3, 0],
    ];
    thick(line1, Math.floor(N * 0.11), VIOLET, 1.9, 0.022);
    // line 2 (cyan): crosses the map
    const line2 = [[-1.3, 0.75, -0.05], [-0.7, 0.75, -0.05], [0.0, 0.05, -0.05], [0.0, -0.5, -0.05], [0.4, -0.9, -0.05], [1.2, -0.9, -0.05]];
    thick(line2, Math.floor(N * 0.07), CYAN, 1.5, 0.018);
    // line 3 (magenta): short spur
    const line3 = [[0.95, -0.05, 0.05], [0.95, 0.55, 0.05], [1.4, 0.95, 0.05]];
    thick(line3, Math.floor(N * 0.035), MAGENTA, 1.4, 0.016);

    // stops on line 1: ring + core (one per timeline entry)
    const stops = [line1[0], line1[2], line1[3], line1[5], line1[6], line1[7]];
    s.stops = [];
    for (const p of stops) {
      const ring = [];
      for (let k = 0; k <= 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        ring.push([p[0] + Math.cos(a) * 0.075, p[1] + Math.sin(a) * 0.075, p[2] + 0.01]);
      }
      i = polyline(s, ring, i, 22, LAV, 1.6, true);
      put(s, i++, [p[0], p[1], p[2] + 0.02], CYAN, 5.5);
      s.stops.push([p[0], p[1], p[2] + 0.02]);
    }
    // interchange marks where lines meet
    for (const p of [[0.0, -0.5, 0.02], [0.95, -0.05, 0.02]]) {
      const ring = [];
      for (let k = 0; k <= 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        ring.push([p[0] + Math.cos(a) * 0.11, p[1] + Math.sin(a) * 0.11, p[2]]);
      }
      i = polyline(s, ring, i, 24, [1, 1, 1], 1.3, true);
    }

    // map grid: faint dotted paper behind the lines
    const GX = 18, GY = 11;
    for (let gy = 0; gy < GY && i < N - 60; gy++) {
      for (let gx = 0; gx < GX && i < N - 60; gx++) {
        put(s, i++, [(gx / (GX - 1) - 0.5) * 3.8, (gy / (GY - 1) - 0.5) * 2.4, -0.15],
          [0.2, 0.12, 0.32], 1.0);
      }
    }

    // dust
    for (; i < N; i++) {
      const d = sphereDir(r);
      put(s, i, [d[0] * (1.6 + r() * 1.4), d[1] * (1.2 + r()), d[2] * (0.8 + r())], DEEP, 1 + r());
    }
    return finish(s);
  };

  /* ---------------- horizon: rooftop, skyline and a synthwave sun ---------------- */

  const buildHorizon = (N) => {
    const s = alloc(N);
    const r = M.rng(1986);
    let i = 0;

    // striped sun disc, low behind the skyline
    const nSun = Math.floor(N * 0.30);
    const sunC = [1.35, 0.38, -1.6], sunR = 0.78;
    for (let j = 0; j < nSun;) {
      const a = r() * Math.PI * 2;
      const rad = Math.sqrt(r()) * sunR;
      const y = Math.sin(a) * rad;
      if (y < 0) {
        const band = Math.abs(y) * 7;
        if (band - Math.floor(band) < 0.28 + Math.abs(y) * 0.3) continue;
      }
      const t = M.clamp((y / sunR + 1) / 2, 0, 1);
      put(s, i++, [sunC[0] + Math.cos(a) * rad, sunC[1] + y, sunC[2]],
        mixc(MAGENTA, [1.0, 0.62, 0.35], t), 3.2 + r() * 2.2);
      j++;
    }

    // skyline: a row of building outlines with lit windows
    const base = -0.62;
    let x = -2.9;
    let tallest = null;
    const buildings = [];
    while (x < 2.9) {
      const w = 0.16 + r() * 0.34;
      const h = 0.25 + Math.pow(r(), 1.6) * 1.15;
      const z = -0.9 + r() * 0.4;
      buildings.push({ x, w, h, z });
      if (!tallest || h > tallest.h) tallest = buildings[buildings.length - 1];
      x += w + 0.04 + r() * 0.08;
    }
    for (const b of buildings) {
      if (i > N - 120) break;
      const pts = [[b.x, base, b.z], [b.x, base + b.h, b.z], [b.x + b.w, base + b.h, b.z], [b.x + b.w, base, b.z]];
      const far = M.clamp((b.z + 0.9) / 0.4, 0, 1);
      i = polyline(s, pts, i, 8 + Math.floor(b.h * 14), mixc(DEEP, VIOLET, 0.3 + far * 0.4), 1.4, true);
      // windows
      const nw = Math.floor(b.w * b.h * 60);
      for (let k = 0; k < nw && i < N - 100; k++, i++) {
        const lit = r();
        put(s, i, [b.x + 0.03 + r() * (b.w - 0.06), base + 0.05 + r() * (b.h - 0.1), b.z + 0.005],
          lit < 0.12 ? CYAN : lit < 0.5 ? LAV : [0.3, 0.2, 0.45], lit < 0.5 ? 1.5 : 1.0);
      }
    }
    // antenna on the tallest building, with a beacon
    if (tallest) {
      const ax = tallest.x + tallest.w / 2, top = base + tallest.h;
      i = polyline(s, [[ax, top, tallest.z], [ax, top + 0.28, tallest.z]], i, 7, LAV, 1.2, true);
      put(s, i++, [ax, top + 0.3, tallest.z], MAGENTA, 4.5);
      s.beacon = [ax, top + 0.3, tallest.z];
    }

    // our rooftop: parapet line in front, and a ledge
    i = polyline(s, [[-2.6, base - 0.55, 0.9], [2.6, base - 0.55, 0.9]], i, 40, VIOLET, 1.6, true);
    i = polyline(s, [[-2.6, base - 0.47, 0.9], [2.6, base - 0.47, 0.9]], i, 30, DEEP, 1.2, true);

    // stars
    for (; i < N; i++) {
      const d = sphereDir(r);
      const roll = r();
      put(s, i, [d[0] * 3.4, Math.abs(d[1]) * 2.4 + 0.2, -1.9 - r() * 1.6],
        roll < 0.1 ? CYAN : LAV, 1 + r() * 1.6);
    }
    return finish(s);
  };

  /* ---------------- rack: ADMIN INTELLIGENCE, a server cabinet ---------------- */

  const buildRack = (N) => {
    const s = alloc(N);
    const r = M.rng(2601);
    const W = 0.52, H = 1.02, D = 0.40; // half extents
    const F = D + 0.006;                // front face plane
    let i = 0;

    // cabinet frame
    i = boxEdges(s, i, W, H, D, 0, 9, VIOLET, 1.8);

    // rack units: 11 faceplates on the front, each with LEDs and a handle
    const units = 11;
    const uH = (2 * H - 0.16) / units;
    s.leds = [];
    for (let u = 0; u < units; u++) {
      const y0 = -H + 0.08 + u * uH;
      const yc = y0 + uH * 0.5;
      i = polyline(s, [[-W * 0.9, y0, F], [W * 0.9, y0, F]], i, 10, mixc(DEEP, VIOLET, 0.55), 1.5, true);
      // handle dash on the right
      i = polyline(s, [[W * 0.42, yc, F], [W * 0.8, yc, F]], i, 5, LAV, 1.6, true);
      // three status LEDs on the left
      for (let k = 0; k < 3 && i < N; k++) {
        const p = [-W * 0.78 + k * 0.075, yc, F + 0.004];
        const c = k === 0 ? CYAN : k === 1 ? mixc(CYAN, LAV, 0.5) : MAGENTA;
        put(s, i, p, c, 3.0);
        s.leds.push({ pos: p, col: c, phase: r() * 6.283, rate: 0.6 + r() * 2.4 });
        i++;
      }
      // vent dots across the middle
      const nVent = 10;
      for (let k = 0; k < nVent && i < N; k++, i++) {
        put(s, i, [-W * 0.3 + (k / (nVent - 1)) * W * 0.6, yc + (r() - 0.5) * uH * 0.5, F],
          mixc(DEEP, VIOLET, 0.3 + r() * 0.3), 1.1);
      }
    }
    i = polyline(s, [[-W * 0.9, H - 0.08, F], [W * 0.9, H - 0.08, F]], i, 10, mixc(DEEP, VIOLET, 0.55), 1.5, true);

    // side and top faces: sparse scatter so the cabinet reads as a volume
    const nFace = Math.floor(N * 0.18);
    for (let j = 0; j < nFace && i < N; j++, i++) {
      const f = (r() * 3) | 0;
      const u = r() * 2 - 1, v = r() * 2 - 1;
      const p = f === 0 ? [W, v * H, u * D] : f === 1 ? [-W, v * H, u * D] : [u * W, H, v * D];
      put(s, i, p, mixc(DEEP, VIOLET, r() * 0.6), 1.0 + r() * 0.8);
    }

    // cables: three sagging lines down the back
    for (let c = 0; c < 3 && i < N; c++) {
      const x0 = -W * 0.6 + c * W * 0.6;
      const pts = [];
      for (let k = 0; k <= 8; k++) {
        const t = k / 8;
        pts.push([x0 + Math.sin(t * 3.1 + c) * 0.08, H - 0.1 - t * (2 * H - 0.3), -D - 0.04 - Math.sin(t * Math.PI) * 0.1]);
      }
      i = polyline(s, pts, i, 22, c === 1 ? CYAN : INDIGO, 1.4, true);
    }

    // floor glow under the cabinet
    const nFloor = Math.floor(N * 0.06);
    for (let j = 0; j < nFloor && i < N; j++, i++) {
      const a = r() * Math.PI * 2, rad = Math.sqrt(r()) * 1.1;
      put(s, i, [Math.cos(a) * rad * 1.4, -H - 0.08, Math.sin(a) * rad], DEEP, 1 + r());
    }

    // aura
    for (; i < N; i++) {
      const d = sphereDir(r);
      put(s, i, [d[0] * (1.6 + r()), d[1] * (1.6 + r()), d[2] * (1.6 + r())], DEEP, 1 + r());
    }
    return finish(s);
  };

  /* ---------------- phone: ki-videos, a 9:16 feed ---------------- */

  const buildPhone = (N) => {
    const s = alloc(N);
    const r = M.rng(916);
    const W = 0.44, H = 0.90, T = 0.045;
    let i = 0;

    // body: front and back outline plus connecting edges at the corners
    const outline = roundedRect(W, H, 0.10, 5);
    const front = outline.map((p) => [p[0], p[1], T]);
    const back = outline.map((p) => [p[0], p[1], -T]);
    i = polyline(s, front, i, Math.floor(N * 0.11), LAV, 1.9, true);
    i = polyline(s, back, i, Math.floor(N * 0.08), DEEP, 1.3, true);
    for (let k = 0; k < outline.length; k += 6) {
      i = polyline(s, [front[k], back[k]], i, 3, DEEP, 1.3, true);
    }

    // screen inset
    const screen = roundedRect(W - 0.045, H - 0.06, 0.07, 4).map((p) => [p[0], p[1], T + 0.004]);
    i = polyline(s, screen, i, Math.floor(N * 0.07), mixc(VIOLET, CYAN, 0.35), 1.3, true);

    // camera dot
    put(s, i++, [0, H - 0.09, T + 0.006], LAV, 2.6);

    // the video: a 3D scene glyph (small wireframe cube) spinning inside the frame,
    // a play triangle, subtitle bars and a progress line
    const z = T + 0.008;
    i = boxEdges(s, i, 0.13, 0.13, 0.13, 0.22, 4, INDIGO, 1.4);
    const tri = [[-0.11, 0.14, z], [0.14, 0, z], [-0.11, -0.14, z], [-0.11, 0.14, z]].map((p) => [p[0], p[1] - 0.22, p[2]]);
    i = polyline(s, tri, i, Math.floor(N * 0.05), CYAN, 2.3, true);
    const nFill = Math.floor(N * 0.07);
    for (let j = 0; j < nFill && i < N; j++, i++) {
      let a = r(), b = r();
      if (a + b > 1) { a = 1 - a; b = 1 - b; }
      const p0 = tri[0], p1 = tri[1], p2 = tri[2];
      put(s, i, [
        p0[0] + (p1[0] - p0[0]) * a + (p2[0] - p0[0]) * b,
        p0[1] + (p1[1] - p0[1]) * a + (p2[1] - p0[1]) * b, z,
      ], mixc(CYAN, INDIGO, r() * 0.6), 1.3 + r());
    }
    // subtitle bars
    i = polyline(s, [[-0.26, -0.52, z], [0.26, -0.52, z]], i, 12, LAV, 1.6, true);
    i = polyline(s, [[-0.18, -0.60, z], [0.18, -0.60, z]], i, 9, mixc(LAV, DEEP, 0.4), 1.4, true);
    // progress line
    i = polyline(s, [[-0.36, -0.76, z], [0.36, -0.76, z]], i, 14, DEEP, 1.2, true);
    i = polyline(s, [[-0.36, -0.76, z + 0.002], [0.05, -0.76, z + 0.002]], i, 9, MAGENTA, 1.8, true);

    // screen glow scatter
    const nGlow = Math.floor(N * 0.10);
    for (let j = 0; j < nGlow && i < N; j++, i++) {
      put(s, i, [(r() - 0.5) * (W * 1.7), (r() - 0.5) * (H * 1.8), T + 0.002],
        mixc(DEEP, INDIGO, r()), 0.9 + r() * 0.9);
    }

    // the feed: ghost cards above and below, dimmer and set back
    for (const dy of [1.95, -1.95]) {
      const ghost = roundedRect(W * 0.92, H * 0.92, 0.09, 4).map((p) => [p[0], p[1] + dy, -0.12]);
      i = polyline(s, ghost, i, Math.floor(N * 0.05), mixc(DEEP, VIOLET, 0.4), 1.1, true);
    }

    // scroll stream: particles rising along the right edge
    const nStream = Math.floor(N * 0.08);
    for (let j = 0; j < nStream && i < N; j++, i++) {
      const t = r();
      put(s, i, [W + 0.12 + Math.sin(t * 20) * 0.03 + r() * 0.03, (t - 0.5) * 3.2, (r() - 0.5) * 0.08],
        r() < 0.3 ? MAGENTA : CYAN, 1 + r() * 1.4);
    }

    // aura
    for (; i < N; i++) {
      const d = sphereDir(r);
      put(s, i, [d[0] * (1.7 + r()), d[1] * (1.6 + r()), d[2] * (1.4 + r())], DEEP, 1 + r());
    }
    return finish(s);
  };

  /* ---------------- registry ---------------- */

  const builders = {
    nebula: buildNebula,
    brain: buildBrain,
    rack: buildRack,
    phone: buildPhone,
    peaks: buildPeaks,
    lock: buildLock,
    cloud: buildCloud,
    die: buildDie,
    play: buildPlay,
    path: buildPath,
    horizon: buildHorizon,
  };

  const build = (name, N) => {
    const key = name + ":" + N;
    if (!cache[key]) cache[key] = builders[name](N);
    return cache[key];
  };

  return { build, names: Object.keys(builders) };
})();
