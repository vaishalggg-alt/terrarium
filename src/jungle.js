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
    // Ground fade from dark green-brown
    const g = ctx.createLinearGradient(0, H * 0.72, 0, H);
    g.addColorStop(0, '#0a1208');
    g.addColorStop(0.4, '#0d1509');
    g.addColorStop(1, '#060c05');
    ctx.fillStyle = g;
    ctx.fillRect(0, H * 0.72, W, H * 0.28);

    // Gnarled root silhouettes
    ctx.strokeStyle = '#081008'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    const roots = rng(20);
    for (let i = 0; i < 8; i++) {
      const rx = roots() * W;
      const ry = H * (0.72 + roots() * 0.14);
      ctx.beginPath(); ctx.moveTo(rx, ry);
      ctx.bezierCurveTo(
        rx + (roots() - 0.5) * 80, ry + 20,
        rx + (roots() - 0.5) * 120, ry + 55,
        rx + (roots() - 0.5) * 60, ry + 80
      );
      ctx.stroke();
    }

    // Undergrowth frond silhouettes
    ctx.fillStyle = '#07100a';
    const fr = rng(30);
    for (let i = 0; i < 14; i++) {
      const fx = fr() * W;
      const fy = H * (0.74 + fr() * 0.12);
      const fw = 30 + fr() * 60;
      ctx.beginPath();
      ctx.ellipse(fx, fy, fw, 12 + fr() * 10, (fr() - 0.5) * 0.8, 0, TAU);
      ctx.fill();
    }
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

  function drawFrog(groundY, time) {
    const t = clamp((bio - 0.50) / 0.25, 0, 1);
    if (t <= 0) return;

    const bx = W * 0.28, by = groundY - 2;
    const sc = Math.min(1, W / 420) * 1.3;
    const bob = Math.sin(time * 0.0012) * 2 * t;
    const pulse = 0.75 + Math.sin(time * 0.0018) * 0.25;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    drawGlow(bx, by - 8, 35, 40, 255, 140, t * pulse * 0.55);
    ctx.restore();

    ctx.save();
    ctx.translate(bx, by + bob);
    ctx.scale(sc, sc);

    const body = `rgba(20,${(200 * t) | 0},${(100 * t) | 0},${t})`;
    const dark  = `rgba(10,${(80 * t) | 0},${(40 * t) | 0},${t})`;
    const spot  = `rgba(100,255,180,${t * pulse})`;
    const eye   = `rgba(255,255,80,${t})`;

    // Hind legs
    ctx.strokeStyle = body; ctx.lineWidth = 4; ctx.lineCap = 'round';
    [[-10, 0, -22, 10, -18, 18], [10, 0, 22, 10, 18, 18]].forEach(([x1,y1,x2,y2,x3,y3]) => {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.stroke();
    });
    // Body
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, -4, 12, 9, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(0, -2, 8, 6, 0, 0, TAU); ctx.fill();
    // Bioluminescent spots
    ctx.fillStyle = spot;
    [[- 5, -7], [5, -7], [-3, -2], [3, -2], [0, -10]].forEach(([sx, sy]) => {
      ctx.beginPath(); ctx.arc(sx, sy, 2.2, 0, TAU); ctx.fill();
    });
    // Front legs
    ctx.strokeStyle = body; ctx.lineWidth = 3;
    [[-8, -2, -14, 4], [8, -2, 14, 4]].forEach(([x1,y1,x2,y2]) => {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    });
    // Eyes
    ctx.fillStyle = eye;
    ctx.beginPath(); ctx.arc(-6, -14, 4.5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(6, -14, 4.5, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    ctx.beginPath(); ctx.arc(-6, -14, 2.5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(6, -14, 2.5, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath(); ctx.arc(-4.5, -15.5, 1, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(7.5, -15.5, 1, 0, TAU); ctx.fill();

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

  function drawJaguar(groundY, time) {
    const t = clamp((bio - 0.92) / 0.08, 0, 1);
    if (t <= 0) return;

    const bx = W * 0.72;
    const by = groundY + 2;
    const sc = Math.min(1, W / 420) * 1.5;
    const breathe = Math.sin(time * 0.0008) * 2;
    const pulse = 0.6 + Math.sin(time * 0.0015) * 0.4;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    drawGlow(bx, by - 20, 55, 80, 220, 255, t * pulse * 0.45);
    ctx.restore();

    ctx.save();
    ctx.translate(bx, by + breathe);
    ctx.scale(sc, sc);

    // Very subtle dark silhouette — only the glow markings are visible
    const silhouette = `rgba(12,22,18,${t * 0.85})`;
    const glow = `rgba(50,${(200 * t) | 0},${(220 * t) | 0},${t * pulse})`;
    const eyeGlow = `rgba(80,255,200,${t})`;

    // Body silhouette
    ctx.fillStyle = silhouette;
    ctx.beginPath(); ctx.ellipse(-4, -14, 24, 13, -0.08, 0, TAU); ctx.fill();
    // Head
    ctx.beginPath(); ctx.arc(-28, -22, 13, 0, TAU); ctx.fill();
    // Tail
    ctx.strokeStyle = silhouette; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(18, -14);
    ctx.bezierCurveTo(32, -8, 36, 4, 28, 12); ctx.stroke();
    // Legs
    ctx.lineWidth = 5;
    [[-12, -4, -14, 12], [-6, -4, -4, 12], [6, -4, 8, 12], [14, -4, 12, 12]].forEach(([x1,y1,x2,y2]) => {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    });

    // Bioluminescent rosette markings
    ctx.fillStyle = glow;
    const markings = rng(99);
    [[-10,-18],[-2,-24],[6,-18],[12,-12],[-16,-10],[-4,-12],[4,-8],[16,-6]].forEach(([mx, my]) => {
      const ms = 2.5 + markings() * 2;
      ctx.beginPath(); ctx.arc(mx, my, ms, 0, TAU); ctx.fill();
      // Rosette ring
      ctx.strokeStyle = glow; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.arc(mx, my, ms * 1.8, 0, TAU); ctx.stroke();
    });

    // Glowing eyes
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    drawGlow(-24, -25, 16, 80, 255, 200, t * pulse * 0.7);
    drawGlow(-32, -25, 16, 80, 255, 200, t * pulse * 0.7);
    ctx.restore();
    ctx.fillStyle = eyeGlow;
    ctx.beginPath(); ctx.ellipse(-24, -25, 3.5, 2.5, 0.1, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-32, -25, 3.5, 2.5, 0.1, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.95)';
    ctx.beginPath(); ctx.ellipse(-24, -25, 1.2, 2.5, 0.1, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-32, -25, 1.2, 2.5, 0.1, 0, TAU); ctx.fill();

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
