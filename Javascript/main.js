/* ==========================================================================
   skyo.dev — portfolio v2.0
   Vanilla JS only: boot sequence, starfield, typewriter, 3D tilt engine,
   magnetic buttons, scroll reveals, chat playback, timeline progress,
   email scramble, marquee, nav, privacy banner.
   ========================================================================== */

(() => {
  "use strict";

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---------- Boot sequence (first visit per session) ---------- */

  const boot = $("#boot");
  const finishBoot = () => {
    document.body.classList.add("is-loaded");
    if (boot) {
      boot.classList.add("done");
      setTimeout(() => boot.remove(), 600);
    }
  };

  if (reduced || sessionStorage.getItem("skyoBoot")) {
    if (boot) boot.remove();
    document.body.classList.add("is-loaded");
    startTypewriter(reduced);
  } else {
    sessionStorage.setItem("skyoBoot", "1");
    const pre = $("#boot-text");
    const lines = [
      "skyo.dev portfolio v2.0",
      "> loading pixels ......... ok",
      "> mounting 3d engine ..... ok",
      "> ready",
    ];
    let i = 0;
    (function nextLine() {
      if (i < lines.length) {
        pre.textContent += (i ? "\n" : "") + lines[i++];
        setTimeout(nextLine, 240);
      } else {
        setTimeout(() => {
          finishBoot();
          startTypewriter(false);
        }, 350);
      }
    })();
  }

  /* ---------- Hero name: split into 3D letters ---------- */

  const heroName = $("#hero-name");
  if (heroName) {
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
  }

  /* ---------- Typewriter (types a typo, fixes it, like v1 did) ---------- */

  function startTypewriter(instant) {
    const el = $("#typed");
    if (!el) return;
    const full = "Hey, I'm Tim. My target is to become a software developer.";
    if (instant) {
      el.textContent = full;
      return;
    }
    const queue = [];
    const type = (s, d = 52) => [...s].forEach((ch) => queue.push({ op: "t", ch, d }));
    const del = (n, d = 65) => { for (let k = 0; k < n; k++) queue.push({ op: "d", d }); };
    const pause = (d) => queue.push({ op: "p", d });

    type("Hey, I'm Tmi.");
    pause(450);
    del(3);
    type("im.");
    pause(550);
    type(" My target is to become a software developr", 40);
    pause(420);
    del(1);
    type("er.");

    (function step() {
      const a = queue.shift();
      if (!a) return;
      if (a.op === "t") el.textContent += a.ch;
      else if (a.op === "d") el.textContent = el.textContent.slice(0, -1);
      setTimeout(step, a.op === "p" ? a.d : a.d + Math.random() * 45);
    })();
  }

  /* ---------- Canvas starfield (pixel stars, mouse parallax) ---------- */

  const canvas = $("#stars");
  if (canvas && !reduced) {
    const ctx = canvas.getContext("2d");
    let w = 0, h = 0, stars = [], running = false, rafId = 0, t = 0;
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const dpr = Math.min(devicePixelRatio || 1, 2);

    const resize = () => {
      const rect = canvas.parentElement.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = Array.from({ length: Math.floor((w * h) / 7000) }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        z: 0.3 + Math.random() * 0.7,
        s: Math.random() < 0.82 ? 1 : 2,
        c: Math.random() < 0.12 ? "#0dffeb" : Math.random() < 0.06 ? "#e100ff" : "#cfc7ff",
        p: Math.random() * Math.PI * 2,
      }));
    };

    const frame = () => {
      t += 0.016;
      mouse.x += (mouse.tx - mouse.x) * 0.05;
      mouse.y += (mouse.ty - mouse.y) * 0.05;
      ctx.clearRect(0, 0, w, h);
      for (const st of stars) {
        st.y -= st.z * 0.18;
        if (st.y < -2) { st.y = h + 2; st.x = Math.random() * w; }
        const alpha = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.3 + st.p));
        ctx.globalAlpha = alpha * st.z;
        ctx.fillStyle = st.c;
        ctx.fillRect(st.x + mouse.x * st.z * 16, st.y + mouse.y * st.z * 10, st.s, st.s);
      }
      ctx.globalAlpha = 1;
      if (running) rafId = requestAnimationFrame(frame);
    };

    addEventListener("pointermove", (e) => {
      mouse.tx = (e.clientX / innerWidth - 0.5) * 2;
      mouse.ty = (e.clientY / innerHeight - 0.5) * 2;
    }, { passive: true });
    addEventListener("resize", resize, { passive: true });
    resize();

    new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !running) {
        running = true;
        rafId = requestAnimationFrame(frame);
      } else if (!entry.isIntersecting && running) {
        running = false;
        cancelAnimationFrame(rafId);
      }
    }).observe(canvas);
  } else if (canvas) {
    // Reduced motion: one static frame of dim stars.
    const ctx = canvas.getContext("2d");
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    ctx.fillStyle = "#cfc7ff";
    for (let i = 0; i < 90; i++) {
      ctx.globalAlpha = 0.2 + Math.random() * 0.5;
      ctx.fillRect(Math.random() * rect.width, Math.random() * rect.height, 1.5, 1.5);
    }
  }

  /* ---------- 3D tilt engine with specular glare ---------- */

  if (finePointer && !reduced) {
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
  }

  /* ---------- Magnetic buttons ---------- */

  if (finePointer && !reduced) {
    $$("[data-magnetic]").forEach((el) => {
      const strength = 14;
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        const dx = ((e.clientX - r.left) / r.width - 0.5) * 2;
        const dy = ((e.clientY - r.top) / r.height - 0.5) * 2;
        el.classList.add("is-mag");
        el.style.transform = `translate(${(dx * strength).toFixed(1)}px, ${(dy * strength).toFixed(1)}px)`;
      });
      el.addEventListener("pointerleave", () => {
        el.classList.remove("is-mag");
        el.style.transform = "";
      });
    });
  }

  /* ---------- Scroll reveals (staggered per parent) ---------- */

  const reveals = $$("[data-reveal]");
  if (reduced) {
    reveals.forEach((el) => el.classList.add("is-in"));
  } else {
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
  }

  /* ---------- Chat playback ---------- */

  const chat = $("#chat");
  if (chat) {
    const msgs = $$(".msg", chat);
    if (reduced) {
      msgs.forEach((m) => m.classList.add("is-in", "is-done"));
    } else {
      const playMsg = (i) => {
        if (i >= msgs.length) return;
        const m = msgs[i];
        m.classList.add("is-in");
        setTimeout(() => {
          m.classList.add("is-done");
          setTimeout(() => playMsg(i + 1), 180);
        }, 450);
      };
      new IntersectionObserver(([entry], obs) => {
        if (entry.isIntersecting) {
          obs.disconnect();
          playMsg(0);
        }
      }, { threshold: 0.25 }).observe(chat);
    }
  }

  /* ---------- Timeline node activation ---------- */

  const tlItems = $$(".tl-item");
  if (tlItems.length) {
    const tlIo = new IntersectionObserver((entries) => {
      entries.forEach((entry) => entry.target.classList.toggle("is-active", entry.isIntersecting));
    }, { rootMargin: "-30% 0px -30%" });
    tlItems.forEach((el) => tlIo.observe(el));
  }

  /* ---------- Nav: active section, scrolled state, burger menu ---------- */

  const nav = $("#nav");
  const navLinks = $$(".nav-links a");
  const sections = navLinks
    .map((a) => $(a.getAttribute("href")))
    .filter(Boolean);

  const sectionIo = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        navLinks.forEach((a) =>
          a.classList.toggle("is-active", a.getAttribute("href") === "#" + entry.target.id)
        );
      }
    });
  }, { rootMargin: "-40% 0px -55%" });
  sections.forEach((s) => sectionIo.observe(s));

  const burger = $("#nav-burger");
  if (burger) {
    const setMenu = (open) => {
      document.body.classList.toggle("menu-open", open);
      burger.setAttribute("aria-expanded", String(open));
    };
    burger.addEventListener("click", () =>
      setMenu(!document.body.classList.contains("menu-open"))
    );
    $$(".menu a").forEach((a, i) => {
      a.style.setProperty("--i", i);
      a.addEventListener("click", () => setMenu(false));
    });
    addEventListener("keydown", (e) => {
      if (e.key === "Escape") setMenu(false);
    });
  }

  /* ---------- Scroll-driven: progress bar, nav state, parallax, timeline ---------- */

  const progressBar = $(".scroll-progress");
  const peakLayers = $$(".peaks svg");
  const heroInner = $(".hero-inner");
  const timeline = $(".timeline");
  let ticking = false;

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const y = scrollY;
      const max = document.documentElement.scrollHeight - innerHeight;
      if (progressBar) progressBar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
      if (nav) nav.classList.toggle("is-scrolled", y > 40);

      if (!reduced && y < innerHeight * 1.2) {
        peakLayers.forEach((svg, i) => {
          svg.style.transform = `translateY(${(y * (0.06 + i * 0.07)).toFixed(1)}px)`;
        });
        if (heroInner) heroInner.style.transform = `translateY(${(y * 0.28).toFixed(1)}px)`;
      }

      if (timeline) {
        const r = timeline.getBoundingClientRect();
        const p = clamp((innerHeight * 0.55 - r.top) / r.height, 0, 1);
        timeline.style.setProperty("--tl", p.toFixed(3));
      }
    });
  };
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- Email scramble ---------- */

  if (finePointer && !reduced) {
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
  }

  /* ---------- Marquee: clone groups for a seamless loop ---------- */

  if (!reduced) {
    $$(".marquee-track").forEach((track) => {
      const group = $(".marquee-group", track);
      if (!group) return;
      const clone = group.cloneNode(true);
      clone.setAttribute("aria-hidden", "true");
      track.appendChild(clone);
    });
  }

  /* ---------- Cursor halo ---------- */

  const halo = $(".cursor-halo");
  if (halo && finePointer && !reduced) {
    const pos = { x: innerWidth / 2, y: innerHeight / 2, tx: innerWidth / 2, ty: innerHeight / 2 };
    let visible = false;
    addEventListener("pointermove", (e) => {
      pos.tx = e.clientX;
      pos.ty = e.clientY;
      if (!visible) {
        visible = true;
        halo.classList.add("is-on");
      }
    }, { passive: true });
    document.addEventListener("mouseover", (e) => {
      halo.classList.toggle("on-link", !!e.target.closest("a, button, [data-tilt]"));
    });
    (function haloFrame() {
      pos.x += (pos.tx - pos.x) * 0.16;
      pos.y += (pos.ty - pos.y) * 0.16;
      halo.style.transform = `translate(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px)`;
      requestAnimationFrame(haloFrame);
    })();
  } else if (halo) {
    halo.remove();
  }

  /* ---------- Footer year & privacy banner ---------- */

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
})();
