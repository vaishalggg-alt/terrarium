// Canvas world engine for the Desert biome — an oasis hydration tracker.
//
//   • The pool rises with today's water intake (litres).
//   • Animals arrive at each litre milestone:
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

  const foxS    = { phase: Math.random() * TAU };
  const snakeS  = { phase: Math.random() * TAU };
  const coyoteS = { phase: Math.random() * TAU };
  const owlS    = { phase: Math.random() * TAU };
  const camelS  = { phase: Math.random() * TAU };

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

    if (fill <= 0.02) {
      ctx.strokeStyle = `rgba(120,92,60,${0.6 * d})`; ctx.lineWidth = 1.2;
      const rr = rng(7);
      for (let i = 0; i < 7; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + (rr() - 0.5) * r, cy + (rr() - 0.5) * ry);
        ctx.lineTo(cx + (rr() - 0.5) * r, cy + (rr() - 0.5) * ry);
        ctx.stroke();
      }
      return { cx, cy, r, ry };
    }

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

  // ── animals ──────────────────────────────────────────────────────────────
  // All animals are drawn facing the pool and positioned at its edge.
  // Relative sizes (realistic): camel >> coyote > fox ≈ owl > snake coil

  // 2L — Fennec fox: pale sandy fur, enormous ears, trots to pool right edge
  function drawFox(pool, groundY, sky, time) {
    foxS.phase += 0.0016;
    const d = 0.4 + sky.day * 0.6;
    const { cx, cy, r, ry } = pool;

    // Oscillate: idle far → walk to pool → drink → walk back
    const cycle = (Math.sin(foxS.phase) * 0.5 + 0.5); // 0..1
    const drinkT = clamp((cycle - 0.6) / 0.35, 0, 1); // 0 until near, then 0→1
    const bx = cx + r + 14 + (1 - ease(cycle)) * 72;
    const by = groundY + 2;

    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(-1.95, 1.95); // face left (toward pool)

    const fur    = rgb([216, 186, 118].map((c) => c * d)); // pale sandy buff
    const shadow = rgb([170, 136, 75].map((c) => c * d));  // darker for shadow/markings
    const belly  = `rgba(245,232,200,${d})`;
    const dark   = rgb([38, 24, 8].map((c) => c * d));

    // Bushy tail — held up and curled, white tip
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.moveTo(9, -2);
    ctx.bezierCurveTo(20, -16, 32, -14, 30, -4);
    ctx.bezierCurveTo(28, 3, 18, 4, 10, 0);
    ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${0.88 * d})`;
    ctx.beginPath(); ctx.ellipse(29, -6, 5, 3.5, -0.4, 0, TAU); ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(29, -7, 3, 2, -0.4, 0, TAU); ctx.fill();

    // Body — elongated oval
    ctx.fillStyle = fur;
    ctx.beginPath(); ctx.ellipse(0, -7, 13, 6.5, -0.05, 0, TAU); ctx.fill();
    ctx.fillStyle = belly;
    ctx.beginPath(); ctx.ellipse(-1, -4.5, 8.5, 4, 0, 0, TAU); ctx.fill();

    // Legs — slight crouch when drinking
    const crouch = drinkT * 2.5;
    ctx.strokeStyle = fur; ctx.lineWidth = 2.8; ctx.lineCap = 'round';
    [[-7.5, -1, -7.5, 7 - crouch], [-2.5, -1, -2.5, 7 - crouch],
     [3.5, -2, 3.5, 6.5], [8, -2, 8, 6.5]].forEach(([x1, y1, x2, y2]) => {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    });
    // Paws
    ctx.fillStyle = shadow;
    [[-7.5, 7 - crouch], [-2.5, 7 - crouch], [3.5, 6.5], [8, 6.5]].forEach(([px, py]) => {
      ctx.beginPath(); ctx.ellipse(px, py, 2.8, 1.6, 0, 0, TAU); ctx.fill();
    });

    // Head — dips forward and down when drinking
    const headX = -14 - drinkT * 4;
    const headY = -13 + drinkT * 8; // drops toward water
    ctx.fillStyle = fur;
    ctx.beginPath(); ctx.arc(headX, headY, 7, 0, TAU); ctx.fill();
    // Muzzle
    ctx.fillStyle = shadow;
    ctx.beginPath(); ctx.ellipse(headX - 5, headY + 1, 5, 3.2, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = belly;
    ctx.beginPath(); ctx.ellipse(headX - 4.5, headY + 2.5, 3.5, 2, 0, 0, TAU); ctx.fill();

    // Fennec's enormous ears (defining feature — nearly as tall as body)
    const earLean = drinkT * 0.15; // ears tilt forward slightly when drinking
    ctx.fillStyle = fur;
    // Left ear
    ctx.save(); ctx.translate(headX - 3, headY - 5); ctx.rotate(-earLean);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-8, -28); ctx.lineTo(5, -1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgba(210,140,140,${0.85 * d})`;
    ctx.beginPath(); ctx.moveTo(0, -1); ctx.lineTo(-6, -24); ctx.lineTo(3.5, -2); ctx.closePath(); ctx.fill();
    ctx.restore();
    // Right ear
    ctx.fillStyle = fur;
    ctx.save(); ctx.translate(headX + 3, headY - 5); ctx.rotate(earLean);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(6, -27); ctx.lineTo(8, -2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgba(210,140,140,${0.85 * d})`;
    ctx.beginPath(); ctx.moveTo(0, -1); ctx.lineTo(5, -23); ctx.lineTo(6.5, -2); ctx.closePath(); ctx.fill();
    ctx.restore();

    // Nose (dark, oval)
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(headX - 9, headY + 1.5, 1.7, 1.3, 0.1, 0, TAU); ctx.fill();
    // Whisker dots
    ctx.fillStyle = `rgba(0,0,0,${0.5 * d})`;
    [[-5.5, 1.2], [-6, 0], [-6, 2.4]].forEach(([ox, oy]) => {
      ctx.beginPath(); ctx.arc(headX + ox, headY + oy, 0.5, 0, TAU); ctx.fill();
    });
    // Eye (large, dark brown)
    ctx.fillStyle = rgb([42, 28, 10].map((c) => c * d));
    ctx.beginPath(); ctx.ellipse(headX - 1, headY - 1.5, 2.4, 2.1, 0.1, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.arc(headX + 0.3, headY - 2.5, 0.75, 0, TAU); ctx.fill();

    ctx.restore();
  }

  // 3L — Rattlesnake: coiled at left pool edge, head raised and extended toward water
  function drawSnake(pool, groundY, sky, time) {
    snakeS.phase += 0.001;
    const d = 0.4 + sky.day * 0.6;
    const { cx, cy, r, ry } = pool;

    // Positioned at left pool edge
    const bx = cx - r - 18;
    const by = groundY + 6;

    // Gentle head sway
    const headSway = Math.sin(snakeS.phase * 0.8) * 0.12;

    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(2.4, 2.4);

    const bodyTan  = rgb([188, 155, 90].map((c) => c * d));  // tan base
    const bodyDark = rgb([95, 68, 30].map((c) => c * d));    // dark saddles
    const belly    = rgb([222, 200, 148].map((c) => c * d)); // pale belly
    const headCol  = rgb([160, 125, 65].map((c) => c * d));

    // ── coil (2 loops) ────────────────────────────────────────────
    // Draw each arc segment with dark outline + lighter fill

    const coilDraw = (strokeW, col, arcs) => {
      ctx.strokeStyle = col; ctx.lineWidth = strokeW; ctx.lineCap = 'butt';
      arcs.forEach(([rad, a0, a1]) => {
        ctx.beginPath(); ctx.arc(0, 0, rad, a0, a1); ctx.stroke();
      });
    };

    // Outer coil back-half (behind inner coil)
    coilDraw(11, bodyDark, [[17, Math.PI * 0.05, Math.PI * 1.05]]);
    coilDraw(8.5, bodyTan, [[17, Math.PI * 0.07, Math.PI * 1.03]]);
    // belly stripe on outer
    coilDraw(3.5, belly, [[17, Math.PI * 0.35, Math.PI * 0.82]]);

    // Inner coil
    coilDraw(10, bodyDark, [[9.5, Math.PI * 0.5, Math.PI * 2.4]]);
    coilDraw(7.5, bodyTan, [[9.5, Math.PI * 0.52, Math.PI * 2.38]]);
    coilDraw(3, belly, [[9.5, Math.PI * 0.55, Math.PI * 1.6]]);

    // Outer coil front-half (in front of inner)
    coilDraw(11, bodyDark, [[17, Math.PI * 1.05, Math.PI * 2.0]]);
    coilDraw(8.5, bodyTan, [[17, Math.PI * 1.07, Math.PI * 1.98]]);
    coilDraw(3.5, belly, [[17, Math.PI * 1.1, Math.PI * 1.7]]);

    // Diamond saddle markings along outer coil
    ctx.fillStyle = bodyDark;
    for (let i = 0; i < 7; i++) {
      const ang = Math.PI * (0.08 + i * 0.27);
      const px = Math.cos(ang) * 17, py = Math.sin(ang) * 17;
      ctx.save(); ctx.translate(px, py); ctx.rotate(ang + Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, -4.5); ctx.lineTo(3.5, 0); ctx.lineTo(0, 4.5); ctx.lineTo(-3.5, 0);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    // Rattle (at tail end, right side)
    const rattleBase = { x: Math.cos(Math.PI * 0.05) * 17, y: Math.sin(Math.PI * 0.05) * 17 };
    const rattleCol = rgb([200, 168, 100].map((c) => c * d));
    for (let s = 0; s < 5; s++) {
      ctx.fillStyle = s % 2 ? bodyTan : rattleCol;
      ctx.beginPath();
      ctx.ellipse(rattleBase.x + s * 3.2, rattleBase.y - s * 0.3,
        5.5 - s * 0.7, 3.8 - s * 0.5, -0.25, 0, TAU);
      ctx.fill();
    }

    // ── neck rising from inner coil, curving toward pool (right) ──────────
    const neckBase = { x: Math.cos(Math.PI * 2.38) * 9.5, y: Math.sin(Math.PI * 2.38) * 9.5 };
    // Neck curves rightward and upward toward the water
    ctx.strokeStyle = bodyDark; ctx.lineWidth = 11; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(neckBase.x, neckBase.y);
    ctx.quadraticCurveTo(neckBase.x + 10, neckBase.y - 8, 18 + headSway * 5, -20);
    ctx.stroke();
    ctx.strokeStyle = bodyTan; ctx.lineWidth = 8.5;
    ctx.beginPath();
    ctx.moveTo(neckBase.x, neckBase.y);
    ctx.quadraticCurveTo(neckBase.x + 10, neckBase.y - 8, 18 + headSway * 5, -20);
    ctx.stroke();
    // Belly along neck
    ctx.strokeStyle = belly; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(neckBase.x, neckBase.y);
    ctx.quadraticCurveTo(neckBase.x + 10, neckBase.y - 8, 18 + headSway * 5, -20);
    ctx.stroke();

    // ── broad triangular pit-viper head ──────────────────────────────────
    const hx = 18 + headSway * 5, hy = -20;
    // Head rotated to face right (toward pool)
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(headSway);

    // Jaw / head shape — wide triangular pit viper silhouette
    ctx.fillStyle = bodyDark;
    ctx.beginPath();
    ctx.moveTo(-9, 4); ctx.lineTo(9, 4); ctx.lineTo(12, -1);
    ctx.lineTo(5, -9); ctx.lineTo(-5, -9); ctx.lineTo(-11, -1);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = headCol;
    ctx.beginPath();
    ctx.moveTo(-7, 2.5); ctx.lineTo(7, 2.5); ctx.lineTo(10, -1);
    ctx.lineTo(4, -7.5); ctx.lineTo(-4, -7.5); ctx.lineTo(-9, -1);
    ctx.closePath(); ctx.fill();

    // Heat-sensing pit (characteristic of rattlesnakes)
    ctx.fillStyle = bodyDark;
    ctx.beginPath(); ctx.ellipse(-5, -0.5, 1.8, 1.4, 0.3, 0, TAU); ctx.fill();

    // Vertical slit pupil in amber eye
    ctx.fillStyle = `rgba(${(240 * d) | 0},${(155 * d) | 0},0,${d})`;
    ctx.beginPath(); ctx.ellipse(4, -3, 2.8, 2.4, 0.15, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.95)';
    ctx.beginPath(); ctx.ellipse(4, -3, 0.9, 2.4, 0.15, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.arc(5, -4, 0.7, 0, TAU); ctx.fill();

    // Nostril
    ctx.fillStyle = bodyDark;
    ctx.beginPath(); ctx.ellipse(9, 1, 1, 0.7, 0.2, 0, TAU); ctx.fill();

    // Tongue flick toward water
    const flick = Math.sin(time * 0.008);
    if (flick > 0.4) {
      const ta = (flick - 0.4) / 0.6;
      ctx.strokeStyle = `rgba(${(195 * d) | 0},${(15 * d) | 0},${(15 * d) | 0},${ta})`;
      ctx.lineWidth = 1.1; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(10, 2); ctx.lineTo(18, 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(18, 2); ctx.lineTo(22, -1.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(18, 2); ctx.lineTo(22, 5.5); ctx.stroke();
    }

    ctx.restore(); // end head rotation
    ctx.restore(); // end animal
  }

  // 4L — Coyote: leans over pool right edge, head bowed to drink
  function drawCoyote(pool, groundY, sky, time) {
    coyoteS.phase += 0.0018;
    const d = 0.4 + sky.day * 0.6;
    const { cx, r } = pool;

    const cycle = (Math.sin(coyoteS.phase) * 0.5 + 0.5);
    const drinkT = clamp((cycle - 0.45) / 0.45, 0, 1);
    const bx = cx + r + 26 + (1 - ease(cycle)) * 90;
    const by = groundY + 2;

    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(-2.65, 2.65); // face left

    const fur    = rgb([170, 148, 105].map((c) => c * d)); // gray-brown
    const dark   = rgb([82, 62, 32].map((c) => c * d));
    const belly  = rgb([218, 205, 172].map((c) => c * d));
    const muzzle = rgb([195, 176, 132].map((c) => c * d));

    // Bushy tail drooping down, dark tip
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.moveTo(12, -5);
    ctx.bezierCurveTo(24, 2, 26, 14, 20, 18);
    ctx.bezierCurveTo(16, 20, 12, 16, 13, 10);
    ctx.bezierCurveTo(15, 4, 15, -1, 11, -3);
    ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(18.5, 18, 4, 2.5, 0.4, 0, TAU); ctx.fill();

    // Body
    ctx.fillStyle = fur;
    ctx.beginPath(); ctx.ellipse(0, -9, 14, 7.5, -0.05, 0, TAU); ctx.fill();
    ctx.fillStyle = belly;
    ctx.beginPath(); ctx.ellipse(-1, -6, 9, 5, -0.05, 0, TAU); ctx.fill();

    // Legs — front pair lean forward when drinking
    const frontLean = drinkT * 4;
    ctx.strokeStyle = fur; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    [[-9, -3, -10 - frontLean, 9], [-13, -3, -14 - frontLean, 9],
     [7, -4, 7, 9], [11, -4, 11, 9]].forEach(([x1, y1, x2, y2]) => {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    });
    // Paws
    ctx.fillStyle = dark;
    [[-10 - frontLean, 9], [-14 - frontLean, 9], [7, 9], [11, 9]].forEach(([px, py]) => {
      ctx.beginPath(); ctx.ellipse(px, py, 3.5, 2.2, 0, 0, TAU); ctx.fill();
    });

    // Neck + head — dips deeply to drink
    const headDip = drinkT * 18;
    const headFwd = drinkT * 10;
    const hx = -22 - headFwd, hy = -24 + headDip;

    // Neck
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.moveTo(-12, -15);
    ctx.quadraticCurveTo(hx + 10, hy + 10, hx, hy + 8);
    ctx.quadraticCurveTo(hx + 8, hy + 8, -10, -14);
    ctx.fill();

    // Head — elongated coyote skull
    ctx.fillStyle = fur;
    ctx.beginPath(); ctx.ellipse(hx, hy, 10, 8.5, -0.12, 0, TAU); ctx.fill();
    // Forehead saddle (darker)
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(hx + 2, hy - 4, 7, 3.5, -0.12, 0, TAU); ctx.fill();
    ctx.fillStyle = fur;
    ctx.beginPath(); ctx.ellipse(hx + 2, hy - 3.5, 5.5, 2.5, -0.12, 0, TAU); ctx.fill();
    // Muzzle (long and pointed)
    ctx.fillStyle = muzzle;
    ctx.beginPath(); ctx.ellipse(hx - 9, hy + 1.5, 9.5, 4, -0.08, 0, TAU); ctx.fill();
    ctx.fillStyle = belly;
    ctx.beginPath(); ctx.ellipse(hx - 9, hy + 3.5, 6, 2.5, 0, 0, TAU); ctx.fill();

    // Ears — tall and pointed
    ctx.fillStyle = fur;
    [[hx - 1, hy - 7, hx - 6, hy - 24, hx + 4, hy - 8],
     [hx + 5, hy - 7, hx + 10, hy - 22, hx + 11, hy - 7]].forEach(([x1, y1, x2, y2, x3, y3]) => {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath(); ctx.fill();
    });
    ctx.fillStyle = `rgba(200,142,142,${0.8 * d})`;
    [[hx - 1, hy - 9, hx - 4, hy - 20, hx + 3, hy - 9],
     [hx + 5, hy - 9, hx + 8, hy - 18, hx + 10, hy - 8]].forEach(([x1, y1, x2, y2, x3, y3]) => {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath(); ctx.fill();
    });

    // Amber eye with pupil
    ctx.fillStyle = `rgba(${(215 * d) | 0},${(165 * d) | 0},${(50 * d) | 0},${d})`;
    ctx.beginPath(); ctx.ellipse(hx - 1, hy - 2, 2.4, 2.1, 0.1, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.92)';
    ctx.beginPath(); ctx.arc(hx - 1, hy - 2, 1.5, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.arc(hx + 0.1, hy - 3, 0.6, 0, TAU); ctx.fill();

    // Nose
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(hx - 17, hy + 1.5, 2, 1.5, 0.1, 0, TAU); ctx.fill();

    ctx.restore();
  }

  // 5L — Burrowing owl: perched on a rock to the right of the pool, watches intently
  function drawOwl(pool, groundY, sky, time) {
    owlS.phase += 0.0014;
    const d = 0.4 + sky.day * 0.6;
    const { cx, r } = pool;

    // Perched on a rock just right of pool
    const bx = cx + r + 65;
    const by = groundY - 10; // slightly elevated (on rock)
    const swivel = Math.sin(owlS.phase * 0.55) * 0.28;
    // Occasional head bob (dipping to drink)
    const bobT = clamp((Math.sin(owlS.phase * 1.4) - 0.65) / 0.35, 0, 1);
    const bob = bobT * 8;

    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(-1.95, 1.95); // face left

    const body  = rgb([152, 118, 68].map((c) => c * d));  // warm brown
    const dark  = rgb([72, 50, 22].map((c) => c * d));
    const face  = rgb([202, 175, 125].map((c) => c * d)); // facial disc (pale)
    const rock  = rgb([125, 100, 75].map((c) => c * d));

    // Rock
    ctx.fillStyle = rock;
    ctx.beginPath(); ctx.ellipse(0, 28, 19, 9, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = rgb([148, 122, 95].map((c) => c * d));
    ctx.beginPath(); ctx.ellipse(-4, 23, 12, 5.5, -0.18, 0, TAU); ctx.fill();

    // Body — stocky upright oval
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, 8, 10, 15, 0, 0, TAU); ctx.fill();

    // Brown-and-white barred underparts
    ctx.fillStyle = `rgba(235,220,185,${0.55 * d})`;
    ctx.beginPath(); ctx.ellipse(0, 10, 6.5, 10, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 1.2;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(-6, 4 + i * 3.5);
      ctx.quadraticCurveTo(0, 3.5 + i * 3.5, 6, 4 + i * 3.5);
      ctx.stroke();
    }

    // Wing feather detail
    ctx.strokeStyle = dark; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    [[-8, 2, -7, 18], [-5, 0, -4.5, 17], [5, 0, 4.5, 17], [8, 2, 7, 18]].forEach(([x1, y1, x2, y2]) => {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    });

    // Head (swivels)
    ctx.save();
    ctx.translate(0, -7 + bob * 0.3);
    ctx.rotate(swivel);

    // Facial disc — pale oval
    ctx.fillStyle = face;
    ctx.beginPath(); ctx.ellipse(0, 0, 9, 10.5, 0, 0, TAU); ctx.fill();
    // Dark border around facial disc
    ctx.strokeStyle = dark; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(0, 0, 9, 10.5, 0, 0, TAU); ctx.stroke();
    // White brow bar (very characteristic of burrowing owls)
    ctx.fillStyle = `rgba(245,240,215,${0.9 * d})`;
    ctx.beginPath(); ctx.ellipse(0, -7, 6.5, 2, 0, 0, TAU); ctx.fill();

    // Ear tufts (small on burrowing owl)
    ctx.fillStyle = body;
    [[-3.5, -9.5, -6, -16, -0.5, -10.5], [3.5, -9.5, 6, -16, 0.5, -10.5]].forEach(([x1,y1, x2,y2, x3,y3]) => {
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.lineTo(x3,y3); ctx.closePath(); ctx.fill();
    });

    // Large yellow eyes with black pupils (signature feature)
    ctx.fillStyle = `rgba(${(250 * d) | 0},${(195 * d) | 0},${(18 * d) | 0},${d})`;
    ctx.beginPath(); ctx.arc(-3.2, -1.5, 4.8, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(3.2, -1.5, 4.8, 0, TAU); ctx.fill();
    // Pupil
    ctx.fillStyle = 'rgba(0,0,0,0.95)';
    ctx.beginPath(); ctx.arc(-3.2, -1.5, 3.5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(3.2, -1.5, 3.5, 0, TAU); ctx.fill();
    // Eye shine
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.arc(-1.8, -3, 1.4, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(4.6, -3, 1.4, 0, TAU); ctx.fill();
    // Tiny hooked beak
    ctx.fillStyle = rgb([155, 128, 62].map((c) => c * d));
    ctx.beginPath(); ctx.moveTo(-2.5, 2.5); ctx.lineTo(2.5, 2.5); ctx.lineTo(0.5, 7.5); ctx.closePath(); ctx.fill();

    ctx.restore(); // end swivel

    // Talons on rock
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

  // 6L — Dromedary camel: largest animal, left of pool, long neck bowing to water
  function drawCamel(pool, groundY, sky, time) {
    camelS.phase += 0.001;
    const d = 0.4 + sky.day * 0.6;
    const { cx, r } = pool;

    // Left of pool — camel neck reaches rightward toward water
    const bx = clamp(cx - r - 70, 20, W * 0.32);
    const by = groundY + 4;

    // Slow jaw chew
    const chew = Math.abs(Math.sin(camelS.phase * 1.8)) * 2.5;
    // Occasional head dip to water
    const dipT = clamp((Math.sin(camelS.phase * 0.7) - 0.3) / 0.5, 0, 1);

    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(3.8, 3.8); // Camel is by far the biggest

    const fur    = rgb([198, 163, 98].map((c) => c * d));  // tawny camel
    const dark   = rgb([138, 105, 55].map((c) => c * d));
    const belly  = rgb([218, 188, 128].map((c) => c * d));
    const hoove  = rgb([62, 45, 20].map((c) => c * d));

    // ── four long legs with knee joints ──────────────────────────
    const legData = [
      // front pair (right side of drawing = toward pool)
      { x1: 10, y1: -4,  kx: 9,   ky: 12, x2: 9,   y2: 26 },
      { x1: 14, y1: -4,  kx: 13,  ky: 12, x2: 13,  y2: 26 },
      // back pair
      { x1: -10, y1: -8, kx: -11, ky: 10, x2: -12, y2: 26 },
      { x1: -15, y1: -8, kx: -16, ky: 10, x2: -17, y2: 26 },
    ];
    ctx.strokeStyle = fur; ctx.lineWidth = 5.5; ctx.lineCap = 'round';
    legData.forEach(({ x1, y1, kx, ky, x2, y2 }) => {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(kx, ky); ctx.lineTo(x2, y2); ctx.stroke();
    });
    // Knee bumps
    ctx.fillStyle = dark;
    legData.forEach(({ kx, ky }) => {
      ctx.beginPath(); ctx.arc(kx, ky, 3.2, 0, TAU); ctx.fill();
    });
    // Wide two-toed hooves
    ctx.fillStyle = hoove;
    legData.forEach(({ x2, y2 }) => {
      ctx.beginPath(); ctx.ellipse(x2, y2, 5.5, 3, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = rgb([40, 28, 12].map((c) => c * d));
      ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(x2, y2 - 2.5); ctx.lineTo(x2, y2 + 3); ctx.stroke();
      ctx.strokeStyle = fur; ctx.lineWidth = 5.5;
    });

    // ── body ────────────────────────────────────────────────────
    ctx.fillStyle = fur;
    ctx.beginPath(); ctx.ellipse(0, -11, 20, 11, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = belly;
    ctx.beginPath(); ctx.ellipse(0, -7, 14, 7, 0, 0, TAU); ctx.fill();

    // ── single hump (dromedary) ─────────────────────────────────
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.moveTo(-8, -21);
    ctx.quadraticCurveTo(-1, -40, 7, -38);
    ctx.quadraticCurveTo(15, -36, 16, -21);
    ctx.closePath(); ctx.fill();
    // Darker hump top
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(5, -31, 8, 5, -0.2, 0, TAU); ctx.fill();
    // Hump fur ridge
    ctx.strokeStyle = dark; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(4 + i * 1.5, -38); ctx.lineTo(4 + i * 1.5, -34); ctx.stroke();
    }

    // ── long neck curving toward pool (right) ───────────────────
    const neckDip = dipT * 10;
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.moveTo(16, -20);
    ctx.quadraticCurveTo(26, -22 + neckDip, 30, -16 + neckDip);
    ctx.quadraticCurveTo(34, -9 + neckDip, 30, -5 + neckDip);
    ctx.quadraticCurveTo(26, -3 + neckDip, 22, -8 + neckDip);
    ctx.quadraticCurveTo(22, -15 + neckDip * 0.5, 18, -18);
    ctx.closePath(); ctx.fill();

    // ── head ────────────────────────────────────────────────────
    const hx = 30, hy = -18 + neckDip;
    ctx.fillStyle = fur;
    ctx.beginPath(); ctx.ellipse(hx, hy, 10.5, 7.5, -0.2, 0, TAU); ctx.fill();

    // Distinctive drooping lip (camel's unique look)
    ctx.fillStyle = rgb([182, 148, 90].map((c) => c * d));
    ctx.beginPath();
    ctx.moveTo(hx - 2, hy + 4);
    ctx.quadraticCurveTo(hx + 12, hy + 5, hx + 14, hy + 9);
    ctx.quadraticCurveTo(hx + 12, hy + 14, hx + 7, hy + 13);
    ctx.quadraticCurveTo(hx + 3, hy + 12, hx + 1, hy + 8 - chew);
    ctx.fill();
    // Lower jaw with chew
    ctx.fillStyle = belly;
    ctx.beginPath(); ctx.ellipse(hx + 8, hy + 10 + chew * 0.5, 4.5, 2.5, 0.1, 0, TAU); ctx.fill();

    // Slit-like nostrils (camels have closeable nostrils)
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(hx + 13, hy + 5, 1.8, 1, 0.35, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(hx + 13, hy + 8, 1.8, 1, 0.35, 0, TAU); ctx.fill();

    // Eye — small but with very long lashes (camels famous for lashes)
    ctx.fillStyle = rgb([40, 28, 10].map((c) => c * d));
    ctx.beginPath(); ctx.ellipse(hx + 3, hy - 4, 3.5, 2.8, 0.2, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.arc(hx + 4.5, hy - 5, 1, 0, TAU); ctx.fill();
    // Eyelashes — long curved (camel's signature)
    ctx.strokeStyle = dark; ctx.lineWidth = 1.0; ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const lx = hx + 1 + i * 0.9;
      const curveX = -0.5 + i * 0.3;
      ctx.beginPath();
      ctx.moveTo(lx, hy - 6.5);
      ctx.quadraticCurveTo(lx + curveX, hy - 10, lx + curveX * 1.5, hy - 13);
      ctx.stroke();
    }

    // Small ear
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
    // Draw back to front: camel furthest left, then owl (right), coyote, snake, fox
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
