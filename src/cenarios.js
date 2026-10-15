/*
 * Cenários dos campos de tiro.
 * Cada tema tem céu, relevo, decoração, clima (partículas) e animações próprias.
 * As partes estáticas são desenhadas uma vez em canvas fora da tela; o resto é animado a cada quadro.
 */
export const Scenery = (() => {
  'use strict';

  // O fundo é desenhado com a largura máxima do jogo (telas largas); o que passa da tela é cortado.
  const W = 1920, H = 720, GROUND_Y = 640;
  const TAU = Math.PI * 2;
  const RES = 1.5;                       // resolução dos canvas pré-desenhados
  let visivel = 1280;                    // largura lógica que aparece agora (muda com a tela)

  const rand = (a, b) => a + Math.random() * (b - a);

  // Gerador aleatório com semente: o cenário sai sempre igual
  function seeded(seed) {
    return () => {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------------------
  // Ferramentas de desenho
  // ---------------------------------------------------------------------------
  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function layer(draw, res = RES, largura = W) {
    const c = document.createElement('canvas');
    c.width = largura * res;
    c.height = H * res;
    const b = c.getContext('2d');
    b.scale(res, res);
    draw(b);
    return c;
  }

  function vgrad(b, y0, y1, stops) {
    const g = b.createLinearGradient(0, y0, 0, y1);
    for (const [o, c] of stops) g.addColorStop(o, c);
    return g;
  }

  function hillY(x, base, amp, f1, f2, ph) {
    return base - amp * (Math.sin(x * f1 + ph) * 0.6 + Math.sin(x * f2 + ph * 2.1 + 1.3) * 0.4);
  }

  function fillHill(b, fn, top, stops, rim) {
    b.fillStyle = vgrad(b, top, GROUND_Y, stops);
    b.beginPath();
    b.moveTo(0, GROUND_Y + 20);
    for (let x = 0; x <= W; x += 8) b.lineTo(x, fn(x));
    b.lineTo(W, GROUND_Y + 20);
    b.closePath();
    b.fill();
    if (rim) {
      b.strokeStyle = rim;
      b.lineWidth = 2;
      b.beginPath();
      for (let x = 0; x <= W; x += 8) x ? b.lineTo(x, fn(x) + 1) : b.moveTo(x, fn(x) + 1);
      b.stroke();
    }
  }

  function haze(b, y0, y1, rgb, alpha) {
    const g = b.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, `rgba(${rgb},0)`);
    g.addColorStop(1, `rgba(${rgb},${alpha})`);
    b.fillStyle = g;
    b.fillRect(0, y0, W, y1 - y0);
  }

  function paintSky(b, th) {
    b.fillStyle = vgrad(b, 0, GROUND_Y, th.sky);
    b.fillRect(0, 0, W, H);

    if (th.stars) {
      const rnd = seeded(5);
      for (let i = 0; i < 160; i++) {
        const x = rnd() * W, y = rnd() * rnd() * 400;
        const a = (1 - y / 400) * (0.4 + rnd() * 0.6);
        b.fillStyle = `rgba(255,255,255,${a})`;
        b.beginPath(); b.arc(x, y, 0.4 + rnd() * 1.3, 0, TAU); b.fill();
      }
    }

    const s = th.sun;
    const glow = b.createRadialGradient(s.x, s.y, s.r * 0.5, s.x, s.y, s.glowR);
    glow.addColorStop(0, s.glow[0]);
    glow.addColorStop(0.25, s.glow[1]);
    glow.addColorStop(1, s.glow[2]);
    b.fillStyle = glow;
    b.fillRect(0, 0, W, H);

    const disc = b.createRadialGradient(s.x - s.r * 0.2, s.y - s.r * 0.2, s.r * 0.1, s.x, s.y, s.r);
    disc.addColorStop(0, s.core);
    disc.addColorStop(1, s.edge);
    b.fillStyle = disc;
    b.beginPath(); b.arc(s.x, s.y, s.r, 0, TAU); b.fill();
  }

  // Cordilheira: picos com face iluminada, face na sombra e neve opcional
  function mountainRange(b, rnd, o) {
    const base = o.base;
    for (let x = o.start ?? -150; x < W + 200; x += o.step[0] + rnd() * (o.step[1] - o.step[0])) {
      const px = x;
      const py = o.peak[0] + rnd() * (o.peak[1] - o.peak[0]);
      const hw = o.hw[0] + rnd() * (o.hw[1] - o.hw[0]);
      const lx = px - hw * 0.35, ly = py + (base - py) * 0.35 + (rnd() - 0.5) * 24;
      const rx = px + hw * 0.4, ry = py + (base - py) * 0.4 + (rnd() - 0.5) * 24;
      const path = () => {
        b.beginPath();
        b.moveTo(px - hw, base); b.lineTo(lx, ly); b.lineTo(px, py); b.lineTo(rx, ry); b.lineTo(px + hw, base);
        b.closePath();
      };
      path();
      b.fillStyle = o.light;
      b.fill();

      b.save();
      path();
      b.clip();
      const shadowFace = () => {
        b.beginPath();
        b.moveTo(px, py); b.lineTo(rx, ry); b.lineTo(px + hw, base); b.lineTo(px + hw * 0.05, base);
        b.lineTo(px + hw * 0.12, py + (base - py) * 0.55);
        b.closePath();
      };
      shadowFace();
      b.fillStyle = o.dark;
      b.fill();

      if (o.snow) {
        const sl = py + (base - py) * o.snowF;
        const span = hw * o.snowF * 1.4;
        b.fillStyle = o.snow;
        b.beginPath();
        b.moveTo(px - hw, py - 20);
        b.lineTo(px + hw, py - 20);
        b.lineTo(px + span, sl);
        for (let k = 1; k < 7; k++) b.lineTo(px + span - k * (2 * span / 7), sl + (k % 2 ? -10 : 6) + (rnd() - 0.5) * 6);
        b.lineTo(px - span, sl);
        b.closePath();
        b.fill();
        shadowFace();
        b.fillStyle = o.snowShade;
        b.fill();
      }
      b.restore();
    }
  }

  function pineTree(b, x, y, s, light, dark, tiers = 3) {
    b.fillStyle = '#4e342e';
    b.fillRect(x - 3 * s, y - 12 * s, 6 * s, 12 * s);
    for (let i = 0; i < tiers; i++) {
      const ty = y - 8 * s - i * 14 * s, w = (22 - i * (14 / tiers)) * s, h = 28 * s;
      b.fillStyle = dark;
      b.beginPath(); b.moveTo(x, ty - h); b.lineTo(x + w, ty); b.lineTo(x - w, ty); b.closePath(); b.fill();
      b.fillStyle = light;
      b.beginPath(); b.moveTo(x, ty - h); b.lineTo(x - w, ty); b.lineTo(x - w * 0.1, ty); b.closePath(); b.fill();
    }
  }

  function blobCanopy(b, x, y, s, blobs, pal) {
    b.fillStyle = pal[2];
    for (const [ox, oy, r] of blobs) { b.beginPath(); b.arc(x + (ox + 3) * s, y + (oy + 4) * s, r * s, 0, TAU); b.fill(); }
    for (const [ox, oy, r] of blobs) {
      const cx = x + ox * s, cy = y + oy * s, rr = r * s;
      const g = b.createRadialGradient(cx - rr * 0.4, cy - rr * 0.5, rr * 0.1, cx, cy, rr);
      g.addColorStop(0, pal[0]);
      g.addColorStop(1, pal[1]);
      b.fillStyle = g;
      b.beginPath(); b.arc(cx, cy, rr, 0, TAU); b.fill();
    }
  }

  function roundTree(b, x, y, s, pal) {
    b.fillStyle = 'rgba(30,60,20,0.22)';
    b.beginPath(); b.ellipse(x + 4 * s, y + 1, 24 * s, 5 * s, 0, 0, TAU); b.fill();
    const trunk = b.createLinearGradient(x - 6 * s, 0, x + 6 * s, 0);
    trunk.addColorStop(0, '#8d6e63');
    trunk.addColorStop(1, '#4e342e');
    b.fillStyle = trunk;
    b.beginPath();
    b.moveTo(x - 6 * s, y); b.lineTo(x - 4 * s, y - 36 * s); b.lineTo(x + 4 * s, y - 36 * s); b.lineTo(x + 6 * s, y);
    b.fill();
    blobCanopy(b, x, y, s, [[0, -52, 27], [-20, -40, 19], [20, -41, 19], [-10, -68, 18], [11, -66, 17]], pal);
  }

  // Árvore grande e frondosa (bosque)
  function oakTree(b, x, y, s, pal) {
    const tg = b.createLinearGradient(x - 20 * s, 0, x + 20 * s, 0);
    tg.addColorStop(0, '#7b5a4a');
    tg.addColorStop(0.5, '#5d4037');
    tg.addColorStop(1, '#3a2620');
    b.fillStyle = tg;
    b.beginPath();
    b.moveTo(x - 26 * s, y);
    b.quadraticCurveTo(x - 10 * s, y - 20 * s, x - 11 * s, y - 120 * s);
    b.lineTo(x - 40 * s, y - 190 * s); b.lineTo(x - 31 * s, y - 196 * s);
    b.lineTo(x - 3 * s, y - 150 * s);
    b.lineTo(x + 3 * s, y - 205 * s); b.lineTo(x + 13 * s, y - 203 * s);
    b.lineTo(x + 11 * s, y - 140 * s);
    b.lineTo(x + 40 * s, y - 186 * s); b.lineTo(x + 47 * s, y - 178 * s);
    b.lineTo(x + 13 * s, y - 108 * s);
    b.quadraticCurveTo(x + 11 * s, y - 20 * s, x + 28 * s, y);
    b.closePath();
    b.fill();
    blobCanopy(b, x, y, s,
      [[0, -232, 70], [-62, -206, 52], [62, -206, 55], [-30, -272, 50], [36, -270, 48], [-92, -176, 36], [92, -178, 38], [0, -186, 48]],
      pal);
  }

  function mushroom(b, x, y, s) {
    b.fillStyle = '#f3e6cf';
    roundRect(b, x - 3 * s, y - 10 * s, 6 * s, 10 * s, 2 * s);
    b.fill();
    const cap = b.createLinearGradient(0, y - 18 * s, 0, y - 8 * s);
    cap.addColorStop(0, '#ef5350');
    cap.addColorStop(1, '#b71c1c');
    b.fillStyle = cap;
    b.beginPath(); b.ellipse(x, y - 10 * s, 10 * s, 8 * s, 0, Math.PI, 0); b.fill();
    b.fillStyle = '#fff';
    for (const [ox, oy, r] of [[-4, -14, 1.8], [3, -15, 1.4], [6, -11, 1.2], [-7, -11, 1.1]]) {
      b.beginPath(); b.arc(x + ox * s, y + oy * s, r * s, 0, TAU); b.fill();
    }
  }

  function fern(b, x, y, s, color) {
    b.strokeStyle = color;
    b.lineWidth = 2 * s;
    b.lineCap = 'round';
    for (const a of [-1.1, -0.6, -0.2, 0.25, 0.7]) {
      const ex = x + Math.sin(a) * 30 * s, ey = y - Math.cos(a) * 26 * s;
      b.beginPath(); b.moveTo(x, y); b.quadraticCurveTo(x + Math.sin(a) * 10 * s, ey, ex, ey + 8 * s); b.stroke();
      for (let k = 1; k < 5; k++) {
        const t = k / 5, lx = x + (ex - x) * t, ly = y + (ey + 8 * s - y) * t - Math.sin(t * Math.PI) * 6 * s;
        b.beginPath(); b.moveTo(lx, ly); b.lineTo(lx - 4 * s, ly - 5 * s); b.moveTo(lx, ly); b.lineTo(lx + 4 * s, ly - 5 * s); b.stroke();
      }
    }
  }

  function house(b, x, y, s, wall, roof) {
    const w = 36 * s, h = 24 * s;
    b.fillStyle = wall;
    b.fillRect(x - w / 2, y - h, w, h);
    b.fillStyle = 'rgba(0,0,0,0.12)';
    b.fillRect(x + w * 0.15, y - h, w * 0.35, h);
    b.fillStyle = roof;
    b.beginPath(); b.moveTo(x - w / 2 - 4 * s, y - h + 1); b.lineTo(x - w * 0.1, y - h - 18 * s); b.lineTo(x + w / 2 + 4 * s, y - h + 1); b.closePath(); b.fill();
    b.fillStyle = '#5d4037';
    b.fillRect(x - w * 0.32, y - 12 * s, 7 * s, 12 * s);
    b.fillStyle = '#ffe082';
    b.fillRect(x + w * 0.05, y - 17 * s, 7 * s, 6 * s);
    b.fillStyle = '#8d6e63';
    b.fillRect(x + w * 0.22, y - h - 14 * s, 5 * s, 10 * s);
  }

  function castle(b, cx, gy, flags, windows) {
    const wall = '#4b3658', light = '#6c5079';
    const tower = (x, w, h, cone) => {
      const top = gy - h;
      const g = b.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
      g.addColorStop(0, light);
      g.addColorStop(0.55, wall);
      g.addColorStop(1, '#33243f');
      b.fillStyle = g;
      b.fillRect(x - w / 2, top, w, h);
      if (cone) {
        const rg = b.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
        rg.addColorStop(0, '#b0335a');
        rg.addColorStop(1, '#5e1530');
        b.fillStyle = rg;
        b.beginPath(); b.moveTo(x - w / 2 - 6, top); b.lineTo(x, top - w * 1.25); b.lineTo(x + w / 2 + 6, top); b.closePath(); b.fill();
        b.strokeStyle = '#2b1d33';
        b.lineWidth = 2;
        b.beginPath(); b.moveTo(x, top - w * 1.25); b.lineTo(x, top - w * 1.25 - 26); b.stroke();
        flags.push({ x, y: top - w * 1.25 - 26 });
      } else {
        b.fillStyle = wall;
        for (let k = 0; k < 4; k++) b.fillRect(x - w / 2 + k * (w / 3.5), top - 9, w / 6, 9);
      }
      for (let k = 0; k < Math.floor(h / 55); k++) windows.push({ x, y: top + 26 + k * 50 });
    };

    // Muralha
    const g = b.createLinearGradient(0, gy - 95, 0, gy);
    g.addColorStop(0, light);
    g.addColorStop(1, wall);
    b.fillStyle = g;
    b.fillRect(cx - 140, gy - 95, 280, 95);
    b.fillStyle = light;
    for (let x = cx - 140; x < cx + 140; x += 20) b.fillRect(x, gy - 107, 11, 12);
    b.strokeStyle = 'rgba(30,15,40,0.35)';
    b.lineWidth = 1;
    for (let y = gy - 80; y < gy; y += 16) { b.beginPath(); b.moveTo(cx - 140, y); b.lineTo(cx + 140, y); b.stroke(); }

    tower(cx - 150, 46, 165, true);
    tower(cx + 150, 46, 165, true);
    tower(cx - 10, 78, 205, false);
    tower(cx + 42, 34, 255, true);
    tower(cx - 62, 30, 225, true);

    // Portão
    b.fillStyle = '#1f1426';
    b.beginPath(); b.moveTo(cx - 26, gy); b.lineTo(cx - 26, gy - 40); b.arc(cx, gy - 40, 26, Math.PI, 0); b.lineTo(cx + 26, gy); b.closePath(); b.fill();
    b.strokeStyle = '#6d5a3a';
    b.lineWidth = 2;
    for (let x = cx - 20; x <= cx + 20; x += 8) { b.beginPath(); b.moveTo(x, gy); b.lineTo(x, gy - 58); b.stroke(); }

    // Janelas acesas
    for (const w of windows) {
      const wg = b.createRadialGradient(w.x, w.y, 1, w.x, w.y, 22);
      wg.addColorStop(0, 'rgba(255,210,110,0.55)');
      wg.addColorStop(1, 'rgba(255,210,110,0)');
      b.fillStyle = wg;
      b.fillRect(w.x - 22, w.y - 22, 44, 44);
      b.fillStyle = '#ffd36e';
      b.beginPath(); b.moveTo(w.x - 4, w.y + 7); b.lineTo(w.x - 4, w.y - 2); b.arc(w.x, w.y - 2, 4, Math.PI, 0); b.lineTo(w.x + 4, w.y + 7); b.closePath(); b.fill();
    }
  }

  function topiary(b, x, y, kind) {
    b.fillStyle = 'rgba(10,30,10,0.3)';
    b.beginPath(); b.ellipse(x + 3, y, 16, 4, 0, 0, TAU); b.fill();
    b.fillStyle = '#6d4c41';
    b.fillRect(x - 2.5, y - 14, 5, 14);
    const g = b.createRadialGradient(x - 6, y - 40, 2, x, y - 30, 30);
    g.addColorStop(0, '#6fae4a');
    g.addColorStop(1, '#1f5320');
    b.fillStyle = g;
    if (kind === 'cone') {
      b.beginPath(); b.moveTo(x, y - 66); b.quadraticCurveTo(x + 18, y - 20, x + 15, y - 12); b.lineTo(x - 15, y - 12); b.quadraticCurveTo(x - 18, y - 20, x, y - 66); b.fill();
    } else {
      b.beginPath(); b.arc(x, y - 30, 16, 0, TAU); b.fill();
      b.beginPath(); b.arc(x, y - 54, 10, 0, TAU); b.fill();
    }
  }

  // Terra + faixa de grama com "gotas" penduradas
  function soilGround(b, rnd, o) {
    b.fillStyle = vgrad(b, GROUND_Y, H, [[0, o.dirt[0]], [1, o.dirt[1]]]);
    b.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    b.strokeStyle = 'rgba(40,20,10,0.18)';
    b.lineWidth = 3;
    for (const yy of [668, 694]) {
      b.beginPath();
      for (let x = 0; x <= W; x += 10) {
        const y = yy + Math.sin(x * 0.02 + yy) * 3;
        x ? b.lineTo(x, y) : b.moveTo(x, y);
      }
      b.stroke();
    }
    for (let i = 0; i < 40; i++) {
      const x = rnd() * W, y = GROUND_Y + 18 + rnd() * 70, rx = 4 + rnd() * 9, ry = rx * (0.5 + rnd() * 0.2);
      b.fillStyle = vgrad(b, y - ry, y + ry, [[0, o.stone[0]], [1, o.stone[1]]]);
      b.beginPath(); b.ellipse(x, y, rx, ry, 0, 0, TAU); b.fill();
      b.fillStyle = 'rgba(255,255,255,0.22)';
      b.beginPath(); b.ellipse(x - rx * 0.3, y - ry * 0.4, rx * 0.35, ry * 0.25, 0, 0, TAU); b.fill();
    }

    b.fillStyle = vgrad(b, GROUND_Y - 22, GROUND_Y + 14, [[0, o.grass[0]], [0.6, o.grass[1]], [1, o.grass[2]]]);
    b.beginPath();
    b.moveTo(0, GROUND_Y + 8);
    for (let x = 0; x <= W; x += 8) b.lineTo(x, GROUND_Y - 18 + Math.sin(x * 0.05) * 2);
    b.lineTo(W, GROUND_Y + 8);
    for (let x = W; x >= 0; x -= 22) b.quadraticCurveTo(x - 11, GROUND_Y + 18 + (x % 3) * 2, x - 22, GROUND_Y + 8);
    b.closePath();
    b.fill();
    b.strokeStyle = 'rgba(255,255,255,0.25)';
    b.lineWidth = 2;
    b.beginPath();
    for (let x = 0; x <= W; x += 8) x ? b.lineTo(x, GROUND_Y - 17 + Math.sin(x * 0.05) * 2) : b.moveTo(x, GROUND_Y - 17);
    b.stroke();
  }

  function flowers(b, rnd, colors, count) {
    for (let i = 0; i < count; i++) {
      const x = rnd() * W, y = GROUND_Y - 8 + rnd() * 10;
      if (x > 80 && x < 230) continue;
      b.fillStyle = colors[Math.floor(rnd() * colors.length)];
      for (let k = 0; k < 5; k++) {
        const a = k / 5 * TAU;
        b.beginPath(); b.arc(x + Math.cos(a) * 3, y + Math.sin(a) * 3, 2.4, 0, TAU); b.fill();
      }
      b.fillStyle = '#ffb300';
      b.beginPath(); b.arc(x, y, 1.8, 0, TAU); b.fill();
    }
  }

  // Chão de pedra coberto de neve, com pingentes de gelo
  function rockyGround(b, rnd) {
    b.fillStyle = vgrad(b, GROUND_Y, H, [[0, '#7d8994'], [1, '#353e45']]);
    b.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    for (let i = 0; i < 34; i++) {
      const x = rnd() * W, y = GROUND_Y + 22 + rnd() * 62, r = 10 + rnd() * 16;
      b.fillStyle = vgrad(b, y - r, y + r, [[0, '#9aa6b0'], [1, '#55616b']]);
      b.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = k / 6 * TAU + rnd() * 0.4, rr = r * (0.7 + rnd() * 0.3);
        k ? b.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.6) : b.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.6);
      }
      b.closePath();
      b.fill();
      b.strokeStyle = 'rgba(20,28,34,0.45)';
      b.lineWidth = 1.5;
      b.stroke();
    }

    b.fillStyle = vgrad(b, GROUND_Y - 22, GROUND_Y + 14, [[0, '#ffffff'], [0.7, '#e8f1f8'], [1, '#c5d7e6']]);
    b.beginPath();
    b.moveTo(0, GROUND_Y + 8);
    for (let x = 0; x <= W; x += 8) b.lineTo(x, GROUND_Y - 17 + Math.sin(x * 0.04) * 3);
    b.lineTo(W, GROUND_Y + 8);
    for (let x = W; x >= 0; x -= 14) {
      b.lineTo(x - 4, GROUND_Y + 8);
      b.lineTo(x - 7, GROUND_Y + 12 + rnd() * 14);
      b.lineTo(x - 10, GROUND_Y + 8);
    }
    b.closePath();
    b.fill();
    b.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 60; i++) {
      b.beginPath(); b.arc(rnd() * W, GROUND_Y - 14 + rnd() * 20, 0.8 + rnd() * 1.2, 0, TAU); b.fill();
    }
  }

  // ---------------------------------------------------------------------------
  // Plataformas do arqueiro (o topo fica sempre em y = 594)
  // ---------------------------------------------------------------------------
  function woodPiece(b, x, y, w, h, c1, c2) {
    b.fillStyle = vgrad(b, y, y + h, [[0, c1], [1, c2]]);
    roundRect(b, x, y, w, h, 3);
    b.fill();
    b.strokeStyle = '#3e2312';
    b.lineWidth = 2;
    b.stroke();
  }

  function woodPlatform(b, moss) {
    b.fillStyle = 'rgba(30,50,10,0.3)';
    b.beginPath(); b.ellipse(156, GROUND_Y - 4, 82, 9, 0, 0, TAU); b.fill();
    b.save();
    b.translate(156, 625);
    b.rotate(0.62);
    woodPiece(b, -46, -4, 92, 8, '#9c6a3c', '#6d4421');
    b.rotate(-1.24);
    woodPiece(b, -46, -4, 92, 8, '#9c6a3c', '#6d4421');
    b.restore();
    woodPiece(b, 104, 600, 14, 46, '#a5713f', '#6d4421');
    woodPiece(b, 194, 600, 14, 46, '#a5713f', '#6d4421');
    woodPiece(b, 88, 594, 136, 12, '#c48a4f', '#8a5a2d');
    b.strokeStyle = 'rgba(62,35,18,0.5)';
    b.lineWidth = 1;
    for (const x of [122, 156, 190]) { b.beginPath(); b.moveTo(x, 595); b.lineTo(x, 605); b.stroke(); }
    if (moss) {
      b.fillStyle = '#6a9a3a';
      for (const [x, y, rx] of [[96, 605, 9], [210, 606, 12], [111, 630, 6], [200, 618, 7]]) {
        b.beginPath(); b.ellipse(x, y, rx, 4, 0, 0, TAU); b.fill();
      }
      b.strokeStyle = '#4f7f2e';
      b.lineWidth = 2;
      b.beginPath(); b.moveTo(200, 606); b.quadraticCurveTo(206, 620, 198, 636); b.stroke();
    }
  }

  function stoneColumn(b, colors) {
    b.fillStyle = 'rgba(20,30,40,0.3)';
    b.beginPath(); b.ellipse(156, GROUND_Y - 2, 84, 9, 0, 0, TAU); b.fill();
    let row = 0;
    for (let y = 606; y < GROUND_Y + 4; y += 14, row++) {
      const off = row % 2 ? 0 : 15;
      for (let x = 108 - off; x < 204; x += 30) {
        const x0 = Math.max(106, x), x1 = Math.min(206, x + 30);
        b.fillStyle = vgrad(b, y, y + 14, [[0, colors[0]], [1, colors[1]]]);
        b.fillRect(x0, y, x1 - x0, 14);
        b.strokeStyle = colors[2];
        b.lineWidth = 1.5;
        b.strokeRect(x0, y, x1 - x0, 14);
      }
    }
    b.fillStyle = vgrad(b, 594, 608, [[0, colors[3]], [1, colors[1]]]);
    roundRect(b, 86, 594, 140, 14, 4);
    b.fill();
    b.strokeStyle = colors[2];
    b.lineWidth = 2;
    b.stroke();
  }

  function stonePlatform(b) {
    stoneColumn(b, ['#a7b3bc', '#6b7883', '#37434c', '#cfd8dc']);
    b.fillStyle = '#ffffff';
    for (const [x, rx] of [[94, 12], [218, 13]]) { b.beginPath(); b.ellipse(x, 596, rx, 5, 0, Math.PI, 0); b.fill(); }
    b.fillStyle = '#e3eef7';
    for (let x = 92; x < 222; x += 9) {
      b.beginPath(); b.moveTo(x, 608); b.lineTo(x + 2.5, 614 + (x % 4) * 2); b.lineTo(x + 5, 608); b.fill();
    }
  }

  function royalPlatform(b) {
    stoneColumn(b, ['#d8c6aa', '#9c8566', '#4e3d2a', '#efe2c8']);
    b.strokeStyle = '#d4a017';
    b.lineWidth = 2;
    b.beginPath(); b.moveTo(88, 597); b.lineTo(224, 597); b.stroke();
    // Estandarte vermelho com coroa
    b.fillStyle = vgrad(b, 606, 646, [[0, '#c62828'], [1, '#7f1010']]);
    b.beginPath(); b.moveTo(134, 606); b.lineTo(178, 606); b.lineTo(178, 642); b.lineTo(156, 632); b.lineTo(134, 642); b.closePath(); b.fill();
    b.strokeStyle = '#ffca28';
    b.lineWidth = 2;
    b.stroke();
    b.fillStyle = '#ffca28';
    b.beginPath();
    b.moveTo(146, 624); b.lineTo(146, 614); b.lineTo(151, 619); b.lineTo(156, 612); b.lineTo(161, 619); b.lineTo(166, 614); b.lineTo(166, 624);
    b.closePath();
    b.fill();
  }

  // ---------------------------------------------------------------------------
  // Nuvens, grama e partículas de clima
  // ---------------------------------------------------------------------------
  function makeCloudSprite(seed, w, pal) {
    const rnd = seeded(seed);
    const h = w * 0.55;
    const c = document.createElement('canvas');
    c.width = w * 2;
    c.height = h * 2;
    const x = c.getContext('2d');
    x.scale(2, 2);
    const puffs = [];
    const n = 6 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      const px = w * (0.2 + 0.6 * (i / (n - 1))) + (rnd() - 0.5) * w * 0.08;
      const boost = 1 - Math.abs(px / w - 0.5) * 1.3;
      puffs.push({ x: px, y: h * 0.62 - rnd() * h * 0.14 * boost, r: h * (0.16 + 0.2 * boost + rnd() * 0.06) });
    }
    const path = dy => {
      x.beginPath();
      for (const p of puffs) { x.moveTo(p.x + p.r, p.y + dy); x.arc(p.x, p.y + dy, p.r, 0, TAU); }
    };
    path(6);
    x.fillStyle = pal.shadow;
    x.fill();
    path(0);
    x.fillStyle = vgrad(x, h * 0.2, h * 0.9, [[0, pal.top], [0.6, pal.mid], [1, pal.bottom]]);
    x.fill();
    x.save();
    path(0);
    x.clip();
    x.fillStyle = pal.hl;
    for (const p of puffs) { x.beginPath(); x.arc(p.x - p.r * 0.2, p.y - p.r * 0.25, p.r * 0.6, 0, TAU); x.fill(); }
    x.restore();
    return { canvas: c, w, h };
  }

  function makeBlades(seed, o) {
    const rnd = seeded(seed), list = [];
    for (let x = -4; x < W + 8; x += o.step[0] + rnd() * (o.step[1] - o.step[0])) {
      list.push({
        x,
        h: o.h[0] + rnd() * (o.h[1] - o.h[0]),
        lean: (rnd() - 0.5) * 6,
        phase: rnd() * TAU,
        color: o.colors[Math.floor(rnd() * o.colors.length)],
      });
    }
    return list;
  }

  const AMBIENT = {
    pollen: {
      make: () => ({ x: rand(0, visivel), y: rand(80, 600), r: rand(1, 2.4), phase: rand(0, 6), speed: rand(6, 16) }),
      update(p, dt, t) {
        p.x += p.speed * dt;
        p.y += Math.sin(t * 0.8 + p.phase) * 6 * dt;
        if (p.x > W + 10) { p.x = -10; p.y = rand(80, 600); }
      },
      draw(ctx, p, t) {
        ctx.fillStyle = `rgba(255,250,220,${0.25 + 0.25 * Math.sin(t * 2 + p.phase)})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
      },
      glow: true,
    },
    leaves: {
      make: () => ({
        x: rand(0, visivel), y: rand(-20, GROUND_Y), vy: rand(22, 50), amp: rand(15, 40), phase: rand(0, 6),
        rot: rand(0, 6), vr: rand(-2.5, 2.5), size: rand(4, 7),
        color: ['#e65100', '#f9a825', '#a1662f', '#7cb342', '#ef6c00'][Math.floor(rand(0, 5))],
      }),
      update(p, dt, t) {
        p.y += p.vy * dt;
        p.x += (Math.cos(t * 1.3 + p.phase) * p.amp + 12) * dt;
        p.rot += p.vr * dt;
        if (p.y > GROUND_Y - 6 || p.x > visivel + 20) { p.y = rand(-40, -10); p.x = rand(-60, visivel); }
      },
      draw(ctx, p, t) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(1, 0.4 + Math.abs(Math.sin(t * 3 + p.phase)) * 0.6);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(60,30,10,0.4)';
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(-p.size, 0); ctx.lineTo(p.size, 0); ctx.stroke();
        ctx.restore();
      },
    },
    snow: {
      make: () => ({ x: rand(0, visivel), y: rand(-20, H), r: rand(1, 3), vy: rand(40, 95), phase: rand(0, 6), depth: Math.random() }),
      update(p, dt, t) {
        p.y += p.vy * dt;
        p.x += (-30 - p.depth * 30 + Math.sin(t + p.phase) * 15) * dt;
        if (p.y > H + 5) { p.y = -5; p.x = rand(0, W + 200); }
        if (p.x < -10) p.x = W + 10;
      },
      draw(ctx, p) {
        ctx.fillStyle = `rgba(255,255,255,${0.55 + p.depth * 0.4})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
      },
      front: true,
    },
    fireflies: {
      make: () => ({ x: rand(0, visivel), y: rand(380, 625), phase: rand(0, 6), sx: rand(10, 25), sy: rand(8, 18) }),
      update(p, dt, t) {
        p.x += Math.cos(t * 0.7 + p.phase) * p.sx * dt + 4 * dt;
        p.y += Math.sin(t * 0.9 + p.phase * 1.3) * p.sy * dt;
        if (p.x > W + 10) p.x = -10;
      },
      draw(ctx, p, t) {
        const blink = Math.max(0, Math.sin(t * 2.2 + p.phase));
        if (blink <= 0.02) return;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 12);
        g.addColorStop(0, `rgba(230,255,140,${0.7 * blink})`);
        g.addColorStop(1, 'rgba(230,255,140,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, 12, 0, TAU); ctx.fill();
        ctx.fillStyle = `rgba(255,255,220,${blink})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, 1.8, 0, TAU); ctx.fill();
      },
      glow: true,
    },
  };

  function drawSunRays(ctx, sun, rays, t) {
    ctx.save();
    ctx.translate(sun.x, sun.y);
    ctx.rotate(t * 0.05);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(${rays.color},${rays.alpha})`;
    for (let i = 0; i < 12; i++) {
      ctx.rotate(TAU / 12);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(rays.len || 420, -28); ctx.lineTo(rays.len || 420, 28); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Temas
  // ---------------------------------------------------------------------------
  const WHITE_CLOUDS = { shadow: 'rgba(150,180,210,0.45)', top: '#ffffff', mid: '#f3f8fd', bottom: '#d4e3f1', hl: 'rgba(255,255,255,0.8)' };

  const THEMES = {
    // Dia ensolarado com vila, moinho e flores
    village: {
      seed: 2024,
      sky: [[0, '#2f9fe0'], [0.45, '#73c6ef'], [0.8, '#bfe8f6'], [1, '#f2fbe9']],
      sun: {
        x: 1090, y: 112, r: 48, glowR: 360, core: '#fffef2', edge: '#ffe98a',
        glow: ['rgba(255,250,215,0.95)', 'rgba(255,240,170,0.45)', 'rgba(255,240,170,0)'],
      },
      rays: { color: '255,245,200', alpha: 0.07 },
      clouds: { count: 9, pal: WHITE_CLOUDS },
      ambient: { type: 'pollen', count: 26 },
      blades: { colors: ['#7cb342', '#8bc34a', '#689f38', '#9ccc65'], step: [5, 10], h: [10, 26] },
      dust: ['#bcaaa4', '#a1887f'],
      vignette: 0.38,
      land(b, rnd, scene) {
        mountainRange(b, rnd, {
          base: 600, peak: [300, 410], hw: [170, 280], step: [150, 240],
          light: '#a3b9d4', dark: '#8aa1c0', snow: '#f5f9fd', snowShade: 'rgba(90,110,150,0.18)', snowF: 0.2,
        });
        haze(b, 330, 600, '225,243,246', 0.85);

        const farHill = x => hillY(x, 548, 38, 0.0045, 0.012, 0.4);
        fillHill(b, farHill, 480, [[0, '#a8d58a'], [1, '#7fb862']]);
        for (let i = 0; i < 22; i++) {
          const x = rnd() * W;
          if (x < 260 || (x > 560 && x < 960)) continue;
          pineTree(b, x, farHill(x) + 6, 0.55 + rnd() * 0.3, '#6fa864', '#4f8a4a');
        }
        // Vila no alto da colina
        [[600, '#f5e6c8', '#c0392b'], [648, '#efe0c0', '#a93226'], [700, '#f8ecd4', '#cb4335'], [748, '#f1e2c4', '#b03a2e']]
          .forEach(([x, wall, roof], i) => house(b, x, farHill(x) + 5, 0.75 + (i % 2) * 0.1, wall, roof));
        // Moinho (as pás giram no desenho dinâmico)
        const mx = 880, my = farHill(mx) + 6, s = 1;
        b.fillStyle = vgrad(b, my - 80, my, [[0, '#fbf3e4'], [1, '#d9c9ad']]);
        b.beginPath(); b.moveTo(mx - 16 * s, my); b.lineTo(mx - 9 * s, my - 72 * s); b.lineTo(mx + 9 * s, my - 72 * s); b.lineTo(mx + 16 * s, my); b.closePath(); b.fill();
        b.fillStyle = '#8d3a2b';
        b.beginPath(); b.moveTo(mx - 12 * s, my - 70 * s); b.lineTo(mx, my - 86 * s); b.lineTo(mx + 12 * s, my - 70 * s); b.closePath(); b.fill();
        b.fillStyle = '#5d4037';
        roundRect(b, mx - 4, my - 16, 8, 16, 3);
        b.fill();
        scene.windmill = { x: mx, y: my - 74 * s, s };
        b.fillStyle = 'rgba(225,243,246,0.25)';
        b.fillRect(0, 480, W, 160);

        const nearHill = x => hillY(x, 598, 26, 0.006, 0.017, 2.2);
        fillHill(b, nearHill, 560, [[0, '#9fd16b'], [1, '#6ea843']], 'rgba(255,255,255,0.25)');
        const greens = ['#9ad85a', '#3f8f32', '#2b6a25'], darkGreens = ['#7cc24f', '#2f7a2c', '#1f531d'];
        [[430, 0.8], [490, 0.62], [740, 1.05], [800, 0.7], [985, 0.85], [1170, 1], [1235, 0.7]]
          .forEach(([x, sc], i) => roundTree(b, x, nearHill(x) + 8, sc, i % 2 ? darkGreens : greens));

        soilGround(b, rnd, { dirt: ['#8a6248', '#4a2f22'], stone: ['#b6a59a', '#6d5a50'], grass: ['#9ccc65', '#7cb342', '#558b2f'] });
        flowers(b, rnd, ['#ffffff', '#fff176', '#f48fb1', '#ce93d8'], 34);
        woodPlatform(b, false);
      },
      extras(ctx, t, scene) {
        const { x, y, s } = scene.windmill;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t * 0.8);
        for (let i = 0; i < 4; i++) {
          ctx.rotate(TAU / 4);
          ctx.fillStyle = '#6d4c41';
          ctx.fillRect(-1.5 * s, 0, 3 * s, 46 * s);
          ctx.fillStyle = 'rgba(245,236,220,0.95)';
          ctx.fillRect(1.5 * s, 10 * s, 9 * s, 34 * s);
          ctx.strokeStyle = 'rgba(109,76,65,0.7)';
          ctx.lineWidth = 0.8;
          for (let k = 16; k < 44; k += 7) { ctx.beginPath(); ctx.moveTo(1.5 * s, k * s); ctx.lineTo(10.5 * s, k * s); ctx.stroke(); }
        }
        ctx.fillStyle = '#4e342e';
        ctx.beginPath(); ctx.arc(0, 0, 3.5 * s, 0, TAU); ctx.fill();
        ctx.restore();
      },
    },

    // Floresta na hora dourada, com feixes de luz e folhas caindo
    forest: {
      seed: 777,
      sky: [[0, '#4a8fcf'], [0.4, '#9cc8e0'], [0.75, '#f6d79a'], [1, '#ffe9b8']],
      sun: {
        x: 1010, y: 300, r: 54, glowR: 460, core: '#fffbe8', edge: '#ffd27a',
        glow: ['rgba(255,240,200,0.95)', 'rgba(255,200,120,0.5)', 'rgba(255,190,110,0)'],
      },
      rays: { color: '255,225,170', alpha: 0.045 },
      clouds: { count: 6, pal: { shadow: 'rgba(200,140,90,0.35)', top: '#fff8ea', mid: '#fde8c8', bottom: '#f0c49a', hl: 'rgba(255,255,240,0.7)' } },
      ambient: { type: 'leaves', count: 24 },
      blades: { colors: ['#5b8c32', '#4a7a2a', '#6e9f3c', '#3f6b22'], step: [4, 8], h: [14, 34] },
      dust: ['#a1887f', '#8d6e63'],
      vignette: 0.45,
      land(b, rnd) {
        // Fileiras de pinheiros em profundidade
        const rows = [
          { y: 470, n: 46, s: [0.7, 1.0], light: '#9cb7a2', dark: '#86a48f', fill: '#86a48f' },
          { y: 520, n: 38, s: [0.95, 1.35], light: '#6f9a72', dark: '#55805b', fill: '#55805b' },
          { y: 575, n: 30, s: [1.2, 1.7], light: '#467a45', dark: '#2f5e33', fill: '#2f5e33' },
        ];
        rows.forEach((r, ri) => {
          b.fillStyle = r.fill;
          b.fillRect(0, r.y - 4, W, GROUND_Y - r.y + 24);
          for (let i = 0; i < r.n; i++) {
            const x = (i / r.n) * (W + 80) - 40 + rnd() * 24;
            pineTree(b, x, r.y + rnd() * 10, r.s[0] + rnd() * (r.s[1] - r.s[0]), r.light, r.dark, 4);
          }
          haze(b, r.y - 120, r.y + 10, '255,226,170', 0.32 - ri * 0.08);
        });

        // Árvores grandes emoldurando a cena
        oakTree(b, 330, 612, 1.05, ['#8fbf4a', '#2f6b26', '#1d4a1a']);
        oakTree(b, 1185, 620, 1.25, ['#a2c94f', '#3a7a2c', '#20501c']);
        oakTree(b, 760, 600, 0.75, ['#9cc451', '#3d7b2f', '#24561f']);

        soilGround(b, rnd, { dirt: ['#6d4c35', '#3a261a'], stone: ['#a1887f', '#5d4037'], grass: ['#7aa84a', '#5d8f35', '#3f6b22'] });

        // Tronco caído, cogumelos e samambaias
        b.fillStyle = vgrad(b, 612, 634, [[0, '#8d6e63'], [1, '#4e342e']]);
        roundRect(b, 905, 612, 120, 22, 11);
        b.fill();
        b.fillStyle = '#d7b98e';
        b.beginPath(); b.ellipse(1025, 623, 6, 11, 0, 0, TAU); b.fill();
        b.strokeStyle = '#8d6e63';
        b.lineWidth = 1.5;
        b.beginPath(); b.ellipse(1025, 623, 3, 6, 0, 0, TAU); b.stroke();
        b.fillStyle = '#6a9a3a';
        b.beginPath(); b.ellipse(950, 612, 22, 4, 0, 0, TAU); b.fill();
        [[480, 1], [500, 0.7], [960, 0.9], [1062, 1.1], [640, 0.8], [1240, 0.9]].forEach(([x, s]) => mushroom(b, x, GROUND_Y - 8, s));
        [[420, 0.9], [580, 1.1], [860, 1], [1110, 1.2], [270, 0.8]].forEach(([x, s]) => fern(b, x, GROUND_Y - 10, s, '#4f8a2c'));

        woodPlatform(b, true);
      },
      extras(ctx, t) {
        // Feixes de luz atravessando a floresta
        const sx = 1010, sy = 300;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 6; i++) {
          const ang = 2.25 + i * 0.13;
          const a = 0.03 + 0.022 * Math.sin(t * 0.6 + i * 1.7);
          const dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx;
          const L = 1500, w0 = 6, w1 = 50 + i * 12;
          ctx.fillStyle = `rgba(255,214,140,${a})`;
          ctx.beginPath();
          ctx.moveTo(sx + px * w0, sy + py * w0);
          ctx.lineTo(sx + dx * L + px * w1, sy + dy * L + py * w1);
          ctx.lineTo(sx + dx * L - px * w1, sy + dy * L - py * w1);
          ctx.lineTo(sx - px * w0, sy - py * w0);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      },
    },

    // Montanhas nevadas acima de um mar de nuvens
    peak: {
      seed: 4242,
      sky: [[0, '#0b3d91'], [0.4, '#1e7fd8'], [0.8, '#8cc6f5'], [1, '#e3f2fd']],
      sun: {
        x: 1000, y: 92, r: 38, glowR: 300, core: '#ffffff', edge: '#e8f4ff',
        glow: ['rgba(255,255,255,0.95)', 'rgba(220,240,255,0.45)', 'rgba(220,240,255,0)'],
      },
      rays: { color: '230,245,255', alpha: 0.05 },
      clouds: { count: 10, pal: WHITE_CLOUDS },
      ambient: { type: 'snow', count: 120 },
      blades: { colors: ['#a7b8ae', '#c9d6cf', '#8fa39a'], step: [16, 40], h: [6, 14] },
      dust: ['#ffffff', '#dfe9f2'],
      vignette: 0.4,
      land(b, rnd, scene) {
        mountainRange(b, rnd, {
          base: 590, peak: [190, 320], hw: [200, 300], step: [170, 260],
          light: '#b4c7de', dark: '#90a7c6', snow: '#f7fbff', snowShade: 'rgba(70,100,150,0.22)', snowF: 0.34,
        });
        haze(b, 260, 590, '220,236,250', 0.6);
        mountainRange(b, rnd, {
          base: 610, peak: [300, 420], hw: [150, 230], step: [140, 210], start: -60,
          light: '#8195b2', dark: '#5f7597', snow: '#f2f7fc', snowShade: 'rgba(50,70,120,0.28)', snowF: 0.3,
        });

        // Mar de nuvens cobrindo a base das montanhas
        for (let i = 0; i < 46; i++) {
          const x = (i / 45) * (W + 100) - 50 + rnd() * 20, y = 570 + rnd() * 30, r = 34 + rnd() * 30;
          b.fillStyle = vgrad(b, y - r, y + r, [[0, '#ffffff'], [1, '#c7d9ec']]);
          b.beginPath(); b.arc(x, y, r, 0, TAU); b.fill();
        }
        haze(b, 520, 640, '235,244,252', 0.5);

        // Agulha de rocha à direita
        b.fillStyle = vgrad(b, 420, GROUND_Y, [[0, '#8f9ba6'], [1, '#4b5660']]);
        b.beginPath();
        b.moveTo(1080, GROUND_Y);
        b.lineTo(1120, 520); b.lineTo(1150, 470); b.lineTo(1175, 430); b.lineTo(1200, 455); b.lineTo(1225, 410);
        b.lineTo(1255, 440); b.lineTo(1280, 425); b.lineTo(1280, GROUND_Y);
        b.closePath();
        b.fill();
        b.fillStyle = 'rgba(30,40,50,0.3)';
        b.beginPath(); b.moveTo(1175, 430); b.lineTo(1200, 455); b.lineTo(1190, GROUND_Y); b.lineTo(1150, GROUND_Y); b.closePath(); b.fill();
        b.fillStyle = '#f7fbff';
        b.beginPath(); b.moveTo(1160, 452); b.lineTo(1175, 430); b.lineTo(1200, 455); b.lineTo(1225, 410); b.lineTo(1255, 440); b.lineTo(1240, 446); b.lineTo(1226, 430); b.lineTo(1205, 466); b.lineTo(1180, 446); b.closePath(); b.fill();

        rockyGround(b, rnd);
        stonePlatform(b);
        scene.mist = Array.from({ length: 7 }, (_, i) => ({ x: i * 200 + rnd() * 80, y: 560 + rnd() * 40, w: 160 + rnd() * 120, speed: 6 + rnd() * 8 }));
      },
      extras(ctx, t, scene) {
        // Névoa passando devagar sobre o mar de nuvens
        for (const m of scene.mist) {
          const x = ((m.x + t * m.speed) % (W + 400)) - 200;
          const g = ctx.createRadialGradient(x, m.y, 0, x, m.y, m.w * 0.5);
          g.addColorStop(0, 'rgba(255,255,255,0.45)');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g;
          ctx.save();
          ctx.translate(x, m.y);
          ctx.scale(1, 0.3);
          ctx.translate(-x, -m.y);
          ctx.beginPath(); ctx.arc(x, m.y, m.w * 0.5, 0, TAU); ctx.fill();
          ctx.restore();
        }
      },
    },

    // Pôr do sol diante do castelo real, com tochas e vagalumes
    royal: {
      seed: 1789,
      sky: [[0, '#1d1340'], [0.3, '#4f2a78'], [0.58, '#b23a6e'], [0.8, '#ff7f50'], [1, '#ffcf80']],
      stars: true,
      sun: {
        x: 1060, y: 528, r: 74, glowR: 520, core: '#fff3c4', edge: '#ff8a50',
        glow: ['rgba(255,220,150,0.95)', 'rgba(255,140,90,0.45)', 'rgba(255,120,90,0)'],
      },
      rays: { color: '255,190,140', alpha: 0.05, len: 700 },
      // Nuvens só no alto, para não cobrir o castelo
      clouds: { count: 7, farY: [110, 170], nearY: [20, 110], pal: { shadow: 'rgba(80,30,90,0.35)', top: '#ffd6c2', mid: '#f4a6a0', bottom: '#9c4f86', hl: 'rgba(255,230,210,0.6)' } },
      ambient: { type: 'fireflies', count: 34 },
      blades: { colors: ['#3f6f2c', '#4f7f35', '#355f25'], step: [4, 7], h: [6, 13] },
      dust: ['#a1887f', '#8d6e63'],
      vignette: 0.5,
      land(b, rnd, scene) {
        const farHill = x => hillY(x, 540, 34, 0.004, 0.011, 1.1);
        fillHill(b, farHill, 470, [[0, '#7a4a7e'], [1, '#5a3866']]);
        haze(b, 470, 600, '255,150,120', 0.3);

        const midHill = x => hillY(x, 580, 22, 0.005, 0.014, 0.3);
        scene.flags = [];
        scene.windows = [];
        castle(b, 880, midHill(880) + 14, scene.flags, scene.windows);
        fillHill(b, midHill, 540, [[0, '#4c5e3a'], [1, '#33452a']], 'rgba(255,190,150,0.25)');
        // Sebe aparada
        b.fillStyle = vgrad(b, 600, 624, [[0, '#3d6b2f'], [1, '#22421c']]);
        b.beginPath();
        b.moveTo(250, 626);
        for (let x = 250; x <= W; x += 20) b.quadraticCurveTo(x + 10, 598, x + 20, 606);
        b.lineTo(W, 626);
        b.closePath();
        b.fill();
        [[330, 'cone'], [470, 'ball'], [610, 'cone'], [1130, 'ball'], [1250, 'cone']].forEach(([x, k]) => topiary(b, x, 626, k));

        soilGround(b, rnd, { dirt: ['#6b4b3e', '#2e1d1a'], stone: ['#a39083', '#5b4a42'], grass: ['#5e9442', '#467a30', '#2f5a22'] });

        // Postes das tochas (o fogo é animado)
        scene.torches = [];
        for (const x of [58, 254]) {
          b.fillStyle = vgrad(b, 556, GROUND_Y, [[0, '#5d4037'], [1, '#3e2723']]);
          b.fillRect(x - 3, 558, 6, GROUND_Y - 558);
          b.fillStyle = '#4a4a4a';
          b.beginPath(); b.moveTo(x - 10, 552); b.lineTo(x + 10, 552); b.lineTo(x + 5, 562); b.lineTo(x - 5, 562); b.closePath(); b.fill();
          b.strokeStyle = '#d4a017';
          b.lineWidth = 1.5;
          b.stroke();
          scene.torches.push({ x, y: 550 });
        }
        royalPlatform(b);
      },
      extras(ctx, t, scene) {
        // Bandeiras tremulando
        for (const [i, f] of scene.flags.entries()) {
          ctx.save();
          ctx.translate(f.x, f.y);
          ctx.beginPath();
          const L = 26, n = 8;
          for (let k = 0; k <= n; k++) {
            const x = k / n * L, y = Math.sin(t * 5 + k * 0.6 + i) * 2.5 * (k / n);
            k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          }
          for (let k = n; k >= 0; k--) {
            const x = k / n * L, y = 13 - (k === n ? 5 : 0) + Math.sin(t * 5 + k * 0.6 + i) * 2.5 * (k / n);
            ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.fillStyle = i % 2 ? '#ffca28' : '#d32f2f';
          ctx.fill();
          ctx.restore();
        }
        // Tochas
        for (const [i, tc] of scene.torches.entries()) {
          const flick = 1 + Math.sin(t * 17 + i * 3) * 0.08 + Math.sin(t * 7.3 + i) * 0.06;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const g = ctx.createRadialGradient(tc.x, tc.y - 6, 2, tc.x, tc.y - 6, 70 * flick);
          g.addColorStop(0, 'rgba(255,190,90,0.55)');
          g.addColorStop(1, 'rgba(255,120,40,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(tc.x, tc.y - 6, 70 * flick, 0, TAU); ctx.fill();
          ctx.restore();
          for (const [c, sc] of [['#ff6f00', 1], ['#ffb300', 0.7], ['#fff3c4', 0.38]]) {
            const h = 22 * sc * flick, w = 9 * sc;
            ctx.fillStyle = c;
            ctx.beginPath();
            ctx.moveTo(tc.x, tc.y - h + Math.sin(t * 9 + i) * 2);
            ctx.quadraticCurveTo(tc.x + w, tc.y - h * 0.3, tc.x, tc.y + 2);
            ctx.quadraticCurveTo(tc.x - w, tc.y - h * 0.3, tc.x, tc.y - h + Math.sin(t * 9 + i) * 2);
            ctx.fill();
          }
        }
        // Janelas do castelo piscando de leve
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const [i, w] of scene.windows.entries()) {
          const a = 0.12 + 0.08 * Math.sin(t * 2 + i * 1.9);
          ctx.fillStyle = `rgba(255,200,100,${a})`;
          ctx.beginPath(); ctx.arc(w.x, w.y, 9, 0, TAU); ctx.fill();
        }
        ctx.restore();
      },
    },
  };

  // ---------------------------------------------------------------------------
  // Montagem de uma cena
  // ---------------------------------------------------------------------------
  function create(key) {
    const th = THEMES[key];
    const scene = { key, dust: th.dust };

    scene.skyLayer = layer(b => paintSky(b, th));
    scene.landLayer = layer(b => th.land(b, seeded(th.seed), scene));
    const VW = 1280;
    scene.vignetteLayer = layer(b => {
      const v = b.createRadialGradient(VW / 2, H * 0.45, VW * 0.38, VW / 2, H * 0.45, VW * 0.78);
      v.addColorStop(0, 'rgba(0,20,40,0)');
      v.addColorStop(1, `rgba(0,15,35,${th.vignette})`);
      b.fillStyle = v;
      b.fillRect(0, 0, VW, H);
    }, 1, VW);

    const sprites = [0, 1, 2, 3].map(i => makeCloudSprite(th.seed + 11 + i * 17, 170 + i * 30, th.clouds.pal));
    const farShare = Math.ceil(th.clouds.count * 0.4);
    const farY = th.clouds.farY || [150, 300], nearY = th.clouds.nearY || [30, 240];
    const cloudY = far => far ? rand(...farY) : rand(...nearY);
    scene.clouds = Array.from({ length: th.clouds.count }, (_, i) => {
      const far = i < farShare;
      return {
        sprite: sprites[i % sprites.length], far,
        x: rand(-100, visivel),
        y: cloudY(far),
        s: far ? rand(0.45, 0.7) : rand(0.75, 1.15),
        speed: far ? rand(4, 9) : rand(12, 24),
      };
    });

    scene.blades = th.blades ? makeBlades(th.seed + 99, th.blades) : [];
    const amb = AMBIENT[th.ambient.type];
    scene.ambient = Array.from({ length: th.ambient.count }, amb.make);

    scene.update = (dt, t) => {
      for (const c of scene.clouds) {
        c.x += c.speed * dt;
        if (c.x > visivel + 50) { c.x = -c.sprite.w * c.s - 50; c.y = cloudY(c.far); }
      }
      for (const p of scene.ambient) amb.update(p, dt, t);
    };

    const drawClouds = (ctx, far) => {
      for (const c of scene.clouds) {
        if (c.far !== far) continue;
        ctx.globalAlpha = far ? 0.7 : 0.95;
        ctx.drawImage(c.sprite.canvas, c.x, c.y, c.sprite.w * c.s, c.sprite.h * c.s);
      }
      ctx.globalAlpha = 1;
    };

    const drawAmbient = ctx => {
      ctx.save();
      if (amb.glow) ctx.globalCompositeOperation = 'lighter';
      for (const p of scene.ambient) amb.draw(ctx, p, scene.t);
      ctx.restore();
    };

    // Fundo: céu, sol, nuvens, relevo e animações do cenário
    scene.drawBack = (ctx, t) => {
      scene.t = t;
      ctx.drawImage(scene.skyLayer, 0, 0, W, H);
      if (th.rays) drawSunRays(ctx, th.sun, th.rays, t);
      drawClouds(ctx, true);
      ctx.drawImage(scene.landLayer, 0, 0, W, H);
      drawClouds(ctx, false);
      if (th.extras) th.extras(ctx, t, scene);
      if (!amb.front) drawAmbient(ctx);
    };

    // Frente: grama balançando e clima que passa na frente de tudo
    scene.drawFront = (ctx, t) => {
      ctx.lineCap = 'round';
      ctx.lineWidth = 2.4;
      for (const bl of scene.blades) {
        const sway = Math.sin(t * 1.8 + bl.phase + bl.x * 0.01) * 3;
        const y0 = GROUND_Y - 10;
        ctx.strokeStyle = bl.color;
        ctx.beginPath();
        ctx.moveTo(bl.x, y0);
        ctx.quadraticCurveTo(bl.x + bl.lean * 0.5, y0 - bl.h * 0.6, bl.x + bl.lean + sway, y0 - bl.h);
        ctx.stroke();
      }
      if (amb.front) drawAmbient(ctx);
    };

    scene.drawVignette = ctx => ctx.drawImage(scene.vignetteLayer, 0, 0, visivel, H);
    return scene;
  }

  // Guarda só as 2 cenas mais recentes para não gastar memória à toa
  const cache = new Map();
  function get(key) {
    if (cache.has(key)) {
      const s = cache.get(key);
      cache.delete(key);
      cache.set(key, s);
      return s;
    }
    const s = create(key);
    cache.set(key, s);
    if (cache.size > 2) cache.delete(cache.keys().next().value);
    return s;
  }

  /** Largura lógica visível agora: nuvens, partículas e vinheta acompanham a tela. */
  const ajustarLargura = largura => { visivel = largura; };

  return { get, themes: Object.keys(THEMES), ajustarLargura, larguraMaxima: W };
})();
