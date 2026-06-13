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

  // Multi-colour palette matching the photo: red, teal-green, blue, purple, pink
  const FIREFLY_PALETTES = [
    [255, 60,  60],   // red
    [50,  255, 180],  // teal-green
    [80,  160, 255],  // blue
    [180, 80,  255],  // purple
    [255, 80,  200],  // pink
    [60,  255, 120],  // bright green
  ];

  function rebuildFireflies() {
    const count = Math.floor(bio * 48);
    fireflies = Array.from({ length: count }, (_, i) => {
      const pal = FIREFLY_PALETTES[i % FIREFLY_PALETTES.length];
      return {
        x: Math.random() * W,
        y: H * (0.12 + Math.random() * 0.72),
        baseY: H * (0.12 + Math.random() * 0.72),
        phase: Math.random() * TAU,
        yPhase: Math.random() * TAU,
        speed: 0.12 + Math.random() * 0.22,
        size: 1.5 + Math.random() * 2.5,
        r: pal[0], g: pal[1], b: pal[2],
      };
    });
  }

  function setData({ bio: b, hours: h }) {
    const prevBio = bio;
    bio = b || 0; hours = h || 0;
    if (Math.abs(bio - prevBio) > 0.05) rebuildFireflies();
  }

  // ── sky & stars ─────────────────────────────────────────────────────────

  function drawSky() {
    // Deep blue-indigo-purple background like the photo
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0,   '#04030e');
    g.addColorStop(0.4, '#08051a');
    g.addColorStop(0.75,'#0a0820');
    g.addColorStop(1,   '#070614');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // Scattered coloured light particles across the whole scene (like the photo)
    const palettes = [[255,60,60],[50,255,180],[80,160,255],[180,80,255],[255,80,200],[60,255,120]];
    for (let i = 0; i < 80; i++) {
      const sx = (i * 137.5 + 30) % W;
      const sy = (i * 93.7 + 15) % (H * 0.82);
      const pal = palettes[i % palettes.length];
      ctx.globalAlpha = 0.25 + Math.sin(i * 0.9) * 0.18;
      ctx.fillStyle = `rgb(${pal[0]},${pal[1]},${pal[2]})`;
      ctx.beginPath(); ctx.arc(sx, sy, 0.8 + (i % 3) * 0.5, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Pale moon
    const mx = W * 0.68, my = H * 0.10;
    const mg = ctx.createRadialGradient(mx, my, 0, mx, my, 70);
    mg.addColorStop(0, 'rgba(200,215,255,0.15)');
    mg.addColorStop(1, 'rgba(200,215,255,0)');
    ctx.fillStyle = mg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(215,225,255,0.45)';
    ctx.beginPath(); ctx.arc(mx, my, 16, 0, TAU); ctx.fill();
  }

  // ── tree fern structure — tall straight trunks + pergola + fern crowns ──

  // The trunk X positions shared between drawTrunks and drawFernCrowns
  function trunkPositions() {
    return [
      // Deepest bg row — very thin, high up
      { xf: 0.11, tw:  9, topY: 0.08, scale: 0.50 },
      { xf: 0.28, tw:  9, topY: 0.09, scale: 0.50 },
      { xf: 0.50, tw:  9, topY: 0.07, scale: 0.50 },
      { xf: 0.72, tw:  9, topY: 0.09, scale: 0.50 },
      { xf: 0.89, tw:  9, topY: 0.08, scale: 0.50 },
      // Mid bg row
      { xf: 0.04, tw: 14, topY: 0.04, scale: 0.72 },
      { xf: 0.20, tw: 14, topY: 0.05, scale: 0.72 },
      { xf: 0.40, tw: 14, topY: 0.04, scale: 0.72 },
      { xf: 0.60, tw: 14, topY: 0.04, scale: 0.72 },
      { xf: 0.80, tw: 14, topY: 0.05, scale: 0.72 },
      { xf: 0.96, tw: 14, topY: 0.04, scale: 0.72 },
      // Foreground row — thick, tallest
      { xf: 0.13, tw: 20, topY: 0.02, scale: 0.92 },
      { xf: 0.38, tw: 24, topY: 0.01, scale: 1.00 },
      { xf: 0.62, tw: 24, topY: 0.01, scale: 1.00 },
      { xf: 0.87, tw: 20, topY: 0.02, scale: 0.92 },
    ];
  }

  // Draw a single fern frond radiating from crown point (cx,cy)
  function fernFrondFromCrown(cx, cy, len, angle, col) {
    const steps = 10;
    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    const ex = cx + Math.cos(angle) * len;
    const ey = cy + Math.sin(angle) * len;
    const cpx = cx + Math.cos(angle - 0.3) * len * 0.55;
    const cpy = cy + Math.sin(angle - 0.3) * len * 0.55;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.quadraticCurveTo(cpx, cpy, ex, ey); ctx.stroke();
    // Pinnae (leaflets) along rachis
    for (let i = 2; i < steps; i++) {
      const t = i / steps;
      const px = cx + (cpx - cx) * 2 * t * (1 - t) + ex * t * t;
      const py = cy + (cpy - cy) * 2 * t * (1 - t) + ey * t * t;
      const plen = len * 0.18 * (1 - t * 0.6);
      const pAngle = angle + Math.PI * 0.5;
      ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(pAngle) * plen, py + Math.sin(pAngle) * plen); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px, py);
      ctx.lineTo(px - Math.cos(pAngle) * plen * 0.7, py - Math.sin(pAngle) * plen * 0.7); ctx.stroke();
    }
  }

  function drawTrunksAndPergola() {
    const trunks = trunkPositions();
    const groundY = H * 0.74;

    // ── pergola beams connecting trunk tops ──
    // Longitudinal beam running left to right across top
    const beamY = H * 0.10;
    const beamH = H * 0.022;
    const tg2 = ctx.createLinearGradient(0, beamY, 0, beamY + beamH);
    tg2.addColorStop(0, '#1e1848');
    tg2.addColorStop(1, '#0c0a22');
    ctx.fillStyle = tg2;
    ctx.beginPath();
    ctx.roundRect(W * 0.03, beamY, W * 0.94, beamH, 2);
    ctx.fill();
    // Cross beams between each pair of trunks
    trunks.forEach(tr => {
      const tx = W * tr.xf;
      const topY = H * tr.topY;
      const bw = tr.tw * 0.9;
      ctx.fillStyle = '#0c0a22';
      ctx.beginPath();
      ctx.roundRect(tx - bw / 2, topY - H * 0.005, bw, beamY - topY + beamH + H * 0.005, 1);
      ctx.fill();
    });

    // ── trunks ──
    trunks.forEach(({ xf, tw, topY: topYf, scale }) => {
      const tx = W * xf;
      const topY = H * topYf;
      const r2 = rng((xf * 100) | 0);

      // Cylinder shading gradient
      const tg = ctx.createLinearGradient(tx - tw, 0, tx + tw, 0);
      tg.addColorStop(0,    '#080620');
      tg.addColorStop(0.25, '#1a1645');
      tg.addColorStop(0.5,  '#221e56');
      tg.addColorStop(0.75, '#1a1645');
      tg.addColorStop(1,    '#080620');
      ctx.fillStyle = tg;
      ctx.beginPath();
      ctx.moveTo(tx - tw / 2, groundY + 4);
      ctx.lineTo(tx - tw / 2, topY);
      ctx.lineTo(tx + tw / 2, topY);
      ctx.lineTo(tx + tw / 2, groundY + 4);
      ctx.closePath(); ctx.fill();

      // Horizontal ring marks on trunk (tree fern characteristic)
      ctx.strokeStyle = 'rgba(8,6,28,0.7)'; ctx.lineCap = 'round';
      const rings = Math.floor((groundY - topY) / (H * 0.055));
      for (let b = 0; b < rings; b++) {
        const by2 = topY + (groundY - topY) * (b / rings);
        ctx.lineWidth = 0.7 + (b % 3) * 0.3;
        ctx.beginPath();
        ctx.moveTo(tx - tw / 2 + 2, by2);
        ctx.quadraticCurveTo(tx, by2 + 1.5, tx + tw / 2 - 2, by2 - 0.5);
        ctx.stroke();
      }

      // Elliptical trunk top cap
      const capG = ctx.createRadialGradient(tx, topY, 0, tx, topY, tw * 0.7);
      capG.addColorStop(0, '#2a2460');
      capG.addColorStop(1, '#0c0a22');
      ctx.fillStyle = capG;
      ctx.beginPath(); ctx.ellipse(tx, topY, tw / 2, tw * 0.22, 0, 0, TAU); ctx.fill();

      // Root base — slight flare at ground
      const tg3 = ctx.createLinearGradient(tx - tw * 1.5, 0, tx + tw * 1.5, 0);
      tg3.addColorStop(0, 'rgba(8,6,28,0)');
      tg3.addColorStop(0.5, 'rgba(26,22,68,0.7)');
      tg3.addColorStop(1, 'rgba(8,6,28,0)');
      ctx.fillStyle = tg3;
      ctx.beginPath();
      ctx.moveTo(tx - tw * 1.4, groundY + 2);
      ctx.bezierCurveTo(tx - tw * 0.8, groundY - H * 0.02, tx - tw / 2, groundY - H * 0.05, tx - tw / 2, H * topYf + H * 0.05);
      ctx.lineTo(tx + tw / 2, H * topYf + H * 0.05);
      ctx.bezierCurveTo(tx + tw / 2, groundY - H * 0.05, tx + tw * 0.8, groundY - H * 0.02, tx + tw * 1.4, groundY + 2);
      ctx.closePath(); ctx.fill();
    });
  }

  function drawFernCrowns() {
    const trunks = trunkPositions();
    trunks.forEach(({ xf, tw, topY: topYf, scale }) => {
      const tx = W * xf;
      const crownY = H * topYf;
      const frondLen = W * 0.14 * scale;
      const col = `rgba(8,6,26,0.92)`;
      const colMid = `rgba(14,10,38,0.85)`;
      // Radiate ~12 fronds from the crown in a full fan
      const count = 11;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * TAU - TAU * 0.08;
        // Only draw fronds going upward and sideways (skip straight down into trunk)
        if (a > Math.PI * 0.15 && a < Math.PI * 0.85) continue;
        const len = frondLen * (0.65 + Math.sin(i * 1.3) * 0.30);
        fernFrondFromCrown(tx, crownY, len, a, col);
      }
      // Shorter inner fronds for density
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU * 0.7 - Math.PI * 0.35 - Math.PI * 0.5;
        fernFrondFromCrown(tx, crownY, frondLen * 0.45, a, colMid);
      }
    });
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
    // Dark ground with deep blue-purple undertone
    const g = ctx.createLinearGradient(0, H * 0.72, 0, H);
    g.addColorStop(0,   '#0c0a1e');
    g.addColorStop(0.5, '#090818');
    g.addColorStop(1,   '#060510');
    ctx.fillStyle = g;
    ctx.fillRect(0, H * 0.72, W, H * 0.28);

    // Teal-green ground glow from below — key feature of the photo
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 5; i++) {
      const px = W * (0.10 + i * 0.20);
      const py = H * 0.82;
      const pg = ctx.createRadialGradient(px, py, 0, px, py, W * 0.18);
      pg.addColorStop(0, `rgba(30,200,120,0.10)`);
      pg.addColorStop(1, `rgba(30,200,120,0)`);
      ctx.fillStyle = pg; ctx.fillRect(0, 0, W, H);
    }
    // Purple path edge glow (right side like the photo)
    const pathGlow = ctx.createLinearGradient(W * 0.55, H * 0.72, W * 0.58, H);
    pathGlow.addColorStop(0, 'rgba(140,60,255,0.08)');
    pathGlow.addColorStop(1, 'rgba(140,60,255,0)');
    ctx.fillStyle = pathGlow; ctx.fillRect(W * 0.52, H * 0.72, W * 0.48, H * 0.28);
    ctx.restore();

    // Subtle path running through the center-right
    const pg2 = ctx.createLinearGradient(0, H * 0.74, 0, H);
    pg2.addColorStop(0, 'rgba(12,10,28,0)');
    pg2.addColorStop(0.5, 'rgba(12,10,28,0.4)');
    pg2.addColorStop(1, 'rgba(12,10,28,0)');
    ctx.fillStyle = pg2;
    ctx.beginPath();
    ctx.moveTo(W * 0.42, H * 0.74);
    ctx.bezierCurveTo(W * 0.44, H * 0.82, W * 0.46, H * 0.90, W * 0.44, H);
    ctx.lineTo(W * 0.72, H);
    ctx.bezierCurveTo(W * 0.68, H * 0.90, W * 0.64, H * 0.82, W * 0.62, H * 0.74);
    ctx.closePath(); ctx.fill();

    // Gnarled surface roots
    const roots = rng(20);
    for (let i = 0; i < 10; i++) {
      const rx = roots() * W;
      const ry = H * (0.74 + roots() * 0.10);
      ctx.strokeStyle = `rgba(${18 + (i * 2)},${15 + (i * 2)},${38 + (i * 4)},0.9)`;
      ctx.lineWidth = 3 + roots() * 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(rx, ry);
      ctx.bezierCurveTo(
        rx + (roots() - 0.5) * 100, ry + 14,
        rx + (roots() - 0.5) * 140, ry + 44,
        rx + (roots() - 0.5) * 80, ry + 70
      );
      ctx.stroke();
    }

    // Ground ferns — dark blue-green
    const fr = rng(30);
    for (let i = 0; i < 22; i++) {
      const fx = fr() * W;
      const fy = H * (0.76 + fr() * 0.09);
      const flen = 35 + fr() * 50;
      const fangle = (fr() - 0.5) * Math.PI * 0.7 - Math.PI * 0.5;
      fernFrond(fx, fy, flen, fangle, `rgba(16,32,52,${0.7 + fr() * 0.3})`);
    }

    // Purple/pink dots along path edge — string lights like the photo
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 14; i++) {
      const lx = W * (0.56 + (i % 3) * 0.02 - 0.01);
      const ly = H * (0.76 + i * 0.016);
      const pal = i % 2 === 0 ? [200,80,255] : [255,80,200];
      const lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, 8);
      lg.addColorStop(0, `rgba(${pal[0]},${pal[1]},${pal[2]},0.9)`);
      lg.addColorStop(1, `rgba(${pal[0]},${pal[1]},${pal[2]},0)`);
      ctx.fillStyle = lg;
      ctx.beginPath(); ctx.arc(lx, ly, 8, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(${pal[0]},${pal[1]},${pal[2]},0.95)`;
      ctx.beginPath(); ctx.arc(lx, ly, 1.5, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawForeground() {
    // Hanging vines from pergola/canopy
    const vr = rng(88);
    for (let i = 0; i < 10; i++) {
      const vx = W * (0.05 + vr() * 0.90);
      const vlen = H * (0.18 + vr() * 0.28);
      const sway = (vr() - 0.5) * 35;
      ctx.strokeStyle = `rgba(18,14,42,${0.6 + vr() * 0.35})`;
      ctx.lineWidth = 1.2 + vr() * 1.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(vx, H * 0.10);
      ctx.bezierCurveTo(vx + sway * 0.28, H * 0.22, vx + sway * 0.7, H * 0.30, vx + sway, H * 0.10 + vlen);
      ctx.stroke();
    }

    // Large tropical leaves framing the sides
    const leafDefs = [
      { bx: -8,       by: H * 0.50, len: W * 0.26, hw: H * 0.070, angle: 0.38 },
      { bx: W * 0.10, by: H * 0.57, len: W * 0.22, hw: H * 0.058, angle: 0.18 },
      { bx: W + 8,    by: H * 0.48, len: W * 0.27, hw: H * 0.070, angle: Math.PI - 0.35 },
      { bx: W * 0.90, by: H * 0.55, len: W * 0.22, hw: H * 0.058, angle: Math.PI - 0.20 },
      { bx: -8,       by: H * 0.68, len: W * 0.18, hw: H * 0.045, angle: 0.22 },
      { bx: W + 8,    by: H * 0.66, len: W * 0.18, hw: H * 0.045, angle: Math.PI - 0.24 },
    ];
    leafDefs.forEach(({ bx, by, len, hw, angle }) => {
      tropicalLeaf(bx, by, len, hw, angle, '#0a0820', '#0e0c2c');
      tropicalLeaf(bx, by, len * 0.96, hw * 0.72, angle, 'rgba(18,14,55,0.55)', 'rgba(28,22,72,0.40)');
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
    const t = bio >= 0.25 ? 1 : 0;
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
    const t = bio >= 0.44 ? 1 : 0;
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
    const t = bio >= 0.35 ? 1 : 0;
    if (t <= 0 || !fireflies.length) return;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const f of fireflies) {
      f.phase += f.speed * 0.011;
      const x = ((f.x + f.speed * 0.6) % W + W) % W;
      f.x = x;
      const y = f.baseY + Math.sin(f.yPhase + time * 0.0005) * 30;
      const flicker = 0.55 + Math.sin(time * 0.004 + f.phase * 6) * 0.45;
      const alpha = t * flicker;
      if (alpha < 0.05) continue;
      // Larger, more vivid glow to match the photo's scattered lights
      drawGlow(x, y, f.size * 9, f.r, f.g, f.b, alpha * 0.65);
      ctx.fillStyle = `rgba(${f.r},${f.g},${f.b},${alpha})`;
      ctx.beginPath(); ctx.arc(x, y, f.size * 1.2, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  // ── bioluminescent frog ───────────────────────────────────────────────
  // Poison-dart frog viewed from a 3/4-above angle.
  // Key anatomy: wide flat body, massive bulging eyes with horizontal slit
  // pupils, long folded hind legs with webbed toes, tympanum discs.

  function drawFrog(groundY, time) {
    const t = bio >= 0.53 ? 1 : 0;
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
    const t = bio >= 0.62 ? 1 : 0;
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
    const t = bio >= 0.70 ? 1 : 0;
    if (t <= 0) return;

    const bx = W * 0.72;
    const by = groundY + 2;
    const sc = Math.min(1, W / 420) * 2.6;
    const breathe = Math.sin(time * 0.0008) * 2;
    const pulse = 0.6 + Math.sin(time * 0.0015) * 0.4;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    drawGlow(bx, by - 20, 70, 80, 220, 255, t * pulse * 0.75);
    ctx.restore();

    ctx.save();
    ctx.translate(bx, by + breathe);
    ctx.scale(sc, sc);

    const silhouette = `rgba(12,22,18,${t * 0.97})`;
    const glow = `rgba(50,${(200 * t) | 0},${(220 * t) | 0},${t * Math.max(pulse, 0.85)})`;
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

    // Ears — base on skull top, tip pointing up
    ctx.beginPath();
    ctx.moveTo(-24, -38); ctx.lineTo(-31, -38); ctx.lineTo(-27, -50);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-38, -38); ctx.lineTo(-45, -38); ctx.lineTo(-42, -50);
    ctx.closePath(); ctx.fill();

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
    drawGlow(-30, -28, 18, 80, 255, 200, t * Math.max(pulse, 0.8) * 0.95);
    drawGlow(-40, -28, 18, 80, 255, 200, t * Math.max(pulse, 0.8) * 0.95);
    ctx.restore();
    ctx.fillStyle = eyeGlow;
    ctx.beginPath(); ctx.ellipse(-30, -28, 3.5, 2.5, 0.1, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-40, -28, 3.5, 2.5, 0.1, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.95)';
    ctx.beginPath(); ctx.ellipse(-30, -28, 1.2, 2.5, 0.1, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-40, -28, 1.2, 2.5, 0.1, 0, TAU); ctx.fill();

    ctx.restore();
  }

  // ── bioluminescent serpent — coiled, static ───────────────────────────

  function drawSerpent(groundY, time) {
    const t = bio >= 0.78 ? 1 : 0;
    if (t <= 0) return;

    const cx = W * 0.68, cy = groundY - 10;
    const pulse = 0.70 + Math.sin(time * 0.0014) * 0.30;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    drawGlow(cx, cy, 38, 30, 220, 130, t * pulse * 0.45);
    ctx.restore();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // Coil — 3 concentric arcs drawn as thick strokes to fake a spiral
    // Outer coil
    ctx.strokeStyle = `rgba(8,6,22,${t * 0.95})`;
    ctx.lineWidth = 11;
    ctx.beginPath(); ctx.arc(0, 4, 22, Math.PI * 0.1, Math.PI * 1.85); ctx.stroke();

    // Middle coil (slightly inset)
    ctx.lineWidth = 9;
    ctx.beginPath(); ctx.arc(2, 0, 13, Math.PI * 1.0, Math.PI * 2.7); ctx.stroke();

    // Inner coil
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(1, 2, 5, Math.PI * 0.5, Math.PI * 2.4); ctx.stroke();

    // Glowing scale rows on each coil — dots along the arcs
    const scaleRow = (rx, ry, r, startA, endA, count) => {
      for (let i = 0; i <= count; i++) {
        const a = startA + (endA - startA) * (i / count);
        const sx = rx + Math.cos(a) * r;
        const sy = ry + Math.sin(a) * r;
        const hue = i % 2 === 0 ? [30, 255, 140] : [80, 220, 255];
        ctx.fillStyle = `rgba(${hue[0]},${hue[1]},${hue[2]},${t * pulse * 0.85})`;
        ctx.beginPath(); ctx.arc(sx, sy, 1.8, 0, TAU); ctx.fill();
      }
    };
    scaleRow(0, 4, 22, Math.PI * 0.1, Math.PI * 1.85, 14);
    scaleRow(2, 0, 13, Math.PI * 1.0, Math.PI * 2.7,  10);
    scaleRow(1, 2,  5, Math.PI * 0.5, Math.PI * 2.4,   6);

    // Head resting on top of the coil, facing right
    const hx = 22, hy = 4;
    ctx.fillStyle = `rgba(8,6,22,${t})`;
    ctx.beginPath(); ctx.ellipse(hx + 6, hy - 4, 8, 5, -0.3, 0, TAU); ctx.fill();
    // Jaw/chin underscale
    ctx.fillStyle = `rgba(20,50,30,${t * 0.8})`;
    ctx.beginPath(); ctx.ellipse(hx + 7, hy - 2, 7, 3.5, -0.3, 0, TAU); ctx.fill();
    // Forked tongue
    ctx.strokeStyle = `rgba(255,60,100,${t * 0.9})`;
    ctx.lineWidth = 1; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(hx + 13, hy - 5);
    ctx.lineTo(hx + 18, hy - 3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hx + 13, hy - 5);
    ctx.lineTo(hx + 17, hy - 7); ctx.stroke();
    // Eye
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    drawGlow(hx + 5, hy - 6, 6, 60, 255, 160, t * 0.9);
    ctx.restore();
    ctx.fillStyle = `rgba(80,255,160,${t})`;
    ctx.beginPath(); ctx.arc(hx + 5, hy - 6, 1.8, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.95)';
    ctx.beginPath(); ctx.ellipse(hx + 5, hy - 6, 0.7, 1.8, 0, 0, TAU); ctx.fill();

    ctx.restore();
  }

  // ── spirit deer — static, realistic side silhouette ───────────────────
  // Drawn as a proper deer in side-profile: long legs, barrel body,
  // long neck, elongated snout, large ears, branching antlers.

  // Spirit owl — perched on a trunk, facing forward, glowing eyes
  function drawSpiritDeer(groundY, time) {
    const t = bio >= 0.86 ? 1 : 0;
    if (t <= 0) return;

    // Perch on the right-side foreground trunk
    const bx = W * 0.87, by = groundY - H * 0.22;
    const sc = Math.min(1, W / 420) * 1.4;
    const pulse = 0.65 + Math.sin(time * 0.0011) * 0.35;

    // Ambient glow around perch point
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    drawGlow(bx, by, 55, 120, 200, 255, t * pulse * 0.35);
    ctx.restore();

    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(sc, sc);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    const body  = `rgba(80,145,225,${t * 0.88})`;
    const dim   = `rgba(45,85,170,${t * 0.75})`;
    const mark  = `rgba(130,200,255,${t * 0.70})`;
    const eye   = `rgba(180,240,255,${t * pulse})`;

    // ── wings folded at sides — two rounded lobes ──
    ctx.fillStyle = dim;
    ctx.beginPath(); ctx.ellipse(-14, 4, 10, 18, -0.15, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse( 14, 4, 10, 18,  0.15, 0, TAU); ctx.fill();

    // Wing feather lines
    ctx.strokeStyle = `rgba(40,75,160,${t * 0.6})`; ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const wy = -8 + i * 6;
      ctx.beginPath(); ctx.moveTo(-20, wy); ctx.lineTo(-6, wy + 1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo( 20, wy); ctx.lineTo(  6, wy + 1); ctx.stroke();
    }

    // ── body — plump rounded torso ──
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, 4, 12, 18, 0, 0, TAU); ctx.fill();

    // Breast barring (horizontal marks)
    ctx.fillStyle = mark;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath(); ctx.ellipse(0, -2 + i * 7, 7, 1.8, 0, 0, TAU); ctx.fill();
    }

    // ── talons gripping branch ──
    ctx.strokeStyle = dim; ctx.lineWidth = 2.2;
    [[-6, 20], [0, 21], [6, 20]].forEach(([tx2, ty2]) => {
      ctx.beginPath(); ctx.moveTo(tx2, 18);
      ctx.bezierCurveTo(tx2 - 3, ty2 + 2, tx2 - 6, ty2 + 5, tx2 - 8, ty2 + 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(tx2, 18);
      ctx.bezierCurveTo(tx2 + 3, ty2 + 2, tx2 + 5, ty2 + 5, tx2 + 7, ty2 + 4); ctx.stroke();
    });

    // ── head — large round circle ──
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(0, -20, 16, 0, TAU); ctx.fill();

    // Facial disc — flat pale oval around face
    ctx.fillStyle = mark;
    ctx.beginPath(); ctx.ellipse(0, -20, 13, 12, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, -20, 10, 9, 0, 0, TAU); ctx.fill();

    // Ear tufts
    ctx.fillStyle = dim;
    ctx.beginPath(); ctx.moveTo(-8, -34); ctx.lineTo(-11, -42); ctx.lineTo(-5, -38); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo( 8, -34); ctx.lineTo( 11, -42); ctx.lineTo(  5, -38); ctx.closePath(); ctx.fill();

    // ── eyes — large forward-facing owl eyes ──
    // Left eye
    ctx.fillStyle = `rgba(8,6,24,${t})`;
    ctx.beginPath(); ctx.arc(-5, -21, 5.5, 0, TAU); ctx.fill();
    ctx.fillStyle = eye;
    ctx.beginPath(); ctx.arc(-5, -21, 4, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(8,6,24,${t})`;
    ctx.beginPath(); ctx.arc(-5, -21, 2.2, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath(); ctx.arc(-3.8, -22.2, 1, 0, TAU); ctx.fill();
    // Right eye
    ctx.fillStyle = `rgba(8,6,24,${t})`;
    ctx.beginPath(); ctx.arc( 5, -21, 5.5, 0, TAU); ctx.fill();
    ctx.fillStyle = eye;
    ctx.beginPath(); ctx.arc( 5, -21, 4, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(8,6,24,${t})`;
    ctx.beginPath(); ctx.arc( 5, -21, 2.2, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath(); ctx.arc( 6.2, -22.2, 1, 0, TAU); ctx.fill();

    // Eye glow
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    drawGlow(-5, -21, 14, 120, 210, 255, t * pulse * 0.9);
    drawGlow( 5, -21, 14, 120, 210, 255, t * pulse * 0.9);
    ctx.restore();

    // Beak — small downward triangle
    ctx.fillStyle = `rgba(130,190,255,${t * 0.85})`;
    ctx.beginPath(); ctx.moveTo(-2.5, -16); ctx.lineTo(2.5, -16); ctx.lineTo(0, -12); ctx.closePath(); ctx.fill();

    ctx.restore();
  }

  // ── ambient jungle glow ───────────────────────────────────────────────

  function drawAmbientGlow(groundY) {
    if (bio <= 0.05) return;
    const t = clamp(bio / 0.6, 0, 1);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    // Teal-green ground fog (strong, like the photo)
    const fogG = ctx.createLinearGradient(0, groundY - 60, 0, groundY + 100);
    fogG.addColorStop(0, `rgba(20,200,120,0)`);
    fogG.addColorStop(0.35, `rgba(20,200,120,${t * 0.18})`);
    fogG.addColorStop(0.7, `rgba(20,200,120,${t * 0.10})`);
    fogG.addColorStop(1, `rgba(20,200,120,0)`);
    ctx.fillStyle = fogG;
    ctx.fillRect(0, groundY - 60, W, 160);

    // Purple ambient from left side
    const purpleG = ctx.createLinearGradient(0, groundY - 40, 0, groundY + 80);
    purpleG.addColorStop(0, `rgba(100,40,255,0)`);
    purpleG.addColorStop(0.4, `rgba(100,40,255,${t * 0.12})`);
    purpleG.addColorStop(1, `rgba(100,40,255,0)`);
    ctx.fillStyle = purpleG;
    ctx.fillRect(0, groundY - 40, W * 0.35, 120);

    // Blue ambient from right
    const blueG = ctx.createLinearGradient(W * 0.65, groundY - 30, W, groundY + 80);
    blueG.addColorStop(0, `rgba(40,100,255,0)`);
    blueG.addColorStop(0.4, `rgba(40,100,255,${t * 0.10})`);
    blueG.addColorStop(1, `rgba(40,100,255,0)`);
    ctx.fillStyle = blueG;
    ctx.fillRect(W * 0.65, groundY - 30, W * 0.35, 110);

    ctx.restore();
  }

  // ── frame loop ────────────────────────────────────────────────────────

  function frame(now) {
    const time = now - t0;
    const groundY = H * 0.74;

    drawSky();
    drawTrunksAndPergola();
    drawFernCrowns();
    drawGround();
    drawForeground();

    // Bioluminescent layers
    drawAmbientGlow(groundY);
    drawMushrooms(groundY, time);
    drawOrchids(groundY);
    drawFireflies(time);
    drawFrog(groundY, time);
    drawButterfly(time);
    drawJaguar(groundY, time);
    drawSerpent(groundY, time);
    drawSpiritDeer(groundY, time);

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
