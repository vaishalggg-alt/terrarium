// Canvas world engine for the Jungle biome — a bioluminescent sleep tracker.
//
//   • The jungle is always deep night.
//   • bioluminescence level (0–1) drives how many glowing creatures appear:
//       0.00 → dark, silent jungle — a few faint stars through the canopy
//       0.25 → fireflies drift through the undergrowth
//       0.50 → glowing mushrooms, orchids, and a bioluminescent frog
//       0.75 → glowing morpho butterfly flutters through the scene
//       0.92 → a phantom jaguar with luminous markings steps out of the dark

import { clockDate } from './clock.js';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const ease = t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

function rng(seed) {
  let s = (seed * 9301 + 49297) | 0;
  return () => { s = ((s * 9301) + 49297) % 233280; return s / 233280; };
}

export function createJungle(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
  let bio = 0, hours = 0;
  let fireflies = [];
  let raf = 0;
  let t0 = performance.now();

  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = rect.width; H = rect.height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rebuildFireflies();
  }

  function rebuildFireflies() {
    const count = Math.floor(bio * 32);
    fireflies = Array.from({ length: count }, (_, i) => ({
      x: Math.random() * W,
      y: H * (0.25 + Math.random() * 0.55),
      baseY: H * (0.25 + Math.random() * 0.55),
      phase: Math.random() * TAU,
      yPhase: Math.random() * TAU,
      speed: 0.18 + Math.random() * 0.28,
      size: 1.8 + Math.random() * 2.2,
      r: Math.floor(180 + Math.random() * 75),
      g: Math.floor(230 + Math.random() * 25),
      b: Math.floor(80 + Math.random() * 80),
    }));
  }

  function setData({ bio: b, hours: h }) {
    const prevBio = bio;
    bio = b || 0; hours = h || 0;
    if (Math.abs(bio - prevBio) > 0.05) rebuildFireflies();
  }

  // ── sky & stars ─────────────────────────────────────────────────────────

  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.65);
    g.addColorStop(0, '#04060f');
    g.addColorStop(0.6, '#080e1a');
    g.addColorStop(1, '#0a1410');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // Stars visible through gaps in canopy
    ctx.fillStyle = 'rgba(220,230,255,0.7)';
    for (let i = 0; i < 55; i++) {
      const sx = (i * 137.5) % W;
      const sy = (i * 81.3) % (H * 0.38);
      const a = 0.3 + Math.sin(i * 0.7) * 0.25;
      ctx.globalAlpha = a;
      ctx.beginPath(); ctx.arc(sx, sy, 0.9 + (i % 3) * 0.4, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Pale moon
    const mx = W * 0.68, my = H * 0.12;
    const mg = ctx.createRadialGradient(mx, my, 0, mx, my, 80);
    mg.addColorStop(0, 'rgba(210,225,255,0.18)');
    mg.addColorStop(1, 'rgba(210,225,255,0)');
    ctx.fillStyle = mg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(225,235,255,0.55)';
    ctx.beginPath(); ctx.arc(mx, my, 18, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(180,195,240,0.22)';
    ctx.beginPath(); ctx.arc(mx, my, 28, 0, TAU); ctx.fill();
  }

  // ── jungle canopy layers ──────────────────────────────────────────────

  function treeProfile(x0, x1, peakY, pts, seed) {
    const r = rng(seed);
    ctx.beginPath(); ctx.moveTo(x0, H);
    ctx.lineTo(x0, peakY + r() * (H * 0.06));
    for (let i = 0; i <= pts; i++) {
      const t = i / pts;
      const x = lerp(x0, x1, t);
      const noise = (r() - 0.5) * H * 0.06;
      const arch = Math.sin(t * Math.PI) * (H * 0.12);
      ctx.lineTo(x, peakY - arch + noise);
    }
    ctx.lineTo(x1, peakY + r() * (H * 0.06));
    ctx.lineTo(x1, H);
    ctx.closePath();
  }

  function drawCanopy() {
    // Far layer — very dark blue-green silhouettes
    ctx.fillStyle = '#050d09';
    treeProfile(0, W * 0.35, H * 0.18, 12, 1);  ctx.fill();
    treeProfile(W * 0.25, W * 0.7, H * 0.12, 14, 2); ctx.fill();
    treeProfile(W * 0.55, W, H * 0.16, 12, 3);  ctx.fill();

    // Mid layer — slightly lighter
    ctx.fillStyle = '#071208';
    treeProfile(0, W * 0.42, H * 0.28, 10, 4);  ctx.fill();
    treeProfile(W * 0.3, W * 0.78, H * 0.22, 12, 5); ctx.fill();
    treeProfile(W * 0.6, W, H * 0.26, 10, 6);   ctx.fill();

    // Near canopy — darkest, most detail
    ctx.fillStyle = '#060f07';
    treeProfile(0, W * 0.32, H * 0.38, 8, 7);   ctx.fill();
    treeProfile(W * 0.2, W * 0.65, H * 0.32, 10, 8); ctx.fill();
    treeProfile(W * 0.5, W, H * 0.36, 8, 9);    ctx.fill();
  }

  // Helper: draw a single tropical leaf from base point in given direction
  function tropicalLeaf(bx, by, len, halfW, angle, fillCol, midribCol) {
    const ex = bx + Math.cos(angle) * len;
    const ey = by + Math.sin(angle) * len;
    const mx = bx + Math.cos(angle) * len * 0.48;
    const my = by + Math.sin(angle) * len * 0.48;
    const px = Math.cos(angle + Math.PI / 2) * halfW;
    const py = Math.sin(angle + Math.PI / 2) * halfW;
    ctx.fillStyle = fillCol;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.bezierCurveTo(mx + px * 0.6, my + py * 0.6, mx + px, my + py, ex, ey);
    ctx.bezierCurveTo(mx - px * 0.2, my - py * 0.2, bx + Math.cos(angle) * 8, by + Math.sin(angle) * 8, bx, by);
    ctx.fill();
    ctx.strokeStyle = midribCol; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.stroke();
    for (let v = 1; v <= 5; v++) {
      const vt = v / 6;
      const vx = lerp(bx, ex, vt), vy = lerp(by, ey, vt);
      const spread = (1 - vt) * 0.85;
      ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(vx, vy);
      ctx.lineTo(vx + px * spread, vy + py * spread); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(vx, vy);
      ctx.lineTo(vx - px * spread * 0.7, vy - py * spread * 0.7); ctx.stroke();
    }
  }

  // A ground-level fern frond: multiple leaflets along a central rachis
  function fernFrond(bx, by, len, angle, col) {
    const r = rng(bx * 7 | 0);
    ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(bx, by);
    const ex = bx + Math.cos(angle) * len, ey = by + Math.sin(angle) * len;
    ctx.quadraticCurveTo(bx + Math.cos(angle - 0.15) * len * 0.5, by + Math.sin(angle - 0.15) * len * 0.5, ex, ey);
    ctx.stroke();
    const pairs = 7;
    for (let i = 1; i <= pairs; i++) {
      const ft = i / (pairs + 1);
      const fx = lerp(bx, ex, ft), fy = lerp(by, ey, ft);
      const flen = len * 0.22 * (1 - ft * 0.5);
      const spread = 0.55;
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(fx, fy);
      ctx.lineTo(fx + Math.cos(angle + Math.PI * 0.5 - spread) * flen, fy + Math.sin(angle + Math.PI * 0.5 - spread) * flen); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(fx, fy);
      ctx.lineTo(fx + Math.cos(angle - Math.PI * 0.5 + spread) * flen, fy + Math.sin(angle - Math.PI * 0.5 + spread) * flen); ctx.stroke();
    }
  }

  function drawGround() {
    const g = ctx.createLinearGradient(0, H * 0.72, 0, H);
    g.addColorStop(0,   '#111f0d');
    g.addColorStop(0.5, '#0e1a0a');
    g.addColorStop(1,   '#090e06');
    ctx.fillStyle = g;
    ctx.fillRect(0, H * 0.72, W, H * 0.28);

    // Moonlight patches — subtle silver pools on the ground
    for (let i = 0; i < 4; i++) {
      const mx = W * (0.15 + i * 0.23);
      const my = H * (0.80 + (i % 2) * 0.06);
      const mg = ctx.createRadialGradient(mx, my, 0, mx, my, W * 0.10);
      mg.addColorStop(0, 'rgba(200,215,200,0.06)');
      mg.addColorStop(1, 'rgba(200,215,200,0)');
      ctx.fillStyle = mg; ctx.fillRect(0, 0, W, H);
    }

    // Gnarled surface roots winding across floor
    const roots = rng(20);
    for (let i = 0; i < 10; i++) {
      const rx = roots() * W;
      const ry = H * (0.74 + roots() * 0.10);
      ctx.strokeStyle = `rgba(${28 + (i * 3)},${48 + (i * 3)},${20},0.9)`;
      ctx.lineWidth = 3 + roots() * 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(rx, ry);
      ctx.bezierCurveTo(
        rx + (roots() - 0.5) * 100, ry + 14,
        rx + (roots() - 0.5) * 140, ry + 44,
        rx + (roots() - 0.5) * 80, ry + 70
      );
      ctx.stroke();
    }

    // Ground ferns spread across the floor
    const fr = rng(30);
    for (let i = 0; i < 22; i++) {
      const fx = fr() * W;
      const fy = H * (0.76 + fr() * 0.09);
      const flen = 35 + fr() * 50;
      const fangle = (fr() - 0.5) * Math.PI * 0.7 - Math.PI * 0.5;
      fernFrond(fx, fy, flen, fangle, `rgba(24,48,20,${0.7 + fr() * 0.3})`);
    }
  }

  function drawMidground() {
    // Organic tree trunks with bark texture
    const trunkDefs = [
      { xf: 0.08, tw: 22, lean:  4 },
      { xf: 0.35, tw: 28, lean: -3 },
      { xf: 0.62, tw: 24, lean:  5 },
      { xf: 0.91, tw: 20, lean: -4 },
    ];
    trunkDefs.forEach(({ xf, tw, lean }) => {
      const tx = W * xf;
      const topX = tx + lean;
      // Trunk outline — organic bezier instead of rectangle
      const tg = ctx.createLinearGradient(tx - tw, 0, tx + tw, 0);
      tg.addColorStop(0,    '#0e1c0b');
      tg.addColorStop(0.38, '#243d1e');
      tg.addColorStop(0.65, '#1c3018');
      tg.addColorStop(1,    '#0e1c0b');
      ctx.fillStyle = tg;
      ctx.beginPath();
      ctx.moveTo(tx - tw / 2, H);
      ctx.bezierCurveTo(tx - tw / 2 + lean * 0.3, H * 0.80, topX - tw / 2 - 2, H * 0.45, topX - tw / 2, H * 0.28);
      ctx.lineTo(topX + tw / 2, H * 0.28);
      ctx.bezierCurveTo(topX + tw / 2 + 2, H * 0.45, tx + tw / 2 - lean * 0.3, H * 0.80, tx + tw / 2, H);
      ctx.closePath(); ctx.fill();
      // Bark horizontal lines
      ctx.strokeStyle = '#0b1609'; ctx.lineCap = 'round';
      for (let b = 0; b < 10; b++) {
        const by2 = H * (0.32 + b * 0.07);
        const bxt = lerp(tx, topX, (by2 - H) / (H * 0.28 - H));
        ctx.lineWidth = 0.8 + (b % 3) * 0.4;
        ctx.beginPath();
        ctx.moveTo(bxt - tw / 2 + 2, by2);
        ctx.quadraticCurveTo(bxt, by2 + 1.5, bxt + tw / 2 - 2, by2 - 0.5);
        ctx.stroke();
      }
      // Moss patches on shadow side
      ctx.fillStyle = 'rgba(20,42,18,0.6)';
      for (let m = 0; m < 4; m++) {
        const my = H * (0.45 + m * 0.08);
        ctx.beginPath();
        ctx.ellipse(tx - tw * 0.28, my, 4 + m * 1.5, 3, 0.3, 0, TAU);
        ctx.fill();
      }
      // Root buttress flares spreading at ground
      ctx.fillStyle = '#172b14';
      [[-1.1, -2.5], [1.1, 2.5]].forEach(([dirX, dirY]) => {
        ctx.beginPath();
        ctx.moveTo(tx, H * 0.72);
        ctx.quadraticCurveTo(tx + dirX * tw * 1.0, H * 0.78, tx + dirX * tw * 2.2, H * 0.82);
        ctx.lineTo(tx + dirX * tw * 2.4, H * 0.85);
        ctx.quadraticCurveTo(tx + dirX * tw * 1.2, H * 0.80, tx + dirX * tw * 0.3, H * 0.75);
        ctx.closePath(); ctx.fill();
      });
    });

    // Hanging vines — thicker, more visible
    const vr = rng(88);
    for (let i = 0; i < 12; i++) {
      const vx = W * (0.05 + vr() * 0.90);
      const vlen = H * (0.30 + vr() * 0.32);
      const sway = (vr() - 0.5) * 45;
      const vw = 1.2 + vr() * 2;
      ctx.strokeStyle = `rgba(22,44,18,${0.7 + vr() * 0.3})`;
      ctx.lineWidth = vw; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(vx, 0);
      ctx.bezierCurveTo(vx + sway * 0.28, vlen * 0.32, vx + sway * 0.72, vlen * 0.68, vx + sway, vlen);
      ctx.stroke();
      // Leaf clusters at vine nodes
      ctx.fillStyle = 'rgba(20,40,16,0.85)';
      for (let j = 0; j < 3; j++) {
        const lt = 0.22 + j * 0.28;
        const lx = lerp(vx, vx + sway, lt);
        const ly = lerp(0, vlen, lt);
        ctx.beginPath(); ctx.ellipse(lx, ly, 5 + j, 3, (vr() - 0.5) * 1.2, 0, TAU); ctx.fill();
      }
    }

    // Large tropical leaves from screen edges and trunks — moonlit highlight edge
    const leafDefs = [
      { bx: -8,       by: H * 0.50, len: W * 0.24, hw: H * 0.065, angle: 0.38 },
      { bx: W * 0.12, by: H * 0.56, len: W * 0.21, hw: H * 0.055, angle: 0.16 },
      { bx: W + 8,    by: H * 0.48, len: W * 0.25, hw: H * 0.065, angle: Math.PI - 0.35 },
      { bx: W * 0.86, by: H * 0.55, len: W * 0.20, hw: H * 0.055, angle: Math.PI - 0.20 },
      { bx: W * 0.34, by: H * 0.42, len: W * 0.19, hw: H * 0.052, angle: 0.52 },
      { bx: W * 0.65, by: H * 0.44, len: W * 0.18, hw: H * 0.050, angle: Math.PI - 0.48 },
      { bx: W * 0.05, by: H * 0.66, len: W * 0.15, hw: H * 0.040, angle: 0.25 },
      { bx: W * 0.92, by: H * 0.64, len: W * 0.14, hw: H * 0.038, angle: Math.PI - 0.28 },
    ];
    leafDefs.forEach(({ bx, by, len, hw, angle }) => {
      // Dark fill first
      tropicalLeaf(bx, by, len, hw, angle, '#152818', '#111f14');
      // Moonlit edge highlight on upper surface
      tropicalLeaf(bx, by, len * 0.96, hw * 0.72, angle, 'rgba(28,52,24,0.55)', 'rgba(35,62,28,0.4)');
    });
  }

  // ── bioluminescence helpers ───────────────────────────────────────────

  function drawGlow(x, y, r, rv, gv, bv, a = 0.9) {
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${rv},${gv},${bv},${a})`);
    grad.addColorStop(0.45, `rgba(${rv},${gv},${bv},${a * 0.35})`);
    grad.addColorStop(1, `rgba(${rv},${gv},${bv},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }

  // ── mushrooms ────────────────────────────────────────────────────────

  function drawMushroomCluster(x, groundY, seed, bioT) {
    if (bioT <= 0) return;
    const r = rng(seed);
    const count = 2 + Math.floor(r() * 3);
    for (let i = 0; i < count; i++) {
      const mx = x + (r() - 0.5) * 38;
      const mh = 8 + r() * 18;
      const capW = mh * 0.9;
      const my = groundY - mh;
      const hue = r() > 0.5 ? [50, 220, 180] : [80, 180, 255]; // teal or blue
      const intensity = bioT * (0.6 + r() * 0.4);

      // Glow halo
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      drawGlow(mx, my, capW * 2.5, hue[0], hue[1], hue[2], intensity * 0.5);
      ctx.restore();

      // Stem
      ctx.fillStyle = `rgba(${hue[0] + 100},${hue[1] + 20},${hue[2] + 40},${0.6 * bioT})`;
      ctx.beginPath();
      ctx.roundRect(mx - mh * 0.12, my + mh * 0.1, mh * 0.24, mh * 0.9, 2);
      ctx.fill();

      // Cap
      ctx.fillStyle = `rgba(${hue[0]},${hue[1]},${hue[2]},${0.85 * bioT})`;
      ctx.beginPath();
      ctx.ellipse(mx, my, capW * 0.8, capW * 0.45, 0, Math.PI, 0);
      ctx.fill();

      // Spots
      ctx.fillStyle = `rgba(255,255,255,${0.55 * bioT})`;
      for (let s = 0; s < 3; s++) {
        ctx.beginPath();
        ctx.arc(mx + (r() - 0.5) * capW * 0.7, my - r() * capW * 0.3, 1.5 + r() * 2, 0, TAU);
        ctx.fill();
      }
    }
  }

  function drawMushrooms(groundY, time) {
    const t = clamp((bio - 0.15) / 0.35, 0, 1);
    if (t <= 0) return;
    const pulse = 0.85 + Math.sin(time * 0.0008) * 0.15;
    const positions = rng(77);
    for (let i = 0; i < 8; i++) {
      const mx = W * (0.05 + positions() * 0.9);
      const mgy = groundY - 2 + positions() * 16;
      drawMushroomCluster(mx, mgy, 77 + i * 13, t * pulse);
    }
  }

  // ── glowing orchids on vines ──────────────────────────────────────────

  function drawOrchid(x, y, seed, bioT) {
    if (bioT <= 0) return;
    const r = rng(seed);
    const col = r() > 0.55 ? [120, 80, 255] : [255, 80, 180]; // purple or pink
    const size = 5 + r() * 8;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    drawGlow(x, y, size * 3.5, col[0], col[1], col[2], bioT * 0.45);
    ctx.restore();

    ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${0.7 * bioT})`;
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * TAU;
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * size * 0.7, y + Math.sin(a) * size * 0.7,
        size * 0.55, size * 0.3, a, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = `rgba(255,240,180,${0.9 * bioT})`;
    ctx.beginPath(); ctx.arc(x, y, size * 0.28, 0, TAU); ctx.fill();
  }

  function drawOrchids(groundY) {
    const t = clamp((bio - 0.35) / 0.30, 0, 1);
    if (t <= 0) return;
    const r = rng(44);
    for (let i = 0; i < 12; i++) {
      const ox = W * (0.04 + r() * 0.92);
      const oy = groundY * (0.5 + r() * 0.5) - r() * 50;
      drawOrchid(ox, oy, 44 + i * 7, t);
    }
  }

  // ── fireflies ─────────────────────────────────────────────────────────

  function drawFireflies(time) {
    const t = clamp((bio - 0.25) / 0.30, 0, 1);
    if (t <= 0 || !fireflies.length) return;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const f of fireflies) {
      f.phase += f.speed * 0.011;
      const x = ((f.x + f.speed * 0.6) % W + W) % W;
      f.x = x;
      const y = f.baseY + Math.sin(f.yPhase + time * 0.0005) * 28;
      const flicker = 0.5 + Math.sin(time * 0.004 + f.phase * 6) * 0.5;
      const alpha = t * flicker * 0.92;
      if (alpha < 0.05) continue;
      drawGlow(x, y, f.size * 6, f.r, f.g, f.b, alpha * 0.55);
      ctx.fillStyle = `rgba(${f.r},${f.g},${f.b},${alpha})`;
      ctx.beginPath(); ctx.arc(x, y, f.size, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  // ── bioluminescent frog ───────────────────────────────────────────────
  // Poison-dart frog viewed from a 3/4-above angle.
  // Key anatomy: wide flat body, massive bulging eyes with horizontal slit
  // pupils, long folded hind legs with webbed toes, tympanum discs.

  function drawFrog(groundY, time) {
    const t = clamp((bio - 0.50) / 0.25, 0, 1);
    if (t <= 0) return;

    const bx = W * 0.28, by = groundY - 10;
    const sc = Math.min(1, W / 420) * 1.3;
    const bob = Math.sin(time * 0.0012) * 1.5 * t;
    const pulse = 0.75 + Math.sin(time * 0.0018) * 0.25;

    // Outer body-glow in world space (before translate/scale)
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    drawGlow(bx, by, 55, 40, 255, 140, t * pulse * 0.42);
    ctx.restore();

    ctx.save();
    ctx.translate(bx, by + bob);
    ctx.scale(sc, sc);

    const bodyDark = `rgba(6,${(28 * t) | 0},${(14 * t) | 0},${t * 0.95})`;
    const glowG    = `rgba(28,${(215 * t) | 0},${(105 * t) | 0},${t * pulse})`;
    const glowC    = `rgba(70,${(255 * t) | 0},${(195 * t) | 0},${t * pulse * 0.9})`;
    const eyeGold  = `rgba(${(255 * t) | 0},${(235 * t) | 0},${(55 * t) | 0},${t})`;

    // ── hind legs: long, folded outward — thigh + shin + webbed foot ──
    ctx.strokeStyle = bodyDark; ctx.lineWidth = 5; ctx.lineCap = 'round';
    // Left: hip → knee → ankle
    ctx.beginPath(); ctx.moveTo(-7, 2); ctx.lineTo(-19, 9); ctx.lineTo(-24, 20); ctx.stroke();
    // Right
    ctx.beginPath(); ctx.moveTo(7, 2); ctx.lineTo(19, 9); ctx.lineTo(24, 20); ctx.stroke();

    // Bioluminescent webbed feet — left
    const foot = (ax, ay, dir) => {
      const toeAngles = [-0.6, -0.18, 0.22, 0.62].map(a => a * dir);
      ctx.fillStyle = bodyDark;
      ctx.beginPath(); ctx.moveTo(ax, ay);
      toeAngles.forEach((a, i) => {
        const tl = 7 + i * 0.5;
        ctx.lineTo(ax + Math.cos(a) * tl, ay + Math.sin(Math.abs(a) * 0.5 + 0.3) * tl * 1.1);
      });
      ctx.closePath(); ctx.fill();
      // Webbing lines
      ctx.strokeStyle = glowG; ctx.lineWidth = 1.1;
      toeAngles.forEach(a => {
        const tl = 6 + Math.random() * 0.5;
        ctx.beginPath(); ctx.moveTo(ax, ay);
        ctx.lineTo(ax + Math.cos(a) * tl, ay + Math.sin(Math.abs(a) * 0.5 + 0.3) * tl * 1.1);
        ctx.stroke();
      });
    };
    foot(-24, 20, -1);
    foot( 24, 20,  1);

    // ── body: wide flat oval, viewed from slight above ─────────────────
    ctx.fillStyle = bodyDark;
    ctx.beginPath(); ctx.ellipse(0, 0, 15, 10, 0, 0, TAU); ctx.fill();

    // Dorsal stripe pattern (two bold stripes the length of the body)
    ctx.strokeStyle = glowG; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-5.5, -9); ctx.lineTo(-5.5,  7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo( 5.5, -9); ctx.lineTo( 5.5,  7); ctx.stroke();
    // Lateral flank spots
    ctx.fillStyle = glowC;
    [[-12, -2], [-12, 3], [-12, 7], [12, -2], [12, 3], [12, 7]].forEach(([sx, sy]) => {
      ctx.beginPath(); ctx.arc(sx, sy, 2.1, 0, TAU); ctx.fill();
    });

    // ── front legs: short, angled forward ─────────────────────────────
    ctx.strokeStyle = bodyDark; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-9, -5); ctx.lineTo(-16, -1); ctx.lineTo(-19, 5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo( 9, -5); ctx.lineTo( 16, -1); ctx.lineTo( 19, 5); ctx.stroke();
    // Front toe tips
    ctx.strokeStyle = glowG; ctx.lineWidth = 1;
    [[-20, 4], [-18, 6], [-16, 7]].forEach(([tx, ty]) => {
      ctx.beginPath(); ctx.moveTo(-19, 5); ctx.lineTo(tx, ty); ctx.stroke();
    });
    [[20, 4], [18, 6], [16, 7]].forEach(([tx, ty]) => {
      ctx.beginPath(); ctx.moveTo(19, 5); ctx.lineTo(tx, ty); ctx.stroke();
    });

    // ── head: wide, blunt snout ────────────────────────────────────────
    ctx.fillStyle = bodyDark;
    ctx.beginPath();
    ctx.moveTo(-11, -8);
    ctx.quadraticCurveTo(-15, -15, -9, -20);
    ctx.quadraticCurveTo(0, -23, 9, -20);
    ctx.quadraticCurveTo(15, -15, 11, -8);
    ctx.closePath(); ctx.fill();

    // Head dorsal stripe continues
    ctx.strokeStyle = glowG; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(0, -21); ctx.stroke();

    // ── tympanum: characteristic round disc behind each eye ───────────
    ctx.fillStyle = `rgba(5,${(22 * t) | 0},${(10 * t) | 0},${t})`;
    ctx.beginPath(); ctx.arc(-10, -11, 3.8, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc( 10, -11, 3.8, 0, TAU); ctx.fill();
    ctx.strokeStyle = glowC; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(-10, -11, 3.8, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc( 10, -11, 3.8, 0, TAU); ctx.stroke();

    // ── eyes: large protruding domes — the most frog-defining feature ─
    // Dark dome base
    ctx.fillStyle = bodyDark;
    ctx.beginPath(); ctx.arc(-8.5, -19, 6.5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc( 8.5, -19, 6.5, 0, TAU); ctx.fill();
    // Golden iris
    ctx.fillStyle = eyeGold;
    ctx.beginPath(); ctx.arc(-8.5, -19, 5.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc( 8.5, -19, 5.2, 0, TAU); ctx.fill();
    // Horizontal bar pupil (hallmark of tree/dart frogs)
    ctx.fillStyle = 'rgba(0,0,0,0.95)';
    ctx.beginPath(); ctx.ellipse(-8.5, -19, 5.2, 1.6, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse( 8.5, -19, 5.2, 1.6, 0, 0, TAU); ctx.fill();
    // Upper eyelid ridge
    ctx.strokeStyle = `rgba(${(50*t)|0},${(30*t)|0},${(15*t)|0},${t * 0.6})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(-8.5, -19, 5.5, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.beginPath(); ctx.arc( 8.5, -19, 5.5, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    // Eye shine
    ctx.fillStyle = `rgba(255,255,255,${0.78 * t})`;
    ctx.beginPath(); ctx.arc(-6.8, -21, 1.3, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(10.2, -21, 1.3, 0, TAU); ctx.fill();

    // Nostril dots
    ctx.fillStyle = glowG;
    ctx.beginPath(); ctx.arc(-3.5, -21, 1.1, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc( 3.5, -21, 1.1, 0, TAU); ctx.fill();

    ctx.restore();
  }

  // ── morpho butterfly ──────────────────────────────────────────────────

  function drawButterfly(time) {
    const t = clamp((bio - 0.75) / 0.20, 0, 1);
    if (t <= 0) return;

    // Gentle figure-8 flight path
    const bx = W * 0.6 + Math.sin(time * 0.0005) * W * 0.18;
    const by = H * 0.42 + Math.sin(time * 0.001) * H * 0.08;
    const flapT = Math.sin(time * 0.008);
    const wingSY = 0.25 + Math.abs(flapT) * 0.75; // flap
    const pulse = 0.7 + Math.sin(time * 0.002) * 0.3;
    const sc = Math.min(1, W / 420) * 1.2;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    drawGlow(bx, by, 42, 80, 160, 255, t * pulse * 0.5);
    ctx.restore();

    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(sc, sc * wingSY);

    const wing = `rgba(40,${(140 * t) | 0},255,${t * 0.85})`;
    const vein = `rgba(100,200,255,${t * 0.6})`;
    const spot = `rgba(200,240,255,${t * pulse})`;

    // Upper wings
    ctx.fillStyle = wing;
    ctx.beginPath(); ctx.ellipse(-14, -8, 18, 13, -0.5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(14, -8, 18, 13, 0.5, 0, TAU); ctx.fill();
    // Lower wings
    ctx.beginPath(); ctx.ellipse(-12, 6, 12, 8, 0.4, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(12, 6, 12, 8, -0.4, 0, TAU); ctx.fill();
    // Veins
    ctx.strokeStyle = vein; ctx.lineWidth = 0.8;
    [[-14, -8, -26, -4], [-14, -8, -10, -18], [14, -8, 26, -4], [14, -8, 10, -18]].forEach(([x1,y1,x2,y2]) => {
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    });
    // Spots
    ctx.fillStyle = spot;
    [[-16,-10],[-10,-16],[16,-10],[10,-16],[-18,2],[18,2]].forEach(([sx,sy]) => {
      ctx.beginPath(); ctx.arc(sx, sy, 2.5, 0, TAU); ctx.fill();
    });
    // Body
    ctx.fillStyle = `rgba(60,80,120,${t})`;
    ctx.beginPath(); ctx.ellipse(0, 0, 2.5, 14, 0, 0, TAU); ctx.fill();
    // Antennae
    ctx.strokeStyle = vein; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-1, -12); ctx.lineTo(-8, -24); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(1, -12);  ctx.lineTo(8, -24);  ctx.stroke();
    ctx.fillStyle = spot;
    ctx.beginPath(); ctx.arc(-8, -24, 2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(8, -24, 2, 0, TAU); ctx.fill();

    ctx.restore();
  }

  // ── phantom jaguar ────────────────────────────────────────────────────
  // Key anatomy: jaguars have the largest, roundest head of any big cat —
  // nearly a perfect circle in profile. The muzzle barely protrudes.
  // Ears are small and rounded (not tall/pointy like a fox).
  // Body is a deep barrel with very short legs.

  function drawJaguar(groundY, time) {
    const t = clamp((bio - 0.92) / 0.08, 0, 1);
    if (t <= 0) return;

    const bx = W * 0.72;
    const by = groundY + 2;
    const sc = Math.min(1, W / 420) * 2.6;
    const breathe = Math.sin(time * 0.0008) * 2;
    const pulse = 0.6 + Math.sin(time * 0.0015) * 0.4;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    drawGlow(bx, by - 20, 55, 80, 220, 255, t * pulse * 0.45);
    ctx.restore();

    ctx.save();
    ctx.translate(bx, by + breathe);
    ctx.scale(sc, sc);

    const silhouette = `rgba(12,22,18,${t * 0.85})`;
    const glow = `rgba(50,${(200 * t) | 0},${(220 * t) | 0},${t * pulse})`;
    const eyeGlow = `rgba(80,255,200,${t})`;

    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // Tail — arcs up behind haunches
    ctx.strokeStyle = silhouette; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(22, -18);
    ctx.bezierCurveTo(38, -10, 44, 4, 34, 14);
    ctx.bezierCurveTo(28, 20, 20, 16, 22, 8); ctx.stroke();

    // Legs — four strokes, back pair slightly behind
    ctx.strokeStyle = silhouette; ctx.lineWidth = 6;
    [[14,-6,16,12],[8,-6,10,12],[-4,-4,-2,12],[-10,-4,-12,12]].forEach(([x1,y1,x2,y2]) => {
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    });
    // Paws
    ctx.fillStyle = silhouette;
    ctx.beginPath(); ctx.ellipse(13, 13, 5, 2.5, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-7, 13, 5, 2.5, 0, 0, TAU); ctx.fill();

    // Body — long lean ellipse tilted slightly, haunches higher than chest
    ctx.fillStyle = silhouette;
    ctx.beginPath(); ctx.ellipse(4, -14, 26, 12, -0.12, 0, TAU); ctx.fill();

    // Neck — connects body to head, thicker ellipse
    ctx.beginPath(); ctx.ellipse(-26, -20, 9, 7, -0.25, 0, TAU); ctx.fill();

    // Head — large circle, offset left and slightly up
    ctx.beginPath(); ctx.arc(-36, -26, 13, 0, TAU); ctx.fill();

    // Ears — proper triangles with a slight curve, medium sized
    ctx.beginPath();
    ctx.moveTo(-25, -37); ctx.lineTo(-22, -47); ctx.lineTo(-31, -44);
    ctx.bezierCurveTo(-32, -42, -29, -39, -25, -37); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-39, -36); ctx.lineTo(-37, -46); ctx.lineTo(-46, -43);
    ctx.bezierCurveTo(-47, -41, -43, -38, -39, -36); ctx.closePath(); ctx.fill();

    // Bioluminescent rosette markings
    const markings = rng(99);
    [[2,-18],[10,-14],[18,-10],[20,-22],[10,-6],[0,-10],[14,-26],[-2,-6]].forEach(([mx,my]) => {
      const ms = 2.5 + markings() * 2;
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(mx, my, ms, 0, TAU); ctx.fill();
      ctx.strokeStyle = glow; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.arc(mx, my, ms * 1.8, 0, TAU); ctx.stroke();
    });
    // Head spots
    [[-30,-22],[-38,-28],[-42,-22],[-34,-30]].forEach(([mx,my]) => {
      ctx.strokeStyle = glow; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.arc(mx, my, 2, 0, TAU); ctx.stroke();
    });

    // Glowing eyes
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    drawGlow(-30, -28, 16, 80, 255, 200, t * pulse * 0.7);
    drawGlow(-40, -28, 16, 80, 255, 200, t * pulse * 0.7);
    ctx.restore();
    ctx.fillStyle = eyeGlow;
    ctx.beginPath(); ctx.ellipse(-30, -28, 3.5, 2.5, 0.1, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-40, -28, 3.5, 2.5, 0.1, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.95)';
    ctx.beginPath(); ctx.ellipse(-30, -28, 1.2, 2.5, 0.1, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-40, -28, 1.2, 2.5, 0.1, 0, TAU); ctx.fill();

    ctx.restore();
  }

  // ── ambient jungle glow ───────────────────────────────────────────────

  function drawAmbientGlow(groundY) {
    if (bio <= 0.05) return;
    const t = clamp(bio / 0.6, 0, 1);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    // Ground-level bio-fog
    const fogG = ctx.createLinearGradient(0, groundY - 30, 0, groundY + 80);
    fogG.addColorStop(0, `rgba(20,80,50,0)`);
    fogG.addColorStop(0.4, `rgba(20,80,50,${t * 0.12})`);
    fogG.addColorStop(1, `rgba(20,80,50,0)`);
    ctx.fillStyle = fogG;
    ctx.fillRect(0, groundY - 30, W, 110);
    ctx.restore();
  }

  // ── frame loop ────────────────────────────────────────────────────────

  function frame(now) {
    const time = now - t0;
    const groundY = H * 0.74;

    drawSky();
    drawCanopy();
    drawGround();
    drawMidground();

    // Bioluminescent layers
    drawAmbientGlow(groundY);
    drawMushrooms(groundY, time);
    drawOrchids(groundY);
    drawFireflies(time);
    drawFrog(groundY, time);
    drawButterfly(time);
    drawJaguar(groundY, time);

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
