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

// ── approach / walk cycle helpers ────────────────────────────────────────────
// Each animal walks in, drinks, walks back on an independent cycle.
// Offsets stagger them so they don't all arrive simultaneously.
const CYCLE_MS = 28000; // full cycle length (ms)

function cycleFrac(time, offsetMs) {
  return ((time + offsetMs) % CYCLE_MS) / CYCLE_MS;
}

// Returns 0 (at rest) → 1 (at pool)
function approachT(frac) {
  if (frac < 0.12) return 0;
  if (frac < 0.35) return ease((frac - 0.12) / 0.23);
  if (frac < 0.68) return 1;
  if (frac < 0.90) return 1 - ease((frac - 0.68) / 0.22);
  return 0;
}

// 1 while the animal is walking (either direction)
function walkFrac(frac) {
  return (frac > 0.12 && frac < 0.35) || (frac > 0.68 && frac < 0.90) ? 1 : 0;
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

  function setData({ fill: f, litres: l, animals: a }) {
    const rebuild = (f >= 0.6) !== (fill >= 0.6) || (f >= 0.3) !== (fill >= 0.3);
    fill = f; litres = l || 0;
    animals = a || { fox: false, snake: false, coyote: false, owl: false, camel: false };
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

  // ── dunes ────────────────────────────────────────────────────────────────

  function drawDunes(sky, time) {
    const d = 0.4 + sky.day * 0.6;
    const layers = [
      { y: H * 0.5,  amp: 26, col: [214, 180, 132] },
      { y: H * 0.62, amp: 34, col: [202, 166, 116] },
      { y: H * 0.74, amp: 30, col: [188, 150, 100] },
    ];
    layers.forEach((L, i) => {
      ctx.fillStyle = rgb(L.col.map((c) => c * d));
      ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(0, L.y);
      for (let x = 0; x <= W; x += 12)
        ctx.lineTo(x, L.y + Math.sin(x * 0.006 + i * 1.7) * L.amp + Math.sin(x * 0.02 + i) * 6);
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    });
    return H * 0.78;
  }

  // ── oasis pool ───────────────────────────────────────────────────────────

  function drawOasis(groundY, sky, time) {
    const cx = W * 0.5, cy = groundY + 8;
    const maxR = Math.min(W * 0.26, 200);
    const r = maxR * (0.18 + fill * 0.82);
    const ry = r * 0.34;
    const d = 0.4 + sky.day * 0.6;

    ctx.fillStyle = rgb([150, 120, 80].map((c) => c * d));
    ctx.beginPath(); ctx.ellipse(cx, cy, r + 16, ry + 7, 0, 0, TAU); ctx.fill();

    if (fill <= 0.02) return { cx, cy, r, ry };

    const wg = ctx.createLinearGradient(0, cy - ry, 0, cy + ry);
    wg.addColorStop(0, `rgb(${96 * d},${198 * d},${214 * d})`);
    wg.addColorStop(1, `rgb(${30 * d},${110 * d},${158 * d})`);
    ctx.fillStyle = wg;
    ctx.beginPath(); ctx.ellipse(cx, cy, r, ry, 0, 0, TAU); ctx.fill();

    ctx.save();
    ctx.beginPath(); ctx.ellipse(cx, cy, r, ry, 0, 0, TAU); ctx.clip();
    ctx.strokeStyle = `rgba(255,255,255,${0.18 * d})`; ctx.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) {
      const yy = cy - ry + (i + 0.5) * (ry * 2 / 4);
      ctx.beginPath();
      for (let x = cx - r; x <= cx + r; x += 8) {
        const off = Math.sin(x * 0.06 + time * 0.003 + i) * 2;
        x === cx - r ? ctx.moveTo(x, yy + off) : ctx.lineTo(x, yy + off);
      }
      ctx.stroke();
    }
    ctx.restore();
    return { cx, cy, r, ry };
  }

  // ── vegetation ───────────────────────────────────────────────────────────

  function drawPalm(x, baseY, hgt, sky, sway) {
    const d = 0.4 + sky.day * 0.6;
    ctx.strokeStyle = rgb([110, 78, 46].map((c) => c * d));
    ctx.lineWidth = Math.max(3, hgt * 0.05); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, baseY);
    const tx = x + sway * hgt * 0.12, ty = baseY - hgt;
    ctx.quadraticCurveTo(x + sway * hgt * 0.04, baseY - hgt * 0.5, tx, ty); ctx.stroke();
    ctx.strokeStyle = rgb([70, 140, 70].map((c) => c * d));
    ctx.lineWidth = Math.max(2, hgt * 0.03);
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i - 3) * 0.5 + sway * 0.1;
      ctx.beginPath(); ctx.moveTo(tx, ty);
      ctx.quadraticCurveTo(tx + Math.cos(a) * hgt * 0.3, ty + Math.sin(a) * hgt * 0.3 - 6,
        tx + Math.cos(a) * hgt * 0.5, ty + Math.sin(a) * hgt * 0.5 + 6); ctx.stroke();
    }
  }

  function drawLife(pool, groundY, sky, time) {
    const d = 0.4 + sky.day * 0.6;
    const sway = Math.sin(time * 0.0009) * 0.6;
    const { cx, r } = pool;
    const tufts = clamp(Math.round(litres * 2), 0, 16);
    ctx.strokeStyle = rgb([90, 150, 78].map((c) => c * d));
    ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    const gr = rng(21);
    for (let i = 0; i < tufts; i++) {
      const side = i % 2 ? 1 : -1;
      const bx = cx + side * (r + 10 + gr() * 40);
      const by = groundY + 6 + gr() * 8;
      for (let b = 0; b < 3; b++) {
        const a = -Math.PI / 2 + (b - 1) * 0.35 + sway * 0.2;
        ctx.beginPath(); ctx.moveTo(bx + b, by);
        ctx.lineTo(bx + Math.cos(a) * 9, by + Math.sin(a) * 9); ctx.stroke();
      }
    }
    const palms = Math.floor(fill * 4);
    const pr = rng(5);
    for (let i = 0; i < palms; i++) {
      const side = i % 2 ? 1 : -1;
      drawPalm(cx + side * (r + 30 + pr() * 50), groundY + 6, 70 + pr() * 50, sky, sway * side);
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
    const { cx, r } = pool;
    const sc = Math.min(1, W / 480);

    const frac = cycleFrac(time, CYCLE_MS * 0.30);
    const ap = approachT(frac);
    const walking = walkFrac(frac);
    const drinkX = cx + r + 6;
    const restX  = Math.min(cx + r + 130, W - 10);
    const bx = lerp(restX, drinkX, ap);
    const by = groundY + 2;

    const drinkT = ap > 0.88 ? (ap - 0.88) / 0.12 : 0; // head dip when at pool
    const [fr, fl, br, bl] = legSwing(time, walking);

    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(2.1 * sc, 2.1 * sc); // head at -x → faces left toward pool ✓

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
    const { cx, r } = pool;
    const sc = Math.min(1, W / 480);

    const bx = cx - r - 10;
    const by = groundY + 6;

    // Head bobs gently toward water
    const headSway = Math.sin(time * 0.0008) * 0.15;
    const headBob  = (Math.sin(time * 0.0005) * 0.5 + 0.5) * 4; // 0..4 px toward water

    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(2.0 * sc, 2.0 * sc);

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

    const frac = cycleFrac(time, CYCLE_MS * 0.62);
    const ap = approachT(frac);
    const walking = walkFrac(frac);
    const drinkX = cx + r + 52;
    const restX  = Math.min(W + 60, W + 50); // enters from right edge
    const bx = lerp(restX, drinkX, ap);
    const by = groundY + 2;

    const drinkT = ap > 0.88 ? (ap - 0.88) / 0.12 : 0;
    const [fr, fl, br, bl] = legSwing(time, walking);

    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(2.4 * sc, 2.4 * sc); // head at -x → faces left toward pool ✓

    const fur    = rgb([168, 148, 105].map((c) => c * d));
    const dark   = rgb([82, 62, 32].map((c) => c * d));
    const belly  = rgb([218, 205, 172].map((c) => c * d));
    const muzzle = rgb([195, 176, 132].map((c) => c * d));

    // Bushy tail drooping, dark tip
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.moveTo(12, -5); ctx.bezierCurveTo(24, 2, 26, 14, 20, 18);
    ctx.bezierCurveTo(16, 20, 12, 16, 13, 10); ctx.bezierCurveTo(15, 4, 15, -1, 11, -3);
    ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(18.5, 18, 4, 2.5, 0.4, 0, TAU); ctx.fill();

    // Body
    ctx.fillStyle = fur;
    ctx.beginPath(); ctx.ellipse(0, -9, 14, 7.5, -0.05, 0, TAU); ctx.fill();
    ctx.fillStyle = belly;
    ctx.beginPath(); ctx.ellipse(-1, -6, 9, 5, -0.05, 0, TAU); ctx.fill();

    // Legs
    const frontLean = drinkT * 4; // front legs lean forward when drinking
    ctx.strokeStyle = fur; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    [[-9, -3, fl - frontLean, 9], [-13, -3, fr - frontLean, 9],
     [7, -4, br, 9], [11, -4, bl, 9]].forEach(([hx, hy, sw, fy]) => {
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + sw, fy); ctx.stroke();
    });
    ctx.fillStyle = dark;
    [[-9, fl - frontLean, 9], [-13, fr - frontLean, 9],
     [7, br, 9], [11, bl, 9]].forEach(([hx, sw, fy]) => {
      ctx.beginPath(); ctx.ellipse(hx + sw, fy, 3.5, 2.2, 0, 0, TAU); ctx.fill();
    });

    // Head dips deeply when drinking
    const headDip = drinkT * 18;
    const headFwd = drinkT * 8;
    const hx = -22 - headFwd, hy = -24 + headDip;

    // Neck
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.moveTo(-12, -15); ctx.quadraticCurveTo(hx + 10, hy + 10, hx, hy + 8);
    ctx.quadraticCurveTo(hx + 8, hy + 8, -10, -14); ctx.fill();

    // Head
    ctx.fillStyle = fur;
    ctx.beginPath(); ctx.ellipse(hx, hy, 10, 8.5, -0.12, 0, TAU); ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(hx + 2, hy - 4, 7, 3.5, -0.12, 0, TAU); ctx.fill();
    ctx.fillStyle = fur;
    ctx.beginPath(); ctx.ellipse(hx + 2, hy - 3.5, 5.5, 2.5, -0.12, 0, TAU); ctx.fill();
    ctx.fillStyle = muzzle;
    ctx.beginPath(); ctx.ellipse(hx - 9, hy + 1.5, 9.5, 4, -0.08, 0, TAU); ctx.fill();
    ctx.fillStyle = belly;
    ctx.beginPath(); ctx.ellipse(hx - 9, hy + 3.5, 6, 2.5, 0, 0, TAU); ctx.fill();

    // Ears
    ctx.fillStyle = fur;
    [[hx - 1, hy - 7, hx - 6, hy - 24, hx + 4, hy - 8],
     [hx + 5, hy - 7, hx + 10, hy - 22, hx + 11, hy - 7]].forEach(([x1,y1,x2,y2,x3,y3]) => {
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.lineTo(x3,y3); ctx.closePath(); ctx.fill();
    });
    ctx.fillStyle = `rgba(200,142,142,${0.8 * d})`;
    [[hx - 1, hy - 9, hx - 4, hy - 20, hx + 3, hy - 9],
     [hx + 5, hy - 9, hx + 8, hy - 18, hx + 10, hy - 8]].forEach(([x1,y1,x2,y2,x3,y3]) => {
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.lineTo(x3,y3); ctx.closePath(); ctx.fill();
    });

    // Eye
    ctx.fillStyle = `rgba(${(215 * d) | 0},${(165 * d) | 0},${(50 * d) | 0},${d})`;
    ctx.beginPath(); ctx.ellipse(hx - 1, hy - 2, 2.4, 2.1, 0.1, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.92)';
    ctx.beginPath(); ctx.arc(hx - 1, hy - 2, 1.5, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.arc(hx + 0.1, hy - 3, 0.6, 0, TAU); ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(hx - 17, hy + 1.5, 2.2, 1.6, 0, 0, TAU); ctx.fill();

    ctx.restore();
  }

  // 5L — Burrowing owl. Perched on a rock at W*0.88 (far right), elevated.
  // Occasionally hops toward the pool. Cycle offset 0.78 × CYCLE_MS.
  function drawOwl(pool, groundY, sky, time) {
    const d = 0.4 + sky.day * 0.6;
    const { cx, r } = pool;
    const sc = Math.min(1, W / 480);

    const frac = cycleFrac(time, CYCLE_MS * 0.78);
    const ap = approachT(frac);
    const drinkX = cx + r + 52; // same x-lane as coyote rest when coyote is away
    const restX  = clamp(W * 0.87, cx + r + 90, W - 15);
    const bx = lerp(restX, drinkX, ap);
    const by = lerp(groundY - 52, groundY + 2, ap); // descends from rock to ground

    const swivel = Math.sin(time * 0.0007) * 0.28;
    const bobT = clamp((Math.sin(time * 0.0012) - 0.6) / 0.4, 0, 1);
    const bob = bobT * 8 * (ap > 0.85 ? 1 : 0.3); // more head-bob when at pool

    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(1.85 * sc, 1.85 * sc);

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

  // 6L — Dromedary camel. Walks in from the left to the pool edge.
  // Largest animal — clearly dominates when present.
  // Cycle offset 0.0 × CYCLE_MS (starts approaching immediately)
  function drawCamel(pool, groundY, sky, time) {
    const d = 0.4 + sky.day * 0.6;
    const { cx, r } = pool;
    const sc = Math.min(1, W / 480);

    const frac = cycleFrac(time, 0);
    const ap = approachT(frac);
    const walking = walkFrac(frac);
    const drinkX = clamp(cx - r - 10, 30, W * 0.42); // neck just reaches pool
    const restX  = -100; // enters from off-screen left
    const bx = lerp(restX, drinkX, ap);
    const by = groundY + 4;

    const drinkT = ap > 0.88 ? (ap - 0.88) / 0.12 : 0;
    const chew = Math.abs(Math.sin(time * 0.0016)) * 2.5;
    const neckDip = drinkT * 18;

    // Camel walk: legs have wide stride
    const [fr, fl, br, bl] = legSwing(time, walking);
    const legAmp = 14; // camels have a big stride
    const cFR = fr / 10 * legAmp, cFL = fl / 10 * legAmp;
    const cBR = br / 10 * legAmp, cBL = bl / 10 * legAmp;

    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(2.85 * sc, 2.85 * sc); // clearly biggest animal

    const fur   = rgb([198, 163, 98].map((c) => c * d));
    const dark  = rgb([138, 105, 55].map((c) => c * d));
    const belly = rgb([218, 188, 128].map((c) => c * d));
    const hoove = rgb([62, 45, 20].map((c) => c * d));

    // Four long legs with knee joints and stride animation
    ctx.strokeStyle = fur; ctx.lineWidth = 5.5; ctx.lineCap = 'round';
    [
      [10, -2, 9, 12, 9 + cFR, 26],
      [14, -2, 13, 12, 13 + cFL, 26],
      [-12, -6, -13, 10, -14 + cBR, 26],
      [-16, -6, -17, 10, -18 + cBL, 26],
    ].forEach(([x1, y1, kx, ky, x2, y2]) => {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(kx, ky); ctx.lineTo(x2, y2); ctx.stroke();
    });
    ctx.fillStyle = dark;
    [[9, 12], [13, 12], [-13, 10], [-17, 10]].forEach(([kx, ky]) => {
      ctx.beginPath(); ctx.arc(kx, ky, 3, 0, TAU); ctx.fill();
    });
    ctx.fillStyle = hoove;
    [[9 + cFR, 26], [13 + cFL, 26], [-14 + cBR, 26], [-18 + cBL, 26]].forEach(([hfx, hfy]) => {
      ctx.beginPath(); ctx.ellipse(hfx, hfy, 5.5, 3, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = rgb([40, 28, 12].map((c) => c * d));
      ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(hfx, hfy - 2.5); ctx.lineTo(hfx, hfy + 3); ctx.stroke();
      ctx.strokeStyle = fur; ctx.lineWidth = 5.5;
    });

    // Body
    ctx.fillStyle = fur;
    ctx.beginPath(); ctx.ellipse(0, -9, 18, 9.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = belly;
    ctx.beginPath(); ctx.ellipse(0, -5, 13, 6, 0, 0, TAU); ctx.fill();

    // Hump
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.moveTo(-9, -17); ctx.quadraticCurveTo(-2, -34, 5, -32);
    ctx.quadraticCurveTo(13, -30, 14, -17); ctx.closePath(); ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(4, -24, 7, 4.5, -0.25, 0, TAU); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(4 + i * 1.5, -38); ctx.lineTo(4 + i * 1.5, -34); ctx.stroke();
    }

    // Long neck curves rightward toward pool
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.moveTo(16, -20);
    ctx.quadraticCurveTo(26, -22 + neckDip, 30, -16 + neckDip);
    ctx.quadraticCurveTo(34, -9 + neckDip, 30, -5 + neckDip);
    ctx.quadraticCurveTo(26, -3 + neckDip, 22, -8 + neckDip);
    ctx.quadraticCurveTo(22, -15 + neckDip * 0.5, 18, -18);
    ctx.closePath(); ctx.fill();

    // Head
    const hx = 30, hy = -18 + neckDip;
    ctx.fillStyle = fur;
    ctx.beginPath(); ctx.ellipse(hx, hy, 10.5, 7.5, -0.2, 0, TAU); ctx.fill();
    ctx.fillStyle = rgb([182, 148, 90].map((c) => c * d));
    ctx.beginPath();
    ctx.moveTo(hx - 2, hy + 4); ctx.quadraticCurveTo(hx + 12, hy + 5, hx + 14, hy + 9);
    ctx.quadraticCurveTo(hx + 12, hy + 14, hx + 7, hy + 13);
    ctx.quadraticCurveTo(hx + 3, hy + 12, hx + 1, hy + 8 - chew); ctx.fill();
    ctx.fillStyle = belly;
    ctx.beginPath(); ctx.ellipse(hx + 8, hy + 10 + chew * 0.5, 4.5, 2.5, 0.1, 0, TAU); ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(hx + 13, hy + 5, 1.8, 1, 0.35, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(hx + 13, hy + 8, 1.8, 1, 0.35, 0, TAU); ctx.fill();
    ctx.fillStyle = rgb([40, 28, 10].map((c) => c * d));
    ctx.beginPath(); ctx.ellipse(hx + 3, hy - 4, 3.5, 2.8, 0.2, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.arc(hx + 4.5, hy - 5, 1, 0, TAU); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 1.0; ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(hx + 1 + i, hy - 6.5);
      ctx.quadraticCurveTo(hx + 0.5 + i * 1.1, hy - 10, hx + i * 1.2, hy - 13);
      ctx.stroke();
    }
    ctx.fillStyle = fur;
    ctx.beginPath(); ctx.ellipse(hx + 1, hy - 8, 3, 1.8, -0.6, 0, TAU); ctx.fill();

    ctx.restore();
  }

  // ── frame loop ───────────────────────────────────────────────────────────

  function frame(now) {
    const time = now - t0;
    const sky = skyState(clockDate());
    drawSky(sky);
    drawBirds(sky, time);
    const groundY = drawDunes(sky, time);
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
