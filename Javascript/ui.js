/* ==========================================================================
   skyo.dev — ui.js
   DOM-side interactions: boot sequence, typewriter (with its beloved typo),
   scroll reveals, 3D tilt engine, magnetic buttons, the tag wall (the
   toolbox sprayed on as you scroll), nav, email scramble, privacy banner.
   No scroll listeners anywhere; IntersectionObserver + rAF only.
   ========================================================================== */

window.SKYO = window.SKYO || {};

SKYO.UI = (() => {
  "use strict";

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];

  let reduced = false;
  let finePointer = false;

  /* ---------- Boot sequence ---------- */

  const initBoot = (done) => {
    const boot = $("#boot");
    const finish = () => {
      document.body.classList.add("is-loaded");
      if (boot) {
        boot.classList.add("done");
        setTimeout(() => boot.remove(), 600);
      }
      done();
    };

    if (reduced || sessionStorage.getItem("skyoBoot")) {
      if (boot) boot.remove();
      document.body.classList.add("is-loaded");
      done();
      return;
    }
    sessionStorage.setItem("skyoBoot", "1");
    const pre = $("#boot-text");
    const lines = [
      "skyo.dev portfolio v4.0",
      "> compiling shaders ....... ok",
      "> allocating bloom ........ ok",
      "> growing neurons ......... ok",
      "> linking synapses ........ ok",
      "> ready",
    ];
    let i = 0;
    (function nextLine() {
      if (i < lines.length) {
        pre.textContent += (i ? "\n" : "") + lines[i++];
        setTimeout(nextLine, 200);
      } else {
        setTimeout(finish, 320);
      }
    })();
  };

  /* ---------- Hero name: split into per-letter 3D spans ---------- */

  const initHeroName = () => {
    const heroName = $("#hero-name");
    if (!heroName) return;
    let idx = 0;
    $$(".word", heroName).forEach((word) => {
      const text = word.textContent;
      word.textContent = "";
      [...text].forEach((ch) => {
        const span = document.createElement("span");
        span.className = "ltr";
        span.textContent = ch;
        span.style.setProperty("--i", idx++);
        word.appendChild(span);
      });
    });
  };

  /* ---------- Typewriter (types a typo, fixes it) ---------- */

  const startTypewriter = () => {
    const el = $("#typed");
    if (!el) return;
    const full = "Hey, I'm Tim. Self-taught developer, currently at ADMIN INTELLIGENCE in Ulm.";
    if (reduced) {
      el.textContent = full;
      return;
    }
    const queue = [];
    const type = (s, d = 48) => [...s].forEach((ch) => queue.push({ op: "t", ch, d }));
    const del = (n, d = 60) => { for (let k = 0; k < n; k++) queue.push({ op: "d", d }); };
    const pause = (d) => queue.push({ op: "p", d });

    type("Hey, I'm Tmi.");
    pause(420);
    del(3);
    type("im.");
    pause(500);
    type(" Self-taught developr", 40);
    pause(380);
    del(1);
    type("er, currently at ADMIN INTELLIGENCE in Ulm.", 34);

    (function step() {
      const a = queue.shift();
      if (!a) return;
      if (a.op === "t") el.textContent += a.ch;
      else if (a.op === "d") el.textContent = el.textContent.slice(0, -1);
      setTimeout(step, a.op === "p" ? a.d : a.d + Math.random() * 40);
    })();
  };

  /* ---------- Scroll reveals (staggered per parent) ---------- */

  const initReveals = () => {
    const reveals = $$("[data-reveal]");
    if (reduced) {
      reveals.forEach((el) => el.classList.add("is-in"));
      return;
    }
    const groups = new Map();
    reveals.forEach((el) => {
      const n = groups.get(el.parentElement) || 0;
      el.style.setProperty("--rd", n * 90 + "ms");
      groups.set(el.parentElement, n + 1);
    });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -40px" });
    reveals.forEach((el) => io.observe(el));
  };

  /* ---------- Timeline node activation ---------- */

  const initTimeline = () => {
    const tlItems = $$(".tl-item");
    if (!tlItems.length) return;
    const tlIo = new IntersectionObserver((entries) => {
      entries.forEach((entry) =>
        entry.target.classList.toggle("is-active", entry.isIntersecting));
    }, { rootMargin: "-30% 0px -30%" });
    tlItems.forEach((el) => tlIo.observe(el));
  };

  /* ---------- 3D tilt engine with specular glare ---------- */

  const initTilt = () => {
    if (!finePointer || reduced) return;
    $$("[data-tilt]").forEach((card) => {
      const max = parseFloat(card.dataset.tiltMax || "8");
      const glare = document.createElement("div");
      glare.className = "glare";
      glare.setAttribute("aria-hidden", "true");
      card.appendChild(glare);
      let raf = null;

      card.addEventListener("pointerenter", () => card.classList.add("is-tilting"));
      card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = null;
          card.style.setProperty("--ry", ((px - 0.5) * 2 * max).toFixed(2) + "deg");
          card.style.setProperty("--rx", ((0.5 - py) * 2 * max).toFixed(2) + "deg");
          card.style.setProperty("--gx", (px * 100).toFixed(1) + "%");
          card.style.setProperty("--gy", (py * 100).toFixed(1) + "%");
        });
      });
      card.addEventListener("pointerleave", () => {
        card.classList.remove("is-tilting");
        card.style.setProperty("--rx", "0deg");
        card.style.setProperty("--ry", "0deg");
      });
    });
  };

  /* ---------- Magnetic buttons ---------- */

  const initMagnetic = () => {
    if (!finePointer || reduced) return;
    $$("[data-magnetic]").forEach((el) => {
      const strength = 14;
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        const dx = ((e.clientX - r.left) / r.width - 0.5) * 2;
        const dy = ((e.clientY - r.top) / r.height - 0.5) * 2;
        el.style.transform =
          `translate(${(dx * strength).toFixed(1)}px, ${(dy * strength).toFixed(1)}px)`;
      });
      el.addEventListener("pointerleave", () => {
        el.style.transform = "";
      });
    });
  };

  /* ---------- Hall of tags: the toolbox sprayed onto a wall ----------
     Each skill is rendered to an offscreen mask, sampled into spray dots
     (ordered left to right like a real can pass) and painted in as the
     chapter scrolls: drop shadow first, colour, overspray, then drips once
     a word is mostly done. Hold the pointer to spray your own. */

  let tagProgress = null;

  const initTagWall = () => {
    const canvas = $("#tagwall");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const words = [
      ["JavaScript", 0, "#0dffeb"], ["TypeScript", 0, "#e100ff"], ["WebGL", 0, "#cfc7ff"],
      ["C#", 0, "#ff8c38"], ["HTML", 1, "#b57bff"], ["CSS", 1, "#0dffeb"], ["GLSL", 1, "#6cff73"],
      ["Three.js", 1, "#e100ff"], ["Remotion", 1, "#cfc7ff"], ["Python", 1, "#ff8c38"],
      ["Node.js", 1, "#6cff73"], [".NET", 1, "#b57bff"], ["Git", 1, "#0dffeb"],
      ["Playwright", 2, "#cfc7ff"], ["WPF", 2, "#e100ff"], ["Linux", 2, "#6cff73"],
      ["SEO", 2, "#ff8c38"], ["Blender", 2, "#b57bff"],
    ];
    const cans = ["#e100ff", "#0dffeb", "#943adf", "#cfc7ff", "#6cff73", "#ff8c38"];
    const font = (px) => `700 ${px}px "Pixelify Sans", monospace`;

    let W = 0, H = 0, dpr = 1;
    let items = [], total = 0, drawn = 0, progress = reduced ? 1 : 0;
    const user = [];
    let can = 0, spraying = false, built = false;

    const dot = (x, y, rad, alpha, color) => {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, 6.2832);
      ctx.fill();
    };

    const build = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;
      W = Math.round(rect.width);
      H = Math.round(rect.height);
      dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const r = SKYO.M.rng(4711);

      // lay the words out in loose rows, biggest tiers first in source order
      const sizes = [H * 0.17, H * 0.115, H * 0.085];
      let scale = 1.28, placed = [];
      for (let attempt = 0; attempt < 10; attempt++) {
        placed = [];
        let x = W * 0.03, y = H * 0.04, rowH = 0, ok = true;
        const rr = SKYO.M.rng(4711);
        for (const [label, tier, color] of words) {
          const px = sizes[tier] * scale;
          ctx.font = font(px);
          const w = ctx.measureText(label).width + px * 0.2;
          const h = px * 1.05;
          if (x + w > W * 0.97) { x = W * 0.03 + rr() * W * 0.04; y += rowH + px * 0.1; rowH = 0; }
          if (y + h > H) { ok = false; break; }
          placed.push({ label, color, px, x, y: y + (rr() - 0.5) * px * 0.15, w, h, rot: (rr() - 0.5) * 0.09 });
          x += w + px * 0.15 + rr() * 12;
          rowH = Math.max(rowH, h);
        }
        if (ok) break;
        scale *= 0.93;
      }

      // sample spray dots from each word's glyph mask
      items = [];
      total = 0;
      const off = document.createElement("canvas");
      const octx = off.getContext("2d", { willReadFrequently: true });
      for (const p of placed) {
        off.width = Math.ceil(p.w) + 8;
        off.height = Math.ceil(p.h) + 8;
        octx.clearRect(0, 0, off.width, off.height);
        octx.font = font(p.px);
        octx.textBaseline = "top";
        octx.fillStyle = "#fff";
        octx.fillText(p.label, 4, 4);
        const img = octx.getImageData(0, 0, off.width, off.height).data;
        const step = Math.max(2, Math.round(p.px / 24));
        const pts = [];
        for (let yy = 0; yy < off.height; yy += step) {
          for (let xx = 0; xx < off.width; xx += step) {
            if (img[(yy * off.width + xx) * 4 + 3] > 90) pts.push([xx, yy, xx + (r() - 0.5) * p.px * 0.9]);
          }
        }
        pts.sort((a, b) => a[2] - b[2]); // a can pass: left to right, wobbly
        const cs = Math.cos(p.rot), sn = Math.sin(p.rot);
        const world = (xx, yy) => [p.x + (xx - 4) * cs - (yy - 4) * sn, p.y + (xx - 4) * sn + (yy - 4) * cs];
        const dots = pts.map(([xx, yy]) => {
          const [wx, wy] = world(xx, yy);
          const over = r() < 0.08;
          return {
            x: wx + (r() - 0.5) * step * (over ? 6 : 1.2),
            y: wy + (r() - 0.5) * step * (over ? 6 : 1.2),
            r: step * (over ? 2.4 : 0.5 + r() * 0.5),
            a: over ? 0.05 + r() * 0.05 : 0.5 + r() * 0.45,
            over,
          };
        });
        // drips start at the lowest glyph pixel of a few columns
        const cols = new Map();
        for (const [xx, yy] of pts) {
          const b = (xx / (p.px * 0.42)) | 0;
          if (!cols.has(b) || cols.get(b)[1] < yy) cols.set(b, [xx, yy]);
        }
        const drips = [...cols.values()].filter(() => r() < 0.28).map(([xx, yy]) => {
          const [wx, wy] = world(xx, yy);
          return { x: wx, y: wy, len: p.px * (0.25 + r() * 0.7), w: 1.2 + r() * 1.8, lean: (r() - 0.5) * 3 };
        });
        items.push({ ...p, dots, drips, start: total });
        total += dots.length;
      }
      drawn = 0;
      ctx.clearRect(0, 0, W, H);
      built = true;
      render();
    };

    const drawDrips = (it) => {
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = it.color;
      ctx.lineCap = "round";
      for (const d of it.drips) {
        ctx.lineWidth = d.w;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + d.lean, d.y + d.len);
        ctx.stroke();
        dot(d.x + d.lean, d.y + d.len, d.w * 0.95, 0.9, it.color);
      }
    };

    const drawRange = (from, to) => {
      for (const it of items) {
        const a = Math.max(from, it.start), b = Math.min(to, it.start + it.dots.length);
        for (let k = a; k < b; k++) {
          const d = it.dots[k - it.start];
          if (d.over) { dot(d.x, d.y, d.r, d.a, it.color); continue; }
          dot(d.x + 5, d.y + 6, d.r * 1.1, d.a * 0.85, "#08050e");
          dot(d.x, d.y, d.r, d.a, it.color);
        }
        const thr = it.start + it.dots.length * 0.72;
        if (from <= thr && thr < to) drawDrips(it);
      }
    };

    const drawUser = () => {
      for (const u of user) dot(u.x, u.y, u.r, u.a, u.c);
    };

    const render = () => {
      if (!built) return;
      const target = Math.round(progress * total);
      if (target < drawn) {
        ctx.clearRect(0, 0, W, H);
        drawn = 0;
      }
      if (target > drawn) {
        drawRange(drawn, target);
        drawn = target;
        drawUser();
      }
    };

    tagProgress = (p) => {
      const next = Math.min(1, Math.max(0, p * 1.25));
      if (Math.abs(next - progress) < 0.002) return;
      progress = next;
      render();
    };

    // spray your own
    const toCanvas = (e) => {
      const rect = canvas.getBoundingClientRect();
      return [(e.clientX - rect.left) * (W / rect.width), (e.clientY - rect.top) * (H / rect.height)];
    };
    const burst = (x, y, n) => {
      const c = cans[can];
      for (let k = 0; k < n; k++) {
        const a = Math.random() * 6.2832;
        const rad = Math.abs((Math.random() + Math.random() + Math.random()) / 3 - 0.5) * 32;
        const u = { x: x + Math.cos(a) * rad, y: y + Math.sin(a) * rad, r: 1.2 + Math.random() * 2.4, a: 0.25 + Math.random() * 0.5, c };
        user.push(u);
        dot(u.x, u.y, u.r, u.a, u.c);
      }
      if (user.length > 60000) user.splice(0, 20000);
    };
    canvas.addEventListener("pointerdown", (e) => {
      const [x, y] = toCanvas(e);
      if (e.pointerType === "touch") { burst(x, y, 60); return; }
      spraying = true;
      canvas.setPointerCapture(e.pointerId);
      burst(x, y, 24);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!spraying) return;
      const [x, y] = toCanvas(e);
      burst(x, y, 16);
    });
    const stop = () => {
      if (!spraying) return;
      spraying = false;
      can = (can + 1) % cans.length;
      canvas.parentElement.style.setProperty("--can", cans[can]);
    };
    canvas.addEventListener("pointerup", stop);
    canvas.addEventListener("pointercancel", stop);
    canvas.parentElement.style.setProperty("--can", cans[can]);

    const ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    ready.then(build);
    let rt = 0;
    if ("ResizeObserver" in window) {
      new ResizeObserver(() => {
        clearTimeout(rt);
        rt = setTimeout(() => {
          const rect = canvas.getBoundingClientRect();
          if (Math.round(rect.width) !== W || Math.round(rect.height) !== H) build();
        }, 150);
      }).observe(canvas);
    }
  };

  /* ---------- Nav: active section, burger menu ---------- */

  const initNav = () => {
    const navLinks = $$(".nav-links a");
    const sections = navLinks
      .map((a) => $(a.getAttribute("href")))
      .filter(Boolean);

    const sectionIo = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          navLinks.forEach((a) =>
            a.classList.toggle("is-active", a.getAttribute("href") === "#" + entry.target.id));
        }
      });
    }, { rootMargin: "-45% 0px -50%" });
    sections.forEach((s) => sectionIo.observe(s));

    const burger = $("#nav-burger");
    if (!burger) return;
    const setMenu = (open) => {
      document.body.classList.toggle("menu-open", open);
      burger.setAttribute("aria-expanded", String(open));
    };
    burger.addEventListener("click", () =>
      setMenu(!document.body.classList.contains("menu-open")));
    $$(".menu a").forEach((a, i) => {
      a.style.setProperty("--i", i);
      a.addEventListener("click", () => setMenu(false));
    });
    addEventListener("keydown", (e) => {
      if (e.key === "Escape") setMenu(false);
    });
  };

  /* ---------- Email scramble ---------- */

  const initScramble = () => {
    if (!finePointer || reduced) return;
    $$("[data-scramble]").forEach((el) => {
      const original = el.textContent;
      const chars = "!<>-_\\/[]{}=+*^?#";
      let interval = null;
      el.addEventListener("pointerenter", () => {
        let progress = 0;
        clearInterval(interval);
        interval = setInterval(() => {
          el.textContent = [...original]
            .map((c, i) => {
              if (i < progress || c === "@" || c === "." || c === " ") return c;
              return chars[(Math.random() * chars.length) | 0];
            })
            .join("");
          progress += 1.6;
          if (progress >= original.length) {
            clearInterval(interval);
            el.textContent = original;
          }
        }, 26);
      });
      el.addEventListener("pointerleave", () => {
        clearInterval(interval);
        el.textContent = original;
      });
    });
  };

  /* ---------- Fallback chrome loop (only when WebGL is unavailable) ---------- */

  const initFallbackChrome = () => {
    const bar = $(".scroll-progress");
    const nav = $("#nav");
    const timeline = $(".timeline");
    const hudPath = $("#hud-path");
    const chapters = $$("[data-chapter]");
    let lastY = -1;
    const tick = () => {
      const y = scrollY;
      if (y !== lastY) {
        lastY = y;
        const max = document.documentElement.scrollHeight - innerHeight;
        if (bar) bar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
        if (nav) nav.classList.toggle("is-scrolled", y > 40);
        if (timeline) {
          const r = timeline.getBoundingClientRect();
          const p = Math.min(1, Math.max(0, (innerHeight * 0.55 - r.top) / r.height));
          timeline.style.setProperty("--tl", p.toFixed(3));
        }
        let name = "tunnel";
        for (const c of chapters) {
          const r = c.getBoundingClientRect();
          if (r.top <= innerHeight * 0.5) name = c.dataset.chapter;
          if (c.dataset.chapter === "skills") {
            progress("skills", Math.min(1, Math.max(0, (innerHeight * 0.9 - r.top) / (r.height * 0.8))));
          }
        }
        if (hudPath && hudPath.textContent !== name) hudPath.textContent = name;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  /* ---------- Footer year & privacy banner ---------- */

  const initMisc = () => {
    const year = $("#year");
    if (year) year.textContent = new Date().getFullYear();

    const banner = $("#privacy-banner");
    const ok = $("#privacy-banner-ok");
    if (banner && !sessionStorage.getItem("privacyBannerAck")) {
      banner.hidden = false;
    }
    if (ok) {
      ok.addEventListener("click", () => {
        sessionStorage.setItem("privacyBannerAck", "1");
        banner.hidden = true;
      });
    }
  };

  /* ---------- Entry ---------- */

  const init = (opts) => {
    reduced = opts.reduced;
    finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;

    initHeroName();
    initReveals();
    initTimeline();
    initTilt();
    initMagnetic();
    initTagWall();
    initNav();
    initScramble();
    initMisc();
    if (opts.noWebgl) initFallbackChrome();

    initBoot(() => startTypewriter());
  };

  /* Chapter progress from the director (or the fallback loop). */
  const progress = (name, local) => {
    if (name === "skills" && tagProgress) tagProgress(local);
  };

  return { init, progress };
})();
