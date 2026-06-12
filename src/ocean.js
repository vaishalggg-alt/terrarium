// Canvas world engine for the Ocean biome.
//
//   • Each unsent letter you bottle becomes a glass bottle bobbing on the
//     waves. Bottles are placed deterministically so the sea is stable across
//     reloads — letting go is permanent, the sea keeps every one.
//   • The view is a half-bird's-eye perspective: the shore is at the bottom,
//     the open ocean stretches away toward the horizon at the top. Bottles
//     float out into the distance — smaller and higher as they drift further.
//   • The sky above the waterline runs the same continuous day/night cycle as
//     the forest, tied to the real clock.
//   • The more letters you release, the more alive the water gets: a school of
//     fish thickens, and at night the deep fills with bioluminescent plankton
//     and pulsing jellyfish.
//   • A hidden luminous whale surfaces once five letters have been released.

import { clockDate } from './clock.js';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const ease = (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
const blend = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rgb = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

// deterministic per-index pseudo random so bottle layout is stable
function rng(seed) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

// 0..1 daylight + sky palette for the current hour
function skyState(date) {
  const h = date.getHours() + date.getMinutes() / 60;
  let day;
  if (h < 5 || h >= 21) day = 0;
  else if (h < 7) day = (h - 5) / 2;
  else if (h < 18) day = 1;
  else if (h < 21) day = 1 - (h - 18) / 3;
  else day = 0;

  const night = { top: [12, 18, 44], bot: [30, 44, 82] };
  const dusk = { top: [58, 50, 96], bot: [232, 138, 110] };
  const noon = { top: [120, 190, 236], bot: [196, 232, 236] };
  const base = day < 0.5
    ? { top: blend(night.top, dusk.top, day / 0.5), bot: blend(night.bot, dusk.bot, day / 0.5) }
    : { top: blend(dusk.top, noon.top, (day - 0.5) / 0.5), bot: blend(dusk.bot, noon.bot, (day - 0.5) / 0.5) };
  return { day, top: base.top, bot: base.bot, isNight: day < 0.12 };
}

export function createOcean(canvas, { onBottleClick } = {}) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
  let letters = [];
  let bottles = [];
  let whale = false;
  let fish = [];
  let plankton = [];
  let jellies = [];
  let raf = 0;
  let t0 = performance.now();
  let lastTime = 0;
  let whaleState = { phase: 0.1 };

  // ── perspective helpers ──────────────────────────────────────────────────
  // d=0: near shore (bottom of water), d=1: far horizon (top of water)
  function wTop() { return H * 0.40; }
  function wBot() { return H * 0.84; }
  function pY(d) { return wBot() - d * (wBot() - wTop()); }
  function pX(fx, d) { return W * 0.5 + (fx - 0.5) * W * lerp(0.96, 0.18, d); }
  function pScale(d) { return lerp(3.2, 0.32, d); }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = rect.width; H = rect.height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rebuildLife();
  }

  function rebuildBottles(launchNewest = false, currentTime = 0) {
    bottles = letters.map((l, k) => {
      const r = rng(k + 1);
      const isNewest = launchNewest && k === letters.length - 1;
      return {
        fx: 0.15 + r() * 0.70,   // horizontal 0..1
        fy: 0.55 + r() * 0.38,   // depth: 0.55–0.93, reaches the dark deep ocean
        drift: (r() - 0.5) * 0.005,
        bob: r() * TAU,
        scale: 0.82 + r() * 0.42,
        tint: r(),
        launchTime: isNewest ? currentTime : -1,
      };
    });
  }

  function rebuildLife() {
    const n = clamp(letters.length * 2, 0, 34);
    const WT = wTop(), WB = wBot();
    fish = Array.from({ length: n }, () => {
      const r = Math.random;
      return {
        x: r() * W, y: WT + 30 + r() * (WB - WT - 50),
        sp: (0.3 + r() * 0.7) * (r() < 0.5 ? 1 : -1),
        phase: r() * TAU, amp: 4 + r() * 8, s: 4 + r() * 5,
      };
    });
    plankton = Array.from({ length: 70 }, () => {
      const r = Math.random;
      return { x: r() * W, y: WT + 10 + r() * (WB - WT), phase: r() * TAU, sp: 0.2 + r() * 0.4, s: 1 + r() * 1.8 };
    });
    jellies = Array.from({ length: 5 }, () => {
      const r = Math.random;
      return { x: r() * W, y: WT + 50 + r() * (WB - WT - 60), phase: r() * TAU, sp: 0.15 + r() * 0.2, s: 10 + r() * 12, rise: 0.1 + r() * 0.15 };
    });
  }

  function setData({ letters: ls, whale: wh }) {
    // Only animate if a letter was added while ocean was already mounted
    // (letters.length > 0 guards against the "fresh mount with saved data" case)
    const isNew = letters.length > 0 && ls.length > letters.length;
    const changed = ls.length !== letters.length;
    letters = ls;
    whale = !!wh;
    const currentTime = performance.now() - t0;
    rebuildBottles(isNew, currentTime);
    if (changed) rebuildLife();
  }

  // ── sky ──────────────────────────────────────────────────────────────────

  function drawSky(sky) {
    const wl = wTop();
    const g = ctx.createLinearGradient(0, 0, 0, wl);
    g.addColorStop(0, rgb(sky.top));
    g.addColorStop(1, rgb(sky.bot));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, wl + 10);

    if (sky.isNight || sky.day < 0.35) {
      const a = clamp((0.35 - sky.day) / 0.35, 0, 1);
      ctx.fillStyle = `rgba(255,255,255,${0.7 * a})`;
      for (let i = 0; i < 50; i++) {
        ctx.fillRect((i * 137.5) % W, (i * 71.3) % (wl * 0.8), 1.4, 1.4);
      }
      ctx.fillStyle = `rgba(240,240,220,${a})`;
      ctx.beginPath(); ctx.arc(W * 0.76, wl * 0.42, 24, 0, TAU); ctx.fill();
      ctx.fillStyle = rgb(sky.top);
      ctx.beginPath(); ctx.arc(W * 0.81, wl * 0.36, 22, 0, TAU); ctx.fill();
    } else {
      const a = clamp(sky.day, 0, 1);
      const sun = ctx.createRadialGradient(W * 0.78, wl * 0.4, 8, W * 0.78, wl * 0.4, 130);
      sun.addColorStop(0, `rgba(255,250,220,${0.9 * a})`);
      sun.addColorStop(1, 'rgba(255,250,220,0)');
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, W, wl + 10);
    }
  }

  // ── water ────────────────────────────────────────────────────────────────

  function drawWater(sky, time) {
    const WT = wTop(), WB = wBot();
    const d = 0.35 + sky.day * 0.65;

    // Ocean fill — darkens toward horizon (perspective depth cue)
    const g = ctx.createLinearGradient(0, WT, 0, WB);
    g.addColorStop(0,   `rgb(${(15 * d) | 0},${(55 * d) | 0},${(100 * d) | 0})`);
    g.addColorStop(0.45,`rgb(${(32 * d) | 0},${(110 * d) | 0},${(148 * d) | 0})`);
    g.addColorStop(1,   `rgb(${(54 * d) | 0},${(162 * d) | 0},${(184 * d) | 0})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, WT, W, WB - WT);

    // Sandy shore strip at bottom
    const sg = ctx.createLinearGradient(0, WB, 0, H);
    sg.addColorStop(0,   `rgb(${(190 * d) | 0},${(165 * d) | 0},${(122 * d) | 0})`);
    sg.addColorStop(0.5, `rgb(${(210 * d) | 0},${(182 * d) | 0},${(138 * d) | 0})`);
    sg.addColorStop(1,   `rgb(${(222 * d) | 0},${(194 * d) | 0},${(150 * d) | 0})`);
    ctx.fillStyle = sg;
    ctx.fillRect(0, WB, W, H - WB);

    // Perspective wave lines — spaced by perspective, bigger amplitude near shore
    let depth = 0.03;
    while (depth < 0.99) {
      const wy = WB - depth * (WB - WT);
      const amp = lerp(7, 0.6, depth);
      const alpha = lerp(0.16, 0.04, depth);
      ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
      ctx.lineWidth = lerp(1.5, 0.4, depth);
      ctx.beginPath();
      for (let x = 0; x <= W; x += 8) {
        const wy2 = wy
          + Math.sin(x * 0.013 + depth * 7 - time * 0.0012) * amp
          + Math.sin(x * 0.031 + depth * 3 + time * 0.0008) * amp * 0.38;
        x === 0 ? ctx.moveTo(x, wy2) : ctx.lineTo(x, wy2);
      }
      ctx.stroke();
      // perspective spacing: near waves widely spaced, far waves closely packed
      depth += lerp(0.085, 0.010, depth);
    }

    // Shore foam
    ctx.strokeStyle = `rgba(255,255,255,${0.38 * d})`;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let x = 0; x <= W; x += 8) {
      const wy = WB
        + Math.sin(x * 0.022 + time * 0.0022) * 3.5
        + Math.sin(x * 0.051 - time * 0.0016) * 1.5;
      x === 0 ? ctx.moveTo(x, wy) : ctx.lineTo(x, wy);
    }
    ctx.stroke();

    // Sun glitter band near shore
    if (sky.day > 0.25) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const glit = lerp(0, 0.09, sky.day);
      ctx.fillStyle = `rgba(255,250,210,${glit})`;
      for (let x = 0; x <= W; x += 18) {
        const wy = WB - 0.06 * (WB - WT) + Math.sin(x * 0.04 + time * 0.004) * 4;
        const w = 4 + Math.abs(Math.sin(x * 0.06 + time * 0.003)) * 3;
        ctx.fillRect(x - w / 2, wy, w, 2.5);
      }
      ctx.restore();
    }
  }

  // ── sea life ─────────────────────────────────────────────────────────────

  function drawFish(sky, time) {
    const night = sky.day < 0.3;
    const WT = wTop(), WB = wBot();
    for (const f of fish) {
      f.x += f.sp;
      f.phase += 0.05;
      const y = f.y + Math.sin(f.phase) * f.amp;
      if (f.x > W + 20) f.x = -20;
      if (f.x < -20) f.x = W + 20;
      if (y < WT + 5 || y > WB - 5) continue;
      const dir = f.sp >= 0 ? 1 : -1;
      ctx.save();
      ctx.translate(f.x, y);
      ctx.scale(dir, 1);
      if (night) {
        const a = 0.5 + 0.4 * Math.sin(time * 0.005 + f.phase);
        ctx.fillStyle = `rgba(120,220,255,${a})`;
      } else {
        ctx.fillStyle = 'rgba(20,60,90,0.45)';
      }
      ctx.beginPath();
      ctx.ellipse(0, 0, f.s, f.s * 0.5, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-f.s, 0);
      ctx.lineTo(-f.s - f.s * 0.7, -f.s * 0.5);
      ctx.lineTo(-f.s - f.s * 0.7, f.s * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawDeepLife(sky, time) {
    if (sky.day > 0.4) return;
    const a = clamp((0.4 - sky.day) / 0.4, 0, 1);
    const WT = wTop(), WB = wBot();

    for (const p of plankton) {
      p.phase += 0.02 * p.sp;
      const glow = (0.3 + 0.4 * Math.sin(p.phase)) * a;
      ctx.fillStyle = `rgba(150,240,210,${glow})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, TAU); ctx.fill();
    }

    for (const j of jellies) {
      j.phase += j.sp * 0.03;
      j.y -= j.rise;
      if (j.y < WT + 20) j.y = WB - 10;
      const pulse = 0.5 + 0.5 * Math.sin(j.phase);
      const x = j.x + Math.sin(j.phase * 0.6) * 12;
      const r = j.s * (0.8 + pulse * 0.3);
      const glow = ctx.createRadialGradient(x, j.y, 0, x, j.y, r * 2.4);
      glow.addColorStop(0, `rgba(190,150,255,${0.45 * a})`);
      glow.addColorStop(1, 'rgba(190,150,255,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(x, j.y, r * 2.4, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(220,200,255,${0.7 * a})`;
      ctx.beginPath(); ctx.ellipse(x, j.y, r, r * 0.8, 0, Math.PI, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(200,180,255,${0.5 * a})`;
      ctx.lineWidth = 1.2;
      for (let t = -2; t <= 2; t++) {
        ctx.beginPath();
        ctx.moveTo(x + t * r * 0.35, j.y);
        ctx.quadraticCurveTo(x + t * r * 0.35 + Math.sin(time * 0.004 + t) * 4, j.y + r * 1.6, x + t * r * 0.35, j.y + r * 2.4);
        ctx.stroke();
      }
    }
  }

  function drawWhale(sky, time) {
    whaleState.phase += 0.0014;
    const a = sky.day < 0.4 ? clamp((0.4 - sky.day) / 0.4, 0, 1) : 0.25;
    const WT = wTop(), WB = wBot();
    // Whale swims in mid-ocean depth
    const depth = 0.45 + Math.sin(whaleState.phase * 0.7) * 0.12;
    const x = pX(0.5 + Math.cos(whaleState.phase) * 0.38, depth);
    const y = pY(depth);
    const dir = Math.sin(whaleState.phase) >= 0 ? 1 : -1;
    const sc = pScale(depth);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(dir * sc, sc);
    const L = W * 0.18;
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, L);
    glow.addColorStop(0, `rgba(140,200,255,${0.22 * a})`);
    glow.addColorStop(1, 'rgba(140,200,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(0, 0, L, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(40,70,110,${0.55 + 0.3 * a})`;
    ctx.beginPath();
    ctx.moveTo(-L * 0.5, 0);
    ctx.quadraticCurveTo(0, -L * 0.32, L * 0.5, 0);
    ctx.quadraticCurveTo(L * 0.62, L * 0.05, L * 0.5, L * 0.16);
    ctx.quadraticCurveTo(0, L * 0.26, -L * 0.5, L * 0.12);
    ctx.quadraticCurveTo(-L * 0.62, L * 0.04, -L * 0.7, -L * 0.12);
    ctx.quadraticCurveTo(-L * 0.55, 0, -L * 0.5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = `rgba(150,220,255,${0.6 * a})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-L * 0.45, -L * 0.02);
    ctx.quadraticCurveTo(0, -L * 0.22, L * 0.42, -L * 0.02);
    ctx.stroke();
    ctx.fillStyle = `rgba(200,230,255,${a})`;
    ctx.beginPath(); ctx.arc(L * 0.34, L * 0.02, 2.2, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // ── bottles ───────────────────────────────────────────────────────────────

  // Glass bottle seen from slightly above — proper silhouette with bezier curves
  function paintBottleShape(b) {
    const tint = b.tint;
    const glassR = (100 + tint * 50) | 0;
    const glassG = (170 - tint * 20) | 0;
    const glassB = (160 + tint * 40) | 0;
    const glass   = `rgba(${glassR},${glassG},${glassB},0.58)`;
    const glassDk = `rgba(${(glassR * 0.7) | 0},${(glassG * 0.7) | 0},${(glassB * 0.7) | 0},0.72)`;

    // ── bottle outline (right half mirrored) ──────────────────────────────
    // Coordinates: y=0 at cork top, bottle hangs downward
    //   cork top:    y = 0
    //   neck mouth:  y = 8
    //   neck base:   y = 22   half-width = 5.5
    //   shoulder:    y = 30   half-width = 14
    //   body mid:    y = 44   half-width = 15
    //   body bottom: y = 58   half-width = 13  (rounded bottom)
    // Shift so visual center is near y=30 for the bob pivot
    const YOF = -25; // offset so pivot is at body mid

    function bottlePath() {
      ctx.beginPath();
      ctx.moveTo(0, YOF + 0); // cork top-center
      // Left side — going down
      ctx.lineTo(-3.5, YOF + 0);   // cork left top
      ctx.lineTo(-3.8, YOF + 6);   // cork bottom / mouth
      ctx.lineTo(-4.5, YOF + 8);   // neck top flare
      ctx.lineTo(-4.2, YOF + 16);  // neck bottom (shorter neck)
      // shoulder curve — quicker taper
      ctx.bezierCurveTo(-4.5, YOF + 19, -10, YOF + 22, -10.5, YOF + 26);
      // body (narrower: half-width ~10.5 not 15)
      ctx.lineTo(-10.5, YOF + 42);
      // bottom curve
      ctx.bezierCurveTo(-10.4, YOF + 50, -7, YOF + 53, 0, YOF + 53);
      // Right side — mirror going up
      ctx.bezierCurveTo(7, YOF + 53, 10.4, YOF + 50, 10.5, YOF + 42);
      ctx.lineTo(10.5, YOF + 26);
      ctx.bezierCurveTo(10, YOF + 22, 4.5, YOF + 19, 4.2, YOF + 16);
      ctx.lineTo(4.5, YOF + 8);
      ctx.lineTo(3.8, YOF + 6);
      ctx.lineTo(3.5, YOF + 0);
      ctx.closePath();
    }

    // ── glass body fill with gradient ────────────────────────────────────
    const bodyG = ctx.createLinearGradient(-15, YOF + 30, 15, YOF + 30);
    bodyG.addColorStop(0,   glassDk);
    bodyG.addColorStop(0.3, glass);
    bodyG.addColorStop(0.7, glass);
    bodyG.addColorStop(1,   glassDk);
    ctx.fillStyle = bodyG;
    bottlePath();
    ctx.fill();

    // ── rolled letter visible through glass ─────────────────────────────
    // Parchment scroll inside the body
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, YOF + 38, 9, 18, 0, 0, TAU); // clip to body area
    ctx.clip();

    ctx.fillStyle = 'rgba(240,228,196,0.82)';
    ctx.beginPath();
    ctx.ellipse(0, YOF + 38, 5.5, 14, 0, 0, TAU);
    ctx.fill();
    // Slight scroll curl at top
    ctx.fillStyle = 'rgba(220,205,165,0.9)';
    ctx.beginPath();
    ctx.ellipse(0, YOF + 25, 5, 3, 0, 0, TAU);
    ctx.fill();
    // Faint writing lines
    ctx.strokeStyle = 'rgba(140,110,60,0.28)';
    ctx.lineWidth = 0.9;
    for (let i = 0; i < 4; i++) {
      const ly = YOF + 30 + i * 4;
      ctx.beginPath();
      ctx.moveTo(-4, ly); ctx.lineTo(4, ly);
      ctx.stroke();
    }
    ctx.restore();

    // ── glass outline ────────────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(255,255,255,0.38)';
    ctx.lineWidth = 1.2;
    bottlePath();
    ctx.stroke();

    // ── highlight streak on left body ────────────────────────────────────
    const hg = ctx.createLinearGradient(-7, YOF + 22, -7, YOF + 48);
    hg.addColorStop(0, 'rgba(255,255,255,0.28)');
    hg.addColorStop(1, 'rgba(255,255,255,0.04)');
    ctx.fillStyle = hg;
    ctx.save();
    ctx.beginPath();
    bottlePath();
    ctx.clip();
    ctx.beginPath();
    ctx.ellipse(-6, YOF + 36, 2.5, 11, -0.15, 0, TAU);
    ctx.fillStyle = hg;
    ctx.fill();
    ctx.restore();

    // ── cork ─────────────────────────────────────────────────────────────
    const corkG = ctx.createLinearGradient(-3.5, YOF, 3.5, YOF + 6);
    corkG.addColorStop(0, '#c49040');
    corkG.addColorStop(0.5, '#d9a855');
    corkG.addColorStop(1, '#a87830');
    ctx.fillStyle = corkG;
    ctx.beginPath();
    ctx.roundRect(-3.5, YOF, 7, 6, 1.2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,55,10,0.4)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // Cork grain lines
    ctx.strokeStyle = 'rgba(160,100,30,0.35)';
    ctx.lineWidth = 0.6;
    for (let i = 1; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(-3, YOF + i * 2); ctx.lineTo(3, YOF + i * 2);
      ctx.stroke();
    }
  }

  function drawBottle(b, time) {
    const LAUNCH_DURATION = 4500; // 4.5s drift out to sea
    const WT = wTop(), WB = wBot();

    let depth, alpha;

    if (b.launchTime >= 0) {
      const elapsed = time - b.launchTime;
      if (elapsed < LAUNCH_DURATION) {
        // ease-in: starts slow near shore, accelerates as wind catches it
        const progress = Math.pow(elapsed / LAUNCH_DURATION, 0.7);
        depth = lerp(0.01, b.fy, progress);
        alpha = clamp(elapsed / 300, 0, 1);
      } else {
        b.launchTime = -1;
        depth = b.fy;
        alpha = 1;
      }
    } else {
      depth = b.fy;
      alpha = 1;
    }

    const fx = ((b.fx + b.drift * time * 0.0001) % 1 + 1) % 1;
    const sc = pScale(depth) * b.scale;

    // Bobbing: y oscillation + rocking, both shrink with distance
    const bobAmp   = lerp(5.5, 0.4, depth);
    const rockAmp  = lerp(0.20, 0.015, depth);
    const bobY     = Math.sin(time * 0.0016 + b.bob) * bobAmp
                   + Math.sin(time * 0.0027 + b.bob * 1.6) * bobAmp * 0.35;
    const rock     = Math.sin(time * 0.0011 + b.bob * 1.3) * rockAmp;

    const bx = pX(fx, depth);
    const by = pY(depth) + bobY;

    ctx.save();
    ctx.globalAlpha = alpha;

    // ── wake ripples (drawn before scaling so they stay world-sized) ────────
    if (sc > 0.15) {
      const wakeR    = sc * 28;
      const wakeAlpha = clamp((sc - 0.15) / 0.4, 0, 1) * 0.38;
      ctx.save();
      ctx.translate(bx, by);
      for (let i = 0; i < 3; i++) {
        const t = ((time * 0.00042 + b.bob * 0.18 + i * 0.333) % 1);
        const rr = wakeR * lerp(0.3, 1.0, t);
        const ra = (1 - t) * wakeAlpha;
        ctx.strokeStyle = `rgba(255,255,255,${ra})`;
        ctx.lineWidth = lerp(1.4, 0.3, t);
        ctx.beginPath();
        // foreshortened ellipse: wide in x, narrow in y (perspective)
        ctx.ellipse(0, 0, rr, rr * 0.28, 0, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }

    // ── bottle ────────────────────────────────────────────────────────────
    ctx.translate(bx, by);
    ctx.scale(sc, sc);
    ctx.rotate(b.bob * 0.55 + rock);
    paintBottleShape(b);

    // Distant glint — tiny bright spark so you can still spot it far away
    if (sc < 0.35) {
      const glintA = clamp((0.35 - sc) / 0.25, 0, 1) * 0.9;
      ctx.fillStyle = `rgba(255,255,255,${glintA})`;
      ctx.beginPath();
      ctx.arc(0, -12, 1.4 / sc, 0, TAU);
      ctx.fill();
    }

    ctx.restore();
  }

  // ── frame loop ───────────────────────────────────────────────────────────

  function bottleAt(mx, my) {
    for (let i = bottles.length - 1; i >= 0; i--) {
      const b = bottles[i];
      if (b.launchTime >= 0) continue;
      const fx = ((b.fx + b.drift * lastTime * 0.0001) % 1 + 1) % 1;
      const bx = pX(fx, b.fy);
      const by = pY(b.fy);
      const hitR = pScale(b.fy) * b.scale * 36;
      if ((mx - bx) ** 2 + (my - by) ** 2 < hitR ** 2) return i;
    }
    return -1;
  }

  function frame(now) {
    const time = now - t0;
    lastTime = time;
    const sky = skyState(clockDate());
    drawSky(sky);
    drawWater(sky, time);
    drawDeepLife(sky, time);
    if (whale) drawWhale(sky, time);
    drawFish(sky, time);
    for (const b of bottles) drawBottle(b, time);
    raf = requestAnimationFrame(frame);
  }

  function toCanvasXY(e) {
    const rect = canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  function onClick(e) {
    const [mx, my] = toCanvasXY(e);
    const idx = bottleAt(mx, my);
    if (idx >= 0) onBottleClick?.(idx, letters[idx]);
  }

  function onMouseMove(e) {
    const [mx, my] = toCanvasXY(e);
    canvas.style.cursor = bottleAt(mx, my) >= 0 ? 'pointer' : '';
  }

  const onResize = () => resize();
  resize();
  window.addEventListener('resize', onResize);
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('mousemove', onMouseMove);
  raf = requestAnimationFrame(frame);

  return {
    setData,
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('mousemove', onMouseMove);
    },
  };
}
