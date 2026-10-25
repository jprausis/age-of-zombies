import { T } from '../config.js';
import { hash2 } from '../rng.js';
import { C, P, poly, box, disc, ellipse, line, shade, cylinder } from './shapes.js';

// Tudo aqui é pintado uma vez num sprite (origem = pé do objeto) e depois só copiado.

export function paintTree(ctx, kind, variant) {
  const j = (k) => (hash2(variant * 5 + k, 11 + kind) - 0.5) * 6;
  ellipse(ctx, 9, 2, 21, 9, C.shadow);
  // Tronco com lado iluminado
  ctx.fillStyle = C.trunk;
  ctx.fillRect(-3, -18, 6, 18);
  ctx.fillStyle = shade(C.trunk, 1.35);
  ctx.fillRect(-3, -18, 2, 18);
  if (kind === 1) {
    // Pinheiro: três camadas com lado de sombra
    const lean = (variant / 4 - 0.4) * 3;
    for (let k = 0; k < 4; k++) {
      const base = -(10 + k * 11), half = 18 - k * 4 + (variant % 2) * 2, top = base - (18 - k * 2);
      poly(ctx, [[-half, base], [half, base], [lean * (k + 1), top]], C.pine[Math.min(2, k)]);
      poly(ctx, [[lean * (k + 1) * 0.5, base], [half, base], [lean * (k + 1), top]], 'rgba(0,0,0,0.22)');
      poly(ctx, [[-half, base], [-half * 0.4, base], [lean * (k + 1), top]], 'rgba(150,190,120,0.08)');
    }
    return;
  }
  if (kind === 2) {
    // Árvore seca: galhos sem folha (as que a praga matou)
    ctx.strokeStyle = shade(C.trunk, 0.9);
    ctx.lineCap = 'round';
    const branch = (x, y, a, len, w) => {
      if (len < 4) return;
      const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      branch(x2, y2, a - 0.5 + j(len) * 0.05, len * 0.68, w * 0.65);
      branch(x2, y2, a + 0.45 + j(len + 1) * 0.05, len * 0.62, w * 0.6);
    };
    branch(0, -16, -Math.PI / 2 + j(1) * 0.04, 18, 4);
    ctx.lineCap = 'butt';
    return;
  }
  // Copada: bolhas sobrepostas com luz vinda do alto à esquerda
  const pal = kind === 3 ? C.autumn : C.tree;
  const cy = -32;
  const blobs = [
    [0, 4, 18, 0], [-9 + j(1), 0 + j(2), 12, 0], [9 + j(3), 1 + j(4), 12, 0],
    [-4 + j(5), -6, 13, 1], [6 + j(6), -4 + j(7), 11, 1], [-6 + j(8), -11, 8, 2], [2 + j(9), -13, 6, 3],
  ];
  for (const [ox, oy, r, c] of blobs) disc(ctx, ox, cy + oy, r, pal[c]);
  // Sombra no lado direito de baixo
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ellipse(ctx, 10, cy + 10, 16, 12, 'rgba(0,0,0,0.22)');
  ctx.restore();
  for (let k = 0; k < 7; k++) disc(ctx, -10 + hash2(variant, k) * 16, cy - 10 + hash2(k, variant) * 14, 1.6, shade(pal[3] || pal[2], 1.15));
}

export function paintRock(ctx, variant) {
  const pts = [];
  for (let s = 0; s < 8; s++) {
    const a = (s / 8) * Math.PI * 2 + variant;
    const rad = 0.85 + hash2(variant * 7 + s, 3 - s) * 0.3;
    pts.push([Math.cos(a) * 22 * rad, -8 + Math.sin(a) * 12 * rad - (Math.sin(a) < 0 ? 9 * rad : 0)]);
  }
  ellipse(ctx, 5, 2, 23, 10, C.shadow);
  poly(ctx, pts, C.rock);
  poly(ctx, [pts[4], pts[5], pts[6], [-2, -12]], C.rockHi);
  poly(ctx, [pts[0], pts[1], pts[2], [2, -6]], C.rockDark);
  ctx.strokeStyle = 'rgba(30,28,24,0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-6, -14);
  ctx.lineTo(-1, -7);
  ctx.lineTo(5, -5);
  ctx.stroke();
  // Musgo
  if (variant % 2) ellipse(ctx, -8, -4, 6, 2.5, 'rgba(90,120,60,0.55)');
}

// Decoração que não bloqueia: escolhida de forma determinística por tile.
export function decorAt(x, y, t) {
  const h = hash2(x * 17 + 3, y * 29 + 7);
  const v = Math.floor(hash2(x * 5 + 1, y * 3 + 2) * 4);
  if (t === T.GRASS) {
    if (h < 0.035) return { kind: 'bush', v };
    if (h < 0.055) return { kind: 'flowers', v };
    if (h < 0.09) return { kind: 'grass', v };
    if (h < 0.1) return { kind: 'pebbles', v };
    if (h < 0.106) return { kind: 'log', v };
    if (h < 0.11) return { kind: 'mushroom', v };
  } else if (t === T.ROAD) {
    if (h < 0.03) return { kind: 'car', v };
    if (h < 0.05) return { kind: 'trash', v };
    if (h < 0.06) return { kind: 'barrel', v };
  } else if (t === T.DIRT || t === T.SAND) {
    if (h < 0.05) return { kind: 'pebbles', v };
    if (h < 0.06) return { kind: 'grass', v };
  } else if (t === T.RUBBLE) {
    if (h < 0.55) return { kind: 'debris', v };
  }
  return null;
}

export const DECOR_SIZE = {
  bush: [48, 32, 24, 26], flowers: [36, 24, 18, 18], grass: [36, 28, 18, 22], pebbles: [36, 20, 18, 14],
  log: [56, 32, 28, 22], mushroom: [28, 22, 14, 18], car: [110, 76, 55, 46], trash: [44, 30, 22, 22],
  barrel: [30, 40, 15, 34], debris: [52, 30, 26, 22],
};

export function paintDecor(ctx, kind, v) {
  switch (kind) {
    case 'bush':
      ellipse(ctx, 4, 1, 16, 6, C.shadow);
      disc(ctx, -6, -7, 8, '#2a3d20');
      disc(ctx, 6, -6, 9, '#2f4524');
      disc(ctx, 0, -11, 8, '#3a5429');
      disc(ctx, -3, -13, 3, '#4d6a35');
      if (v === 0) for (let k = 0; k < 4; k++) disc(ctx, -6 + k * 4, -8 - (k % 2) * 4, 1.5, '#9a3a3a');
      break;
    case 'flowers': {
      const col = ['#d8c25a', '#e0dcd0', '#9a7ab8', '#c86a5a'][v];
      ctx.strokeStyle = '#4a6a35';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const x = -8 + k * 3.2;
        ctx.moveTo(x, 0);
        ctx.lineTo(x + (k % 2 ? 1 : -1), -6 - (k % 3) * 2);
      }
      ctx.stroke();
      for (let k = 0; k < 6; k++) disc(ctx, -8 + k * 3.2 + (k % 2 ? 1 : -1), -7 - (k % 3) * 2, 1.8, col);
      break;
    }
    case 'grass':
      ctx.strokeStyle = ['#4f6236', '#5a6e3a', '#62703e', '#566a34'][v];
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let k = 0; k < 9; k++) {
        const x = -9 + k * 2.2;
        ctx.moveTo(x, 0);
        ctx.quadraticCurveTo(x + 1, -8, x + (k % 2 ? 4 : -3), -12 - (k % 3) * 3);
      }
      ctx.stroke();
      break;
    case 'pebbles':
      for (let k = 0; k < 3 + v; k++) {
        const x = -10 + hash2(k, v) * 20, y = -2 + hash2(v, k) * 5;
        ellipse(ctx, x, y, 2.5 + (k % 2), 1.6, '#6e6b62');
        ellipse(ctx, x - 0.6, y - 0.6, 1.4, 0.8, '#8e8b80');
      }
      break;
    case 'log': {
      ellipse(ctx, 2, 1, 22, 6, C.shadow);
      const a = P(-0.3, 0.15), b = P(0.3, -0.15);
      line(ctx, [a[0], a[1] - 4], [b[0], b[1] - 4], C.log, 8);
      line(ctx, [a[0], a[1] - 6], [b[0], b[1] - 6], shade(C.log, 1.25), 2);
      ellipse(ctx, a[0], a[1] - 4, 3.5, 4, '#a07a50');
      disc(ctx, a[0], a[1] - 4, 1.2, '#6e4f30');
      break;
    }
    case 'mushroom':
      for (const [x, s] of [[-3, 1], [4, 0.7]]) {
        ctx.fillStyle = '#d8d0b8';
        ctx.fillRect(x - 1, -6 * s, 2, 6 * s);
        ctx.fillStyle = v % 2 ? '#a8382a' : '#b08a5a';
        ctx.beginPath();
        ctx.ellipse(x, -6 * s, 4 * s, 3 * s, 0, Math.PI, 0);
        ctx.fill();
      }
      break;
    case 'car': {
      // Carro abandonado: carroceria, cabine, rodas, ferrugem
      const body = ['#6a3a32', '#3e5566', '#6b6a4a', '#5a5a5e'][v];
      const turn = v % 2;
      const [w, h] = turn ? [0.45, 0.95] : [0.95, 0.45];
      const x = -w / 2, y = -h / 2;
      ellipse(ctx, 6, 3, 34, 13, C.shadow);
      for (const [wx, wy] of turn ? [[x, y + 0.15], [x + w, y + 0.15], [x, y + h - 0.15], [x + w, y + h - 0.15]] : [[x + 0.15, y], [x + 0.15, y + h], [x + w - 0.15, y], [x + w - 0.15, y + h]]) {
        const [px, py] = P(wx, wy);
        ellipse(ctx, px, py - 4, 4.5, 4.5, '#141414');
      }
      box(ctx, x, y, w, h, 4, 13, body);
      const cx = turn ? x + 0.04 : x + 0.25, cy = turn ? y + 0.25 : y + 0.04;
      const cw = turn ? w - 0.08 : w * 0.5, ch = turn ? h * 0.5 : h - 0.08;
      box(ctx, cx, cy, cw, ch, 13, 21, body, 0.92);
      // Vidros escuros e quebrados
      const g = P(cx + cw, cy + ch);
      poly(ctx, [[g[0] - 9, g[1] - 14], [g[0] - 1, g[1] - 14], [g[0] - 1, g[1] - 19], [g[0] - 9, g[1] - 19]], 'rgba(20,28,32,0.85)');
      ctx.fillStyle = C.rust;
      for (let k = 0; k < 4; k++) {
        const r = P(x + hash2(k, v) * w, y + hash2(v, k) * h);
        ctx.globalAlpha = 0.55;
        ellipse(ctx, r[0], r[1] - 12, 3 + k, 1.6, C.rust);
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'trash':
      ellipse(ctx, 3, 1, 14, 5, C.shadow);
      disc(ctx, -5, -5, 6, '#22262a');
      disc(ctx, 5, -4, 5, '#2b2f22');
      disc(ctx, 0, -9, 4, '#30353a');
      line(ctx, [-2, -14], [1, -11], '#555', 1);
      break;
    case 'barrel':
      ellipse(ctx, 3, 1, 9, 4, C.shadow);
      cylinder(ctx, 0, 0, 7, 18, v % 2 ? '#3e5a46' : C.rust);
      line(ctx, [-7, -6], [7, -6], 'rgba(0,0,0,0.3)', 1.5);
      line(ctx, [-7, -12], [7, -12], 'rgba(0,0,0,0.3)', 1.5);
      break;
    case 'debris':
      line(ctx, [-16, -2], [8, -8], '#5a4430', 4);
      line(ctx, [-6, -9], [14, -1], '#6b5238', 3);
      for (let k = 0; k < 5; k++) {
        const x = -14 + hash2(k, v + 9) * 28, y = -4 + hash2(v + 9, k) * 6;
        ctx.fillStyle = k % 2 ? '#7a4a3a' : '#6e6b62';
        ctx.fillRect(x, y - 3, 5, 3);
      }
      break;
  }
}

// Brilho animado na água (desenhado por quadro, por isso fica fora dos sprites).
export function waterGlint(ctx, x, y, seed, now) {
  const ph = (now * 0.35 + seed * 7) % 1;
  if (ph > 0.5) return;
  const a = Math.sin(ph * Math.PI * 2) * 0.35;
  ctx.strokeStyle = `rgba(200,230,230,${a})`;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x - 8 - ph * 6, y);
  ctx.lineTo(x + 6 + ph * 6, y);
  ctx.stroke();
}
