/* eslint-disable no-mixed-operators */
/**
 * Tree Plum — Fluidity
 * A scroll-synced modern-art experience optimized for Mobile Safari.
 *
 * Principles:
 * - Use a single fixed canvas, redraw via requestAnimationFrame (no per-scroll paint storms)
 * - Cap devicePixelRatio to keep GPU + memory stable on iPhones
 * - Prefer 2D canvas + lightweight math over heavy shaders (Safari stability)
 * - Respect prefers-reduced-motion
 */

(() => {
  const prefersReduced =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const canvas = document.getElementById("scene");
  /** @type {CanvasRenderingContext2D} */
  const ctx = canvas.getContext("2d", {
    alpha: false,
    desynchronized: true,
  });

  const svg = document.querySelector(".paths");
  const mistEls = Array.from(document.querySelectorAll(".mist"));
  const branchPaths = Array.from(
    document.querySelectorAll(".branch, .twig, .leafStroke"),
  );

  // ---------- Utilities ----------
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };

  // Small deterministic PRNG for repeatable “art” without assets.
  const mulberry32 = (seed) => {
    let t = seed >>> 0;
    return () => {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  };

  // Value noise (2D) with smooth interpolation; fast enough for 2D fields.
  const makeValueNoise2D = (seed = 1337) => {
    const rand = mulberry32(seed);
    const grid = new Map();
    const key = (ix, iy) => `${ix},${iy}`;
    const g = (ix, iy) => {
      const k = key(ix, iy);
      if (!grid.has(k)) grid.set(k, rand() * 2 - 1);
      return grid.get(k);
    };
    return (x, y) => {
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      const fx = x - ix;
      const fy = y - iy;

      const v00 = g(ix, iy);
      const v10 = g(ix + 1, iy);
      const v01 = g(ix, iy + 1);
      const v11 = g(ix + 1, iy + 1);

      const sx = fx * fx * (3 - 2 * fx);
      const sy = fy * fy * (3 - 2 * fy);

      const a = lerp(v00, v10, sx);
      const b = lerp(v01, v11, sx);
      return lerp(a, b, sy);
    };
  };

  const n1 = makeValueNoise2D(9127);
  const n2 = makeValueNoise2D(13331);

  // ---------- Layout / DPR ----------
  const state = {
    w: 0,
    h: 0,
    dpr: 1,
    t: 0,
    scroll01: 0,
    scrollPx: 0,
    vel: 0,
    lastScrollPx: 0,
    needsDraw: true,
  };

  const setCanvasSize = () => {
    // Cap DPR to keep iPhone GPU/memory happy.
    const maxDpr = 2.0;
    const dpr = clamp(window.devicePixelRatio || 1, 1, maxDpr);
    state.dpr = dpr;
    state.w = Math.max(1, Math.floor(window.innerWidth));
    state.h = Math.max(1, Math.floor(window.innerHeight));

    const cw = Math.floor(state.w * dpr);
    const ch = Math.floor(state.h * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
      canvas.style.width = `${state.w}px`;
      canvas.style.height = `${state.h}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.needsDraw = true;
    scheduleDraw();
  };

  // ---------- Scroll sync ----------
  const computeScroll01 = () => {
    const doc = document.documentElement;
    const max = Math.max(1, doc.scrollHeight - window.innerHeight);
    const y = clamp(window.scrollY || doc.scrollTop || 0, 0, max);
    state.scrollPx = y;
    state.scroll01 = max ? y / max : 0;
  };

  // ---------- SVG path “reveals” ----------
  const initPathStrokes = () => {
    // Strokes “grow” by dashoffset; Safari sometimes needs a layout flush.
    for (const p of branchPaths) {
      const len = p.getTotalLength();
      p.style.strokeDasharray = `${len}`;
      p.style.strokeDashoffset = `${len}`;
      // Keep around for update.
      p.dataset.len = String(len);
    }
  };

  const updatePathStrokes = (s) => {
    // Different groups reveal at different scroll intervals.
    // Branches: earlier, twigs: middle, leaf sheen: later.
    for (const p of branchPaths) {
      const len = Number(p.dataset.len || 0);
      let local = 0;
      if (p.classList.contains("branch")) local = smoothstep(0.02, 0.62, s);
      else if (p.classList.contains("twig")) local = smoothstep(0.18, 0.78, s);
      else local = smoothstep(0.42, 0.98, s);
      const dash = lerp(len, 0, local);
      p.style.strokeDashoffset = `${dash}`;
      p.style.opacity = String(
        lerp(0.05, 0.75, smoothstep(0.02, 0.95, s)),
      );
    }
  };

  // ---------- Mist parallax ----------
  const updateMist = (s) => {
    const drift = (k) =>
      Math.sin((s * Math.PI * 2 + k) * 0.85) * (8 + 10 * k);
    for (let i = 0; i < mistEls.length; i++) {
      const el = mistEls[i];
      const k = (i + 1) / 4;
      const y = (s * 120 - 60) * k;
      const x = drift(k);
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      el.style.opacity = String(0.25 + 0.5 * (1 - k) * (0.35 + 0.65 * (1 - s)));
    }
  };

  // ---------- Canvas art ----------
  const palette = {
    bgA: "#05040a",
    bgB: "#13061a",
    plumA: "#3a0f3d",
    plumB: "#6a1f66",
    plumC: "#b23aa5",
    leafA: "#0b1f17",
    leafB: "#2aa370",
    fog: "rgba(255,255,255,0.06)",
  };

  const drawBackground = (s) => {
    const { w, h } = state;
    const g = ctx.createRadialGradient(
      w * 0.5,
      h * (0.22 + 0.06 * Math.sin(s * Math.PI * 2)),
      0,
      w * 0.5,
      h * 0.35,
      Math.max(w, h) * 0.9,
    );
    g.addColorStop(0, palette.bgB);
    g.addColorStop(1, palette.bgA);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  };

  const drawVignette = () => {
    const { w, h } = state;
    const v = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  };

  const drawFlowField = (s, time) => {
    // A light “current” texture: short strokes aligned with a noise-derived angle.
    const { w, h } = state;
    const density = prefersReduced ? 0 : 1;
    if (!density) return;

    const step = w < 420 ? 26 : 30;
    const amp = 0.9 + 0.6 * (1 - s);

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.10;
    ctx.lineWidth = 1;

    for (let y = -step; y < h + step; y += step) {
      for (let x = -step; x < w + step; x += step) {
        const nx = x / w;
        const ny = y / h;
        const a =
          Math.PI *
          2 *
          (0.35 * n1(nx * 5 + s * 0.9, ny * 5 + time * 0.08) +
            0.65 * n2(nx * 7 - time * 0.05, ny * 7 + s * 0.7));
        const len = (10 + 14 * (0.5 + 0.5 * n1(nx * 9 + 2.0, ny * 9 - 1.0))) * amp;
        const x2 = x + Math.cos(a) * len;
        const y2 = y + Math.sin(a) * len;

        const hue = 285 + 35 * (0.5 + 0.5 * Math.sin(a));
        ctx.strokeStyle = `hsla(${hue}, 62%, 58%, 0.7)`;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }
    ctx.restore();
  };

  const drawPlumMetaballs = (s, time) => {
    // “Plums” as soft blobs, drifting along fluid currents.
    const { w, h } = state;
    const rand = mulberry32(20260109);
    const count = w < 420 ? 9 : 12;

    ctx.save();
    ctx.globalCompositeOperation = "screen";

    for (let i = 0; i < count; i++) {
      const r0 = rand();
      const r1 = rand();
      const r2 = rand();

      const baseX = lerp(0.15, 0.85, r0);
      const baseY = lerp(0.18, 0.92, r1);

      const drift =
        0.08 *
        (n1(baseX * 3 + time * 0.12, baseY * 3 + s * 1.8) +
          n2(baseX * 4 - time * 0.10, baseY * 4 + s * 1.2));

      const x = (baseX + drift) * w;
      const y = (baseY + 0.12 * Math.sin(time * 0.6 + i * 1.2 + s * 6.0)) * h;
      const radius = lerp(w * 0.06, w * 0.13, r2) * (0.85 + 0.35 * (1 - s));

      const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 1.25);
      glow.addColorStop(0, "rgba(255,255,255,0.05)");
      glow.addColorStop(0.2, "rgba(178,58,165,0.22)");
      glow.addColorStop(0.55, "rgba(106,31,102,0.16)");
      glow.addColorStop(1, "rgba(10,5,16,0)");

      ctx.fillStyle = glow;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.ellipse(x, y, radius * 1.06, radius * 0.92, time * 0.08, 0, Math.PI * 2);
      ctx.fill();

      // A “skin sheen” stroke
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = "rgba(255, 220, 255, 0.25)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(
        x - radius * 0.18,
        y - radius * 0.16,
        radius * 0.58,
        radius * 0.44,
        -0.55,
        -0.25,
        1.55,
      );
      ctx.stroke();
    }
    ctx.restore();
  };

  const drawCanopy = (s, time) => {
    // Impressionistic leaf field: small arcs responding to flow.
    if (prefersReduced) return;
    const { w, h } = state;

    ctx.save();
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = 0.11;
    ctx.lineWidth = 1.3;

    const rows = w < 420 ? 12 : 14;
    const cols = w < 420 ? 10 : 12;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const u = (i + 0.5) / cols;
        const v = (j + 0.5) / rows;

        const field =
          0.6 * n1(u * 6 + time * 0.08, v * 6 + s * 1.2) +
          0.4 * n2(u * 10 - time * 0.05, v * 10 + s * 0.8);
        const a = field * Math.PI * 2.0;

        const x = u * w + Math.cos(a) * 16;
        const y = v * h + Math.sin(a) * 16;

        const size = (10 + 18 * (0.5 + 0.5 * field)) * (0.7 + 0.5 * (1 - s));
        const hue = 125 + 25 * (0.5 + 0.5 * Math.sin(a + time * 0.2));
        ctx.strokeStyle = `hsla(${hue}, 58%, 48%, 0.8)`;

        ctx.beginPath();
        ctx.arc(x, y, size, a, a + 1.1);
        ctx.stroke();
      }
    }
    ctx.restore();
  };

  const draw = (now) => {
    state.needsDraw = false;
    const { scroll01, w, h } = state;

    // Time is “fluidity”: scroll controls the base, with a tiny inertial tail.
    const base = scroll01 * 18.0;
    const inertia = clamp(state.vel * 0.0012, -0.8, 0.8);
    const time = base + inertia;

    ctx.clearRect(0, 0, w, h);
    drawBackground(scroll01);
    drawFlowField(scroll01, time);
    drawPlumMetaballs(scroll01, time);
    drawCanopy(scroll01, time);
    drawVignette();

    // Micro “fog” grain (cheap) to avoid banding.
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.globalCompositeOperation = "overlay";
    const step = 6;
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const g = n1(x * 0.03 + time * 0.3, y * 0.03 - time * 0.2);
        const a = 0.45 + 0.55 * (0.5 + 0.5 * g);
        ctx.fillStyle = `rgba(255,255,255,${0.03 * a})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.restore();

    // Subtle global transforms tied to scroll for a “breathing” world.
    if (!prefersReduced) {
      const z = 1 + 0.02 * Math.sin(scroll01 * Math.PI * 2);
      const rot = (scroll01 - 0.5) * 0.8; // degrees
      canvas.style.transform = `scale(${z}) rotate(${rot}deg)`;
    } else {
      canvas.style.transform = "none";
    }

    // Keep SVG and mist in sync.
    updatePathStrokes(scroll01);
    updateMist(scroll01);

    // SVG overall drift
    if (svg) {
      const tx = (scroll01 - 0.5) * 28;
      const ty = (scroll01 - 0.5) * -18;
      const r = (scroll01 - 0.5) * 1.5;
      svg.style.transform = prefersReduced
        ? "none"
        : `translate3d(${tx}px, ${ty}px, 0) rotate(${r}deg)`;
      svg.style.opacity = String(0.55 + 0.35 * smoothstep(0.05, 0.95, scroll01));
    }
  };

  // ---------- rAF scheduling ----------
  let raf = 0;
  const scheduleDraw = () => {
    if (prefersReduced) {
      // Still draw once per resize/scroll to keep it responsive, but no continuous animation.
      if (raf) return;
      raf = requestAnimationFrame((t) => {
        raf = 0;
        draw(t);
      });
      return;
    }

    if (raf) return;
    raf = requestAnimationFrame((t) => {
      raf = 0;
      draw(t);
      // If user is still scrolling quickly, keep frames flowing.
      if (Math.abs(state.vel) > 0.6) {
        state.needsDraw = true;
        scheduleDraw();
      }
    });
  };

  const onScroll = () => {
    computeScroll01();
    const dy = state.scrollPx - state.lastScrollPx;
    state.vel = lerp(state.vel, dy, 0.35);
    state.lastScrollPx = state.scrollPx;
    state.needsDraw = true;
    scheduleDraw();
  };

  const onResize = () => {
    setCanvasSize();
    computeScroll01();
    state.needsDraw = true;
    scheduleDraw();
  };

  // iOS Safari can “resize” on scroll because of the address bar.
  // Listen to visualViewport when available to keep canvas crisp without thrashing.
  const onViewport = () => {
    // Avoid overreacting: only resize if it meaningfully changes.
    const vw = Math.floor(window.visualViewport?.width || window.innerWidth);
    const vh = Math.floor(window.visualViewport?.height || window.innerHeight);
    if (Math.abs(vw - state.w) > 2 || Math.abs(vh - state.h) > 2) onResize();
  };

  // ---------- Init ----------
  setCanvasSize();
  computeScroll01();
  initPathStrokes();
  state.lastScrollPx = state.scrollPx;
  state.vel = 0;

  // First paint
  scheduleDraw();

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize, { passive: true });
  window.addEventListener("orientationchange", onResize, { passive: true });
  window.visualViewport?.addEventListener("resize", onViewport, { passive: true });
  window.visualViewport?.addEventListener("scroll", onViewport, { passive: true });

  // Wake up on touch interactions; helps Safari occasionally delay scroll events.
  window.addEventListener(
    "touchmove",
    () => {
      state.needsDraw = true;
      scheduleDraw();
    },
    { passive: true },
  );
})();

