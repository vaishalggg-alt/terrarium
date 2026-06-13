// Canvas world engine for the Desert biome — an oasis hydration tracker.
//
//   • The pool rises with today's water intake (litres).
//   • Animals arrive at each litre milestone and walk to the pool to drink:
//       2L → fennec fox       3L → rattlesnake
//       4L → coyote           5L → burrowing owl
//       6L → dromedary camel  (goal met)

import { clockDate } from './clock.js';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const blend = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rgb = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const ease = (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

// ── approach helpers — one-way walk-in, animals stay at pool forever ─────────
const WALK_MS = 5000; // how long the walk-in takes

// Each animal starts walking after its own delay, then stays at ap=1.
function approachT(time, delayMs) {
  const elapsed = time - delayMs;
  if (elapsed <= 0) return 0;
  if (elapsed < WALK_MS) return ease(elapsed / WALK_MS);
  return 1;
}

function walkFrac(time, delayMs) {
  const elapsed = time - delayMs;
  return (elapsed > 0 && elapsed < WALK_MS) ? 1 : 0;
}

function rng(seed) {
  let s = seed * 9301 + 49297;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

function skyState(date) {
  const h = date.getHours() + date.getMinutes() / 60;
  let day;
  if (h < 5 || h >= 21) day = 0;
  else if (h < 7) day = (h - 5) / 2;
  else if (h < 18) day = 1;
  else if (h < 21) day = 1 - (h - 18) / 3;
  else day = 0;
  const night = { top: [20, 22, 52], bot: [58, 50, 78] };
  const dusk  = { top: [80, 56, 104], bot: [244, 150, 96] };
  const noon  = { top: [108, 170, 224], bot: [240, 224, 184] };
  const base = day < 0.5
    ? { top: blend(night.top, dusk.top, day / 0.5), bot: blend(night.bot, dusk.bot, day / 0.5) }
    : { top: blend(dusk.top, noon.top, (day - 0.5) / 0.5), bot: blend(dusk.bot, noon.bot, (day - 0.5) / 0.5) };
  return { day, top: base.top, bot: base.bot, isNight: day < 0.12 };
}

export function createDesert(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
  let fill = 0, litres = 0;
  let animals = { fox: false, snake: false, coyote: false, owl: false, camel: false };
  let birds = [];
  let raf = 0;
  let t0 = performance.now();

  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = rect.width; H = rect.height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rebuildBirds();
  }

  function rebuildBirds() {
    const n = fill >= 0.6 ? 5 : fill >= 0.3 ? 2 : 0;
    birds = Array.from({ length: n }, () => {
      const r = Math.random;
      return { phase: r() * TAU, sp: 0.3 + r() * 0.4, cx: W * (0.3 + r() * 0.4), cy: H * (0.18 + r() * 0.14), rx: 60 + r() * 80, ry: 18 + r() * 16, flap: r() * TAU };
    });
  }

  let firstSet = true;
  function setData({ fill: f, litres: l, animals: a }) {
    const rebuild = (f >= 0.6) !== (fill >= 0.6) || (f >= 0.3) !== (fill >= 0.3);
    fill = f; litres = l || 0;
    animals = a || { fox: false, snake: false, coyote: false, owl: false, camel: false };
    // On the very first setData call, if animals are already present wind the
    // clock forward so they appear at the pool immediately (no walk-in replay).
    if (firstSet) {
      firstSet = false;
      const maxDelay = 14000 + WALK_MS; // camel delay + walk duration
      t0 = performance.now() - maxDelay;
    }
    if (rebuild) rebuildBirds();
  }

  // ── sky ──────────────────────────────────────────────────────────────────

  function drawSky(sky) {
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.7);
    g.addColorStop(0, rgb(sky.top));
    g.addColorStop(1, rgb(sky.bot));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (sky.isNight || sky.day < 0.35) {
      const a = clamp((0.35 - sky.day) / 0.35, 0, 1);
      ctx.fillStyle = `rgba(255,255,255,${0.7 * a})`;
      for (let i = 0; i < 60; i++) ctx.fillRect((i * 137.5) % W, (i * 81.3) % (H * 0.55), 1.4, 1.4);
      ctx.fillStyle = `rgba(240,240,220,${a})`;
      ctx.beginPath(); ctx.arc(W * 0.74, H * 0.2, 24, 0, TAU); ctx.fill();
      ctx.fillStyle = rgb(sky.top);
      ctx.beginPath(); ctx.arc(W * 0.79, H * 0.17, 22, 0, TAU); ctx.fill();
    } else {
      const a = clamp(sky.day, 0, 1);
      const sun = ctx.createRadialGradient(W * 0.74, H * 0.22, 10, W * 0.74, H * 0.22, 150);
      sun.addColorStop(0, `rgba(255,244,210,${a})`); sun.addColorStop(1, 'rgba(255,244,210,0)');
      ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = `rgba(255,250,225,${0.9 * a})`;
      ctx.beginPath(); ctx.arc(W * 0.74, H * 0.22, 28, 0, TAU); ctx.fill();
    }
  }

  // ── mountains ────────────────────────────────────────────────────────────

  function drawMountains(sky) {
    const d = 0.4 + sky.day * 0.6;
    // Far mountains — cool purple-brown haze
    ctx.fillStyle = rgb([168, 140, 118].map((c) => c * d * 0.82));
    ctx.beginPath(); ctx.moveTo(0, H * 0.58); ctx.lineTo(0, H * 0.42);
    const mpts = [0.06,0.14,0.22,0.30,0.38,0.46,0.54,0.62,0.70,0.78,0.86,0.94,1.0];
    const mh   = [0.44,0.36,0.40,0.33,0.38,0.35,0.32,0.39,0.34,0.41,0.37,0.42,0.44];
    mpts.forEach((x, i) => ctx.lineTo(W * x, H * mh[i]));
    ctx.lineTo(W, H * 0.58); ctx.closePath(); ctx.fill();
    // Nearer rocky ridge — warmer tone
    ctx.fillStyle = rgb([192, 158, 118].map((c) => c * d * 0.88));
    ctx.beginPath(); ctx.moveTo(0, H * 0.62); ctx.lineTo(0, H * 0.50);
    const rpts = [0.08,0.18,0.28,0.38,0.50,0.62,0.72,0.82,0.92,1.0];
    const rh   = [0.52,0.46,0.50,0.47,0.44,0.49,0.47,0.52,0.48,0.52];
    rpts.forEach((x, i) => ctx.lineTo(W * x, H * rh[i]));
    ctx.lineTo(W, H * 0.62); ctx.closePath(); ctx.fill();
  }

  // ── dunes ────────────────────────────────────────────────────────────────

  function drawDunes(sky, time) {
    const d = 0.4 + sky.day * 0.6;
    drawMountains(sky);
    const layers = [
      { y: H * 0.52, amp: 22, col: [228, 198, 152] },
      { y: H * 0.63, amp: 30, col: [218, 182, 130] },
      { y: H * 0.74, amp: 26, col: [205, 168, 112] },
    ];
    layers.forEach((L, i) => {
      ctx.fillStyle = rgb(L.col.map((c) => c * d));
      ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(0, L.y);
      for (let x = 0; x <= W; x += 12)
        ctx.lineTo(x, L.y + Math.sin(x * 0.006 + i * 1.7) * L.amp + Math.sin(x * 0.02 + i) * 5);
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    });
    return H * 0.78;
  }

  // ── oasis pool ───────────────────────────────────────────────────────────

  function poolPath(cx, cy, r, ry) {
    // Slightly irregular, organic pool shape using many bezier-smoothed points
    ctx.beginPath();
    const pts = 24;
    for (let i = 0; i <= pts; i++) {
      const a = (i / pts) * TAU;
      // Gentle wobble for natural shoreline
      const wobble = 1 + 0.07 * Math.sin(a * 3 + 0.4) + 0.04 * Math.sin(a * 7);
      const px = cx + Math.cos(a) * r * wobble;
      const py = cy + Math.sin(a) * ry * wobble;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function drawOasis(groundY, sky, time) {
    const cx = W * 0.5, cy = groundY + 16;
    // Much larger pool — dominant feature of the scene
    const maxR = Math.min(W * 0.40, 300);
    const r  = maxR * (0.28 + fill * 0.72);
    const ry = r * 0.44;
    const d  = 0.4 + sky.day * 0.6;

    // Sandy beach margin around pool
    ctx.fillStyle = rgb([215, 188, 148].map((c) => c * d));
    poolPath(cx, cy, r + 22, ry + 12);
    ctx.fill();

    if (fill <= 0.02) return { cx, cy, r, ry };

    // Water fill — vivid turquoise like reference
    const wg = ctx.createLinearGradient(0, cy - ry, 0, cy + ry);
    wg.addColorStop(0,   `rgb(${(80 * d) | 0},${(210 * d) | 0},${(228 * d) | 0})`);
    wg.addColorStop(0.5, `rgb(${(48 * d) | 0},${(172 * d) | 0},${(205 * d) | 0})`);
    wg.addColorStop(1,   `rgb(${(28 * d) | 0},${(118 * d) | 0},${(165 * d) | 0})`);
    ctx.fillStyle = wg;
    poolPath(cx, cy, r, ry);
    ctx.fill();

    // Palm trunk reflections inside water
    ctx.save();
    poolPath(cx, cy, r, ry);
    ctx.clip();
    const pr = rng(5);
    const palmCount = 2 + Math.floor(fill * 6);
    for (let i = 0; i < palmCount; i++) {
      const side = i % 2 ? 1 : -1;
      const px = cx + side * (r * 0.35 + pr() * r * 0.5);
      const refH = 30 + pr() * 55;
      const g = ctx.createLinearGradient(px, cy, px, cy + refH * 0.7);
      g.addColorStop(0, `rgba(30,90,60,${0.28 * d})`);
      g.addColorStop(1, `rgba(30,90,60,0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(px - 2.5, cy);
      ctx.quadraticCurveTo(px - 1, cy + refH * 0.5, px + (pr() - 0.5) * 6, cy + refH * 0.7);
      ctx.quadraticCurveTo(px + 1, cy + refH * 0.5, px + 2.5, cy);
      ctx.fill();
    }
    // Sky shimmer ripples
    ctx.strokeStyle = `rgba(255,255,255,${0.14 * d})`; ctx.lineWidth = 1.1;
    for (let i = 0; i < 5; i++) {
      const yy = cy - ry * 0.6 + i * (ry * 1.2 / 4);
      ctx.beginPath();
      for (let x = cx - r; x <= cx + r; x += 7) {
        const off = Math.sin(x * 0.07 + time * 0.003 + i * 0.8) * 2.5;
        x === cx - r ? ctx.moveTo(x, yy + off) : ctx.lineTo(x, yy + off);
      }
      ctx.stroke();
    }
    ctx.restore();
    return { cx, cy, r, ry };
  }

  // ── vegetation ───────────────────────────────────────────────────────────

  // Improved palm: thicker trunk with ring marks, denser fronds
  function drawPalm(x, baseY, hgt, sky, sway) {
    const d = 0.4 + sky.day * 0.6;
    const tw = Math.max(4, hgt * 0.055);
    const tx = x + sway * hgt * 0.14, ty = baseY - hgt;
    // Trunk
    ctx.strokeStyle = rgb([118, 82, 46].map((c) => c * d));
    ctx.lineWidth = tw; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, baseY);
    ctx.quadraticCurveTo(x + sway * hgt * 0.05, baseY - hgt * 0.5, tx, ty); ctx.stroke();
    // Trunk ring marks
    ctx.strokeStyle = rgb([92, 62, 32].map((c) => c * d));
    ctx.lineWidth = 0.8;
    for (let i = 1; i < 7; i++) {
      const t = i / 7;
      const rx = lerp(x, tx, t), ry2 = lerp(baseY, ty, t);
      ctx.beginPath(); ctx.moveTo(rx - tw * 0.6, ry2); ctx.lineTo(rx + tw * 0.6, ry2); ctx.stroke();
    }
    // Fronds — 9 longer, drooping
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (i - 4) * 0.42 + sway * 0.12;
      const len = hgt * (0.45 + Math.abs(Math.cos(a)) * 0.08);
      const droop = hgt * 0.12;
      const frondCol = i === 4 ? [55, 135, 58] : (i < 2 || i > 6 ? [42, 108, 45] : [62, 148, 55]);
      ctx.strokeStyle = rgb(frondCol.map((c) => c * d));
      ctx.lineWidth = Math.max(1.8, tw * 0.38);
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(tx, ty);
      ctx.quadraticCurveTo(
        tx + Math.cos(a) * len * 0.5, ty + Math.sin(a) * len * 0.5 + droop * 0.4,
        tx + Math.cos(a) * len, ty + Math.sin(a) * len + droop
      ); ctx.stroke();
    }
  }

  // Rounded desert shrub / bush
  function drawShrub(x, y, size, sky) {
    const d = 0.4 + sky.day * 0.6;
    const cols = [[78, 125, 58], [68, 112, 50], [90, 138, 62]];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const col = cols[i % cols.length];
      ctx.fillStyle = rgb(col.map((c) => c * d));
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * size * 0.48, y + Math.sin(a) * size * 0.28, size * 0.42, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = rgb([88, 138, 65].map((c) => c * d));
    ctx.beginPath(); ctx.arc(x, y - size * 0.1, size * 0.42, 0, TAU); ctx.fill();
  }

  // Desert flowers (like second reference image — warm pink/red)
  function drawFlowers(x, y, sky, seed) {
    const d = 0.4 + sky.day * 0.6;
    const fr = rng(seed);
    // Stems
    ctx.strokeStyle = rgb([72, 108, 52].map((c) => c * d));
    ctx.lineWidth = 1.1; ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const sx = x + (fr() - 0.5) * 20;
      const sh = 14 + fr() * 18;
      ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(sx + (fr() - 0.5) * 6, y - sh); ctx.stroke();
      // Flower head
      ctx.fillStyle = fr() > 0.5
        ? rgb([210, 85, 75].map((c) => c * d))   // red
        : rgb([195, 105, 155].map((c) => c * d)); // pink
      ctx.beginPath(); ctx.arc(sx + (fr() - 0.5) * 4, y - sh, 3 + fr() * 3, 0, TAU); ctx.fill();
    }
    // Base leaves
    ctx.strokeStyle = rgb([78, 120, 55].map((c) => c * d));
    ctx.lineWidth = 1.8;
    for (let i = 0; i < 4; i++) {
      const a = -Math.PI * 0.6 + i * 0.4;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 10, y + Math.sin(a) * 6); ctx.stroke();
    }
  }

  // Reeds / water grasses at pool edge
  function drawReeds(x, baseY, sky, seed, time) {
    const d = 0.4 + sky.day * 0.6;
    const rr = rng(seed);
    ctx.strokeStyle = rgb([95, 148, 68].map((c) => c * d));
    ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const rx = x + (rr() - 0.5) * 14;
      const rh = 16 + rr() * 20;
      const sw = Math.sin(time * 0.001 + rx * 0.1) * 2;
      ctx.lineWidth = 1.2 + rr() * 0.8;
      ctx.beginPath(); ctx.moveTo(rx, baseY); ctx.lineTo(rx + sw, baseY - rh); ctx.stroke();
      // Seed head
      ctx.fillStyle = rgb([168, 128, 62].map((c) => c * d));
      ctx.beginPath(); ctx.ellipse(rx + sw, baseY - rh, 1.8, 4, 0.1, 0, TAU); ctx.fill();
    }
  }

  // Palms and shrubs placed BEFORE the pool so the water naturally overlaps
  // their bases — like a real oasis where trees grow right at the water's edge.
  function drawBackgroundVegetation(groundY, sky, time) {
    const sway = Math.sin(time * 0.0009) * 0.55;
    // Mirror the pool geometry so we can keep vegetation just outside it
    const cx = W * 0.5;
    const maxR = Math.min(W * 0.40, 300);
    const r = maxR * (0.28 + fill * 0.72);

    // Shrubs on both sides of pool
    const sbr = rng(42);
    for (let i = 0; i < 10; i++) {
      const side = i % 2 ? 1 : -1;
      const dist = r + 10 + sbr() * Math.min(W * 0.24, 170);
      const sx = cx + side * dist;
      const sy = groundY + 6 + sbr() * 14;
      if (sx > 5 && sx < W - 5) drawShrub(sx, sy, 16 + sbr() * 18, sky);
    }

    // Palm trees on left and right, spreading outward from pool edge
    const palmCount = 3 + Math.floor(fill * 9);
    const pr = rng(5);
    for (let i = 0; i < palmCount; i++) {
      const side = i % 2 ? 1 : -1;
      const dist = r + 14 + pr() * Math.min(W * 0.22, 155);
      const px = cx + side * dist;
      const py = groundY + 4 + pr() * 10;
      const hgt = 65 + pr() * 95;
      const lean = (pr() - 0.5) * 0.35 + side * 0.15;
      if (px > -20 && px < W + 20) drawPalm(px, py, hgt, sky, sway * lean);
    }
  }

  function drawLife(pool, groundY, sky, time) {
    const { cx, cy, r, ry } = pool;

    // ── reeds at pool edge ─────────────────────────────────────────────────
    const reedCount = 6 + Math.floor(litres * 1.5);
    const rr2 = rng(88);
    for (let i = 0; i < Math.min(reedCount, 16); i++) {
      const a = (i / 16) * TAU;
      const ex = cx + Math.cos(a) * (r + 4 + rr2() * 10);
      const ey = cy + Math.sin(a) * (ry + 4 + rr2() * 6);
      if (ex > 0 && ex < W) drawReeds(ex, ey, sky, 88 + i, time);
    }

    // ── foreground shrubs on sand banks (strictly outside pool) ───────────
    const fgr = rng(77);
    const fgCount = 4 + Math.floor(litres * 1.2);
    for (let i = 0; i < Math.min(fgCount, 14); i++) {
      const side = i % 2 ? 1 : -1;
      const dist = r + 18 + fgr() * 55;
      const sx = cx + side * dist;
      const sy = groundY + 8 + fgr() * 14;
      if (sx > 8 && sx < W - 8) drawShrub(sx, sy, 10 + fgr() * 16, sky);
    }

    // ── desert flowers strictly outside pool ──────────────────────────────
    if (litres >= 1) {
      const flr = rng(55);
      const flCount = Math.floor(litres * 1.8);
      for (let i = 0; i < Math.min(flCount, 10); i++) {
        const side = i % 2 ? 1 : -1;
        const fx = cx + side * (r + 15 + flr() * 40);
        const fy = groundY + 6 + flr() * 18;
        if (fx > 10 && fx < W - 10) drawFlowers(fx, fy, sky, 55 + i * 7, time);
      }
    }
  }

  function drawBirds(sky, time) {
    const d = 0.5 + sky.day * 0.5;
    ctx.strokeStyle = `rgba(${40 * d},${40 * d},${50 * d},0.7)`;
    ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    for (const b of birds) {
      b.phase += 0.005 * b.sp; b.flap += 0.2;
      const x = b.cx + Math.cos(b.phase) * b.rx;
      const y = b.cy + Math.sin(b.phase) * b.ry;
      const w = 5 + Math.abs(Math.sin(b.flap)) * 4;
      ctx.beginPath();
      ctx.moveTo(x - w, y + 3); ctx.quadraticCurveTo(x, y - 3, x, y);
      ctx.quadraticCurveTo(x, y - 3, x + w, y + 3); ctx.stroke();
    }
  }

  // ── animal drawing helpers ───────────────────────────────────────────────
  // legSwing(time, walking): returns [fr, fl, br, bl] leg foot offsets (x-axis)
  // Uses diagonal gait (trot): front-right + back-left swing together
  function legSwing(time, walking) {
    if (!walking) return [0, 0, 0, 0];
    const s = Math.sin(time * 0.018) * 10;
    return [s, -s, -s, s]; // [front-right, front-left, back-right, back-left]
  }

  // ── animals ──────────────────────────────────────────────────────────────

  // 2L — Fennec fox. Walks in from the right to the pool edge.
  // Cycle offset 0.3 × CYCLE_MS → already near pool at start
  function drawFox(pool, groundY, sky, time) {
    const d = 0.4 + sky.day * 0.6;
    const { cx, cy, r, ry } = pool;
    const sc = Math.min(1, W / 480);

    const ap = approachT(time, 2000);
    const walking = walkFrac(time, 2000);
    const drinkX = cx + r * 0.5;
    const drinkY = cy - ry - 15;
    const restX  = W + 30;
    const restY  = cy - ry - 15;
    const bx = lerp(restX, drinkX, ap);
    const by = lerp(restY, drinkY, ap);

    const drinkT = ap === 1 ? 1 : 0;
    const [fr, fl, br, bl] = legSwing(time, walking);

    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(1.3 * sc, 1.3 * sc);

    // Colors matching real fennec: pale sandy body, cream belly/face, pink ear inner
    const sand   = rgb([222, 192, 138].map((c) => c * d)); // main sandy coat
    const light  = rgb([244, 232, 208].map((c) => c * d)); // cream belly + face
    const dorsal = rgb([188, 154, 92].map((c) => c * d));  // darker back stripe
    const earIn  = `rgba(${(212 * d) | 0},${(145 * d) | 0},${(138 * d) | 0},0.9)`;
    const dark   = rgb([28, 16, 6].map((c) => c * d));

    // ── tail: thick, fluffy, curled upward, cream tip ──────────────────────
    ctx.strokeStyle = sand; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(8, -2);
    ctx.bezierCurveTo(18, -2, 26, -12, 24, -20);
    ctx.bezierCurveTo(22, -26, 14, -24, 12, -18);
    ctx.stroke();
    // tip
    ctx.strokeStyle = light; ctx.lineWidth = 4.5;
    ctx.beginPath(); ctx.moveTo(14, -22); ctx.bezierCurveTo(13, -26, 10, -28, 9, -26); ctx.stroke();
    ctx.fillStyle = dark; // black tip
    ctx.beginPath(); ctx.arc(9.5, -27, 2.2, 0, TAU); ctx.fill();

    // ── body: round fluffy oval ─────────────────────────────────────────────
    ctx.fillStyle = sand;
    ctx.beginPath(); ctx.ellipse(-1, -6, 14, 9, -0.08, 0, TAU); ctx.fill();
    // darker dorsal stripe on top of body
    ctx.fillStyle = dorsal;
    ctx.beginPath(); ctx.ellipse(-1, -11, 10, 4.5, -0.08, 0, TAU); ctx.fill();
    // cream belly patch
    ctx.fillStyle = light;
    ctx.beginPath(); ctx.ellipse(-2, -3, 9, 5.5, -0.05, 0, TAU); ctx.fill();

    // ── legs: short stubs (fennec fox legs barely show) ──────────────────
    const crouch = drinkT * 3;
    ctx.strokeStyle = sand; ctx.lineWidth = 3.2; ctx.lineCap = 'round';
    [[-7, 2, -7 + fl, 8 - crouch], [-2, 2, -2 + fr, 8 - crouch],
     [4, 1, 4 + br, 7], [8, 1, 8 + bl, 7]].forEach(([hpx, hpy, fx, fy]) => {
      ctx.beginPath(); ctx.moveTo(hpx, hpy); ctx.lineTo(fx, fy); ctx.stroke();
    });
    // tiny paws
    ctx.fillStyle = light;
    [[-7 + fl, 8 - crouch], [-2 + fr, 8 - crouch], [4 + br, 7], [8 + bl, 7]].forEach(([px, py]) => {
      ctx.beginPath(); ctx.ellipse(px, py, 2.5, 1.5, 0, 0, TAU); ctx.fill();
    });

    // ── head: large round cranium ──────────────────────────────────────────
    const hx = -14 - drinkT * 3;
    const hy = -16 + drinkT * 10;

    // neck connection
    ctx.fillStyle = sand;
    ctx.beginPath();
    ctx.moveTo(-8, -10); ctx.quadraticCurveTo(hx + 8, hy + 6, hx + 6, hy + 2);
    ctx.quadraticCurveTo(hx + 10, hy + 4, -6, -8); ctx.fill();

    // cranium
    ctx.fillStyle = sand;
    ctx.beginPath(); ctx.arc(hx, hy, 9, 0, TAU); ctx.fill();
    // forehead slightly darker
    ctx.fillStyle = dorsal;
    ctx.beginPath(); ctx.ellipse(hx, hy - 4, 6, 4, 0, 0, TAU); ctx.fill();

    // ── EARS: giant bat-like curved ears (the defining feature) ────────────
    // Right ear (drawn first — slightly behind left)
    ctx.fillStyle = sand;
    ctx.beginPath();
    ctx.moveTo(hx + 2, hy - 7);
    ctx.bezierCurveTo(hx + 8, hy - 16, hx + 12, hy - 32, hx + 7, hy - 38);
    ctx.bezierCurveTo(hx + 3, hy - 43, hx - 3, hy - 38, hx - 3, hy - 28);
    ctx.bezierCurveTo(hx - 2, hy - 17, hx - 1, hy - 8, hx, hy - 7);
    ctx.closePath(); ctx.fill();
    // Right ear inner
    ctx.fillStyle = earIn;
    ctx.beginPath();
    ctx.moveTo(hx + 2, hy - 10);
    ctx.bezierCurveTo(hx + 6, hy - 17, hx + 9, hy - 30, hx + 5, hy - 35);
    ctx.bezierCurveTo(hx + 2, hy - 39, hx - 1, hy - 35, hx - 1, hy - 27);
    ctx.bezierCurveTo(hx - 1, hy - 18, hx, hy - 10, hx + 1, hy - 10);
    ctx.closePath(); ctx.fill();

    // Left ear (in front, angles left)
    ctx.fillStyle = sand;
    ctx.beginPath();
    ctx.moveTo(hx - 4, hy - 7);
    ctx.bezierCurveTo(hx - 12, hy - 16, hx - 16, hy - 31, hx - 11, hy - 38);
    ctx.bezierCurveTo(hx - 7, hy - 44, hx + 1, hy - 40, hx + 2, hy - 30);
    ctx.bezierCurveTo(hx + 3, hy - 18, hx + 2, hy - 8, hx + 2, hy - 7);
    ctx.closePath(); ctx.fill();
    // Left ear inner pink
    ctx.fillStyle = earIn;
    ctx.beginPath();
    ctx.moveTo(hx - 3, hy - 10);
    ctx.bezierCurveTo(hx - 9, hy - 18, hx - 12, hy - 30, hx - 8, hy - 36);
    ctx.bezierCurveTo(hx - 5, hy - 41, hx, hy - 37, hx, hy - 28);
    ctx.bezierCurveTo(hx + 1, hy - 19, hx + 1, hy - 10, hx, hy - 10);
    ctx.closePath(); ctx.fill();

    // ── muzzle: slightly pointed, cream ────────────────────────────────────
    ctx.fillStyle = light;
    ctx.beginPath(); ctx.ellipse(hx - 7, hy + 1.5, 6, 4, -0.1, 0, TAU); ctx.fill();
    // darker muzzle top band
    ctx.fillStyle = dorsal;
    ctx.beginPath(); ctx.ellipse(hx - 5, hy - 0.5, 4.5, 2, -0.1, 0, TAU); ctx.fill();
    ctx.fillStyle = light;
    ctx.beginPath(); ctx.ellipse(hx - 5.5, hy + 0.2, 3, 1.5, -0.1, 0, TAU); ctx.fill();

    // nose: small dark oval button
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(hx - 12, hy + 1, 1.8, 1.4, 0.1, 0, TAU); ctx.fill();

    // ── eye: large, dark amber-brown with prominent shine ──────────────────
    ctx.fillStyle = rgb([35, 20, 8].map((c) => c * d));
    ctx.beginPath(); ctx.ellipse(hx - 2, hy - 3, 3.2, 2.8, 0.1, 0, TAU); ctx.fill();
    // subtle iris ring
    ctx.strokeStyle = rgb([80, 50, 15].map((c) => c * d)); ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.ellipse(hx - 2, hy - 3, 3.2, 2.8, 0.1, 0, TAU); ctx.stroke();
    // main shine dot
    ctx.fillStyle = `rgba(255,255,255,${0.88 * d})`;
    ctx.beginPath(); ctx.arc(hx - 0.6, hy - 4.5, 1.1, 0, TAU); ctx.fill();
    // secondary smaller shine
    ctx.fillStyle = `rgba(255,255,255,${0.45 * d})`;
    ctx.beginPath(); ctx.arc(hx - 3.8, hy - 1.8, 0.6, 0, TAU); ctx.fill();

    // eyelid crease (subtle)
    ctx.strokeStyle = dorsal; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.arc(hx - 2, hy - 3, 3.2, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();

    ctx.restore();
  }

  // 3L — Rattlesnake. Arrives coiled at left pool edge and stays — snakes
  // don't walk. Head raises and lowers toward the water with tongue flick.
  function drawSnake(pool, groundY, sky, time) {
    const d = 0.4 + sky.day * 0.6;
    const { cx, cy, r, ry } = pool;
    const sc = Math.min(1, W / 480);

    const ap = approachT(time, 5000);
    const drinkX = cx - r * 0.5;
    const drinkY = cy - ry - 15;
    const restX  = -80;
    const restY  = cy - ry - 15;
    const bx = lerp(restX, drinkX, ap);
    const by = lerp(restY, drinkY, ap);

    // Head bobs gently toward water
    const headSway = Math.sin(time * 0.0008) * 0.15;
    const headBob  = (Math.sin(time * 0.0005) * 0.5 + 0.5) * 4; // 0..4 px toward water

    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(1.25 * sc, 1.25 * sc);

    const bodyTan  = rgb([188, 155, 90].map((c) => c * d));
    const bodyDark = rgb([95, 68, 30].map((c) => c * d));
    const belly    = rgb([222, 200, 148].map((c) => c * d));
    const headCol  = rgb([160, 125, 65].map((c) => c * d));

    const coilDraw = (sw, col, arcs) => {
      ctx.strokeStyle = col; ctx.lineWidth = sw; ctx.lineCap = 'butt';
      arcs.forEach(([rad, a0, a1]) => {
        ctx.beginPath(); ctx.arc(0, 0, rad, a0, a1); ctx.stroke();
      });
    };

    // Outer coil back
    coilDraw(11, bodyDark, [[17, Math.PI * 0.05, Math.PI * 1.05]]);
    coilDraw(8.5, bodyTan,  [[17, Math.PI * 0.07, Math.PI * 1.03]]);
    coilDraw(3.5, belly,    [[17, Math.PI * 0.35, Math.PI * 0.82]]);
    // Inner coil
    coilDraw(10, bodyDark, [[9.5, Math.PI * 0.5,  Math.PI * 2.4]]);
    coilDraw(7.5, bodyTan,  [[9.5, Math.PI * 0.52, Math.PI * 2.38]]);
    coilDraw(3, belly,      [[9.5, Math.PI * 0.55, Math.PI * 1.6]]);
    // Outer coil front
    coilDraw(11, bodyDark, [[17, Math.PI * 1.05, Math.PI * 2.0]]);
    coilDraw(8.5, bodyTan,  [[17, Math.PI * 1.07, Math.PI * 1.98]]);
    coilDraw(3.5, belly,    [[17, Math.PI * 1.1,  Math.PI * 1.7]]);

    // Diamond saddle markings
    ctx.fillStyle = bodyDark;
    for (let i = 0; i < 7; i++) {
      const ang = Math.PI * (0.08 + i * 0.27);
      const px = Math.cos(ang) * 17, py = Math.sin(ang) * 17;
      ctx.save(); ctx.translate(px, py); ctx.rotate(ang + Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, -4.5); ctx.lineTo(3.5, 0); ctx.lineTo(0, 4.5); ctx.lineTo(-3.5, 0);
      ctx.closePath(); ctx.fill(); ctx.restore();
    }

    // Rattle
    const rb = { x: Math.cos(Math.PI * 0.05) * 17, y: Math.sin(Math.PI * 0.05) * 17 };
    const rattleCol = rgb([200, 168, 100].map((c) => c * d));
    for (let s = 0; s < 5; s++) {
      ctx.fillStyle = s % 2 ? bodyTan : rattleCol;
      ctx.beginPath();
      ctx.ellipse(rb.x + s * 3.2, rb.y - s * 0.3, 5.5 - s * 0.7, 3.8 - s * 0.5, -0.25, 0, TAU);
      ctx.fill();
    }

    // Neck curves right toward pool (positive x = toward pool)
    const nb = { x: Math.cos(Math.PI * 2.38) * 9.5, y: Math.sin(Math.PI * 2.38) * 9.5 };
    const neckTipX = 20 + headSway * 4 + headBob;
    const neckTipY = -18 + headBob;
    ctx.strokeStyle = bodyDark; ctx.lineWidth = 11; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(nb.x, nb.y);
    ctx.quadraticCurveTo(nb.x + 8, nb.y - 6, neckTipX, neckTipY); ctx.stroke();
    ctx.strokeStyle = bodyTan; ctx.lineWidth = 8.5;
    ctx.beginPath(); ctx.moveTo(nb.x, nb.y);
    ctx.quadraticCurveTo(nb.x + 8, nb.y - 6, neckTipX, neckTipY); ctx.stroke();
    ctx.strokeStyle = belly; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(nb.x, nb.y);
    ctx.quadraticCurveTo(nb.x + 8, nb.y - 6, neckTipX, neckTipY); ctx.stroke();

    // Triangular pit-viper head
    ctx.save(); ctx.translate(neckTipX, neckTipY); ctx.rotate(headSway);
    ctx.fillStyle = bodyDark;
    ctx.beginPath();
    ctx.moveTo(-9, 4); ctx.lineTo(9, 4); ctx.lineTo(12, -1);
    ctx.lineTo(5, -9); ctx.lineTo(-5, -9); ctx.lineTo(-11, -1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = headCol;
    ctx.beginPath();
    ctx.moveTo(-7, 2.5); ctx.lineTo(7, 2.5); ctx.lineTo(10, -1);
    ctx.lineTo(4, -7.5); ctx.lineTo(-4, -7.5); ctx.lineTo(-9, -1); ctx.closePath(); ctx.fill();
    // Heat pit
    ctx.fillStyle = bodyDark;
    ctx.beginPath(); ctx.ellipse(-5, -0.5, 1.8, 1.4, 0.3, 0, TAU); ctx.fill();
    // Amber slit eye
    ctx.fillStyle = `rgba(${(240 * d) | 0},${(155 * d) | 0},0,${d})`;
    ctx.beginPath(); ctx.ellipse(4, -3, 2.8, 2.4, 0.15, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.95)';
    ctx.beginPath(); ctx.ellipse(4, -3, 0.9, 2.4, 0.15, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.arc(5, -4, 0.7, 0, TAU); ctx.fill();
    // Nostril
    ctx.fillStyle = bodyDark;
    ctx.beginPath(); ctx.ellipse(9, 1, 1, 0.7, 0.2, 0, TAU); ctx.fill();
    // Tongue flick
    const flick = Math.sin(time * 0.008);
    if (flick > 0.4) {
      const ta = (flick - 0.4) / 0.6;
      ctx.strokeStyle = `rgba(${(195 * d) | 0},15,15,${ta})`;
      ctx.lineWidth = 1.1; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(10, 2); ctx.lineTo(18, 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(18, 2); ctx.lineTo(22, -2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(18, 2); ctx.lineTo(22, 6); ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
  }

  // 4L — Coyote. Walks in from the far right to drink.
  // Drink spot is cx+r+52 so it doesn't overlap the fox.
  // Cycle offset 0.62 × CYCLE_MS
  function drawCoyote(pool, groundY, sky, time) {
    const d = 0.4 + sky.day * 0.6;
    const { cx, r } = pool;
    const sc = Math.min(1, W / 480);

    const ap = approachT(time, 8000);
    const walking = walkFrac(time, 8000);
    const drinkX = cx + r - 30;
    const drinkY = groundY - 100;
    const bx = lerp(W + 60, drinkX, ap);
    const by = lerp(groundY - 100, drinkY, ap);

    const drinkT = ap === 1 ? 1 : 0;
    const [fr, fl, br, bl] = legSwing(time, walking);

    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(1.4 * sc, 1.4 * sc);

    // Sandy-gray coyote palette
    const fur     = rgb([175, 158, 118].map(c => c * d));
    const gray    = rgb([145, 132, 112].map(c => c * d));
    const darkFur = rgb([ 98,  78,  42].map(c => c * d));
    const cream   = rgb([230, 218, 188].map(c => c * d));
    const dark    = rgb([ 35,  22,   8].map(c => c * d));

    // Coyote faces LEFT. Origin (0,0) = ground at hind feet.
    // Legs are long — body rides higher off ground than the fox.

    const headDip = drinkT * 14;
    const headFwd = drinkT * 6;
    const hx = -23 - headFwd, hy = -30 + headDip;

    // ── TAIL: drooping low, dark tip ─────────────────────────────────────────
    ctx.strokeStyle = fur; ctx.lineWidth = 5.5; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(14, -13);
    ctx.bezierCurveTo(22, -8, 28, 0, 26, 10);
    ctx.stroke();
    ctx.strokeStyle = darkFur; ctx.lineWidth = 4.5;
    ctx.beginPath(); ctx.moveTo(24, 6); ctx.bezierCurveTo(26, 9, 27, 12, 26, 14); ctx.stroke();
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(26, 15, 3, 2, 0.3, 0, TAU); ctx.fill();

    // ── REAR LEGS: two-segment (thigh + shin) ───────────────────────────────
    const drawLeg = (hpx, hpy, sw, col, w) => {
      const kx = hpx + sw * 0.35 + 2, ky = hpy + 5; // knee/hock
      const fx = hpx + sw, fy = 0;                    // foot
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(hpx, hpy); ctx.lineTo(kx, ky); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
    };
    drawLeg(10,  -10, br, darkFur, 3.8);   // rear-back
    drawLeg( 7,  -10, bl, fur,     3.8);   // rear-front

    // ── BODY: lean elongated ellipse ─────────────────────────────────────────
    ctx.fillStyle = fur;
    ctx.beginPath(); ctx.ellipse(0, -16, 15, 7, -0.08, 0, TAU); ctx.fill();
    // gray overlay on back
    ctx.fillStyle = gray;
    ctx.beginPath(); ctx.ellipse(2, -21, 11, 3, -0.08, 0, TAU); ctx.fill();
    // cream belly strip
    ctx.fillStyle = cream;
    ctx.beginPath(); ctx.ellipse(-1, -11, 9, 3.5, -0.05, 0, TAU); ctx.fill();

    // ── FRONT LEGS ──────────────────────────────────────────────────────────
    const lean = drinkT * 5;
    drawLeg(-9,  -11, fr - lean, darkFur, 3.8);
    drawLeg(-12, -11, fl - lean, fur,     3.8);

    // paws
    ctx.fillStyle = cream;
    [[10+br,0],[7+bl,0],[-9+fr-lean,0],[-12+fl-lean,0]].forEach(([px,py]) => {
      ctx.beginPath(); ctx.ellipse(px, py, 3, 1.5, 0, 0, TAU); ctx.fill();
    });

    // ── NECK: slim tapered strip ─────────────────────────────────────────────
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.moveTo(-10, -21);                              // neck top-back at body
    ctx.bezierCurveTo(-13, -25, hx + 9, hy + 10, hx + 6, hy + 3); // back of neck
    ctx.lineTo(hx + 3, hy + 1);
    ctx.bezierCurveTo(hx + 8, hy + 6, -7, -20, -7, -18);  // front of neck
    ctx.closePath(); ctx.fill();

    // ── HEAD: slightly angular, not round ───────────────────────────────────
    ctx.fillStyle = fur;
    ctx.beginPath(); ctx.ellipse(hx, hy, 8, 6.5, -0.2, 0, TAU); ctx.fill();
    ctx.fillStyle = gray;
    ctx.beginPath(); ctx.ellipse(hx + 1, hy - 2.5, 5, 2.8, -0.18, 0, TAU); ctx.fill();

    // ── EARS: tall narrow pointed ────────────────────────────────────────────
    const ear = (ax, ay, tipX, tipY, bx2, by2, inax, inay, intipX, intipY, inbx, inby) => {
      ctx.fillStyle = fur;
      ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(tipX,tipY); ctx.lineTo(bx2,by2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = `rgba(185,120,110,${0.65*d})`;
      ctx.beginPath(); ctx.moveTo(inax,inay); ctx.lineTo(intipX,intipY); ctx.lineTo(inbx,inby); ctx.closePath(); ctx.fill();
    };
    // back ear
    ear(hx+3, hy-4, hx+6, hy-22, hx+11, hy-5,   hx+4, hy-6, hx+6, hy-19, hx+10, hy-6);
    // front ear (taller, slightly forward)
    ear(hx-2, hy-4, hx-4, hy-23, hx+4,  hy-5,   hx-1, hy-6, hx-2, hy-20, hx+3,  hy-6);

    // ── MUZZLE: long narrow wedge ────────────────────────────────────────────
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.moveTo(hx - 2, hy - 1);    // top-base at head
    ctx.lineTo(hx - 21, hy + 2);   // tip of nose
    ctx.lineTo(hx - 2, hy + 5);    // bottom-base at head
    ctx.closePath(); ctx.fill();
    // lighter lower jaw / chin
    ctx.fillStyle = cream;
    ctx.beginPath();
    ctx.moveTo(hx - 3, hy + 2);
    ctx.lineTo(hx - 17, hy + 2.5);
    ctx.lineTo(hx - 3, hy + 5);
    ctx.closePath(); ctx.fill();

    // ── NOSE ─────────────────────────────────────────────────────────────────
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(hx - 20, hy + 2, 2, 1.5, 0.1, 0, TAU); ctx.fill();

    // ── EYE ──────────────────────────────────────────────────────────────────
    ctx.fillStyle = rgb([145, 108, 35].map(c => c * d));
    ctx.beginPath(); ctx.ellipse(hx - 2, hy - 2, 2.3, 2, 0.1, 0, TAU); ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.arc(hx - 2, hy - 2, 1.4, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${0.6 * d})`;
    ctx.beginPath(); ctx.arc(hx - 0.8, hy - 3, 0.65, 0, TAU); ctx.fill();

    ctx.restore();
  }

  // 5L — Burrowing owl. Perched on a rock at W*0.88 (far right), elevated.
  // Occasionally hops toward the pool. Cycle offset 0.78 × CYCLE_MS.
  function drawOwl(pool, groundY, sky, time) {
    const d = 0.4 + sky.day * 0.6;
    const { cx, cy, r, ry } = pool;
    const sc = Math.min(1, W / 480);

    const ap = approachT(time, 11000);
    const drinkX = cx + r * 0.15;
    const drinkY = cy - ry - 15;
    const restX  = cx + r * 0.15;
    const restY  = cy - ry - 15;
    const bx = lerp(restX, drinkX, ap);
    const by = lerp(restY, drinkY, ap);

    const swivel = Math.sin(time * 0.0007) * 0.28;
    const bobT = clamp((Math.sin(time * 0.0012) - 0.6) / 0.4, 0, 1);
    const bob = bobT * 8 * (ap > 0.85 ? 1 : 0.3); // more head-bob when at pool

    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(1.1 * sc, 1.1 * sc);

    const body = rgb([152, 118, 68].map((c) => c * d));
    const dark = rgb([72, 50, 22].map((c) => c * d));
    const face = rgb([202, 175, 125].map((c) => c * d));
    const rock = rgb([125, 100, 75].map((c) => c * d));

    // Rock perch (only drawn when at rest position, fades away when approaching)
    const rockAlpha = 1 - ap;
    if (rockAlpha > 0.05) {
      ctx.globalAlpha = rockAlpha;
      ctx.fillStyle = rock;
      ctx.beginPath(); ctx.ellipse(0, 28, 19, 9, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = rgb([148, 122, 95].map((c) => c * d));
      ctx.beginPath(); ctx.ellipse(-4, 23, 12, 5.5, -0.18, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Body
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, 8, 10, 15, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(235,220,185,${0.55 * d})`;
    ctx.beginPath(); ctx.ellipse(0, 10, 6.5, 10, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 1.2;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(-6, 4 + i * 3.5);
      ctx.quadraticCurveTo(0, 3.5 + i * 3.5, 6, 4 + i * 3.5);
      ctx.stroke();
    }
    ctx.strokeStyle = dark; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    [[-8, 2, -7, 18], [-5, 0, -4.5, 17], [5, 0, 4.5, 17], [8, 2, 7, 18]].forEach(([x1,y1,x2,y2]) => {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    });

    // Head
    ctx.save();
    ctx.translate(0, -7 + bob * 0.4);
    ctx.rotate(swivel);
    ctx.fillStyle = face;
    ctx.beginPath(); ctx.ellipse(0, 0, 9, 10.5, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(0, 0, 9, 10.5, 0, 0, TAU); ctx.stroke();
    ctx.fillStyle = `rgba(245,240,215,${0.9 * d})`;
    ctx.beginPath(); ctx.ellipse(0, -7, 6.5, 2, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = body;
    [[-3.5, -9.5, -6, -16, -0.5, -10.5], [3.5, -9.5, 6, -16, 0.5, -10.5]].forEach(([x1,y1,x2,y2,x3,y3]) => {
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.lineTo(x3,y3); ctx.closePath(); ctx.fill();
    });
    ctx.fillStyle = `rgba(${(250 * d) | 0},${(195 * d) | 0},${(18 * d) | 0},${d})`;
    ctx.beginPath(); ctx.arc(-3.2, -1.5, 4.8, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(3.2, -1.5, 4.8, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.95)';
    ctx.beginPath(); ctx.arc(-3.2, -1.5, 3.5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(3.2, -1.5, 3.5, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.arc(-1.8, -3, 1.4, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(4.6, -3, 1.4, 0, TAU); ctx.fill();
    ctx.fillStyle = rgb([155, 128, 62].map((c) => c * d));
    ctx.beginPath(); ctx.moveTo(-2.5, 2.5); ctx.lineTo(2.5, 2.5); ctx.lineTo(0.5, 7.5); ctx.closePath(); ctx.fill();
    ctx.restore();

    // Talons
    ctx.strokeStyle = rgb([130, 100, 52].map((c) => c * d));
    ctx.lineWidth = 2.0; ctx.lineCap = 'round';
    [[-5, 22], [5, 22]].forEach(([fx, fy]) => {
      [-1.5, 0, 1.5, 3].forEach((t) => {
        const angle = (t - 0.75) * 0.5;
        ctx.beginPath(); ctx.moveTo(fx, fy);
        ctx.lineTo(fx + Math.sin(angle) * 8, fy + Math.cos(angle) * 6); ctx.stroke();
      });
    });

    ctx.restore();
  }

  function drawCamel(pool, groundY, sky, time) {
    const d = 0.4 + sky.day * 0.6;
    const { cx, r } = pool;
    const sc = Math.min(1, W / 480);

    const ap = approachT(time, 14000);
    const walking = walkFrac(time, 14000);
    const drinkX = cx - r - 60;
    const drinkY = groundY + 24;
    const bx = lerp(-140, drinkX, ap);
    const by = lerp(groundY + 24, drinkY, ap);

    const drinkT = ap === 1 ? 1 : 0;
    const chew = Math.abs(Math.sin(time * 0.0016)) * 2;
    const neckDip = drinkT * 18;

    const [fr, fl, br, bl] = legSwing(time, walking);
    const la = 14;
    const cFR = fr/10*la, cFL = fl/10*la, cBR = br/10*la, cBL = bl/10*la;

    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(1.5 * sc, 1.5 * sc);

    // Local space: ground = y 0, up = negative y
    // Tall legs: hoof y=0, knee y=-22, hip y=-44
    // Body centre y=-54 (rx=30, ry=12), belly y=-42 (clears shrubs)
    // Hump peak ~y=-76
    // Neck base (22,-50), neck top (34,-74+neckDip)

    const fur   = rgb([210, 172, 100].map(c => c * d));
    const shad  = rgb([160, 122, 60].map(c => c * d));
    const belly = rgb([232, 208, 148].map(c => c * d));
    const snout = rgb([190, 152, 90].map(c => c * d));
    const hoove = rgb([48, 34, 12].map(c => c * d));
    const dark  = rgb([55, 36, 10].map(c => c * d));

    function hoof(hx, hy) {
      ctx.fillStyle = hoove;
      ctx.beginPath(); ctx.ellipse(hx, hy, 6, 3, 0.05, 0, TAU); ctx.fill();
      ctx.strokeStyle = dark; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(hx, hy-2.5); ctx.lineTo(hx, hy+3); ctx.stroke();
    }
    function leg(x1,y1, kx,ky, x2,y2, col) {
      ctx.strokeStyle = shad; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(kx,ky); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(kx,ky); ctx.lineTo(x2,y2); ctx.stroke();
      hoof(x2, y2);
    }

    // rear legs (behind body)
    leg(-16,-44, -17+cBR*0.5,-22, -18+cBR,0, shad);
    leg(-22,-44, -23+cBL*0.5,-22, -24+cBL,0, shad);

    // body
    ctx.fillStyle = shad;
    ctx.beginPath(); ctx.ellipse(1,-53,31,13,0,0,TAU); ctx.fill();
    ctx.fillStyle = fur;
    ctx.beginPath(); ctx.ellipse(0,-54,31,13,0,0,TAU); ctx.fill();
    // belly lighter patch
    ctx.fillStyle = belly;
    ctx.beginPath(); ctx.ellipse(-2,-45,19,5.5,0,0,TAU); ctx.fill();

    // hump — sits directly on body top, same fur color to avoid seam
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.moveTo(-13,-63);
    ctx.bezierCurveTo(-16,-70,-12,-78,-3,-80);
    ctx.bezierCurveTo(4,-82,13,-74,14,-64);
    ctx.bezierCurveTo(15,-58,10,-56,6,-56);
    ctx.lineTo(-12,-56);
    ctx.closePath(); ctx.fill();
    // hump shadow side
    ctx.fillStyle = shad;
    ctx.beginPath();
    ctx.moveTo(5,-62);
    ctx.bezierCurveTo(9,-66,13,-70,14,-64);
    ctx.bezierCurveTo(15,-58,10,-56,6,-56);
    ctx.closePath(); ctx.fill();
    // hump tuft
    ctx.strokeStyle = shad; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
    [[-2,-77],[1,-80],[4,-80],[7,-78],[9,-74]].forEach(([sx,sy]) => {
      ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(sx-1,sy-5); ctx.stroke();
    });

    // tail
    ctx.strokeStyle = shad; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-28,-50); ctx.quadraticCurveTo(-38,-42,-36,-30); ctx.stroke();
    ctx.lineWidth = 1.5;
    [[-35,-30],[-37,-29],[-39,-31],[-36,-28]].forEach(([tx,ty]) => {
      ctx.beginPath(); ctx.moveTo(-36,-30); ctx.lineTo(tx,ty+7); ctx.stroke();
    });

    // neck — base buried deep inside body so no gap shows
    const nbx = 18, nby = -56;
    const ntx = 30, nty = -76 + neckDip;
    // draw as single filled quad, same fur color as body
    ctx.fillStyle = shad;
    ctx.beginPath();
    ctx.moveTo(nbx-6, nby+4);
    ctx.bezierCurveTo(nbx,nby-14, ntx-12,nty+16, ntx-8,nty);
    ctx.bezierCurveTo(ntx-2,nty-5, ntx+6,nty-5, ntx+10,nty);
    ctx.bezierCurveTo(ntx+14,nty+16, nbx+8,nby-12, nbx+4,nby+4);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.moveTo(nbx-5, nby+3);
    ctx.bezierCurveTo(nbx,nby-15, ntx-10,nty+14, ntx-7,nty+1);
    ctx.bezierCurveTo(ntx-1,nty-4, ntx+5,nty-4, ntx+9,nty+1);
    ctx.bezierCurveTo(ntx+13,nty+14, nbx+7,nby-13, nbx+3,nby+3);
    ctx.closePath(); ctx.fill();

    // front legs (over body)
    leg(14,-44, 13+cFR*0.5,-22, 12+cFR,0, fur);
    leg(8,-44,  7+cFL*0.5,-22,  6+cFL,0, fur);

    // head — ellipse overlaps generously into neck top to hide seam
    const hx = ntx + 7, hy = nty - 3;
    ctx.fillStyle = shad;
    ctx.beginPath(); ctx.ellipse(hx+1,hy,14,8,-0.18,0,TAU); ctx.fill();
    ctx.fillStyle = fur;
    ctx.beginPath(); ctx.ellipse(hx,hy-1,14,8,-0.18,0,TAU); ctx.fill();

    // muzzle — same fur base, snout-coloured tip
    ctx.fillStyle = snout;
    ctx.beginPath();
    ctx.moveTo(hx-2,hy+4);
    ctx.bezierCurveTo(hx+6,hy+5, hx+18,hy+7, hx+20,hy+14);
    ctx.bezierCurveTo(hx+20,hy+22, hx+14,hy+25, hx+7,hy+24);
    ctx.bezierCurveTo(hx+1,hy+22, hx-2,hy+15, hx-2,hy+8-chew);
    ctx.closePath(); ctx.fill();
    // nostrils
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(hx+15,hy+10,2,1.1,0.4,0,TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(hx+15,hy+15,2,1.1,0.4,0,TAU); ctx.fill();

    // eye
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(hx+2,hy-5,4.5,3.5,0.15,0,TAU); ctx.fill();
    ctx.fillStyle = '#1a0e04';
    ctx.beginPath(); ctx.ellipse(hx+2,hy-5,2.5,2.5,0,0,TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.beginPath(); ctx.arc(hx+3.5,hy-6.2,1.2,0,TAU); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
      const a = -1.1 + i * 0.24;
      ctx.beginPath();
      ctx.moveTo(hx+2+Math.cos(a)*4.5, hy-5+Math.sin(a)*3.5);
      ctx.lineTo(hx+2+Math.cos(a)*7.5, hy-5+Math.sin(a)*5.5);
      ctx.stroke();
    }

    // ear
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.moveTo(hx-5,hy-8); ctx.quadraticCurveTo(hx-11,hy-18,hx-8,hy-17);
    ctx.quadraticCurveTo(hx-5,hy-16,hx-5,hy-9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = belly;
    ctx.beginPath();
    ctx.moveTo(hx-6,hy-9); ctx.quadraticCurveTo(hx-9,hy-16,hx-7,hy-16);
    ctx.quadraticCurveTo(hx-5,hy-15,hx-6,hy-10); ctx.closePath(); ctx.fill();

    ctx.restore();
  }

  // ── frame loop ───────────────────────────────────────────────────────────

  function frame(now) {
    const time = now - t0;
    const sky = skyState(clockDate());
    drawSky(sky);
    drawBirds(sky, time);
    const groundY = drawDunes(sky, time);
    drawBackgroundVegetation(groundY, sky, time);
    const pool = drawOasis(groundY, sky, time);
    drawLife(pool, groundY, sky, time);
    // Draw back to front by distance from viewer
    if (animals.camel)  drawCamel(pool, groundY, sky, time);
    if (animals.owl)    drawOwl(pool, groundY, sky, time);
    if (animals.coyote) drawCoyote(pool, groundY, sky, time);
    if (animals.snake)  drawSnake(pool, groundY, sky, time);
    if (animals.fox)    drawFox(pool, groundY, sky, time);
    raf = requestAnimationFrame(frame);
  }

  const onResize = () => resize();
  resize();
  window.addEventListener('resize', onResize);
  raf = requestAnimationFrame(frame);

  return {
    setData,
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    },
  };
}
