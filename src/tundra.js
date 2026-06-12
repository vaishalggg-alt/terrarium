// Canvas world engine for the Tundra biome.
//
//   • Each frozen thought becomes a chunky ice block resting on the tundra.
//   • The scene: deep arctic night sky, aurora borealis ribbons, stars, a
//     large moon, distant snow-capped mountains, and a snow-covered flat plain.
//   • Gentle snowfall — 60 deterministic-ish particles drift across the scene.
//   • Ice blocks glow with a faint shimmer and display the first ~28 chars of
//     the frozen text etched inside. Click a block to read / thaw it.

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Deterministic per-index pseudo-random so block layout is stable on reload
function rng(seed) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export function createTundra(canvas, { onIceClick } = {}) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
  let freezes = [];
  let blocks = [];
  let snow = [];
  let raf = 0;
  let t0 = performance.now();

  // ── layout constants (computed on resize) ────────────────────────────────
  let groundY = 0;   // y where ground starts
  let skyH = 0;      // height of sky section

  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = rect.width; H = rect.height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    groundY = H * 0.68;
    skyH = groundY;
    initSnow();
    rebuildBlocks();
  }

  // ── snow particles ────────────────────────────────────────────────────────

  function initSnow() {
    snow = Array.from({ length: 60 }, (_, i) => {
      const r = rng(i * 7 + 3);
      return {
        x: r() * W,
        y: r() * H,
        speed: 0.3 + r() * 0.5,
        size: 1 + r() * 2,
        drift: (r() - 0.5) * 0.25,
        phase: r() * TAU,
      };
    });
  }

  // ── ice blocks ────────────────────────────────────────────────────────────

  const BW = 70;  // block width (logical px)
  const BH = 55;  // block height

  function rebuildBlocks() {
    if (!W || !H) return;
    const n = freezes.length;
    if (n === 0) { blocks = []; return; }

    // Divide ground strip into columns and rows
    const cols = Math.max(1, Math.floor((W - 40) / (BW + 22)));
    const rows = Math.ceil(n / cols);
    const cellW = (W - 40) / cols;

    blocks = freezes.map((freeze, k) => {
      const col = k % cols;
      const row = Math.floor(k / cols);
      const r = rng(k + 1);

      // Center of slot + jitter
      const jx = (r() - 0.5) * (cellW * 0.32);
      const jy = (r() - 0.5) * 14;

      // Stack rows upward from the bottom: bottom row sits just above ground,
      // subsequent rows go higher so they don't overlap
      const baseY = groundY - BH * 0.5 - 16;
      const rowSpacing = BH + 18;
      const cx = 20 + col * cellW + cellW * 0.5 + jx;
      const cy = baseY - row * rowSpacing + jy;

      // Age: newer = slightly larger and deeper blue tint
      const age = Date.now() - freeze.ts;
      const ageFactor = clamp(1 - age / (1000 * 60 * 60 * 24 * 7), 0, 1); // 0..1, 1=brand new

      return {
        freeze,
        cx,
        cy,
        w: BW + ageFactor * 6,
        h: BH + ageFactor * 4,
        ageFactor,
        glintPhase: r() * TAU,
        shimmerSpeed: 0.6 + r() * 0.6,
      };
    });
  }

  function setData({ freezes: fs }) {
    const changed = fs.length !== freezes.length;
    freezes = fs;
    if (changed || blocks.length === 0) rebuildBlocks();
    // also refresh in case text changed (thaw + new)
    else {
      // re-map freeze data into existing blocks
      freezes.forEach((f, i) => {
        if (blocks[i]) blocks[i].freeze = f;
      });
    }
  }

  // ── sky ───────────────────────────────────────────────────────────────────

  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, groundY);
    g.addColorStop(0,   '#080e1e');
    g.addColorStop(0.4, '#0d1530');
    g.addColorStop(1,   '#142244');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, groundY + 10);
  }

  function drawStars() {
    ctx.fillStyle = 'rgba(220,230,255,0.75)';
    for (let i = 0; i < 80; i++) {
      const r = rng(i * 13 + 7);
      const x = r() * W;
      const y = r() * groundY * 0.75;
      const s = 0.7 + r() * 1.1;
      ctx.beginPath();
      ctx.arc(x, y, s, 0, TAU);
      ctx.fill();
    }
  }

  function drawMoon() {
    const mx = W * 0.82;
    const my = groundY * 0.22;
    const mr = 28;

    // Glow
    const glow = ctx.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 3.5);
    glow.addColorStop(0, 'rgba(200,220,255,0.18)');
    glow.addColorStop(1, 'rgba(200,220,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(mx, my, mr * 3.5, 0, TAU); ctx.fill();

    // Moon body
    const mg = ctx.createRadialGradient(mx - 6, my - 6, 4, mx, my, mr);
    mg.addColorStop(0, '#e8efff');
    mg.addColorStop(0.6, '#c8daff');
    mg.addColorStop(1, '#9ab8e8');
    ctx.fillStyle = mg;
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();
  }

  function drawAurora(time) {
    const ribbons = [
      { y: groundY * 0.18, color1: 'rgba(40,200,140,0.22)', color2: 'rgba(40,200,140,0)', freq: 0.0045, phase: 0, speed: 0.00028 },
      { y: groundY * 0.26, color1: 'rgba(60,220,200,0.18)', color2: 'rgba(60,220,200,0)', freq: 0.0038, phase: 1.8, speed: 0.00022 },
      { y: groundY * 0.13, color1: 'rgba(80,180,255,0.16)', color2: 'rgba(80,180,255,0)', freq: 0.0055, phase: 3.3, speed: 0.00034 },
      { y: groundY * 0.32, color1: 'rgba(100,240,160,0.12)', color2: 'rgba(100,240,160,0)', freq: 0.0031, phase: 5.1, speed: 0.00018 },
    ];

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    for (const rib of ribbons) {
      const amplitude = groundY * 0.065;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 4) {
        const y = rib.y + Math.sin(x * rib.freq + rib.phase + time * rib.speed) * amplitude
                       + Math.sin(x * rib.freq * 1.7 + rib.phase * 0.5 - time * rib.speed * 0.8) * amplitude * 0.4;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      const thickness = groundY * 0.06;
      ctx.lineWidth = thickness;
      const grad = ctx.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0,   'rgba(0,0,0,0)');
      grad.addColorStop(0.1, rib.color1);
      grad.addColorStop(0.5, rib.color1);
      grad.addColorStop(0.9, rib.color1);
      grad.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.strokeStyle = grad;
      ctx.stroke();
    }

    ctx.restore();
  }

  // ── mountains ────────────────────────────────────────────────────────────

  function drawMountains() {
    // Distant range — darker, hazier
    ctx.fillStyle = '#1a2540';
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    const peaks1 = [
      [0, groundY * 0.82], [W * 0.08, groundY * 0.58], [W * 0.16, groundY * 0.78],
      [W * 0.25, groundY * 0.50], [W * 0.34, groundY * 0.72], [W * 0.44, groundY * 0.44],
      [W * 0.52, groundY * 0.68], [W * 0.62, groundY * 0.46], [W * 0.70, groundY * 0.70],
      [W * 0.80, groundY * 0.53], [W * 0.90, groundY * 0.76], [W, groundY * 0.60],
      [W, groundY],
    ];
    for (const [x, y] of peaks1) ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fill();

    // Snow caps on distant range
    ctx.fillStyle = 'rgba(200,220,255,0.35)';
    const snowCaps1 = [
      { px: W * 0.08, py: groundY * 0.58, lx: W * 0.03, rx: W * 0.13 },
      { px: W * 0.25, py: groundY * 0.50, lx: W * 0.19, rx: W * 0.31 },
      { px: W * 0.44, py: groundY * 0.44, lx: W * 0.38, rx: W * 0.50 },
      { px: W * 0.62, py: groundY * 0.46, lx: W * 0.56, rx: W * 0.68 },
      { px: W * 0.80, py: groundY * 0.53, lx: W * 0.75, rx: W * 0.85 },
    ];
    for (const { px, py, lx, rx } of snowCaps1) {
      const capH = (lerp(lx, rx, 0.5) - lx) * 0.55;
      ctx.beginPath();
      ctx.moveTo(lx, py + capH * 1.8);
      ctx.quadraticCurveTo(px, py - capH * 0.3, rx, py + capH * 1.8);
      ctx.closePath();
      ctx.fill();
    }

    // Closer range — slightly lighter
    ctx.fillStyle = '#222e4a';
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    const peaks2 = [
      [0, groundY * 0.92], [W * 0.06, groundY * 0.70], [W * 0.14, groundY * 0.88],
      [W * 0.22, groundY * 0.63], [W * 0.30, groundY * 0.85], [W * 0.38, groundY * 0.74],
      [W * 0.48, groundY * 0.58], [W * 0.57, groundY * 0.80], [W * 0.66, groundY * 0.64],
      [W * 0.75, groundY * 0.84], [W * 0.86, groundY * 0.68], [W * 0.94, groundY * 0.82],
      [W, groundY * 0.74], [W, groundY],
    ];
    for (const [x, y] of peaks2) ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fill();

    // Snow caps on closer range
    ctx.fillStyle = 'rgba(210,230,255,0.55)';
    const snowCaps2 = [
      { px: W * 0.22, py: groundY * 0.63, lx: W * 0.16, rx: W * 0.28 },
      { px: W * 0.48, py: groundY * 0.58, lx: W * 0.42, rx: W * 0.54 },
      { px: W * 0.66, py: groundY * 0.64, lx: W * 0.60, rx: W * 0.72 },
      { px: W * 0.86, py: groundY * 0.68, lx: W * 0.81, rx: W * 0.91 },
    ];
    for (const { px, py, lx, rx } of snowCaps2) {
      const capH = (lerp(lx, rx, 0.5) - lx) * 0.6;
      ctx.beginPath();
      ctx.moveTo(lx, py + capH * 1.6);
      ctx.quadraticCurveTo(px, py - capH * 0.4, rx, py + capH * 1.6);
      ctx.closePath();
      ctx.fill();
    }
  }

  // ── ground ────────────────────────────────────────────────────────────────

  function drawGround() {
    const g = ctx.createLinearGradient(0, groundY, 0, H);
    g.addColorStop(0, '#d8e8f8');
    g.addColorStop(0.3, '#c8dcf0');
    g.addColorStop(1, '#b8cce4');
    ctx.fillStyle = g;
    ctx.fillRect(0, groundY, W, H - groundY);

    // Blue shadow drifts on snow
    ctx.fillStyle = 'rgba(100,140,200,0.12)';
    for (let i = 0; i < 6; i++) {
      const r = rng(i * 17 + 99);
      const sx = r() * W;
      const sy = groundY + r() * (H - groundY) * 0.8;
      const sw = 60 + r() * 120;
      const sh = 6 + r() * 10;
      ctx.beginPath();
      ctx.ellipse(sx, sy, sw, sh, 0, 0, TAU);
      ctx.fill();
    }

    // Horizon snow ridge
    ctx.fillStyle = 'rgba(230,242,255,0.9)';
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    for (let x = 0; x <= W; x += 12) {
      const y = groundY - 3 - Math.sin(x * 0.042) * 3 - Math.sin(x * 0.019) * 4;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, groundY + 6);
    ctx.lineTo(0, groundY + 6);
    ctx.closePath();
    ctx.fill();
  }

  // ── snowfall ──────────────────────────────────────────────────────────────

  function drawSnow(time) {
    ctx.fillStyle = 'rgba(220,235,255,0.80)';
    for (const p of snow) {
      p.y += p.speed;
      p.x += Math.sin(time * 0.001 + p.phase) * p.drift;
      if (p.y > H + 5) p.y = -5;
      if (p.x > W + 5) p.x = -5;
      if (p.x < -5) p.x = W + 5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
    }
  }

  // ── ice blocks ────────────────────────────────────────────────────────────

  function drawBlock(b, time) {
    const { cx, cy, w, h, ageFactor, glintPhase, shimmerSpeed, freeze } = b;
    const x = cx - w / 2;
    const y = cy - h / 2;

    // Slight hover pulse
    const pulse = Math.sin(time * 0.001 * shimmerSpeed + glintPhase) * 2;
    const dy = pulse;

    ctx.save();
    ctx.translate(0, dy);

    // Drop shadow
    ctx.shadowColor = 'rgba(80,120,200,0.35)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 4;

    // Base fill — gradient top→bottom
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    // Newer blocks are slightly more vivid blue
    const alpha1 = 0.28 + ageFactor * 0.12;
    const alpha2 = 0.48 + ageFactor * 0.12;
    grad.addColorStop(0, `rgba(160,220,255,${alpha1})`);
    grad.addColorStop(1, `rgba(100,180,240,${alpha2})`);

    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Stroke
    ctx.strokeStyle = 'rgba(200,240,255,0.80)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6);
    ctx.stroke();

    // Inner bevel highlight — top + left edge
    ctx.strokeStyle = 'rgba(240,255,255,0.50)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x + 3, y + 3, w - 6, h - 6, 4);
    ctx.stroke();

    // Etched text inside
    const raw = freeze.text || '';
    const label = raw.length > 28 ? raw.slice(0, 28) + '…' : raw;
    ctx.font = '11px Nunito, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(220,240,255,0.70)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy + 2);

    // Glint sweep — a small bright arc that moves across periodically
    const glintT = ((time * 0.00045 * shimmerSpeed + glintPhase / TAU) % 1);
    if (glintT < 0.35) {
      const gx = x + glintT * (w / 0.35);
      const glintAlpha = Math.sin(glintT / 0.35 * Math.PI) * 0.65;
      const glint = ctx.createLinearGradient(gx - 6, y, gx + 6, y + h);
      glint.addColorStop(0, 'rgba(255,255,255,0)');
      glint.addColorStop(0.5, `rgba(255,255,255,${glintAlpha})`);
      glint.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 6);
      ctx.clip();
      ctx.fillStyle = glint;
      ctx.fillRect(gx - 8, y, 16, h);
      ctx.restore();
    }

    ctx.restore();
  }

  // ── hit detection ─────────────────────────────────────────────────────────

  function iceAt(mx, my) {
    for (let i = blocks.length - 1; i >= 0; i--) {
      const { cx, cy, w, h } = blocks[i];
      const x = cx - w / 2;
      const y = cy - h / 2;
      if (mx >= x && mx <= x + w && my >= y && my <= y + h) return i;
    }
    return -1;
  }

  // ── frame loop ────────────────────────────────────────────────────────────

  function frame(now) {
    const time = now - t0;
    drawSky();
    drawStars();
    drawAurora(time);
    drawMoon();
    drawMountains();
    drawGround();
    for (const b of blocks) drawBlock(b, time);
    drawSnow(time);
    raf = requestAnimationFrame(frame);
  }

  // ── interaction ───────────────────────────────────────────────────────────

  function toCanvasXY(e) {
    const rect = canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  function onClick(e) {
    const [mx, my] = toCanvasXY(e);
    const idx = iceAt(mx, my);
    if (idx >= 0) onIceClick?.(idx, freezes[idx]);
  }

  function onMouseMove(e) {
    const [mx, my] = toCanvasXY(e);
    canvas.style.cursor = iceAt(mx, my) >= 0 ? 'pointer' : '';
  }

  const onResize = () => resize();
  resize();
  window.addEventListener('resize', onResize);
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('mousemove', onMouseMove);
  raf = requestAnimationFrame(frame);

  return {
    setData,
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('mousemove', onMouseMove);
    },
  };
}
