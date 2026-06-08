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

  function drawGround() {
    // Ground
    const g = ctx.createLinearGradient(0, H * 0.72, 0, H);
    g.addColorStop(0, '#0b1509');
    g.addColorStop(0.5, '#0e1a0b');
    g.addColorStop(1, '#080e06');
    ctx.fillStyle = g;
    ctx.fillRect(0, H * 0.72, W, H * 0.28);

    // Gnarled root silhouettes — slightly visible against ground
    ctx.strokeStyle = '#162210'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    const roots = rng(20);
    for (let i = 0; i < 10; i++) {
      const rx = roots() * W;
      const ry = H * (0.73 + roots() * 0.12);
      ctx.beginPath(); ctx.moveTo(rx, ry);
      ctx.bezierCurveTo(
        rx + (roots() - 0.5) * 90, ry + 18,
        rx + (roots() - 0.5) * 130, ry + 50,
        rx + (roots() - 0.5) * 70, ry + 75
      );
      ctx.stroke();
    }

    // Ground-cover ferns — flat leaves at floor level
    ctx.fillStyle = '#112010';
    const fr = rng(30);
    for (let i = 0; i < 18; i++) {
      const fx = fr() * W;
      const fy = H * (0.75 + fr() * 0.10);
      const fw = 28 + fr() * 55;
      ctx.beginPath();
      ctx.ellipse(fx, fy, fw, 9 + fr() * 8, (fr() - 0.5) * 0.9, 0, TAU);
      ctx.fill();
    }
  }

  // Visible tree trunks, hanging vines, large tropical leaves
  function drawMidground() {
    // Tree trunks — four pillars at deterministic x positions
    const trunkXs = [0.10, 0.36, 0.64, 0.90];
    trunkXs.forEach((xf, i) => {
      const tx = W * xf;
      const tw = 18 + i * 3;
      const tg = ctx.createLinearGradient(tx - tw, 0, tx + tw, 0);
      tg.addColorStop(0, '#0a1609');
      tg.addColorStop(0.45, '#162a12');
      tg.addColorStop(1, '#0a1609');
      ctx.fillStyle = tg;
      ctx.beginPath();
      ctx.roundRect(tx - tw / 2, H * 0.32, tw, H * 0.68, tw * 0.3);
      ctx.fill();
      // Root buttress flares
      ctx.fillStyle = '#112010';
      [[tx - tw * 0.9, H * 0.70, tx - tw * 2.2, H * 0.80],
       [tx + tw * 0.9, H * 0.70, tx + tw * 2.2, H * 0.80]].forEach(([x1, y1, x2, y2]) => {
        ctx.beginPath();
        ctx.moveTo(tx, y1); ctx.quadraticCurveTo(x1, (y1 + y2) / 2, x2, y2);
        ctx.lineTo(tx, y2 + 4); ctx.closePath(); ctx.fill();
      });
    });

    // Hanging vines dropping from canopy
    ctx.strokeStyle = '#142212'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    const vr = rng(88);
    for (let i = 0; i < 10; i++) {
      const vx = W * (0.06 + vr() * 0.88);
      const vlen = H * (0.28 + vr() * 0.30);
      const sway = (vr() - 0.5) * 30;
      ctx.beginPath(); ctx.moveTo(vx, 0);
      ctx.bezierCurveTo(vx + sway * 0.3, vlen * 0.35, vx + sway * 0.7, vlen * 0.65, vx + sway, vlen);
      ctx.stroke();
      // Leaf node bumps along vine
      ctx.fillStyle = '#172814';
      for (let j = 0; j < 4; j++) {
        const lt = 0.2 + j * 0.22;
        const lx = lerp(vx, vx + sway, lt);
        const ly = lerp(0, vlen, lt);
        ctx.beginPath(); ctx.arc(lx, ly, 2.5, 0, TAU); ctx.fill();
      }
    }

    // Large tropical leaves (banana / heliconia style) angled in from sides & trunks
    const leafDefs = [
      { bx: -10,     by: H * 0.52, len: W * 0.22, w: H * 0.06, angle:  0.40 },
      { bx:  W * 0.15, by: H * 0.58, len: W * 0.20, w: H * 0.05, angle:  0.18 },
      { bx:  W + 10,   by: H * 0.50, len: W * 0.24, w: H * 0.06, angle: Math.PI - 0.38 },
      { bx:  W * 0.84, by: H * 0.57, len: W * 0.19, w: H * 0.05, angle: Math.PI - 0.22 },
      { bx:  W * 0.36, by: H * 0.44, len: W * 0.18, w: H * 0.05, angle:  0.55 },
      { bx:  W * 0.64, by: H * 0.46, len: W * 0.17, w: H * 0.05, angle: Math.PI - 0.50 },
    ];
    leafDefs.forEach(({ bx, by, len, w, angle }) => {
      const ex = bx + Math.cos(angle) * len;
      const ey = by + Math.sin(angle) * len;
      const mx = bx + Math.cos(angle) * len * 0.5;
      const my = by + Math.sin(angle) * len * 0.5;
      const px = Math.cos(angle + Math.PI / 2) * w;
      const py = Math.sin(angle + Math.PI / 2) * w;
      ctx.fillStyle = '#112215';
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(mx + px, my + py, ex, ey);
      ctx.quadraticCurveTo(mx - px * 0.25, my - py * 0.25, bx, by);
      ctx.fill();
      // Midrib
      ctx.strokeStyle = '#0d1a10'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.stroke();
      // 3-4 side veins
      ctx.lineWidth = 0.7; ctx.strokeStyle = '#0e1c11';
      for (let v = 1; v <= 4; v++) {
        const vt = v / 5;
        const vbx = lerp(bx, ex, vt), vby = lerp(by, ey, vt);
        ctx.beginPath(); ctx.moveTo(vbx, vby);
        ctx.lineTo(vbx + px * (1 - vt) * 0.7, vby + py * (1 - vt) * 0.7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(vbx, vby);
        ctx.lineTo(vbx - px * (1 - vt) * 0.55, vby - py * (1 - vt) * 0.55); ctx.stroke();
      }
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
    const sc = Math.min(1, W / 420) * 2.2;
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
  // Large cat silhouette — body rendered in very dark tones so only the
  // bioluminescent rosette markings and glowing amber eyes are prominent.

  function drawJaguar(groundY, time) {
    const t = clamp((bio - 0.92) / 0.08, 0, 1);
    if (t <= 0) return;

    const bx = W * 0.68;
    const by = groundY + 4;
    // Bigger scale — jaguar should dominate the scene
    const sc = Math.min(1, W / 420) * 2.6;
    const breathe = Math.sin(time * 0.0008) * 2.5;
    const pulse = 0.58 + Math.sin(time * 0.0014) * 0.42;

    // Wide ambient glow in world space
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    drawGlow(bx, by - 30, 90, 60, 210, 255, t * pulse * 0.38);
    ctx.restore();

    ctx.save();
    ctx.translate(bx, by + breathe);
    ctx.scale(sc, sc);

    const shadow  = `rgba(8,16,12,${t * 0.92})`;
    const fur     = `rgba(14,26,20,${t * 0.88})`;
    const glowCol = `rgba(45,${(205 * t) | 0},${(225 * t) | 0},${t * pulse})`;
    const amber   = `rgba(${(255 * t) | 0},${(195 * t) | 0},${(25 * t) | 0},${t})`;

    // ── tail: thick, curling upward behind body ────────────────────────
    ctx.strokeStyle = shadow; ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(22, -12);
    ctx.bezierCurveTo(38, -6, 44, 8, 34, 20);
    ctx.bezierCurveTo(28, 26, 18, 22, 20, 14); ctx.stroke();
    ctx.strokeStyle = fur; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(22, -12);
    ctx.bezierCurveTo(38, -6, 44, 8, 34, 20);
    ctx.bezierCurveTo(28, 26, 18, 22, 20, 14); ctx.stroke();

    // ── legs: four thick, planted legs ────────────────────────────────
    ctx.strokeStyle = shadow; ctx.lineWidth = 10; ctx.lineCap = 'round';
    // Back pair
    [[-10, -2, -12, 16], [-2, -2, -2, 16]].forEach(([x1,y1,x2,y2]) => {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    });
    // Front pair
    ctx.strokeStyle = fur; ctx.lineWidth = 8;
    [[-10, -2, -12, 16], [-2, -2, -2, 16]].forEach(([x1,y1,x2,y2]) => {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    });
    // Front legs (lighter — in front of body)
    ctx.strokeStyle = shadow; ctx.lineWidth = 10;
    [[8, -4, 8, 16], [16, -4, 14, 16]].forEach(([x1,y1,x2,y2]) => {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    });
    ctx.strokeStyle = fur; ctx.lineWidth = 8;
    [[8, -4, 8, 16], [16, -4, 14, 16]].forEach(([x1,y1,x2,y2]) => {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    });
    // Paws
    ctx.fillStyle = shadow;
    [[-12,16],[-2,16],[8,16],[14,16]].forEach(([px,py]) => {
      ctx.beginPath(); ctx.ellipse(px, py, 5.5, 3.5, 0, 0, TAU); ctx.fill();
    });

    // ── torso: large powerful body ─────────────────────────────────────
    ctx.fillStyle = shadow;
    ctx.beginPath(); ctx.ellipse(4, -10, 26, 15, -0.06, 0, TAU); ctx.fill();
    ctx.fillStyle = fur;
    ctx.beginPath(); ctx.ellipse(4, -10, 24, 13, -0.06, 0, TAU); ctx.fill();

    // ── neck ──────────────────────────────────────────────────────────
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.moveTo(-14, -18); ctx.quadraticCurveTo(-26, -28, -32, -24);
    ctx.quadraticCurveTo(-30, -20, -22, -18); ctx.closePath(); ctx.fill();
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.moveTo(-13, -17); ctx.quadraticCurveTo(-25, -26, -31, -23);
    ctx.quadraticCurveTo(-29, -19, -21, -17); ctx.closePath(); ctx.fill();

    // ── head: broad, heavy cat skull ──────────────────────────────────
    ctx.fillStyle = shadow;
    ctx.beginPath(); ctx.arc(-36, -26, 16, 0, TAU); ctx.fill();
    ctx.fillStyle = fur;
    ctx.beginPath(); ctx.arc(-36, -26, 14, 0, TAU); ctx.fill();

    // Muzzle
    ctx.fillStyle = shadow;
    ctx.beginPath(); ctx.ellipse(-44, -23, 10, 7, -0.1, 0, TAU); ctx.fill();
    ctx.fillStyle = fur;
    ctx.beginPath(); ctx.ellipse(-43, -23, 8, 5.5, -0.1, 0, TAU); ctx.fill();

    // Ears
    ctx.fillStyle = shadow;
    [[-30, -40, -36, -38, -27, -32], [-44, -38, -48, -36, -40, -30]].forEach(([x1,y1,x2,y2,x3,y3]) => {
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.lineTo(x3,y3); ctx.closePath(); ctx.fill();
    });

    // ── bioluminescent rosette markings ───────────────────────────────
    const rosettes = [
      [-4,-18],[4,-14],[12,-10],[18,-6],[-10,-10],
      [2,-8],[10,-4],[18,-12],[22,-18],[6,-20],
    ];
    const mr = rng(99);
    rosettes.forEach(([mx, my]) => {
      const ms = 2.8 + mr() * 2.2;
      // Centre dot
      ctx.fillStyle = glowCol;
      ctx.beginPath(); ctx.arc(mx, my, ms * 0.55, 0, TAU); ctx.fill();
      // Rosette ring of 4-5 satellite dots
      ctx.strokeStyle = glowCol; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(mx, my, ms * 1.65, 0, TAU); ctx.stroke();
    });
    // A few shoulder/back flank markings
    [[-8,-24],[-2,-26],[6,-24],[-14,-16]].forEach(([mx, my]) => {
      const ms = 2.2 + mr() * 1.5;
      ctx.fillStyle = glowCol;
      ctx.beginPath(); ctx.arc(mx, my, ms * 0.5, 0, TAU); ctx.fill();
      ctx.strokeStyle = glowCol; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(mx, my, ms * 1.5, 0, TAU); ctx.stroke();
    });

    // ── glowing amber eyes ────────────────────────────────────────────
    // Eye glow in local coords — we draw in world-space equivalent via screen mode
    // (glow is called outside translate in world space)
    ctx.fillStyle = amber;
    ctx.beginPath(); ctx.ellipse(-31, -29, 4.5, 3.5, 0.12, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-41, -29, 4.5, 3.5, 0.12, 0, TAU); ctx.fill();
    // Pupil
    ctx.fillStyle = 'rgba(0,0,0,0.97)';
    ctx.beginPath(); ctx.ellipse(-31, -29, 1.6, 3.5, 0.12, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-41, -29, 1.6, 3.5, 0.12, 0, TAU); ctx.fill();
    // Shine
    ctx.fillStyle = `rgba(255,255,255,${0.7 * t})`;
    ctx.beginPath(); ctx.arc(-29.5, -31, 1.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(-39.5, -31, 1.2, 0, TAU); ctx.fill();

    ctx.restore();

    // Eye glows in world space (after restore so coords are correct)
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const ex1 = bx + (-31) * sc, ey1 = by + breathe + (-29) * sc;
    const ex2 = bx + (-41) * sc, ey2 = by + breathe + (-29) * sc;
    drawGlow(ex1, ey1, 22, 255, 195, 25, t * pulse * 0.7);
    drawGlow(ex2, ey2, 22, 255, 195, 25, t * pulse * 0.7);
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
