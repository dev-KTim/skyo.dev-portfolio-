/* ==========================================================================
   skyo.dev — engine.js
   Hand-written WebGL particle engine with a post-processing bloom pass.

   Particles: one pool, two position buffers (current scene A, target scene B)
   and a single uMix uniform. The GPU morphs every particle between scenes
   with per-particle stagger, so transitions cost zero CPU work per frame.
   Wireframes are GL_LINES through index buffers into the same pool, so
   edges morph together with the points they connect.

   Room: a fullscreen raymarcher (SDF corridor: floor, walls, box-or-arch
   ceiling) draws the current place at half resolution: neon strips along the
   walls, fluorescent tubes on the ceiling, brick or tile walls, a wet floor
   with a real one-bounce reflection, and fog. Scroll moves the camera through
   it; the particles float inside.

   Post: the scene renders into an offscreen target, gets downsampled and
   blurred twice (separable gaussian, ping-pong at quarter resolution) and is
   composited back with a slight chromatic spread on the glow. All of it is
   plain WebGL 1, no extensions required.
   ========================================================================== */

window.SKYO = window.SKYO || {};

SKYO.Engine = class {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.count = opts.count || 2000;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.stagger = 0.45; // per-particle morph delay spread (shader + CPU must match)
    this.postEnabled = opts.post !== false;
    this.envScale = 0.5; // the raymarched room renders at half resolution

    this.morph = { active: false, t0: 0, dur: 1, mix: 0 };
    this.sceneA = null; // CPU copies, needed to resolve interrupted morphs
    this.sceneB = null;
    this.lastMVP = null;
    this.targets = null;

    this.gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      premultipliedAlpha: true,
      powerPreference: "high-performance",
    });
    if (!this.gl) throw new Error("no-webgl");

    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.lost = true;
    });
    canvas.addEventListener("webglcontextrestored", () => {
      this.lost = false;
      this.targets = null;
      this._init();
      this.resize(true);
      if (this.sceneA) this._uploadScene("A", this.sceneA);
      if (this.sceneB) this._uploadScene("B", this.sceneB);
    });

    this._init();
    this.resize(true);
  }

  /* ----- GL setup ----- */

  _compile(type, src) {
    const gl = this.gl;
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error("shader: " + gl.getShaderInfoLog(s));
    }
    return s;
  }

  _program(vs, fs, attribs, uniforms) {
    const gl = this.gl;
    const prog = gl.createProgram();
    gl.attachShader(prog, this._compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, this._compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error("link: " + gl.getProgramInfoLog(prog));
    }
    const a = {}, u = {};
    for (const n of attribs) a[n] = gl.getAttribLocation(prog, n);
    for (const n of uniforms) u[n] = gl.getUniformLocation(prog, n);
    return { prog, a, u };
  }

  _init() {
    const gl = this.gl;

    /* --- particle program --- */
    const vsrc = `
      precision highp float;
      attribute vec3 aPosA, aPosB, aColA, aColB;
      attribute float aSizeA, aSizeB, aSeed;
      uniform mat4 uMVP;
      uniform float uMix, uTime, uPointScale, uWobble, uStagger;
      varying vec3 vColor;
      varying float vFlicker;

      void main() {
        float tt = clamp(uMix * (1.0 + uStagger) - aSeed * uStagger, 0.0, 1.0);
        float e = tt * tt * (3.0 - 2.0 * tt);
        vec3 p = mix(aPosA, aPosB, e);

        // transit arc: particles swing outward mid-morph
        float arc = sin(e * 3.14159265);
        p += arc * 0.38 * vec3(
          sin(aSeed * 61.7), (aSeed - 0.5) * 2.0, cos(aSeed * 47.3));

        // idle organic wobble
        p += uWobble * vec3(
          sin(uTime * 1.31 + aSeed * 41.0),
          cos(uTime * 1.13 + aSeed * 73.0),
          sin(uTime * 1.71 + aSeed * 97.0)) * 0.018;

        gl_Position = uMVP * vec4(p, 1.0);
        float w = max(gl_Position.w, 0.1);
        gl_PointSize = clamp(mix(aSizeA, aSizeB, e) * uPointScale * (2.6 / w), 1.0, 64.0);
        vColor = mix(aColA, aColB, e);
        vFlicker = 0.78 + 0.22 * sin(uTime * 2.2 + aSeed * 55.0);
      }`;

    const fsrc = `
      precision mediump float;
      uniform float uAlpha, uIsLine;
      varying vec3 vColor;
      varying float vFlicker;

      void main() {
        float a;
        if (uIsLine > 0.5) {
          a = uAlpha;
        } else {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          a = smoothstep(0.5, 0.08, d) * uAlpha * vFlicker;
        }
        gl_FragColor = vec4(vColor * a, a);
      }`;

    this.pp = this._program(vsrc, fsrc,
      ["aPosA", "aPosB", "aColA", "aColB", "aSizeA", "aSizeB", "aSeed"],
      ["uMVP", "uMix", "uTime", "uPointScale", "uWobble", "uAlpha", "uIsLine", "uStagger"]);

    // Particle buffers
    this.buf = {
      posA: gl.createBuffer(), posB: gl.createBuffer(),
      colA: gl.createBuffer(), colB: gl.createBuffer(),
      sizeA: gl.createBuffer(), sizeB: gl.createBuffer(),
      seed: gl.createBuffer(),
      edgesA: gl.createBuffer(), edgesB: gl.createBuffer(),
      spark: gl.createBuffer(), sparkCol: gl.createBuffer(), sparkSize: gl.createBuffer(),
      quad: gl.createBuffer(),
    };
    this.edgeCountA = 0;
    this.edgeCountB = 0;

    // Static per-particle seeds
    const rand = SKYO.M.rng(1337);
    this.seeds = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) this.seeds[i] = rand();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf.seed);
    gl.bufferData(gl.ARRAY_BUFFER, this.seeds, gl.STATIC_DRAW);

    /* --- post-processing programs --- */
    const quadVs = `
      attribute vec2 aPos;
      varying vec2 vUv;
      void main() {
        vUv = aPos * 0.5 + 0.5;
        gl_Position = vec4(aPos, 0.0, 1.0);
      }`;

    // 9-tap separable gaussian
    const blurFs = `
      precision mediump float;
      uniform sampler2D uTex;
      uniform vec2 uDir;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(uTex, vUv) * 0.227027;
        c += texture2D(uTex, vUv + uDir * 1.0) * 0.1945946;
        c += texture2D(uTex, vUv - uDir * 1.0) * 0.1945946;
        c += texture2D(uTex, vUv + uDir * 2.0) * 0.1216216;
        c += texture2D(uTex, vUv - uDir * 2.0) * 0.1216216;
        c += texture2D(uTex, vUv + uDir * 3.0) * 0.054054;
        c += texture2D(uTex, vUv - uDir * 3.0) * 0.054054;
        c += texture2D(uTex, vUv + uDir * 4.0) * 0.016216;
        c += texture2D(uTex, vUv - uDir * 4.0) * 0.016216;
        gl_FragColor = c;
      }`;

    // scene + bloom with a tiny chromatic spread on the glow (premultiplied out)
    const compFs = `
      precision mediump float;
      uniform sampler2D uScene, uBloom;
      uniform float uStrength, uSpread;
      varying vec2 vUv;
      void main() {
        vec4 scene = texture2D(uScene, vUv);
        vec2 off = (vUv - 0.5) * uSpread;
        float br = texture2D(uBloom, vUv + off).r;
        vec4 bg = texture2D(uBloom, vUv);
        float bb = texture2D(uBloom, vUv - off).b;
        vec3 glow = vec3(br, bg.g, bb) * uStrength;
        float a = clamp(scene.a + bg.a * uStrength, 0.0, 1.0);
        gl_FragColor = vec4(scene.rgb + glow, a);
      }`;

    /* --- environment: a raymarched underground place --- */
    const envFs = `
      precision highp float;
      uniform vec2 uRes, uLook;
      uniform float uTravel, uW, uH, uArch, uYc, uWet, uFog, uOpen, uStripY, uTubes, uPattern, uNeonGlow;
      uniform float uGraffiti, uPillars, uPipes;
      uniform vec3 uNeonA, uNeonB, uTubeCol, uFogCol, uSkyCol;
      varying vec2 vUv;

      const float FLOOR = -1.0;
      const float SP = 3.4;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }

      // distance to the nearest surface, positive inside the room
      float map(vec3 p) {
        float d = p.y - FLOOR;
        if (uOpen > 0.5) return d;
        float wall = uW - abs(p.x);
        float ceilBox = uH - p.y;
        float ceilArch = uW - length(vec2(p.x, max(p.y - uYc, 0.0)));
        d = min(d, min(wall, mix(ceilBox, ceilArch, uArch)));
        if (uPillars > 0.5) {
          // square columns along both walls, between the ceiling tubes
          float zk = floor(p.z / SP) * SP;
          vec2 bq = abs(vec2(abs(p.x) - (uW - 0.42), p.z - zk)) - vec2(0.17, 0.17);
          d = min(d, length(max(bq, 0.0)) + min(max(bq.x, bq.y), 0.0));
        }
        if (uPipes > 0.5) {
          // a pipe running along each top corner
          float ceilY = mix(uH, uYc + uW, uArch);
          d = min(d, length(vec2(abs(p.x) - (uW - 0.34), p.y - (ceilY - 0.36))) - 0.07);
        }
        return d;
      }
      vec3 normalAt(vec3 p) {
        vec2 e = vec2(0.004, 0.0);
        return normalize(vec3(
          map(p + e.xyy) - map(p - e.xyy),
          map(p + e.yxy) - map(p - e.yxy),
          map(p + e.yyx) - map(p - e.yyx)));
      }
      bool march(vec3 ro, vec3 rd, out vec3 p, out float t) {
        t = 0.0;
        for (int i = 0; i < 56; i++) {
          p = ro + rd * t;
          float d = map(p);
          if (d < 0.003) return true;
          t += d * 0.92;
          if (t > 60.0) break;
        }
        return false;
      }
      vec3 sky(vec3 rd) {
        // night sky: a thin haze at the horizon, near-black above
        float h = clamp(rd.y, -0.3, 1.0);
        vec3 night = vec3(0.035, 0.02, 0.06);
        float haze = exp(-max(h, 0.0) * 11.0) * smoothstep(-0.3, -0.02, h);
        return night + uSkyCol * haze * 0.55;
      }
      // spray cans
      vec3 palette(float h) {
        if (h < 0.22) return vec3(0.9, 0.05, 1.0);
        if (h < 0.44) return vec3(0.05, 1.0, 0.92);
        if (h < 0.6) return vec3(0.58, 0.23, 0.87);
        if (h < 0.75) return vec3(0.8, 0.78, 1.0);
        if (h < 0.88) return vec3(0.4, 1.0, 0.45);
        return vec3(1.0, 0.55, 0.2);
      }
      // a throw-up: four leaning bubble letters with counters, as a signed distance
      float rbox(vec2 q, vec2 b, float rad) {
        vec2 d = abs(q) - b + rad;
        return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - rad;
      }
      float piece(vec2 q, float cell, vec2 uv) {
        float d = 1e3;
        for (int k = 0; k < 4; k++) {
          float fk = float(k);
          float lean = (hash(vec2(cell, fk + 21.0)) - 0.5) * 0.9;
          vec2 o = vec2((fk - 1.5) * 0.46 + (hash(vec2(cell, fk)) - 0.5) * 0.08,
                        (hash(vec2(fk + 3.0, cell)) - 0.5) * 0.16);
          vec2 lq = q - o;
          lq.x -= lq.y * lean;                       // italic lean per letter
          vec2 b = vec2(0.16 + hash(vec2(cell + fk, 9.0)) * 0.06, 0.3 + hash(vec2(cell, fk + 5.0)) * 0.1);
          float dl = rbox(lq, b, 0.12);
          // counter (the hole in the letter) for some of them
          if (hash(vec2(fk, cell + 17.0)) > 0.45) {
            dl = max(dl, -(length(lq - vec2(0.0, (hash(vec2(cell, fk + 8.0)) - 0.5) * 0.2)) - 0.07));
          }
          d = min(d, dl);
        }
        return d + (vnoise(uv * 6.0) - 0.5) * 0.06;
      }
      // graffiti on a wall: fill with gradient, white outline, drop shadow, drips, overspray
      void graffiti(vec2 uv, float side, inout vec3 alb, inout vec3 emis) {
        float cell = floor(uv.x / 3.0);
        float h1 = hash(vec2(cell * 1.3, side));
        if (h1 > uGraffiti * 0.85) return;
        vec2 c = vec2((cell + 0.5) * 3.0 + (h1 - 0.5) * 0.6, -0.15 + hash(vec2(cell, side + 7.0)) * 0.45);
        vec2 q = uv - c;
        if (abs(q.x) > 1.5 || abs(q.y) > 1.1) return;
        float d = piece(q, cell, uv);
        float dsh = piece(q - vec2(0.05, -0.06), cell, uv);
        vec3 cA = palette(hash(vec2(cell * 1.7, side + 1.0)));
        vec3 cB = palette(hash(vec2(cell * 3.1, side + 2.0)));
        vec3 fillCol = mix(cA, cB, smoothstep(-0.35, 0.25, q.y + (vnoise(uv * 3.0) - 0.5) * 0.3));
        float shadow = smoothstep(0.02, -0.02, dsh);
        float fill = smoothstep(0.02, -0.02, d);
        float outline = smoothstep(0.035, 0.012, abs(d));
        float halo = smoothstep(0.45, 0.0, d) * (0.5 + 0.5 * vnoise(uv * 9.0));
        float colId = floor(uv.x * 6.0);
        float dripLen = hash(vec2(colId, cell + 11.0)) * 0.5;
        float colMask = smoothstep(0.08, 0.0, abs(fract(uv.x * 6.0) - 0.5) - 0.04);
        float above = piece(q + vec2(0.0, dripLen), cell, uv);
        float drip = colMask * step(above, -0.02) * (1.0 - fill) * step(0.4, hash(vec2(colId, cell + 3.0)));
        alb = mix(alb, vec3(0.02, 0.015, 0.03), shadow * 0.85);
        alb = mix(alb, fillCol * 0.7, max(fill, drip * 0.9));
        alb = mix(alb, vec3(0.9, 0.88, 1.0), outline * 0.85);
        alb += cA * halo * 0.08;
        emis += fillCol * (fill + drip * 0.8) * 0.12 + vec3(0.9) * outline * 0.06;
      }

      vec3 shade(vec3 p, vec3 n, float t) {
        bool isFloor = n.y > 0.5;
        bool isCeil = n.y < -0.5;
        vec3 alb;
        if (isFloor) {
          alb = vec3(0.045, 0.04, 0.06) * (0.7 + 0.6 * vnoise(p.xz * 2.0));
        } else {
          vec2 uv = isCeil ? vec2(p.z, p.x) : vec2(p.z, p.y);
          alb = vec3(0.07, 0.06, 0.09);
          if (uPattern > 1.5) {
            vec2 b = vec2(uv.x / 0.44, uv.y / 0.21);
            b.x += step(0.5, fract(b.y * 0.5)) * 0.5;
            vec2 f = fract(b);
            float grout = 1.0 - step(0.07, f.x) * step(0.12, f.y);
            alb = mix(vec3(0.13, 0.07, 0.10), vec3(0.03, 0.025, 0.04), grout);
          } else if (uPattern > 0.5) {
            vec2 f = fract(uv / 0.3);
            float grout = 1.0 - step(0.05, f.x) * step(0.05, f.y);
            alb = mix(vec3(0.075, 0.075, 0.105), vec3(0.025), grout);
          }
          alb *= 0.65 + 0.7 * vnoise(uv * 3.0);
        }
        vec3 emis = vec3(0.0);
        if (!isFloor && !isCeil && uGraffiti > 0.01 && uOpen < 0.5) {
          graffiti(vec2(p.z, p.y), sign(p.x), alb, emis);
        }
        vec3 col = alb * 0.12 + emis;
        if (uOpen < 0.5) {
          // neon strips along both walls
          float band = smoothstep(0.05, 0.014, abs(p.y - uStripY));
          float sa = band * step(uW - 0.03, -p.x);
          float sb = band * step(uW - 0.03, p.x);
          col += (uNeonA * sa + uNeonB * sb) * 1.9 * uNeonGlow;
          float dA = length(vec2(p.x + uW, p.y - uStripY));
          float dB = length(vec2(p.x - uW, p.y - uStripY));
          col += alb * uNeonGlow * (uNeonA * 1.3 / (0.45 + dA * dA * 2.4) + uNeonB * 1.3 / (0.45 + dB * dB * 2.4));
          // ceiling tubes every SP units
          float ceilY = mix(uH, uYc + uW, uArch);
          float zk = (floor(p.z / SP) + 0.5) * SP;
          float tube = smoothstep(0.07, 0.025, abs(p.z - zk)) * smoothstep(0.75, 0.55, abs(p.x)) * step(ceilY - 0.1, p.y);
          col += uTubeCol * tube * 3.2 * uTubes;
          for (int k = -1; k <= 1; k++) {
            vec3 lp = vec3(0.0, ceilY - 0.06, zk + float(k) * SP);
            vec3 L = lp - p;
            float ld = length(L);
            L /= ld;
            col += alb * uTubeCol * uTubes * 2.6 * max(dot(n, L), 0.0) / (0.5 + ld * ld);
          }
        } else {
          // rooftop: faint skylight from the horizon haze
          col += alb * uSkyCol * 0.8 * (0.4 + 0.6 * max(n.y, 0.0));
        }
        return mix(col, uFogCol, 1.0 - exp(-t * uFog));
      }

      void main() {
        vec2 uv = (vUv * 2.0 - 1.0) * vec2(uRes.x / uRes.y, 1.0);
        vec3 ro = vec3(0.0, -0.3, uTravel);
        vec3 rd = normalize(vec3(uv, 1.7));
        float cy = cos(uLook.x), sy = sin(uLook.x);
        rd.xz = mat2(cy, -sy, sy, cy) * rd.xz;
        float cp = cos(uLook.y), spp = sin(uLook.y);
        rd.yz = mat2(cp, -spp, spp, cp) * rd.yz;

        vec3 p, col;
        float t;
        if (march(ro, rd, p, t)) {
          vec3 n = normalAt(p);
          col = shade(p, n, t);
          if (n.y > 0.5 && uWet > 0.01) {
            float wet = uWet * (0.2 + 0.8 * smoothstep(0.3, 0.62, vnoise(p.xz * 1.1 + 7.0)));
            vec3 rd2 = reflect(rd, n);
            vec3 p2, rc;
            float t2;
            if (march(p + n * 0.02, rd2, p2, t2)) rc = shade(p2, normalAt(p2), t + t2);
            else rc = sky(rd2);
            float fr = 0.25 + 0.75 * pow(1.0 - max(dot(n, -rd), 0.0), 4.0);
            col = mix(col, rc, clamp(fr * wet, 0.0, 1.0));
          }
        } else {
          col = sky(rd);
        }
        col *= 1.0 - 0.3 * dot(uv * 0.45, uv * 0.45);
        gl_FragColor = vec4(col, 1.0);
      }`;

    this.envP = this._program(quadVs, envFs, ["aPos"], [
      "uRes", "uLook", "uTravel", "uW", "uH", "uArch", "uYc", "uWet", "uFog", "uOpen", "uStripY",
      "uTubes", "uPattern", "uNeonGlow", "uNeonA", "uNeonB", "uTubeCol", "uFogCol", "uSkyCol",
      "uGraffiti", "uPillars", "uPipes",
    ]);

    this.blurP = this._program(quadVs, blurFs, ["aPos"], ["uTex", "uDir"]);
    this.compP = this._program(quadVs, compFs, ["aPos"], ["uScene", "uBloom", "uStrength", "uSpread"]);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    gl.disable(gl.DEPTH_TEST);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied additive-ish
  }

  /* ----- Render targets ----- */

  _target(w, h) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return { fb, tex, w, h, ok };
  }

  _allocTargets(w, h) {
    const gl = this.gl;
    if (this.targets) {
      for (const t of Object.values(this.targets)) {
        gl.deleteFramebuffer(t.fb);
        gl.deleteTexture(t.tex);
      }
    }
    const qw = Math.max(1, Math.round(w / 4));
    const qh = Math.max(1, Math.round(h / 4));
    const scene = this._target(w, h);
    const a = this._target(qw, qh);
    const b = this._target(qw, qh);
    const env = this._target(Math.max(1, Math.round(w * this.envScale)), Math.max(1, Math.round(h * this.envScale)));
    this.targets = { scene, a, b, env };
    this.post = this.postEnabled && scene.ok && a.ok && b.ok && env.ok;
  }

  resize(force) {
    const { canvas, gl } = this;
    const w = Math.max(1, Math.round(canvas.clientWidth * this.dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * this.dpr));
    if (force || canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      this._allocTargets(w, h);
    }
    gl.viewport(0, 0, w, h);
    this.pointScale = h / 760;
    this.aspect = w / h || 1;
  }

  /* ----- Scene management ----- */

  _uploadScene(slot, scene) {
    const gl = this.gl;
    const b = this.buf;
    const put = (buffer, data) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    };
    if (slot === "A") {
      put(b.posA, scene.pos); put(b.colA, scene.col); put(b.sizeA, scene.size);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.edgesA);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, scene.edges, gl.DYNAMIC_DRAW);
      this.edgeCountA = scene.edges.length;
    } else {
      put(b.posB, scene.pos); put(b.colB, scene.col); put(b.sizeB, scene.size);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.edgesB);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, scene.edges, gl.DYNAMIC_DRAW);
      this.edgeCountB = scene.edges.length;
    }
  }

  /* Instantly show a scene (initial load, reduced motion, tab restore). */
  setScene(scene) {
    this.sceneA = scene;
    this.sceneB = scene;
    this._uploadScene("A", scene);
    this._uploadScene("B", scene);
    this.morph = { active: false, t0: 0, dur: 1, mix: 0 };
  }

  /* Start a staggered GPU morph to a new scene. */
  morphTo(scene, duration, now) {
    if (this.morph.active) this._resolveMorph(now);
    this.sceneB = scene;
    this._uploadScene("B", scene);
    this.morph = { active: true, t0: now, dur: duration, mix: 0 };
  }

  /* Freeze an in-flight morph into scene A (CPU replica of the shader math). */
  _resolveMorph(now) {
    const { sceneA, sceneB, morph, seeds, stagger } = this;
    if (!sceneA || !sceneB) return;
    const mix = Math.min((now - morph.t0) / morph.dur, 1);
    const n = this.count;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let tt = Math.min(Math.max(mix * (1 + stagger) - seeds[i] * stagger, 0), 1);
      const e = tt * tt * (3 - 2 * tt);
      for (let k = 0; k < 3; k++) {
        pos[i * 3 + k] = sceneA.pos[i * 3 + k] + (sceneB.pos[i * 3 + k] - sceneA.pos[i * 3 + k]) * e;
        col[i * 3 + k] = sceneA.col[i * 3 + k] + (sceneB.col[i * 3 + k] - sceneA.col[i * 3 + k]) * e;
      }
      size[i] = sceneA.size[i] + (sceneB.size[i] - sceneA.size[i]) * e;
    }
    // Mid-flight edges are meaningless; keep the closer scene's wireframe.
    const edges = mix < 0.5 ? this.sceneA.edges : this.sceneB.edges;
    this.sceneA = { pos, col, size, edges };
    this._uploadScene("A", this.sceneA);
    this.morph.active = false;
  }

  /* ----- Per-frame render ----- */

  render(o) {
    if (this.lost) return;
    const gl = this.gl;
    const M = SKYO.M;

    // Advance morph
    let mix = 0;
    if (this.morph.active) {
      mix = Math.min((o.now - this.morph.t0) / this.morph.dur, 1);
      if (mix >= 1) {
        this.sceneA = this.sceneB;
        this._uploadScene("A", this.sceneA);
        this.morph.active = false;
        mix = 0;
      }
    }

    const proj = M.perspective(o.fov || 0.9, this.aspect, 0.1, 60);
    // screen-space anchoring as a lens shift (NDC units): the model is drawn
    // exactly as if centred, then slid across the screen, so parking it over
    // a DOM column never skews its perspective
    if (o.ndcOffset) {
      proj[8] = -o.ndcOffset[0];
      proj[9] = -o.ndcOffset[1];
    }
    const view = M.orbitView(o.yaw, o.pitch, o.dist, o.target);
    const mvp = M.multiply(proj, view);
    this.lastMVP = mvp;

    const W = this.canvas.width, H = this.canvas.height;
    const usePost = this.post && (o.bloom == null || o.bloom > 0.001);

    // 1) the room: raymarched at reduced resolution, then copied into the scene target
    gl.disable(gl.BLEND);
    if (usePost) {
      if (o.env) {
        this._drawEnv(o.env, this.targets.env);
        this._blur(this.targets.env.tex, this.targets.scene, 0, 0); // zero-radius blur = copy
      } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets.scene.fb);
        gl.viewport(0, 0, W, H);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (o.env) this._drawEnv(o.env, null);
    }

    // 2) particles on top
    gl.enable(gl.BLEND);
    this._drawParticles(o, mvp, mix);
    if (!usePost) return;

    // 3) bloom: downsample + two separable blur rounds at quarter res
    const { a, b, scene } = this.targets;
    gl.disable(gl.BLEND);
    this._blur(scene.tex, a, 1 / a.w, 0);
    this._blur(a.tex, b, 0, 1 / a.h);
    this._blur(b.tex, a, 2 / a.w, 0);
    this._blur(a.tex, b, 0, 2 / a.h);

    // 4) composite to the canvas
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    const cp = this.compP;
    gl.useProgram(cp.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, scene.tex);
    gl.uniform1i(cp.u.uScene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, b.tex);
    gl.uniform1i(cp.u.uBloom, 1);
    gl.uniform1f(cp.u.uStrength, o.bloom != null ? o.bloom : 1.0);
    gl.uniform1f(cp.u.uSpread, o.spread != null ? o.spread : 0.004);
    this._drawQuad(cp);
    gl.enable(gl.BLEND);
  }

  _drawEnv(e, dst) {
    const gl = this.gl;
    const P = this.envP;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fb : null);
    const w = dst ? dst.w : this.canvas.width, h = dst ? dst.h : this.canvas.height;
    gl.viewport(0, 0, w, h);
    gl.useProgram(P.prog);
    gl.uniform2f(P.u.uRes, w, h);
    gl.uniform2f(P.u.uLook, e.look[0], e.look[1]);
    gl.uniform1f(P.u.uTravel, e.travel);
    gl.uniform1f(P.u.uW, e.w);
    gl.uniform1f(P.u.uH, e.h);
    gl.uniform1f(P.u.uArch, e.arch);
    gl.uniform1f(P.u.uYc, e.yc);
    gl.uniform1f(P.u.uWet, e.wet);
    gl.uniform1f(P.u.uFog, e.fog);
    gl.uniform1f(P.u.uOpen, e.open);
    gl.uniform1f(P.u.uStripY, e.stripY);
    gl.uniform1f(P.u.uTubes, e.tubes);
    gl.uniform1f(P.u.uPattern, e.pattern);
    gl.uniform1f(P.u.uNeonGlow, e.neon);
    gl.uniform1f(P.u.uGraffiti, e.graffiti);
    gl.uniform1f(P.u.uPillars, e.pillars);
    gl.uniform1f(P.u.uPipes, e.pipes);
    gl.uniform3f(P.u.uNeonA, e.neonA[0], e.neonA[1], e.neonA[2]);
    gl.uniform3f(P.u.uNeonB, e.neonB[0], e.neonB[1], e.neonB[2]);
    gl.uniform3f(P.u.uTubeCol, e.tubeCol[0], e.tubeCol[1], e.tubeCol[2]);
    gl.uniform3f(P.u.uFogCol, e.fogCol[0], e.fogCol[1], e.fogCol[2]);
    gl.uniform3f(P.u.uSkyCol, e.skyCol[0], e.skyCol[1], e.skyCol[2]);
    this._drawQuad(P);
  }

  _blur(srcTex, dst, dx, dy) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
    gl.viewport(0, 0, dst.w, dst.h);
    gl.useProgram(this.blurP.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcTex);
    gl.uniform1i(this.blurP.u.uTex, 0);
    gl.uniform2f(this.blurP.u.uDir, dx, dy);
    this._drawQuad(this.blurP);
  }

  _drawQuad(p) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf.quad);
    gl.enableVertexAttribArray(p.a.aPos);
    gl.vertexAttribPointer(p.a.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(p.a.aPos);
  }

  _drawParticles(o, mvp, mix) {
    const gl = this.gl;
    const { a, u } = this.pp;
    const b = this.buf;
    gl.useProgram(this.pp.prog);

    gl.uniformMatrix4fv(u.uMVP, false, mvp);
    gl.uniform1f(u.uMix, mix);
    gl.uniform1f(u.uTime, o.time);
    gl.uniform1f(u.uPointScale, this.pointScale * this.dpr);
    gl.uniform1f(u.uWobble, o.wobble != null ? o.wobble : 1);
    gl.uniform1f(u.uStagger, this.stagger);

    const bindAttr = (loc, buffer, comps) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, comps, gl.FLOAT, false, 0, 0);
    };
    bindAttr(a.aPosA, b.posA, 3);
    bindAttr(a.aPosB, b.posB, 3);
    bindAttr(a.aColA, b.colA, 3);
    bindAttr(a.aColB, b.colB, 3);
    bindAttr(a.aSizeA, b.sizeA, 1);
    bindAttr(a.aSizeB, b.sizeB, 1);
    bindAttr(a.aSeed, b.seed, 1);

    // Wireframe lines: fade old edges out, new edges in, around mid-morph.
    const baseLine = (o.lineAlpha != null ? o.lineAlpha : 0.16) * o.alpha;
    let lineBuf = b.edgesA, lineCount = this.edgeCountA, lineAlpha = baseLine;
    if (this.morph.active || mix > 0) {
      if (mix < 0.5) {
        lineAlpha = baseLine * (1 - mix / 0.4);
      } else {
        lineBuf = b.edgesB;
        lineCount = this.edgeCountB;
        lineAlpha = baseLine * ((mix - 0.6) / 0.4);
      }
      lineAlpha = Math.max(0, Math.min(lineAlpha, baseLine));
    }
    if (lineCount > 0 && lineAlpha > 0.004) {
      gl.uniform1f(u.uIsLine, 1);
      gl.uniform1f(u.uAlpha, lineAlpha);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lineBuf);
      gl.drawElements(gl.LINES, lineCount, gl.UNSIGNED_SHORT, 0);
    }

    // Points
    gl.uniform1f(u.uIsLine, 0);
    gl.uniform1f(u.uAlpha, o.alpha);
    gl.drawArrays(gl.POINTS, 0, this.count);

    // Sparks (neuron pulses, LEDs): tiny dynamic overlay set, drawn with mix=0.
    if (o.sparks && o.sparks.count > 0) {
      gl.uniform1f(u.uMix, 0);
      gl.uniform1f(u.uAlpha, o.sparks.alpha != null ? o.sparks.alpha : o.alpha);
      gl.uniform1f(u.uWobble, 0);
      const upload = (buffer, data) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STREAM_DRAW);
      };
      upload(b.spark, o.sparks.pos);
      upload(b.sparkCol, o.sparks.col);
      upload(b.sparkSize, o.sparks.size);
      bindAttr(a.aPosA, b.spark, 3);
      bindAttr(a.aPosB, b.spark, 3);
      bindAttr(a.aColA, b.sparkCol, 3);
      bindAttr(a.aColB, b.sparkCol, 3);
      bindAttr(a.aSizeA, b.sparkSize, 1);
      bindAttr(a.aSizeB, b.sparkSize, 1);
      gl.drawArrays(gl.POINTS, 0, o.sparks.count);
    }

    for (const loc of Object.values(a)) gl.disableVertexAttribArray(loc);
  }

  /* World position -> CSS pixel position using the last rendered MVP. */
  project(x, y, z) {
    if (!this.lastMVP) return null;
    const [nx, ny, w] = SKYO.M.project(this.lastMVP, x, y, z);
    if (w <= 0) return null;
    return {
      x: (nx * 0.5 + 0.5) * this.canvas.clientWidth,
      y: (-ny * 0.5 + 0.5) * this.canvas.clientHeight,
      w,
    };
  }
};
