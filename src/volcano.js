// Canvas world engine for the Volcano biome.
//
// The volcano's behaviour is driven by two values (both 0–1):
//   pressure — weighted-average stress over the last 7 days
//   release  — weighted-average exercise over the last 7 days
//
// States:
//   dormant            pressure < 0.15
//   simmering          pressure 0.15–0.35
//   pressured          pressure ≥ 0.35, imbalanced (stress >> exercise)
//   releasing          moderate pressure, well balanced
//   erupting-beautiful high pressure AND high release (controlled, beautiful)
//   erupting-dangerous high pressure, low release (ominous, dangerous)

import { clockDate } from './clock.js';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const ease = (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

function rng(seed) {
  let s = seed * 9301 + 49297;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

export function createVolcano(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
  let pressure = 0, release = 0;
  let smokeP = [];
  let eruptP = [];
  let raf = 0;
  let t0 = performance.now();

  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = rect.width; H = rect.height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function setData({ pressure: p, release: r }) {
    pressure = clamp(p, 0, 1);
    release  = clamp(r, 0, 1);
  }

  // ── scene geometry ──────────────────────────────────────────────────────
  function geo() {
    const groundY    = H * 0.70;
    const peakX      = W * 0.50;
    const peakY      = H * 0.10;
    const craterHalf = W * 0.048;
    const craterY    = peakY + H * 0.022;
    return { groundY, peakX, peakY, craterHalf, craterY };
  }

  // ── eruption state ──────────────────────────────────────────────────────
  function eruptionState() {
    if (pressure < 0.15) return 'dormant';
    if (pressure < 0.35) return 'simmering';
    const balance = release / (pressure + 0.01);
    if (pressure >= 0.62) return balance >= 0.52 ? 'erupting-beautiful' : 'erupting-dangerous';
    return balance >= 0.68 ? 'releasing' : 'pressured';
  }

  // ── sky ─────────────────────────────────────────────────────────────────
  const SKY = {
    'dormant':             { top: [18, 12, 42],  mid: [55, 30, 75],   bot: [155, 80, 55]  },
    'simmering':           { top: [24, 14, 45],  mid: [90, 42, 50],   bot: [210, 100, 38] },
    'pressured':           { top: [38, 8,  8],   mid: [115, 20, 15],  bot: [210, 55, 15]  },
    'releasing':           { top: [22, 10, 55],  mid: [110, 50, 20],  bot: [240, 160, 28] },
    'erupting-beautiful':  { top: [30, 8,  65],  mid: [140, 55, 22],  bot: [255, 165, 32] },
    'erupting-dangerous':  { top: [22, 3,  3],   mid: [100, 10, 8],   bot: [195, 35, 8]   },
  };

  function drawSky(state, day, time) {
    const { groundY } = geo();
    const d = 0.28 + day * 0.72;
    const sc = SKY[state];
    const rgb = (arr) => `rgb(${arr.map((c) => (c * d) | 0).join(',')})`;
    const g = ctx.createLinearGradient(0, 0, 0, groundY);
    g.addColorStop(0,   rgb(sc.top));
    g.addColorStop(0.5, rgb(sc.mid));
    g.addColorStop(1,   rgb(sc.bot));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, groundY + 2);

    // Stars at night when calm
    if (day < 0.3 && (state === 'dormant' || state === 'simmering')) {
      const a = (0.3 - day) / 0.3;
      ctx.fillStyle = `rgba(255,255,255,${0.7 * a})`;
      for (let i = 0; i < 60; i++)
        ctx.fillRect((i * 137.5) % W, (i * 71.3) % (groundY * 0.65), 1.4, 1.4);
    }

    // Atmospheric ember glow for active states
    if (state === 'erupting-beautiful' || state === 'releasing') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 7; i++) {
        const ex = W * (0.15 + (i * 0.14) % 0.7);
        const ey = groundY * (0.1 + (i * 0.09) % 0.55);
        const er = 25 + Math.sin(time * 0.0007 + i) * 12;
        const ga = ctx.createRadialGradient(ex, ey, 0, ex, ey, er);
        ga.addColorStop(0, `rgba(255,170,40,${0.07 * Math.abs(Math.sin(time * 0.0006 + i))})`);
        ga.addColorStop(1, 'rgba(255,80,0,0)');
        ctx.fillStyle = ga;
        ctx.beginPath(); ctx.arc(ex, ey, er, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
    if (state === 'erupting-dangerous' || state === 'pressured') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const ex = W * (0.1 + (i * 0.19) % 0.8);
        const ey = groundY * (0.3 + (i * 0.11) % 0.4);
        const er = 20 + Math.sin(time * 0.0009 + i) * 8;
        const ga = ctx.createRadialGradient(ex, ey, 0, ex, ey, er);
        ga.addColorStop(0, `rgba(200,20,5,${0.05 * Math.abs(Math.sin(time * 0.0005 + i))})`);
        ga.addColorStop(1, 'rgba(180,10,0,0)');
        ctx.fillStyle = ga;
        ctx.beginPath(); ctx.arc(ex, ey, er, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  }

  // ── background ridgeline ────────────────────────────────────────────────
  function drawBackground(state, day) {
    const { groundY } = geo();
    const d = 0.18 + day * 0.3;
    const col = state === 'pressured' || state.startsWith('erupting')
      ? [45, 12, 8]
      : [30, 18, 24];
    ctx.fillStyle = `rgb(${col.map((c) => (c * d * 2) | 0).join(',')})`;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    const xs = [0, .08, .14, .22, .30, .38, .46, .54, .62, .70, .78, .86, .92, 1];
    const ys = [.65,.55,.60,.50,.56,.52,.48,.50,.54,.51,.57,.54,.60,.65];
    xs.forEach((x, i) => i === 0
      ? ctx.lineTo(W * x, groundY * ys[i])
      : ctx.lineTo(W * x, groundY * ys[i]));
    ctx.lineTo(W, groundY); ctx.closePath(); ctx.fill();
  }

  // ── ground ──────────────────────────────────────────────────────────────
  function drawGround(state, day) {
    const { groundY } = geo();
    const d = 0.3 + day * 0.5;
    const GC = {
      'dormant':            [32, 26, 20],
      'simmering':          [40, 28, 16],
      'pressured':          [52, 22, 10],
      'releasing':          [38, 27, 16],
      'erupting-beautiful': [48, 26, 8],
      'erupting-dangerous': [60, 13, 6],
    };
    const gc = (GC[state] || GC['dormant']).map((c) => c * d * 1.8);
    const gg = ctx.createLinearGradient(0, groundY, 0, H);
    gg.addColorStop(0, `rgb(${gc.map((v) => v | 0).join(',')})`);
    gg.addColorStop(1, `rgb(${gc.map((v) => (v * 0.4) | 0).join(',')})`);
    ctx.fillStyle = gg; ctx.fillRect(0, groundY, W, H - groundY);

    // Hot glow along ground edge during active eruptions
    if (state === 'erupting-beautiful' || state === 'erupting-dangerous' || state === 'pressured') {
      const glowC = state === 'erupting-beautiful' ? 'rgba(255,140,20,' : 'rgba(210,28,8,';
      const gg2 = ctx.createLinearGradient(0, groundY, 0, groundY + 90);
      gg2.addColorStop(0, glowC + '0.13)'); gg2.addColorStop(1, glowC + '0)');
      ctx.fillStyle = gg2; ctx.fillRect(0, groundY, W, 90);
    }

    drawRocks(state, day);
  }

  function drawRocks(state, day) {
    const { groundY } = geo();
    const d = 0.3 + day * 0.5;
    const r = rng(42);
    for (let i = 0; i < 20; i++) {
      const rx = r() * W;
      const ry = groundY + 6 + r() * (H - groundY - 18);
      const rw = 7 + r() * 32;
      const rh = 4 + r() * 14;
      const angle = (r() - 0.5) * 0.45;
      const c1 = r(), c2 = r(), c3 = r();
      const col = (state === 'erupting-dangerous' || state === 'pressured')
        ? [48 + c1 * 18, 10 + c2 * 8, 6 + c3 * 4].map((c) => (c * d) | 0)
        : [42 + c1 * 20, 33 + c2 * 14, 26 + c3 * 10].map((c) => (c * d) | 0);
      ctx.save();
      ctx.translate(rx, ry); ctx.rotate(angle);
      ctx.fillStyle = `rgb(${col.join(',')})`;
      ctx.beginPath(); ctx.ellipse(0, 0, rw, rh, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  // ── volcano mountain ────────────────────────────────────────────────────
  function drawVolcanoMountain(state, day, time) {
    const { groundY, peakX, craterHalf, craterY, peakY } = geo();
    const d = 0.22 + day * 0.35;
    const dangerous = state === 'erupting-dangerous' || state === 'pressured';
    const dark = dangerous
      ? [30, 8, 6].map((c) => (c * d * 2.2) | 0)
      : [20, 15, 13].map((c) => (c * d * 2.2) | 0);

    ctx.fillStyle = `rgb(${dark.join(',')})`;
    ctx.beginPath();
    ctx.moveTo(-2, groundY + 4);
    ctx.quadraticCurveTo(W * 0.16, H * 0.46, W * 0.28, H * 0.38);
    ctx.quadraticCurveTo(W * 0.37, H * 0.27, peakX - craterHalf, craterY);
    ctx.lineTo(peakX - craterHalf * 0.55, peakY - 2);
    ctx.lineTo(peakX + craterHalf * 0.55, peakY - 2);
    ctx.lineTo(peakX + craterHalf, craterY);
    ctx.quadraticCurveTo(W * 0.63, H * 0.27, W * 0.72, H * 0.38);
    ctx.quadraticCurveTo(W * 0.84, H * 0.46, W + 2, groundY + 4);
    ctx.closePath(); ctx.fill();

    // Subtle slope-edge shadow
    ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 2;
    ctx.stroke();

    // Sulfur/snow patches when dormant
    if (state === 'dormant') {
      ctx.fillStyle = `rgba(210,205,195,${0.38 * day})`;
      [[W*0.38, H*0.31, 11], [W*0.44, H*0.22, 7], [W*0.56, H*0.24, 9]].forEach(([x, y, rs]) => {
        ctx.beginPath(); ctx.ellipse(x, y, rs, rs * 0.45, -0.3, 0, TAU); ctx.fill();
      });
    }

    drawLavaChannels(state, day, time);
  }

  function drawLavaChannels(state, day, time) {
    const { peakX, craterHalf, craterY, groundY } = geo();
    const isErupting = state.startsWith('erupting') || state === 'releasing';

    const channels = [
      { sx: peakX - craterHalf * 0.6, sy: craterY + 4, cx: W * 0.31, cy: H * 0.43, ex: W * 0.20, ey: groundY },
      { sx: peakX + craterHalf * 0.6, sy: craterY + 4, cx: W * 0.69, cy: H * 0.43, ex: W * 0.80, ey: groundY },
    ];

    // Evaluate quadratic bezier at t
    function bezier(ch, t) {
      const mt = 1 - t;
      return {
        x: mt * mt * ch.sx + 2 * mt * t * ch.cx + t * t * ch.ex,
        y: mt * mt * ch.sy + 2 * mt * t * ch.cy + t * t * ch.ey,
      };
    }

    for (const ch of channels) {
      if (!isErupting) {
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(ch.sx, ch.sy);
        ctx.quadraticCurveTo(ch.cx, ch.cy, ch.ex, ch.ey); ctx.stroke();
        continue;
      }
      const beautiful = state === 'erupting-beautiful' || state === 'releasing';
      const lg = ctx.createLinearGradient(ch.sx, ch.sy, ch.ex, ch.ey);
      if (beautiful) {
        lg.addColorStop(0, 'rgba(255,225,60,0.92)');
        lg.addColorStop(0.5, 'rgba(255,100,10,0.80)');
        lg.addColorStop(1, 'rgba(180,28,4,0.45)');
      } else {
        lg.addColorStop(0, 'rgba(235,70,14,0.88)');
        lg.addColorStop(0.5, 'rgba(170,18,4,0.70)');
        lg.addColorStop(1, 'rgba(90,8,2,0.38)');
      }
      ctx.strokeStyle = lg; ctx.lineWidth = 7 + Math.sin(time * 0.003) * 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ch.sx, ch.sy);
      ctx.quadraticCurveTo(ch.cx, ch.cy, ch.ex, ch.ey); ctx.stroke();
      // bright inner core
      ctx.strokeStyle = beautiful ? 'rgba(255,248,180,0.5)' : 'rgba(255,140,30,0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ch.sx, ch.sy);
      ctx.quadraticCurveTo(ch.cx, ch.cy, ch.ex, ch.ey); ctx.stroke();

      // Animated lava drip blobs — 4 per channel staggered in phase
      const DRIPS = 4;
      const speed = beautiful ? 0.00038 : 0.00025;
      for (let d = 0; d < DRIPS; d++) {
        const phase = (time * speed + d / DRIPS) % 1;
        const { x, y } = bezier(ch, phase);
        // Colour: white-yellow at top cooling to dark red at base
        const r2 = (255) | 0;
        const g2 = beautiful
          ? ((1 - phase) * 230 + phase * 18) | 0
          : ((1 - phase) * 120 + phase * 10) | 0;
        const b2 = beautiful
          ? ((1 - phase) * 80)  | 0
          : 4;
        const alpha = 0.82 * (1 - phase * 0.55) * (beautiful ? 1 : 0.85);
        const radius = (1 - phase * 0.55) * (beautiful ? 6 : 7);

        // Glow halo
        const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 2.8);
        glow.addColorStop(0, `rgba(${r2},${g2},${b2},${alpha * 0.45})`);
        glow.addColorStop(1, `rgba(${r2},${g2 >> 1},0,0)`);
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(x, y, radius * 2.8, 0, TAU); ctx.fill();

        // Core blob
        ctx.fillStyle = `rgba(${r2},${g2},${b2},${alpha})`;
        ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.fill();
      }
    }
  }

  // ── crater ──────────────────────────────────────────────────────────────
  function drawCrater(state, day, time) {
    const { peakX, craterHalf, craterY, peakY } = geo();
    const intensity = { dormant: 0.14, simmering: 0.32, pressured: 0.52,
      releasing: 0.78, 'erupting-beautiful': 1.0, 'erupting-dangerous': 0.92 }[state] || 0.3;
    // Minimal pulse — just a gentle shimmer, not a giant growing oval
    const pulse = 1 + Math.sin(time * 0.0019) * 0.04;
    const cw = craterHalf * 2.1 * pulse;
    const ch = craterHalf * 0.65 * pulse;

    const beautiful = state === 'erupting-beautiful' || state === 'releasing';
    const glowRGB = beautiful ? [255, 200, 45] : [255, 55, 10];

    // Small local crater glow (not the giant oval)
    const gR = cw * 1.6;
    const cg = ctx.createRadialGradient(peakX, craterY, 0, peakX, craterY, gR);
    cg.addColorStop(0, `rgba(${glowRGB.join(',')},${0.55 * intensity})`);
    cg.addColorStop(0.5, `rgba(${glowRGB.join(',')},${0.2 * intensity})`);
    cg.addColorStop(1, `rgba(${glowRGB.join(',')},0)`);
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.ellipse(peakX, craterY, gR, gR * 0.5, 0, 0, TAU); ctx.fill();

    // Molten pool
    const t = (Math.sin(time * 0.0026) + 1) * 0.5;
    const ig = ctx.createRadialGradient(peakX, craterY + 2, 0, peakX, craterY, cw);
    if (beautiful) {
      ig.addColorStop(0,   `rgba(255,${(240 + t * 15) | 0},${(130 + t * 80) | 0},${0.96 * intensity})`);
      ig.addColorStop(0.45,`rgba(255,150,18,${0.88 * intensity})`);
      ig.addColorStop(1,   `rgba(170,32,4,${0.62 * intensity})`);
    } else {
      ig.addColorStop(0,   `rgba(255,${(70 + t * 45) | 0},8,${0.92 * intensity})`);
      ig.addColorStop(0.5, `rgba(195,18,4,${0.82 * intensity})`);
      ig.addColorStop(1,   `rgba(95,4,2,${0.60 * intensity})`);
    }
    ctx.fillStyle = ig;
    ctx.beginPath(); ctx.ellipse(peakX, craterY, cw, ch, 0, 0, TAU); ctx.fill();

    // Eruption fountain column — vertical light beam rising above crater
    if (state === 'erupting-beautiful' || state === 'erupting-dangerous' || state === 'releasing') {
      const flicker = 0.75 + Math.sin(time * 0.0041) * 0.18 + Math.sin(time * 0.0073) * 0.07;
      const columnH = beautiful
        ? H * (0.28 + Math.sin(time * 0.0029) * 0.06) * flicker
        : H * (0.18 + Math.sin(time * 0.0033) * 0.04) * flicker;
      const colW = cw * (beautiful ? 0.55 : 0.42);
      const topY = craterY - columnH;
      const colk = beautiful ? [255, 230, 80] : [255, 80, 15];

      const fg = ctx.createLinearGradient(peakX, craterY, peakX, topY);
      fg.addColorStop(0,   `rgba(${colk.join(',')},${0.88 * intensity * flicker})`);
      fg.addColorStop(0.3, `rgba(${colk.join(',')},${0.55 * intensity * flicker})`);
      fg.addColorStop(0.7, `rgba(${colk[0]},${colk[1] >> 1},0,${0.22 * intensity * flicker})`);
      fg.addColorStop(1,   `rgba(${colk[0]},0,0,0)`);

      // Tapered column — wide at base, narrows to point
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(peakX - colW, craterY);
      ctx.quadraticCurveTo(peakX - colW * 0.55, craterY - columnH * 0.5, peakX, topY);
      ctx.quadraticCurveTo(peakX + colW * 0.55, craterY - columnH * 0.5, peakX + colW, craterY);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // ── particles ────────────────────────────────────────────────────────────

  function spawnSmoke(state) {
    const { peakX, craterY } = geo();
    const rate = { dormant: 0.008, simmering: 0.04, pressured: 0.14,
      releasing: 0.06, 'erupting-beautiful': 0.07, 'erupting-dangerous': 0.20 }[state] || 0.02;
    if (Math.random() > rate || smokeP.length >= 55) return;
    const beautiful = state === 'erupting-beautiful' || state === 'releasing';
    const dark = state === 'pressured' || state === 'erupting-dangerous';
    const col = dark ? 'rgba(22,16,14,' : beautiful ? 'rgba(195,175,155,' : 'rgba(155,142,128,';
    smokeP.push({
      x: peakX + (Math.random() - 0.5) * 14,
      y: craterY - 4,
      vx: (Math.random() - 0.5) * 0.7,
      vy: -(1.1 + Math.random() * 1.4),
      size: 3 + Math.random() * 7,
      maxSize: 28 + Math.random() * 55,
      alpha: 0.55 + Math.random() * 0.3,
      col, age: 0,
      maxAge: 110 + Math.random() * 90,
    });
  }

  function spawnEruption(state) {
    const { peakX, craterY } = geo();
    const beautiful = state === 'erupting-beautiful' || state === 'releasing';
    const dangerous = state === 'erupting-dangerous';
    if (!beautiful && !dangerous) return;
    const rate = beautiful ? 0.48 : 0.22;
    if (Math.random() > rate || eruptP.length >= 110) return;
    if (beautiful) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.95;
      const speed = 4.5 + Math.random() * 9;
      const cols = ['rgba(255,242,75,', 'rgba(255,185,28,', 'rgba(255,115,18,', 'rgba(255,75,8,'];
      eruptP.push({
        x: peakX + (Math.random() - 0.5) * 10,
        y: craterY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity: 0.16, size: 2.2 + Math.random() * 4.5,
        alpha: 1, col: cols[Math.floor(Math.random() * cols.length)],
        trail: [], type: 'spark',
      });
    } else {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.65;
      const speed = 5 + Math.random() * 6;
      eruptP.push({
        x: peakX + (Math.random() - 0.5) * 12,
        y: craterY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity: 0.30, size: 5.5 + Math.random() * 9,
        alpha: 0.9, col: 'rgba(215,42,8,',
        trail: [], type: 'bomb',
      });
    }
  }

  function updateParticles() {
    const { groundY } = geo();
    smokeP = smokeP.filter((p) => p.age < p.maxAge);
    for (const p of smokeP) {
      p.age++; p.x += p.vx; p.y += p.vy;
      p.vy *= 0.993; p.vx += (Math.random() - 0.5) * 0.08;
      p.size = lerp(p.size, p.maxSize, 0.018);
      p.alpha = (1 - ease(p.age / p.maxAge)) * 0.48;
    }
    eruptP = eruptP.filter((p) => p.alpha > 0.02 && p.y < groundY + 25);
    for (const p of eruptP) {
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 9) p.trail.shift();
      p.x += p.vx; p.y += p.vy;
      p.vy += p.gravity; p.vx *= 0.996;
      p.alpha *= p.type === 'spark' ? 0.984 : 0.974;
      p.size  *= p.type === 'spark' ? 0.997 : 0.999;
    }
  }

  function drawSmoke() {
    for (const p of smokeP) {
      ctx.fillStyle = p.col + p.alpha + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
    }
  }

  function drawEruptionParticles() {
    for (const p of eruptP) {
      // Trail
      for (let i = 1; i < p.trail.length; i++) {
        const ta = (i / p.trail.length) * p.alpha * 0.55;
        ctx.strokeStyle = p.col + ta + ')';
        ctx.lineWidth = p.size * (i / p.trail.length) * 0.9;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.trail[i - 1].x, p.trail[i - 1].y);
        ctx.lineTo(p.trail[i].x, p.trail[i].y);
        ctx.stroke();
      }
      // Core
      ctx.fillStyle = p.col + p.alpha + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
      // Glow halo for sparks
      if (p.type === 'spark') {
        ctx.fillStyle = `rgba(255,238,180,${p.alpha * 0.28})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 2.8, 0, TAU); ctx.fill();
      }
    }
  }

  // ── frame loop ───────────────────────────────────────────────────────────

  function frame(now) {
    const time = now - t0;
    const date = clockDate();
    const h = date.getHours() + date.getMinutes() / 60;
    let day;
    if (h < 5 || h >= 21) day = 0;
    else if (h < 7)  day = (h - 5) / 2;
    else if (h < 18) day = 1;
    else             day = 1 - (h - 18) / 3;

    const state = eruptionState();
    ctx.clearRect(0, 0, W, H);

    drawSky(state, day, time);
    drawBackground(state, day);
    drawGround(state, day);
    drawVolcanoMountain(state, day, time);
    spawnSmoke(state);
    spawnEruption(state);
    updateParticles();
    drawSmoke();
    drawCrater(state, day, time);
    drawEruptionParticles();

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
