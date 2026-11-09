/* ==========================================================================
   skyo.dev — director.js
   Scroll choreography for the pinned chapters. One rAF loop reads scrollY
   (no scroll listeners), maps it to a chapter + local progress, morphs the
   particle pool, drives the damped orbit camera and the DOM that has to
   move with the scroll (hero exit, horizontal project track, HUD).

   Chapters: hero (brain) -> now (server rack) -> projects (one model per
   card, horizontal pan) -> skills (nebula) -> path (git graph) ->
   contact (horizon).
   ========================================================================== */

window.SKYO = window.SKYO || {};

SKYO.Director = class {
  constructor(engine, opts = {}) {
    this.engine = engine;
    this.reduced = !!opts.reduced;
    this.M = SKYO.M;

    this.cam = { yaw: 0.4, pitch: 0.12, dist: 3.2, ox: 0, oy: 0, alpha: 0, bloom: 1 };
    this.mouse = { x: 0, y: 0 };
    this.lastY = window.scrollY;
    this.yawKick = 0;
    this.lastT = performance.now();
    this.frameCost = 16;
    this.currentScene = null;
    this.pulses = [];
    this.lastPulse = 0;
    this.trackPos = 0;
    this.trackX = 0;

    // spark scratch buffers (node halos, synapse pulses, rack LEDs)
    const MAXS = 64;
    this.MAXS = MAXS;
    this.sparks = {
      pos: new Float32Array(MAXS * 3),
      col: new Float32Array(MAXS * 3),
      size: new Float32Array(MAXS),
      count: 0,
      alpha: 1,
    };

    const $ = (s) => document.querySelector(s);
    this.progressBar = $(".scroll-progress");
    this.navEl = $("#nav");
    this.timelineEl = $(".timeline");
    this.labelsEl = $("#node-labels");
    this.heroInner = $("#hero-inner");
    this.heroHint = $("#hero-hint");
    this.nowStage = $("#now-stage");
    this.projStage = $("#proj-stage");
    this.stageTitle = $("#stage-title");
    this.stageTech = $("#stage-tech");
    this.track = $("#track");
    this.cards = [...document.querySelectorAll(".proj-card")];
    this.hudPath = $("#hud-path");
    this.hudFill = $("#hud-fill");

    this._buildChapters();
    this._buildLabels();
    this._measure();

    // the room around the camera, lerped between places
    this.env = Object.assign({ travel: 0, look: [0, 0] }, SKYO.Director.ROOMS.hero);
    this.env.neonA = [...this.env.neonA]; this.env.neonB = [...this.env.neonB];
    this.env.tubeCol = [...this.env.tubeCol]; this.env.fogCol = [...this.env.fogCol]; this.env.skyCol = [...this.env.skyCol];

    window.addEventListener("resize", () => {
      this.engine.resize();
      this._measure();
    }, { passive: true });
    if ("ResizeObserver" in window) {
      new ResizeObserver(() => this._measure()).observe(document.body);
    }
    window.addEventListener("pointermove", (e) => {
      this.mouse.x = (e.clientX / window.innerWidth - 0.5) * 2;
      this.mouse.y = (e.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });

    // First scene, instantly
    this.currentScene = "brain";
    this.engine.setScene(SKYO.Scenes.build("brain", this.engine.count));

    const loop = (t) => {
      this._frame(t);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /* ----- Chapters ----- */

  _buildChapters() {
    const defs = {
      hero: {
        scene: () => "brain", bloom: 1.0, hud: () => "tunnel",
        dist: 3.1, pitch: 0.08, sway: true, baseYaw: 0.22, spin: 0.7, wobble: 1,
        alpha: 1, alphaNarrow: 0.55, lineAlpha: 0.15,
        anchor: { x: 0.42, y: 0.02 }, anchorNarrow: { x: 0, y: 0.38 },
  },
      now: {
        scene: () => "rack", bloom: 0.9, hud: () => "basement",
        dist: 3.6, pitch: 0.16, sway: true, spin: 1.6, wobble: 0.35,
        alpha: 0.95, alphaNarrow: 0.75, lineAlpha: 0.32,
        anchorEl: this.nowStage, anchorNarrow: { x: 0, y: 0.5 },
  },
      projects: {
        scene: (c) => (this.cards[c.index] ? this.cards[c.index].dataset.model : "peaks"),
        bloom: 1.0, hud: (c) => "wall/" + (this.cards[c.index] ? this.cards[c.index].dataset.title : ""),
        dist: 3.9, pitch: 0.16, sway: true, spin: 0, wobble: 0.45,
        alpha: 0.95, alphaNarrow: 0.8, lineAlpha: 0.3,
        anchorEl: this.projStage, anchorNarrow: { x: 0, y: 0.5 },
  },
      skills: {
        scene: () => "nebula", bloom: 0.7, hud: () => "hall-of-tags",
        dist: 3.6, pitch: 0.02, autoYaw: 0.03, spin: 0.3, wobble: 1,
        alpha: 0.3, alphaNarrow: 0.25, lineAlpha: 0,
        anchor: { x: 0, y: 0 }, anchorNarrow: { x: 0, y: 0 },
  },
      path: {
        scene: () => "path", bloom: 0.9, hud: () => "line-1",
        dist: 4.3, pitch: 0.1, sway: true, spin: 0.5, wobble: 0.12,
        alpha: 0.85, alphaNarrow: 0.3, lineAlpha: 0.45,
        anchor: { x: 0.42, y: 0.05 }, anchorNarrow: { x: 0, y: 0 },
  },
      contact: {
        scene: () => "horizon", bloom: 1.35, hud: () => "rooftop",
        dist: 3.0, pitch: 0.06, autoYaw: 0, baseYaw: 0, spin: 0, wobble: 0.5,
        alpha: 1, alphaNarrow: 0.8, lineAlpha: 0.3,
        anchor: { x: 0, y: 0 }, anchorNarrow: { x: 0, y: 0 },
  },
    };
    this.chapters = [...document.querySelectorAll("[data-chapter]")]
      .filter((el) => defs[el.dataset.chapter])
      .map((el) => Object.assign({ el, name: el.dataset.chapter, index: 0, local: 0 }, defs[el.dataset.chapter]));
    this.projects = this.chapters.find((c) => c.name === "projects") || null;
  }

  _measure() {
    const y = window.scrollY;
    const vh = window.innerHeight;
    for (const c of this.chapters) {
      const r = c.el.getBoundingClientRect();
      c.top = r.top + y;
      c.height = Math.max(r.height, 1);
      // pinned chapters scrub over (height - vh); flowing sections over their height
      c.pinLen = c.el.classList.contains("chapter") ? Math.max(c.height - vh, 1) : c.height;
    }
    this.docMax = Math.max(document.documentElement.scrollHeight - vh, 1);
    this.narrow = window.innerWidth < 1024;
    this.cardX = this.cards.map((card) => card.offsetLeft);
  }

  /* Scroll position that centres project `id` in the horizontal track. */
  scrollToProject(id) {
    const i = this.cards.findIndex((c) => c.id === id);
    const p = this.projects;
    if (i < 0 || !p) return;
    const n = Math.max(this.cards.length - 1, 1);
    const target = this.reduced
      ? this.cards[i].getBoundingClientRect().top + window.scrollY - 120
      : p.top + (i / n) * p.pinLen;
    window.scrollTo({ top: target, behavior: this.reduced ? "auto" : "smooth" });
  }

  /* ----- Neuron labels (clickable, projected each frame) ----- */

  _buildLabels() {
    if (!this.labelsEl) return;
    const brain = SKYO.Scenes.build("brain", this.engine.count);
    this.nodes = brain.nodes || [];
    this.labelBtns = this.nodes.map((n) => {
      const b = document.createElement("button");
      b.className = "node-label";
      b.type = "button";
      b.textContent = n.label;
      b.addEventListener("click", () => this.scrollToProject(n.id));
      this.labelsEl.appendChild(b);
      return b;
    });
  }

  /* ----- Per-frame ----- */

  _frame(t) {
    const M = this.M;
    const dt = Math.min((t - this.lastT) / 1000, 0.05);
    this.lastT = t;
    const time = t / 1000;
    const y = window.scrollY;
    const vh = window.innerHeight;

    // adaptive quality: drop to 1x pixels if frames run hot
    this.frameCost += (dt * 1000 - this.frameCost) * 0.02;
    if (this.frameCost > 34 && (this.engine.dpr > 1 || this.engine.envScale > 0.35)) {
      if (this.engine.dpr > 1) this.engine.dpr = 1;
      else this.engine.envScale = 0.35;
      this.engine.resize(true);
      this.frameCost = 16;
    }

    // chrome that used to live in a scroll listener
    if (this.progressBar) {
      this.progressBar.style.transform = `scaleX(${(y / this.docMax).toFixed(4)})`;
    }
    if (this.navEl) this.navEl.classList.toggle("is-scrolled", y > 40);
    if (this.timelineEl) {
      const r = this.timelineEl.getBoundingClientRect();
      const p = M.clamp((vh * 0.55 - r.top) / r.height, 0, 1);
      this.timelineEl.style.setProperty("--tl", p.toFixed(3));
    }

    // which chapter owns the viewport midline, and how far into it are we?
    const yMid = y + vh * 0.5;
    let ch = this.chapters[0];
    for (const c of this.chapters) if (yMid >= c.top) ch = c;
    for (const c of this.chapters) {
      c.local = M.clamp((y - c.top) / c.pinLen, 0, 1);
      c.el.classList.toggle("is-active", c === ch);
      c.el.classList.toggle("is-past", y > c.top + c.height - vh * 0.5);
    }
    const local = ch.local;
    this.active = ch;
    if (SKYO.UI && SKYO.UI.progress) SKYO.UI.progress(ch.name, local);

    // horizontal project track (continuous position in card units)
    if (this.projects) this._updateTrack(dt);

    // scene morph on change
    const want = ch.scene(ch);
    if (want !== this.currentScene) {
      this.currentScene = want;
      const scene = SKYO.Scenes.build(want, this.engine.count);
      if (this.reduced) this.engine.setScene(scene);
      else this.engine.morphTo(scene, ch.name === "projects" ? 850 : 1100, t);
    }

    // hero exit: copy slides up and fades while the camera flies into the brain
    if (this.heroInner && ch.name === "hero" && !this.reduced) {
      const e = M.smoothstep(local / 0.8);
      this.heroInner.style.transform = `translate3d(0, ${(-e * 140).toFixed(1)}px, 0) scale(${(1 - e * 0.1).toFixed(3)})`;
      this.heroInner.style.opacity = (1 - M.smoothstep((local - 0.25) / 0.45)).toFixed(3);
    }

    // HUD
    if (this.hudPath) {
      const txt = ch.hud(ch);
      if (this.hudPath.textContent !== txt) this.hudPath.textContent = txt;
    }
    if (this.hudFill) this.hudFill.style.transform = `scaleX(${local.toFixed(3)})`;

    // scroll velocity -> yaw kick (the model answers your hand)
    const vel = y - this.lastY;
    this.lastY = y;
    if (!this.reduced) {
      this.yawKick += vel * 0.0009;
      this.yawKick *= Math.exp(-3.2 * dt);
    }

    // camera targets
    const baseYaw = ch.baseYaw != null ? ch.baseYaw : 0.4;
    const idleYaw = ch.sway ? Math.sin(time * 0.35) * 0.12 : time * (ch.autoYaw || 0);
    let tYaw, tDist = ch.dist, tAlpha = this.narrow && ch.alphaNarrow != null ? ch.alphaNarrow : ch.alpha;
    if (this.reduced) {
      tYaw = baseYaw;
    } else {
      tYaw = baseYaw + idleYaw + (local - 0.5) * ch.spin + this.yawKick + this.mouse.x * 0.12;
      if (ch.name === "projects") tYaw += this.trackPos * 0.9;
      if (ch.name === "hero") {
        // fly into the brain as the hero scrolls out
        const e = M.smoothstep(local);
        tDist = M.lerp(ch.dist, 1.4, e);
        tAlpha *= 1 - 0.55 * e;
      }
    }
    const tPitch = ch.pitch + (this.reduced ? 0 : this.mouse.y * 0.07);
    const anchor = this._anchorOffset(ch, tDist);

    const k = this.reduced ? 1 : M.damp(5, dt);
    this.cam.yaw += (tYaw - this.cam.yaw) * k;
    this.cam.pitch += (tPitch - this.cam.pitch) * k;
    this.cam.dist += (tDist - this.cam.dist) * k;
    this.cam.ox += (anchor.x - this.cam.ox) * k;
    this.cam.oy += (anchor.y - this.cam.oy) * k;
    this.cam.alpha += (tAlpha - this.cam.alpha) * (this.reduced ? 1 : M.damp(3.5, dt));
    this.cam.bloom += (ch.bloom - this.cam.bloom) * (this.reduced ? 1 : M.damp(3, dt));

    this._updateSparks(time, dt);
    this._updateLabels(ch);
    this._updateEnv(ch, y, vh, time, dt);

    this.engine.render({
      now: t,
      time,
      yaw: this.cam.yaw,
      pitch: this.cam.pitch,
      dist: this.cam.dist,
      target: [0, 0, 0],
      ndcOffset: [this.cam.ox, this.cam.oy],
      alpha: this.cam.alpha,
      lineAlpha: ch.lineAlpha,
      wobble: this.reduced ? 0 : ch.wobble,
      bloom: this.cam.bloom,
      fov: 0.9,
      sparks: this.sparks,
      env: this.env,
    });
  }

  /* Lerp the room toward the active place and walk the camera with the scroll. */
  _updateEnv(ch, y, vh, time, dt) {
    const R = SKYO.Director.ROOMS[ch.name];
    const e = this.env;
    if (!R) return;
    const k = this.reduced ? 1 : this.M.damp(2.2, dt);
    for (const key of ["w", "h", "arch", "yc", "wet", "fog", "open", "stripY", "tubes", "pattern", "neon", "graffiti"]) {
      e[key] += (R[key] - e[key]) * k;
    }
    for (const key of ["neonA", "neonB", "tubeCol", "fogCol", "skyCol"]) {
      for (let c = 0; c < 3; c++) e[key][c] += (R[key][c] - e[key][c]) * k;
    }
    // geometry switches are hard (the shader branches on them)
    e.open = R.open;
    e.pillars = R.pillars;
    e.pipes = R.pipes;
    e.travel = (y / vh) * 2.6;
    const sway = this.reduced ? 0 : Math.sin(time * 0.3) * 0.015;
    e.look[0] = sway + (this.reduced ? 0 : this.mouse.x * 0.09);
    e.look[1] = -0.02 + (this.reduced ? 0 : this.mouse.y * 0.05);
  }

  /* Horizontal pan: scroll progress through the chapter -> track position. */
  _updateTrack(dt) {
    const p = this.projects;
    const n = this.cards.length;
    if (!n) return;
    const target = p.local * (n - 1);
    this.trackPos += (target - this.trackPos) * (this.reduced ? 1 : this.M.damp(8, dt));
    const i = Math.min(Math.floor(this.trackPos), n - 2);
    const f = this.trackPos - i;
    const idx = Math.round(this.trackPos);
    p.index = Math.max(0, Math.min(idx, n - 1));

    if (this.track && !this.reduced) {
      const x = n > 1 ? this.M.lerp(this.cardX[i], this.cardX[i + 1], f) : 0;
      this.track.style.transform = `translate3d(${(-x).toFixed(1)}px, 0, 0)`;
      for (let k = 0; k < n; k++) {
        const d = Math.min(Math.abs(this.trackPos - k), 1.6);
        this.cards[k].style.setProperty("--d", d.toFixed(3));
        this.cards[k].classList.toggle("is-current", k === p.index);
      }
    }
    const card = this.cards[p.index];
    if (card && this.stageTitle && this.stageTitle.textContent !== card.dataset.title) {
      this.stageTitle.textContent = card.dataset.title;
      this.stageTech.textContent = card.dataset.tech;
    }
  }

  /* World-space x/y offset that parks the model over its DOM anchor. */
  _anchorOffset(ch, dist) {
    let nx = 0, ny = 0;
    const a = this.narrow ? ch.anchorNarrow : ch.anchor;
    if (!this.narrow && ch.anchorEl) {
      const r = ch.anchorEl.getBoundingClientRect();
      nx = ((r.left + r.width / 2) / window.innerWidth) * 2 - 1;
      ny = -(((r.top + r.height / 2) / window.innerHeight) * 2 - 1);
    } else if (this.narrow && ch.anchorEl) {
      const r = ch.anchorEl.getBoundingClientRect();
      ny = -(((r.top + r.height / 2) / window.innerHeight) * 2 - 1);
      nx = 0;
    } else if (a) {
      nx = a.x; ny = a.y;
    }
    void dist;
    return { x: nx, y: ny };
  }

  /* ----- Sparks: neuron pulses, node halos, rack LEDs ----- */

  _updateSparks(time, dt) {
    const sp = this.sparks;
    sp.count = 0;
    sp.alpha = this.cam.alpha;
    if (this.engine.morph.active || this.cam.alpha < 0.15) return;

    if (this.currentScene === "brain") {
      const brain = SKYO.Scenes.build("brain", this.engine.count);
      for (let k = 0; k < this.nodes.length && sp.count < this.MAXS; k++) {
        const n = this.nodes[k];
        const i = sp.count++;
        sp.pos.set(n.pos, i * 3);
        sp.col[i * 3] = 0.05; sp.col[i * 3 + 1] = 1; sp.col[i * 3 + 2] = 0.92;
        sp.size[i] = 6.5 + 2.2 * Math.sin(time * 2 + k * 1.7);
      }
      if (this.reduced) return;
      if (time - this.lastPulse > 0.2 && this.pulses.length < 36) {
        this.lastPulse = time;
        const e = brain.edges;
        if (e.length >= 2) {
          const pick = ((Math.random() * (e.length / 2)) | 0) * 2;
          this.pulses.push({ a: e[pick], b: e[pick + 1], t: 0, v: 0.9 + Math.random() });
        }
      }
      for (let k = this.pulses.length - 1; k >= 0; k--) {
        const p = this.pulses[k];
        p.t += dt * p.v;
        if (p.t >= 1) { this.pulses.splice(k, 1); continue; }
        if (sp.count >= this.MAXS) break;
        const i = sp.count++;
        const e = this.M.smoothstep(p.t);
        for (let c = 0; c < 3; c++) {
          sp.pos[i * 3 + c] =
            brain.pos[p.a * 3 + c] + (brain.pos[p.b * 3 + c] - brain.pos[p.a * 3 + c]) * e;
        }
        sp.col[i * 3] = 0.88; sp.col[i * 3 + 1] = 0.55; sp.col[i * 3 + 2] = 1;
        sp.size[i] = 1.6 + 2.6 * Math.sin(p.t * Math.PI);
      }
    } else if (this.currentScene === "horizon") {
      const sky = SKYO.Scenes.build("horizon", this.engine.count);
      if (sky.beacon && (this.reduced || Math.sin(time * 2.4) > 0.3)) {
        const i = sp.count++;
        sp.pos.set(sky.beacon, i * 3);
        sp.col[i * 3] = 1; sp.col[i * 3 + 1] = 0.2; sp.col[i * 3 + 2] = 0.9;
        sp.size[i] = 7;
      }
    } else if (this.currentScene === "path") {
      const metro = SKYO.Scenes.build("path", this.engine.count);
      const stops = metro.stops || [];
      for (let k = 0; k < stops.length && sp.count < this.MAXS; k++) {
        const i = sp.count++;
        sp.pos.set(stops[k], i * 3);
        sp.col[i * 3] = 0.05; sp.col[i * 3 + 1] = 1; sp.col[i * 3 + 2] = 0.92;
        sp.size[i] = 6 + 2.5 * Math.sin(time * 1.8 + k * 1.3);
      }
    } else if (this.currentScene === "rack") {
      const rack = SKYO.Scenes.build("rack", this.engine.count);
      const leds = rack.leds || [];
      for (let k = 0; k < leds.length && sp.count < this.MAXS; k++) {
        const l = leds[k];
        // activity blink: hard on/off per LED at its own rate
        const on = this.reduced ? 1 : (Math.sin(time * l.rate * 3 + l.phase) > 0.2 ? 1 : 0);
        if (!on) continue;
        const i = sp.count++;
        sp.pos.set(l.pos, i * 3);
        sp.col[i * 3] = l.col[0]; sp.col[i * 3 + 1] = l.col[1]; sp.col[i * 3 + 2] = l.col[2];
        sp.size[i] = 5.5;
      }
    }
  }

  /* ----- Project the clickable neuron labels ----- */

  _updateLabels(ch) {
    if (!this.labelsEl || !this.labelBtns) return;
    // desktop only: on phones the chips would sit on top of the hero copy
    const show = !!(ch.name === "hero" && ch.local < 0.45 && this.currentScene === "brain" &&
      !this.engine.morph.active && !this.narrow && this.cam.alpha > 0.45);
    if (this.labelsEl.hidden === show) this.labelsEl.hidden = !show;
    if (this.heroHint) this.heroHint.classList.toggle("is-on", show);
    if (!show) return;

    for (let k = 0; k < this.nodes.length; k++) {
      const n = this.nodes[k];
      const b = this.labelBtns[k];
      const px = this.engine.project(n.pos[0], n.pos[1], n.pos[2]);
      if (!px) { b.style.opacity = "0"; b.style.pointerEvents = "none"; continue; }
      b.style.opacity = "";
      b.style.pointerEvents = "";
      b.style.transform =
        `translate(${(px.x + 10).toFixed(1)}px, ${(px.y - 12).toFixed(1)}px)`;
    }
  }
};

/* Room parameters per place (see the environment shader in engine.js):
   w half width, h ceiling height, arch 0..1 (box -> arch), yc arch centre,
   wet floor reflectivity, fog density, open 1 = no walls (rooftop),
   stripY wall neon height, tubes ceiling tube brightness, pattern 0 none / 1 tiles / 2 brick. */
SKYO.Director.ROOMS = {
  hero: {
    graffiti: 0.5, pillars: 0, pipes: 1,
    w: 1.55, h: 1.0, arch: 1, yc: 0.15, wet: 0.85, fog: 0.15, open: 0,
    stripY: -0.55, tubes: 0.25, pattern: 1, neon: 1,
    neonA: [0.9, 0.05, 1.0], neonB: [0.05, 1.0, 0.92], tubeCol: [0.75, 0.6, 1.0],
    fogCol: [0.07, 0.04, 0.11], skyCol: [0.2, 0.05, 0.25],
  },
  now: {
    graffiti: 0.25, pillars: 0, pipes: 1,
    w: 2.0, h: 1.05, arch: 0, yc: 0.0, wet: 0.3, fog: 0.11, open: 0,
    stripY: -0.92, tubes: 1.1, pattern: 0, neon: 0.7,
    neonA: [0.05, 1.0, 0.92], neonB: [0.4, 0.2, 0.9], tubeCol: [0.8, 0.72, 1.0],
    fogCol: [0.06, 0.05, 0.09], skyCol: [0.2, 0.05, 0.25],
  },
  projects: {
    graffiti: 1.0, pillars: 1, pipes: 0,
    w: 2.7, h: 1.4, arch: 0, yc: 0.0, wet: 0.55, fog: 0.09, open: 0,
    stripY: 0.75, tubes: 0.35, pattern: 2, neon: 1,
    neonA: [0.9, 0.05, 1.0], neonB: [0.05, 1.0, 0.6], tubeCol: [0.85, 0.7, 1.0],
    fogCol: [0.08, 0.04, 0.1], skyCol: [0.2, 0.05, 0.25],
  },
  skills: {
    graffiti: 1.0, pillars: 1, pipes: 0,
    w: 2.5, h: 1.35, arch: 0, yc: 0.0, wet: 0.35, fog: 0.1, open: 0,
    stripY: 0.8, tubes: 0.7, pattern: 2, neon: 0.9,
    neonA: [0.58, 0.23, 0.87], neonB: [0.9, 0.05, 1.0], tubeCol: [0.85, 0.7, 1.0],
    fogCol: [0.08, 0.03, 0.12], skyCol: [0.2, 0.05, 0.25],
  },
  path: {
    graffiti: 0.45, pillars: 0, pipes: 0,
    w: 2.1, h: 0.8, arch: 1, yc: -0.05, wet: 0.6, fog: 0.13, open: 0,
    stripY: -0.96, tubes: 1.3, pattern: 1, neon: 0.9,
    neonA: [0.05, 1.0, 0.92], neonB: [0.05, 1.0, 0.92], tubeCol: [0.85, 0.85, 1.0],
    fogCol: [0.06, 0.05, 0.1], skyCol: [0.2, 0.05, 0.25],
  },
  contact: {
    graffiti: 0, pillars: 0, pipes: 0,
    w: 6.0, h: 6.0, arch: 0, yc: 0.0, wet: 0.4, fog: 0.03, open: 1,
    stripY: 0, tubes: 0, pattern: 0, neon: 0,
    neonA: [0, 0, 0], neonB: [0, 0, 0], tubeCol: [0, 0, 0],
    fogCol: [0.07, 0.035, 0.1], skyCol: [0.2, 0.03, 0.2],
  },
};
