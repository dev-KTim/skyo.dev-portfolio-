/* ==========================================================================
   skyo.dev — math3d.js
   Minimal hand-written 3D math: column-major mat4, seeded RNG, value noise
   and easing. No libraries; this is half the point of the site.
   ========================================================================== */

window.SKYO = window.SKYO || {};

SKYO.M = (() => {
  "use strict";

  /* ----- mat4 (column-major, WebGL layout) ----- */

  const identity = () => {
    const m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
  };

  const perspective = (fovY, aspect, near, far) => {
    const f = 1 / Math.tan(fovY / 2);
    const m = new Float32Array(16);
    m[0] = f / aspect;
    m[5] = f;
    m[10] = (far + near) / (near - far);
    m[11] = -1;
    m[14] = (2 * far * near) / (near - far);
    return m;
  };

  const multiply = (a, b) => {
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        out[c * 4 + r] =
          a[r] * b[c * 4] +
          a[4 + r] * b[c * 4 + 1] +
          a[8 + r] * b[c * 4 + 2] +
          a[12 + r] * b[c * 4 + 3];
      }
    }
    return out;
  };

  const translation = (x, y, z) => {
    const m = identity();
    m[12] = x; m[13] = y; m[14] = z;
    return m;
  };

  const rotationX = (rad) => {
    const m = identity(), c = Math.cos(rad), s = Math.sin(rad);
    m[5] = c; m[6] = s; m[9] = -s; m[10] = c;
    return m;
  };

  const rotationY = (rad) => {
    const m = identity(), c = Math.cos(rad), s = Math.sin(rad);
    m[0] = c; m[2] = -s; m[8] = s; m[10] = c;
    return m;
  };

  /* Orbit camera: yaw/pitch around a target at a distance -> view matrix. */
  const orbitView = (yaw, pitch, dist, target) => {
    // Inverse of (T(target) * Ry(yaw) * Rx(pitch) * T(0,0,dist))
    let v = translation(0, 0, -dist);
    v = multiply(v, rotationX(-pitch));
    v = multiply(v, rotationY(-yaw));
    v = multiply(v, translation(-target[0], -target[1], -target[2]));
    return v;
  };

  /* Project a world point to normalized device coords. Returns [x,y,w]. */
  const project = (m, x, y, z) => {
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
    const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
    const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    return [cx / cw, cy / cw, cw];
  };

  /* ----- Seeded RNG (mulberry32): deterministic scenes on every visit ----- */

  const rng = (seed) => {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* ----- 3D value noise (for brain wrinkles & terrain) ----- */

  const hash3 = (x, y, z) => {
    let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
    h = ((h ^ (h >>> 13)) * 1274126177) | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  const smooth = (t) => t * t * (3 - 2 * t);

  const noise3 = (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = smooth(x - xi), yf = smooth(y - yi), zf = smooth(z - zi);
    let acc = 0;
    for (let dz = 0; dz <= 1; dz++) {
      for (let dy = 0; dy <= 1; dy++) {
        for (let dx = 0; dx <= 1; dx++) {
          const w = (dx ? xf : 1 - xf) * (dy ? yf : 1 - yf) * (dz ? zf : 1 - zf);
          acc += w * hash3(xi + dx, yi + dy, zi + dz);
        }
      }
    }
    return acc;
  };

  /* ----- Easing & interpolation ----- */

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const smoothstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const easeOutQuint = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 5);

  /* Frame-rate independent damping factor. */
  const damp = (lambda, dt) => 1 - Math.exp(-lambda * dt);

  return {
    identity, perspective, multiply, translation, rotationX, rotationY,
    orbitView, project, rng, noise3, lerp, clamp, smoothstep, easeOutQuint, damp,
  };
})();
