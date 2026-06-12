// Canvas world engine for the Cherry Blossom / Japanese Garden biome.
//
// The scene reacts to real-time stillness — the longer you sit without
// touching the screen, the higher the peace level (0→1 over 90 seconds):
//   0.00 → quiet garden, a few petals drifting
//   0.30 → petals thicken, lanterns warm, mist begins to settle
//   0.60 → koi appear in the pond, lotus flowers bloom at the edges
//   0.85 → dense petal shower, fireflies, deep mist, full serenity
//   1.00 → maximum stillness — everything glows softly

import { clockDate } from './clock.js';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const ease = (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

function rng(seed) {
  let s = seed * 9301 + 49297;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

export function createBlossom(canvas, { onCanvasActivity } = {}) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
  let sessions = [];
  let petals = [];
  let koi = [];
  let fireflies = [];
  let raf = 0;
  let t0 = performance.now();
  let lastActivity = performance.now();
  let disturbance = 0;

  // ── peace / stillness ────────────────────────────────────────────────────
  const PEACE_RAMP = 90000; // 90 s to full peace

  function peaceLevel() {
    return clamp((performance.now() - lastActivity) / PEACE_RAMP, 0, 1);
  }

  function onActivity() {
    onCanvasActivity?.();
    lastActivity = performance.now();
    disturbance = 1;
    for (const p of petals) {
      p.vx += (Math.random() - 0.5) * 1.4;
      p.vy += Math.random() * 0.8;
    }
  }

  // ── resize ───────────────────────────────────────────────────────────────
  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = rect.width; H = rect.height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rebuildKoi();
    rebuildFireflies();
  }

  function rebuildKoi() {
    koi = Array.from({ length: 5 }, (_, i) => {
      const r = rng(i + 70);
      return {
        x: W * (0.32 + r() * 0.36),
        y: pondCY() + (r() - 0.5) * pondRY() * 0.7,
        angle: r() * TAU,
        speed: 0.25 + r() * 0.35,
        turnRate: (r() - 0.5) * 0.012,
        col: r() > 0.5 ? [255, 100, 40] : [255, 200, 40],
        size: 7 + r() * 5,
        phase: r() * TAU,
      };
    });
  }

  function rebuildFireflies() {
    fireflies = Array.from({ length: 18 }, (_, i) => {
      const r = rng(i + 200);
      return {
        x: r() * W,
        y: H * 0.35 + r() * H * 0.45,
        phase: r() * TAU,
        speed: 0.2 + r() * 0.3,
        amp: 18 + r() * 30,
        s: 1.5 + r() * 1.5,
      };
    });
  }

  function pondCX() { return W * 0.5; }
  function pondCY() { return H * 0.72; }
  function pondRX() { return W * 0.20; }
  function pondRY() { return H * 0.065; }

  function setData({ sessions: ss }) {
    sessions = ss;
  }

  // ── sky ──────────────────────────────────────────────────────────────────
  function drawSky(peace, day) {
    // Soft pink-peach dawn palette, shifts to deep rose/purple at night
    const d = 0.25 + day * 0.75;
    const top1 = [lerp(38, 220, d), lerp(18, 170, d), lerp(55, 200, d)];
    const bot1 = [lerp(80, 255, d), lerp(35, 200, d), lerp(80, 220, d)];
    // At high peace: more vivid pink
    const top = top1.map((c, i) => c + [0, 15, -10][i] * peace);
    const bot = bot1.map((c, i) => c + [0, 20, -15][i] * peace);

    const g = ctx.createLinearGradient(0, 0, 0, H * 0.62);
    g.addColorStop(0, `rgb(${top.map(c => clamp(c, 0, 255) | 0).join(',')})`);
    g.addColorStop(1, `rgb(${bot.map(c => clamp(c, 0, 255) | 0).join(',')})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H * 0.62);

    // Moon / sun
    if (day < 0.3) {
      const a = (0.3 - day) / 0.3;
      // Moon
      const mg = ctx.createRadialGradient(W * 0.75, H * 0.22, 0, W * 0.75, H * 0.22, 60);
      mg.addColorStop(0, `rgba(255,240,220,${0.85 * a})`);
      mg.addColorStop(0.3, `rgba(255,230,200,${0.35 * a})`);
      mg.addColorStop(1, 'rgba(255,220,180,0)');
      ctx.fillStyle = mg;
      ctx.beginPath(); ctx.arc(W * 0.75, H * 0.22, 60, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(255,248,235,${0.9 * a})`;
      ctx.beginPath(); ctx.arc(W * 0.75, H * 0.22, 18, 0, TAU); ctx.fill();
      // Stars
      ctx.fillStyle = `rgba(255,240,230,${0.6 * a})`;
      for (let i = 0; i < 40; i++)
        ctx.fillRect((i * 137.5) % W, (i * 71.3) % (H * 0.48), 1.2, 1.2);
    } else {
      // Sun glow
      const sg = ctx.createRadialGradient(W * 0.72, H * 0.14, 0, W * 0.72, H * 0.14, 100);
      sg.addColorStop(0, `rgba(255,240,200,${0.65 * day})`);
      sg.addColorStop(1, 'rgba(255,200,150,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, W, H * 0.5);
    }

    // Cherry blossom clouds drifting across upper sky at high peace
    if (peace > 0.5) {
      const cloudA = (peace - 0.5) / 0.5 * 0.12;
      ctx.fillStyle = `rgba(255,200,210,${cloudA})`;
      [[W * 0.15, H * 0.08, 55, 22], [W * 0.55, H * 0.05, 70, 25], [W * 0.82, H * 0.11, 45, 18]].forEach(([cx, cy, rx, ry]) => {
        ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU); ctx.fill();
      });
    }
  }

  // ── mountains ────────────────────────────────────────────────────────────
  function drawMountains(day) {
    const d = 0.2 + day * 0.55;
    // Far mountains — very pale blue-grey
    ctx.fillStyle = `rgba(${(180 * d) | 0},${(160 * d) | 0},${(175 * d) | 0},0.45)`;
    ctx.beginPath();
    ctx.moveTo(0, H * 0.55);
    [[0, .53],[.08,.41],[.16,.46],[.25,.35],[.35,.42],[.45,.38],[.55,.40],[.65,.34],[.75,.42],[.85,.38],[.93,.44],[1,.50]].forEach(([x, y]) =>
      ctx.lineTo(W * x, H * y));
    ctx.lineTo(W, H * 0.55); ctx.closePath(); ctx.fill();

    // Mid mountains — slightly darker
    ctx.fillStyle = `rgba(${(140 * d) | 0},${(105 * d) | 0},${(120 * d) | 0},0.55)`;
    ctx.beginPath();
    ctx.moveTo(0, H * 0.60);
    [[0,.58],[.06,.50],[.14,.55],[.22,.46],[.30,.52],[.38,.47],[.48,.53],[.56,.45],[.64,.51],[.72,.46],[.82,.53],[.90,.49],[1,.57]].forEach(([x, y]) =>
      ctx.lineTo(W * x, H * y));
    ctx.lineTo(W, H * 0.60); ctx.closePath(); ctx.fill();
  }

  // ── ground ───────────────────────────────────────────────────────────────
  function drawGround(peace, day) {
    const d = 0.3 + day * 0.55;
    // Main ground — mossy stone path area
    const gg = ctx.createLinearGradient(0, H * 0.60, 0, H);
    gg.addColorStop(0, `rgb(${(68*d)|0},${(78*d)|0},${(52*d)|0})`);
    gg.addColorStop(0.4, `rgb(${(52*d)|0},${(60*d)|0},${(40*d)|0})`);
    gg.addColorStop(1, `rgb(${(38*d)|0},${(44*d)|0},${(30*d)|0})`);
    ctx.fillStyle = gg;
    ctx.fillRect(0, H * 0.60, W, H * 0.40);

    // Raked gravel path — two curved lines meeting in center
    ctx.strokeStyle = `rgba(200,190,170,${0.18 + peace * 0.12})`;
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const offset = (i - 2) * 12;
      ctx.beginPath();
      ctx.moveTo(W * 0.5 + offset - 60, H * 0.98);
      ctx.quadraticCurveTo(W * 0.5 + offset * 0.5, H * 0.78, W * 0.5 + offset * 0.2, H * 0.62);
      ctx.stroke();
    }

    // Moss patches
    const mr = rng(55);
    ctx.fillStyle = `rgba(60,100,50,${0.35 + peace * 0.15})`;
    for (let i = 0; i < 8; i++) {
      const mx = mr() * W, my = H * 0.62 + mr() * H * 0.3, mw = 20 + mr() * 50, mh = 6 + mr() * 14;
      ctx.beginPath(); ctx.ellipse(mx, my, mw, mh, (mr() - 0.5) * 0.8, 0, TAU); ctx.fill();
    }
  }

  // ── cherry blossom trees ──────────────────────────────────────────────────
  function drawBranch(x, y, angle, len, depth, peace) {
    if (depth === 0 || len < 4) return;
    const ex = x + Math.cos(angle) * len;
    const ey = y + Math.sin(angle) * len;
    ctx.strokeStyle = depth > 2
      ? `rgba(50,25,15,${0.75 + peace * 0.15})`
      : `rgba(80,40,25,${0.6 + peace * 0.15})`;
    ctx.lineWidth = depth * 1.2;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();

    if (depth <= 1) {
      // Blossom cluster — size derived from position so it never flickers
      const clusterR = 10 + ((Math.abs(ex * 7 + ey * 3) % 80) / 10);
      const blA = 0.55 + peace * 0.3;
      const bg = ctx.createRadialGradient(ex, ey, 0, ex, ey, clusterR);
      bg.addColorStop(0, `rgba(255,200,210,${blA})`);
      bg.addColorStop(0.6, `rgba(255,170,185,${blA * 0.7})`);
      bg.addColorStop(1, 'rgba(255,160,175,0)');
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(ex, ey, clusterR, 0, TAU); ctx.fill();
    }

    const spread = 0.38 + peace * 0.12;
    drawBranch(ex, ey, angle - spread, len * 0.68, depth - 1, peace);
    drawBranch(ex, ey, angle + spread * 0.75, len * 0.72, depth - 1, peace);
    if (depth > 2) drawBranch(ex, ey, angle - 0.1, len * 0.82, depth - 1, peace);
  }

  function drawTrees(peace, day) {
    const d = 0.3 + day * 0.55;
    // Left foreground tree
    ctx.save();
    drawBranch(W * 0.04, H * 0.75, -Math.PI / 2 + 0.22, H * 0.22, 5, peace);
    ctx.restore();

    // Right foreground tree
    ctx.save();
    drawBranch(W * 0.96, H * 0.72, -Math.PI / 2 - 0.18, H * 0.20, 5, peace);
    ctx.restore();

    // Background trees (silhouette)
    [[0.18, 0.65, 0.14], [0.28, 0.67, 0.11], [0.72, 0.64, 0.13], [0.82, 0.66, 0.10]].forEach(([tx, ty, s]) => {
      const th = H * s;
      ctx.fillStyle = `rgba(${(45*d)|0},${(22*d)|0},${(15*d)|0},0.65)`;
      ctx.beginPath();
      ctx.moveTo(W * tx, H * ty + th);
      ctx.quadraticCurveTo(W * tx - th * 0.15, H * ty + th * 0.5, W * tx, H * ty);
      ctx.quadraticCurveTo(W * tx + th * 0.15, H * ty + th * 0.5, W * tx, H * ty + th);
      ctx.fill();
      // Blossom canopy
      const bA = 0.45 + peace * 0.25;
      const bg2 = ctx.createRadialGradient(W * tx, H * ty + th * 0.2, 0, W * tx, H * ty + th * 0.2, th * 0.6);
      bg2.addColorStop(0, `rgba(255,195,205,${bA})`);
      bg2.addColorStop(1, 'rgba(255,185,195,0)');
      ctx.fillStyle = bg2;
      ctx.beginPath(); ctx.ellipse(W * tx, H * ty + th * 0.25, th * 0.55, th * 0.45, 0, 0, TAU); ctx.fill();
    });
  }

  // ── stone lanterns ────────────────────────────────────────────────────────
  function drawLantern(cx, by, peace, day) {
    const d = 0.3 + day * 0.55;
    const h = H * 0.10;
    const w = W * 0.028;

    // Base pedestal
    ctx.fillStyle = `rgb(${(88*d)|0},${(80*d)|0},${(72*d)|0})`;
    ctx.beginPath(); ctx.roundRect(cx - w * 0.7, by - h * 0.08, w * 1.4, h * 0.08, 2); ctx.fill();

    // Pillar
    ctx.fillStyle = `rgb(${(78*d)|0},${(70*d)|0},${(64*d)|0})`;
    ctx.fillRect(cx - w * 0.22, by - h * 0.72, w * 0.44, h * 0.64);

    // Lantern body (the glowing chamber)
    const glowA = 0.08 + peace * 0.55;
    const glowC = `rgba(255,${(180 + peace * 55) | 0},60,${glowA})`;
    ctx.fillStyle = `rgb(${(95*d)|0},${(85*d)|0},${(75*d)|0})`;
    ctx.beginPath(); ctx.roundRect(cx - w * 0.6, by - h * 0.82, w * 1.2, h * 0.28, 3); ctx.fill();
    // Inner glow
    const lg = ctx.createRadialGradient(cx, by - h * 0.68, 0, cx, by - h * 0.68, w * 1.8);
    lg.addColorStop(0, `rgba(255,${(180 + peace * 55)|0},40,${0.55 * peace})`);
    lg.addColorStop(1, 'rgba(255,150,0,0)');
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.arc(cx, by - h * 0.68, w * 1.8, 0, TAU); ctx.fill();

    // Roof
    ctx.fillStyle = `rgb(${(68*d)|0},${(60*d)|0},${(54*d)|0})`;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.72, by - h * 0.82);
    ctx.lineTo(cx, by - h * 1.02);
    ctx.lineTo(cx + w * 0.72, by - h * 0.82);
    ctx.closePath(); ctx.fill();
    // Roof flare tips
    ctx.strokeStyle = `rgb(${(58*d)|0},${(50*d)|0},${(46*d)|0})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx - w * 0.72, by - h * 0.82); ctx.lineTo(cx - w * 0.88, by - h * 0.88); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + w * 0.72, by - h * 0.82); ctx.lineTo(cx + w * 0.88, by - h * 0.88); ctx.stroke();
  }

  // ── pond ──────────────────────────────────────────────────────────────────
  function drawPond(peace, day, time) {
    const d = 0.25 + day * 0.6;
    const cx = pondCX(), cy = pondCY(), rx = pondRX(), ry = pondRY();

    // Water fill
    const pg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
    pg.addColorStop(0, `rgba(${(35*d)|0},${(65*d)|0},${(95*d)|0},0.88)`);
    pg.addColorStop(0.7, `rgba(${(22*d)|0},${(45*d)|0},${(72*d)|0},0.92)`);
    pg.addColorStop(1, `rgba(${(15*d)|0},${(30*d)|0},${(50*d)|0},0.95)`);
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU); ctx.fill();

    // Reflection shimmer — wavy pink lines
    ctx.save();
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU); ctx.clip();
    const refA = 0.10 + peace * 0.18;
    ctx.strokeStyle = `rgba(255,200,210,${refA})`;
    ctx.lineWidth = 1.2;
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      for (let x = cx - rx; x <= cx + rx; x += 6) {
        const wy = cy + i * ry * 0.22 + Math.sin(x * 0.04 + time * 0.001 + i) * 2;
        x === cx - rx ? ctx.moveTo(x, wy) : ctx.lineTo(x, wy);
      }
      ctx.stroke();
    }
    ctx.restore();

    // Pond rim — dark stone border
    ctx.strokeStyle = `rgba(${(55*d)|0},${(48*d)|0},${(40*d)|0},0.85)`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU); ctx.stroke();

    // Lotus flowers at edges when peaceful
    if (peace > 0.6) {
      const la = (peace - 0.6) / 0.4;
      [[cx - rx * 0.72, cy + ry * 0.3], [cx + rx * 0.65, cy - ry * 0.25], [cx - rx * 0.3, cy - ry * 0.6]].forEach(([lx, ly], i) => {
        ctx.save();
        ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU); ctx.clip();
        // Leaf
        ctx.fillStyle = `rgba(50,120,60,${0.65 * la})`;
        ctx.beginPath(); ctx.ellipse(lx, ly, 8, 5, i * 0.8, 0, TAU); ctx.fill();
        // Petals
        for (let p = 0; p < 5; p++) {
          const pa = (p / 5) * TAU;
          ctx.fillStyle = `rgba(255,200,215,${0.7 * la})`;
          ctx.beginPath(); ctx.ellipse(lx + Math.cos(pa) * 4, ly + Math.sin(pa) * 3, 4, 2.5, pa, 0, TAU); ctx.fill();
        }
        ctx.fillStyle = `rgba(255,230,80,${0.8 * la})`;
        ctx.beginPath(); ctx.arc(lx, ly, 2, 0, TAU); ctx.fill();
        ctx.restore();
      });
    }
  }

  // ── koi fish ─────────────────────────────────────────────────────────────
  function drawKoi(peace, time) {
    if (peace < 0.6) return;
    const a = (peace - 0.6) / 0.4;
    const cx = pondCX(), cy = pondCY(), rx = pondRX(), ry = pondRY();

    ctx.save();
    ctx.beginPath(); ctx.ellipse(cx, cy, rx * 0.9, ry * 0.85, 0, 0, TAU); ctx.clip();

    for (const k of koi) {
      k.angle += k.turnRate + Math.sin(time * 0.0006 + k.phase) * 0.005;
      k.x += Math.cos(k.angle) * k.speed;
      k.y += Math.sin(k.angle) * k.speed * 0.4;
      // Soft boundary — nudge back toward pond centre
      const dx = k.x - cx, dy = (k.y - cy) * (rx / ry);
      if (Math.sqrt(dx * dx + dy * dy) > rx * 0.8) {
        k.angle += Math.PI * 0.06;
      }

      const tailWag = Math.sin(time * 0.005 + k.phase) * 0.35;
      ctx.save();
      ctx.translate(k.x, k.y);
      ctx.rotate(k.angle);
      ctx.globalAlpha = a * 0.8;

      // Body
      ctx.fillStyle = `rgba(${k.col[0]},${k.col[1]},${k.col[2]},0.9)`;
      ctx.beginPath(); ctx.ellipse(0, 0, k.size, k.size * 0.42, 0, 0, TAU); ctx.fill();

      // Tail
      ctx.save();
      ctx.translate(-k.size * 0.85, 0);
      ctx.rotate(tailWag);
      ctx.fillStyle = `rgba(${k.col[0]},${k.col[1]},${k.col[2]},0.7)`;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-k.size * 0.55, -k.size * 0.38);
      ctx.lineTo(-k.size * 0.55,  k.size * 0.38);
      ctx.closePath(); ctx.fill();
      ctx.restore();

      // White patch
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.ellipse(k.size * 0.18, 0, k.size * 0.28, k.size * 0.2, 0, 0, TAU); ctx.fill();

      ctx.restore();
    }
    ctx.restore();
  }

  // ── mist ─────────────────────────────────────────────────────────────────
  function drawMist(peace, time) {
    if (peace < 0.25) return;
    const a = (peace - 0.25) / 0.75;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 4; i++) {
      const my = H * (0.52 + i * 0.1) + Math.sin(time * 0.00045 + i * 1.1) * 8;
      const mw = W * (0.7 + i * 0.15);
      const mg = ctx.createLinearGradient(W * 0.5 - mw, my, W * 0.5 + mw, my);
      mg.addColorStop(0, 'rgba(220,210,220,0)');
      mg.addColorStop(0.3, `rgba(220,210,220,${(0.04 + i * 0.015) * a})`);
      mg.addColorStop(0.7, `rgba(220,210,220,${(0.04 + i * 0.015) * a})`);
      mg.addColorStop(1, 'rgba(220,210,220,0)');
      ctx.fillStyle = mg;
      ctx.fillRect(W * 0.5 - mw, my, mw * 2, 28 + i * 8);
    }
    ctx.restore();
  }

  // ── fireflies ────────────────────────────────────────────────────────────
  function drawFireflies(peace, time) {
    if (peace < 0.7) return;
    const a = (peace - 0.7) / 0.3;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const f of fireflies) {
      const fx = f.x + Math.sin(time * f.speed * 0.001 + f.phase) * f.amp;
      const fy = f.y + Math.cos(time * f.speed * 0.00075 + f.phase * 1.3) * f.amp * 0.55;
      const glow = 0.4 + 0.6 * Math.abs(Math.sin(time * 0.003 + f.phase));
      const fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, f.s * 5);
      fg.addColorStop(0, `rgba(200,255,160,${0.7 * glow * a})`);
      fg.addColorStop(1, 'rgba(180,255,120,0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.arc(fx, fy, f.s * 5, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(220,255,180,${glow * a})`;
      ctx.beginPath(); ctx.arc(fx, fy, f.s, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  // ── petal particles ───────────────────────────────────────────────────────
  function spawnPetals(peace) {
    const rate = lerp(0.015, 0.55, ease(peace));
    if (Math.random() > rate || petals.length >= 120) return;
    const side = Math.random() < 0.5 ? 0 : 1;
    const cols = [
      'rgba(255,200,210,', 'rgba(255,215,220,', 'rgba(255,185,200,',
      'rgba(255,230,235,', 'rgba(250,195,215,',
    ];
    petals.push({
      x: side ? -8 : W + 8,
      y: H * 0.05 + Math.random() * H * 0.55,
      vx: (side ? 1 : -1) * (0.3 + Math.random() * 0.8),
      vy: 0.25 + Math.random() * 0.55,
      rot: Math.random() * TAU,
      rotSpd: (Math.random() - 0.5) * 0.07,
      size: 3 + Math.random() * 4,
      alpha: 0.7 + Math.random() * 0.3,
      col: cols[Math.floor(Math.random() * cols.length)],
      wobble: Math.random() * TAU,
      wobbleSpd: 0.02 + Math.random() * 0.03,
    });
  }

  function updatePetals() {
    petals = petals.filter((p) => p.y < H + 20 && p.alpha > 0.04 && p.x > -30 && p.x < W + 30);
    for (const p of petals) {
      p.wobble += p.wobbleSpd;
      p.x += p.vx + Math.sin(p.wobble) * 0.4;
      p.y += p.vy;
      p.rot += p.rotSpd;
      if (p.y > H * 0.82) p.alpha *= 0.97;
    }
  }

  function drawPetals() {
    for (const p of petals) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.col + p.alpha + ')';
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size, p.size * 0.48, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  // ── disturbance ripple ────────────────────────────────────────────────────
  function drawDisturbance(time) {
    if (disturbance < 0.02) return;
    disturbance *= 0.965;
    // Gentle ripple rings on pond
    const cx = pondCX(), cy = pondCY(), rx = pondRX(), ry = pondRY();
    ctx.save();
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU); ctx.clip();
    for (let i = 0; i < 3; i++) {
      const t = (disturbance + i * 0.33) % 1;
      const rr = rx * 0.15 * (1 - t);
      ctx.strokeStyle = `rgba(255,255,255,${t * disturbance * 0.5})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(cx, cy, rr, rr * (ry / rx), 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  // ── frame loop ────────────────────────────────────────────────────────────
  function frame(now) {
    const time = now - t0;
    const date = clockDate();
    const h = date.getHours() + date.getMinutes() / 60;
    let day;
    if (h < 5 || h >= 21) day = 0;
    else if (h < 7) day = (h - 5) / 2;
    else if (h < 18) day = 1;
    else day = 1 - (h - 18) / 3;

    const peace = peaceLevel();
    ctx.clearRect(0, 0, W, H);

    drawSky(peace, day);
    drawMountains(day);
    drawGround(peace, day);
    drawTrees(peace, day);
    drawLantern(W * 0.30, H * 0.76, peace, day);
    drawLantern(W * 0.70, H * 0.74, peace, day);
    drawPond(peace, day, time);
    drawKoi(peace, time);
    drawMist(peace, time);
    drawFireflies(peace, time);
    spawnPetals(peace);
    updatePetals();
    drawPetals();
    drawDisturbance(time);

    raf = requestAnimationFrame(frame);
  }

  const onResize = () => resize();
  resize();
  window.addEventListener('resize', onResize);
  canvas.addEventListener('mousemove', onActivity);
  canvas.addEventListener('touchstart', onActivity, { passive: true });
  canvas.addEventListener('click', onActivity);
  raf = requestAnimationFrame(frame);

  return {
    setData,
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('mousemove', onActivity);
      canvas.removeEventListener('touchstart', onActivity);
      canvas.removeEventListener('click', onActivity);
    },
  };
}
