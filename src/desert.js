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

  const foxS    = { phase: 0 };
  const snakeS  = { phase: 0 };
  const coyoteS = { phase: 0 };
  const owlS    = { phase: 0 };
  const camelS  = { phase: 0 };

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
      return { cx, cy, r };
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
    return { cx, cy, r };
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

  // 2L — Fennec fox: pads to the pool edge to drink
  function drawFox(pool, groundY, sky, time) {
    foxS.phase += 0.003;
    const d = 0.4 + sky.day * 0.6;
    const { cx, r } = pool;
    const t = (Math.sin(foxS.phase) + 1) / 2;
    const bx = cx + r + 95 - t * 78;
    const by = groundY + 4;
    const drink = t > 0.85;

    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(2.2, 2.2);

    const fur   = rgb([208, 98, 38].map((c) => c * d));
    const belly = `rgba(248,232,208,${d})`;
    const dark  = rgb([62, 30, 12].map((c) => c * d));

    // bushy tail
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.moveTo(9, -3); ctx.bezierCurveTo(17, -10, 26, -8, 24, -1);
    ctx.bezierCurveTo(22, 4, 14, 4, 10, 0); ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${0.92 * d})`;
    ctx.beginPath(); ctx.ellipse(23, -3, 4.5, 3, 0.4, 0, TAU); ctx.fill();

    // body + belly
    ctx.fillStyle = fur;
    ctx.beginPath(); ctx.ellipse(0, -5, 12, 6.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = belly;
    ctx.beginPath(); ctx.ellipse(-1, -3.5, 7.5, 4, 0, 0, TAU); ctx.fill();

    // four legs
    ctx.strokeStyle = fur; ctx.lineWidth = 2.8; ctx.lineCap = 'round';
    [[-7, 0, -8, 8], [-2, 0, -3, 8], [3, -1, 3, 7], [8, -1, 8, 7]].forEach(([x1, y1, x2, y2]) => {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    });

    // head
    const hx = -12, hy = drink ? -4 : -13;
    ctx.fillStyle = fur;
    ctx.beginPath(); ctx.arc(hx, hy, 6.5, 0, TAU); ctx.fill();
    ctx.fillStyle = belly;
    ctx.beginPath(); ctx.ellipse(hx - 2.5, hy + 1.5, 4.5, 3, -0.2, 0, TAU); ctx.fill();

    // large ears with pink inner
    ctx.fillStyle = fur;
    [[hx - 4, hy - 5, hx - 10, hy - 20, hx, hy - 7],
     [hx + 1, hy - 5, hx + 5, hy - 19, hx + 7, hy - 6]].forEach(([x1, y1, x2, y2, x3, y3]) => {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath(); ctx.fill();
    });
    ctx.fillStyle = `rgba(215,135,135,${d})`;
    [[hx - 4, hy - 7, hx - 8, hy - 16, hx - 1, hy - 8],
     [hx + 1, hy - 7, hx + 3, hy - 15, hx + 6, hy - 7]].forEach(([x1, y1, x2, y2, x3, y3]) => {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath(); ctx.fill();
    });

    // nose, eye, shine
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.arc(hx - 6, hy + 2, 1.4, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(hx - 1, hy - 1, 1.5, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.beginPath(); ctx.arc(hx - 0.3, hy - 1.6, 0.55, 0, TAU); ctx.fill();

    ctx.restore();
  }

  // 3L — Rattlesnake: coiled at the left pool edge, tongue flicking
  function drawSnake(pool, groundY, sky, time) {
    const d = 0.4 + sky.day * 0.6;
    const { cx, r } = pool;
    const bx = cx - r - 90;
    const by = groundY + 2;

    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(2.1, 2.1);

    const tan   = rgb([172, 138, 80].map((c) => c * d));
    const brown = rgb([88, 62, 30].map((c) => c * d));
    const head  = rgb([155, 115, 60].map((c) => c * d));

    // coil drawn back-to-front
    // bottom arc of outer coil (behind inner)
    ctx.strokeStyle = brown; ctx.lineWidth = 10; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.arc(0, 2, 14, Math.PI * 0.08, Math.PI * 1.1); ctx.stroke();
    ctx.strokeStyle = tan; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.arc(0, 2, 14, Math.PI * 0.1, Math.PI * 1.08); ctx.stroke();

    // inner coil
    ctx.strokeStyle = brown; ctx.lineWidth = 9; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.arc(0, 2, 8, Math.PI * 0.65, Math.PI * 2.35); ctx.stroke();
    ctx.strokeStyle = tan; ctx.lineWidth = 7.5;
    ctx.beginPath(); ctx.arc(0, 2, 8, Math.PI * 0.67, Math.PI * 2.33); ctx.stroke();

    // top arc of outer coil (in front of inner)
    ctx.strokeStyle = brown; ctx.lineWidth = 10; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.arc(0, 2, 14, Math.PI * 1.1, Math.PI * 1.98); ctx.stroke();
    ctx.strokeStyle = tan; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.arc(0, 2, 14, Math.PI * 1.12, Math.PI * 1.96); ctx.stroke();

    // diamond pattern along visible coil
    ctx.fillStyle = brown;
    for (let i = 0; i < 6; i++) {
      const angle = Math.PI * (0.1 + i * 0.31);
      const px = Math.cos(angle) * 14, py = 2 + Math.sin(angle) * 14;
      ctx.save(); ctx.translate(px, py); ctx.rotate(angle + Math.PI / 2);
      ctx.beginPath(); ctx.moveTo(0, -3.5); ctx.lineTo(2.5, 0); ctx.lineTo(0, 3.5); ctx.lineTo(-2.5, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    // rattle segments at tail end
    const rattleAng = Math.PI * 0.08;
    const rx = Math.cos(rattleAng) * 14, ry2 = 2 + Math.sin(rattleAng) * 14;
    const rattleCol = rgb([195, 162, 95].map((c) => c * d));
    for (let s = 0; s < 4; s++) {
      ctx.fillStyle = s % 2 ? tan : rattleCol;
      ctx.beginPath(); ctx.ellipse(rx + s * 2.8, ry2 - s * 0.4, 4.5 - s * 0.5, 3.2 - s * 0.3, -0.25, 0, TAU); ctx.fill();
    }

    // neck from inner coil to raised head
    const neckAng = Math.PI * 2.33;
    const nx = Math.cos(neckAng) * 8, ny = 2 + Math.sin(neckAng) * 8;
    ctx.strokeStyle = brown; ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(nx, ny); ctx.quadraticCurveTo(nx + 3, ny - 10, 9, -15); ctx.stroke();
    ctx.strokeStyle = tan; ctx.lineWidth = 7.5;
    ctx.beginPath(); ctx.moveTo(nx, ny); ctx.quadraticCurveTo(nx + 3, ny - 10, 9, -15); ctx.stroke();

    // broad triangular pit-viper head
    const hx = 9, hy = -15;
    ctx.fillStyle = brown;
    ctx.beginPath();
    ctx.moveTo(hx - 7, hy + 3); ctx.lineTo(hx + 7, hy + 3); ctx.lineTo(hx + 9, hy - 2);
    ctx.lineTo(hx + 3, hy - 8); ctx.lineTo(hx - 3, hy - 8); ctx.lineTo(hx - 9, hy - 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = head;
    ctx.beginPath();
    ctx.moveTo(hx - 5, hy + 1); ctx.lineTo(hx + 5, hy + 1); ctx.lineTo(hx + 7, hy - 2);
    ctx.lineTo(hx + 2, hy - 7); ctx.lineTo(hx - 2, hy - 7); ctx.lineTo(hx - 7, hy - 2); ctx.closePath(); ctx.fill();

    // vertical slit pupil (rattlesnake characteristic)
    ctx.fillStyle = `rgba(${(255 * d) | 0},${(140 * d) | 0},0,${d})`;
    ctx.beginPath(); ctx.ellipse(hx + 3.5, hy - 3.5, 2.2, 1.8, 0.2, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.95)';
    ctx.beginPath(); ctx.ellipse(hx + 3.5, hy - 3.5, 0.7, 1.8, 0.2, 0, TAU); ctx.fill();
    // heat pit
    ctx.fillStyle = brown;
    ctx.beginPath(); ctx.arc(hx - 3, hy - 1, 1.2, 0, TAU); ctx.fill();

    // tongue flick
    const flickAmt = Math.sin(time * 0.007);
    if (flickAmt > 0.55) {
      const ta = (flickAmt - 0.55) / 0.45;
      ctx.strokeStyle = `rgba(${(200 * d) | 0},${(20 * d) | 0},${(20 * d) | 0},${ta * d})`;
      ctx.lineWidth = 0.9; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(hx, hy - 8); ctx.lineTo(hx, hy - 14); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(hx, hy - 14); ctx.lineTo(hx - 3.5, hy - 18); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(hx, hy - 14); ctx.lineTo(hx + 3.5, hy - 18); ctx.stroke();
    }

    ctx.restore();
  }

  // 4L — Coyote: standing at the far right, watching the oasis
  function drawCoyote(groundY, sky, time) {
    coyoteS.phase += 0.0025;
    const d = 0.4 + sky.day * 0.6;
    const bx = W * 0.84;
    const by = groundY + 4;
    const bob = Math.sin(coyoteS.phase) * 1.2;

    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(2.5, 2.5);

    const fur   = rgb([178, 152, 105].map((c) => c * d));
    const dark  = rgb([88, 68, 35].map((c) => c * d));
    const belly = rgb([222, 208, 178].map((c) => c * d));

    // drooping bushy tail
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.moveTo(11, -4); ctx.bezierCurveTo(22, 0, 22, 10, 16, 14);
    ctx.bezierCurveTo(14, 16, 10, 14, 11, 10); ctx.bezierCurveTo(14, 6, 14, 2, 10, 0); ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(15, 14, 3.5, 2, 0.4, 0, TAU); ctx.fill();

    // body + belly
    ctx.fillStyle = fur;
    ctx.beginPath(); ctx.ellipse(0, -8, 13, 7, -0.1, 0, TAU); ctx.fill();
    ctx.fillStyle = belly;
    ctx.beginPath(); ctx.ellipse(-1, -5, 8.5, 4.5, -0.08, 0, TAU); ctx.fill();

    // four legs
    ctx.strokeStyle = fur; ctx.lineWidth = 3.2; ctx.lineCap = 'round';
    [[-9, -3, -10, 8], [-12, -3, -13, 8], [7, -2, 7, 8], [10, -2, 10, 8]].forEach(([x1, y1, x2, y2]) => {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    });
    ctx.fillStyle = fur;
    [[-10, 8], [-13, 8], [7, 8], [10, 8]].forEach(([px, py]) => {
      ctx.beginPath(); ctx.ellipse(px, py, 3, 1.8, 0, 0, TAU); ctx.fill();
    });

    // neck + head (with bob)
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.moveTo(-12, -13 + bob); ctx.quadraticCurveTo(-16, -18 + bob, -20, -24 + bob);
    ctx.quadraticCurveTo(-16, -16 + bob, -11, -14 + bob); ctx.fill();

    const hx = -23, hy = -26 + bob;
    ctx.fillStyle = fur;
    ctx.beginPath(); ctx.ellipse(hx, hy, 8.5, 7.5, -0.18, 0, TAU); ctx.fill();
    ctx.fillStyle = rgb([158, 128, 88].map((c) => c * d));
    ctx.beginPath(); ctx.ellipse(hx - 8, hy + 1.5, 8, 3.8, -0.12, 0, TAU); ctx.fill();
    ctx.fillStyle = belly;
    ctx.beginPath(); ctx.ellipse(hx - 6, hy + 3, 5, 2.5, 0, 0, TAU); ctx.fill();

    // pointed ears
    ctx.fillStyle = fur;
    [[hx - 2, hy - 6, hx - 6, hy - 18, hx + 2, hy - 7],
     [hx + 3, hy - 6, hx + 6, hy - 17, hx + 8, hy - 6]].forEach(([x1, y1, x2, y2, x3, y3]) => {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath(); ctx.fill();
    });
    ctx.fillStyle = `rgba(210,148,148,${d})`;
    [[hx - 2, hy - 8, hx - 4, hy - 14, hx + 1, hy - 8],
     [hx + 3, hy - 8, hx + 5, hy - 13, hx + 7, hy - 7]].forEach(([x1, y1, x2, y2, x3, y3]) => {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath(); ctx.fill();
    });

    // amber eye with pupil + shine
    ctx.fillStyle = `rgba(${(220 * d) | 0},${(165 * d) | 0},${(55 * d) | 0},${d})`;
    ctx.beginPath(); ctx.arc(hx - 2, hy - 3, 2, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    ctx.beginPath(); ctx.arc(hx - 2, hy - 3, 1.2, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.beginPath(); ctx.arc(hx - 1.2, hy - 3.8, 0.55, 0, TAU); ctx.fill();
    ctx.fillStyle = rgb([42, 28, 12].map((c) => c * d));
    ctx.beginPath(); ctx.ellipse(hx - 15, hy + 1.5, 2.2, 1.6, 0, 0, TAU); ctx.fill();

    ctx.restore();
  }

  // 5L — Burrowing owl: perched on a rock near the left edge
  function drawOwl(groundY, sky, time) {
    owlS.phase += 0.002;
    const d = 0.4 + sky.day * 0.6;
    const bx = W * 0.17;
    const by = groundY - 72;
    const swivel = Math.sin(owlS.phase * 0.6) * 0.18;

    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(2.1, 2.1);

    const body = rgb([158, 126, 76].map((c) => c * d));
    const dark = rgb([78, 56, 28].map((c) => c * d));
    const face = rgb([205, 178, 128].map((c) => c * d));
    const rock = rgb([128, 106, 80].map((c) => c * d));

    // rock perch
    ctx.fillStyle = rock;
    ctx.beginPath(); ctx.ellipse(0, 26, 16, 8, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = rgb([148, 124, 95].map((c) => c * d));
    ctx.beginPath(); ctx.ellipse(-3, 22, 10, 5, -0.2, 0, TAU); ctx.fill();

    // body
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, 10, 9.5, 14, 0, 0, TAU); ctx.fill();

    // wing streaks
    ctx.strokeStyle = dark; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(i * 3, 4); ctx.lineTo(i * 2.8, 20); ctx.stroke();
    }

    // white spots
    ctx.fillStyle = `rgba(245,238,215,${0.55 * d})`;
    [[6, 8], [-6, 10], [4, 15], [-5, 16], [7, 13]].forEach(([sx, sy]) => {
      ctx.beginPath(); ctx.ellipse(sx, sy, 1.5, 1, 0.3, 0, TAU); ctx.fill();
    });

    // face disc + swivel
    ctx.fillStyle = face;
    ctx.save(); ctx.rotate(swivel);
    ctx.beginPath(); ctx.ellipse(0, -2, 7.5, 9, 0, 0, TAU); ctx.fill();
    // white brow
    ctx.fillStyle = `rgba(245,238,210,${0.8 * d})`;
    ctx.beginPath(); ctx.ellipse(0, -8, 5, 1.8, 0, 0, TAU); ctx.fill();
    // ear tufts
    ctx.fillStyle = body;
    [[-4, -9, -6, -17, -1, -10], [4, -9, 6, -17, 1, -10]].forEach(([x1, y1, x2, y2, x3, y3]) => {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath(); ctx.fill();
    });
    // large yellow eyes
    ctx.fillStyle = `rgba(${(245 * d) | 0},${(185 * d) | 0},${(25 * d) | 0},${d})`;
    ctx.beginPath(); ctx.arc(-3.5, -2, 4.5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(3.5, -2, 4.5, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.95)';
    ctx.beginPath(); ctx.arc(-3.5, -2, 3.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(3.5, -2, 3.2, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath(); ctx.arc(-2.2, -3.2, 1.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(4.8, -3.2, 1.2, 0, TAU); ctx.fill();
    // hooked beak
    ctx.fillStyle = rgb([162, 132, 68].map((c) => c * d));
    ctx.beginPath(); ctx.moveTo(-2, 1); ctx.lineTo(2, 1); ctx.lineTo(0.5, 6); ctx.closePath(); ctx.fill();
    ctx.restore(); // end swivel

    // talons gripping rock
    ctx.strokeStyle = rgb([135, 106, 58].map((c) => c * d));
    ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    [[-5, 22], [5, 22]].forEach(([fx, fy]) => {
      [-1, 0, 1].forEach((t) => {
        ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + t * 5.5, fy + 6); ctx.stroke();
      });
    });

    ctx.restore();
  }

  // 6L — Dromedary camel: standing tall at the far left, slowly chewing
  function drawCamel(groundY, sky, time) {
    camelS.phase += 0.0015;
    const d = 0.4 + sky.day * 0.6;
    const bx = W * 0.10;
    const by = groundY + 4;
    const chew = Math.abs(Math.sin(camelS.phase * 2)) * 1.5;

    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(2.2, 2.2);

    const fur   = rgb([198, 162, 98].map((c) => c * d));
    const dark  = rgb([138, 106, 60].map((c) => c * d));
    const belly = rgb([216, 186, 128].map((c) => c * d));

    // four long legs with knee joints
    ctx.strokeStyle = fur; ctx.lineWidth = 5.5; ctx.lineCap = 'round';
    [[10, -2, 9, 12, 10, 24], [15, -2, 14, 12, 15, 24],
     [-12, -6, -13, 10, -14, 24], [-16, -6, -17, 10, -18, 24]].forEach(([x1, y1, kx, ky, x2, y2]) => {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(kx, ky); ctx.lineTo(x2, y2); ctx.stroke();
    });
    ctx.fillStyle = dark;
    [[-13, 10], [-17, 10], [9, 12], [14, 12]].forEach(([kx, ky]) => {
      ctx.beginPath(); ctx.arc(kx, ky, 3, 0, TAU); ctx.fill();
    });
    // split hooves
    ctx.fillStyle = dark;
    [[-14, 24], [-18, 24], [9, 24], [15, 24]].forEach(([hfx, hfy]) => {
      ctx.beginPath(); ctx.ellipse(hfx, hfy, 5, 3, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = rgb([80, 58, 28].map((c) => c * d));
      ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hfx, hfy - 2); ctx.lineTo(hfx, hfy + 4); ctx.stroke();
      ctx.strokeStyle = fur; ctx.lineWidth = 5.5;
    });

    // body + belly
    ctx.fillStyle = fur;
    ctx.beginPath(); ctx.ellipse(0, -9, 18, 9.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = belly;
    ctx.beginPath(); ctx.ellipse(0, -5, 13, 6, 0, 0, TAU); ctx.fill();

    // hump
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.moveTo(-9, -17); ctx.quadraticCurveTo(-2, -34, 5, -32);
    ctx.quadraticCurveTo(13, -30, 14, -17); ctx.closePath(); ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(4, -24, 7, 4.5, -0.25, 0, TAU); ctx.fill();

    // long neck
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.moveTo(-16, -16); ctx.quadraticCurveTo(-24, -12, -28, -20);
    ctx.quadraticCurveTo(-30, -28, -28, -38); ctx.quadraticCurveTo(-24, -28, -20, -20); ctx.closePath(); ctx.fill();

    // head
    const hx = -28, hy = -40;
    ctx.fillStyle = fur;
    ctx.beginPath(); ctx.ellipse(hx, hy, 9, 7, -0.25, 0, TAU); ctx.fill();
    // drooping upper lip
    ctx.fillStyle = rgb([185, 148, 90].map((c) => c * d));
    ctx.beginPath();
    ctx.moveTo(hx - 4, hy + 3); ctx.quadraticCurveTo(hx - 12, hy + 5, hx - 14, hy + 8);
    ctx.quadraticCurveTo(hx - 12, hy + 11, hx - 8, hy + 10);
    ctx.quadraticCurveTo(hx - 5, hy + 9, hx - 3, hy + 7 - chew); ctx.fill();
    // lower jaw (moves with chew)
    ctx.fillStyle = belly;
    ctx.beginPath(); ctx.ellipse(hx - 9, hy + 8 + chew * 0.5, 4, 2, 0.1, 0, TAU); ctx.fill();
    // nostril slits
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(hx - 12, hy + 5, 1.6, 0.9, 0.3, 0, TAU); ctx.fill();

    // eye with long lashes
    ctx.fillStyle = rgb([55, 38, 15].map((c) => c * d));
    ctx.beginPath(); ctx.ellipse(hx + 3, hy - 3, 3, 2.5, 0.2, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.arc(hx + 4.5, hy - 4, 0.9, 0, TAU); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 0.9; ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      ctx.beginPath(); ctx.moveTo(hx + 1 + i, hy - 5.5); ctx.lineTo(hx + 0.5 + i, hy - 9.5); ctx.stroke();
    }

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
    if (animals.camel)  drawCamel(groundY, sky, time);
    if (animals.owl)    drawOwl(groundY, sky, time);
    if (animals.coyote) drawCoyote(groundY, sky, time);
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
