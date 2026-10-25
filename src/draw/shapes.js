import { toIso } from '../iso.js';

// Paleta do mundo: verdes apagados, terra, ferrugem e o âmbar das fogueiras.
export const C = {
  void: '#0a0c09',
  grass: ['#3b4a2b', '#3f4f2e', '#38462a', '#425231'],
  tuft: '#55663a',
  dirt: ['#5a4934', '#5e4d37', '#544430'],
  sand: ['#857654', '#80714f'],
  water: ['#1d363c', '#1f3a41'],
  shore: 'rgba(190,200,170,0.18)',
  forest: ['#2e3a22', '#2a3520'],
  gravel: ['#4d4a42', '#535047'],
  road: ['#393835', '#3c3b37', '#353431'],
  roadLine: 'rgba(214,190,120,0.28)',
  rubble: ['#4b463f', '#47423b'],
  tree: ['#22351b', '#2c4423', '#3b572b', '#4a6a35'],
  autumn: ['#4a3a1c', '#6b5124', '#8a6a2e', '#a8843c'],
  pine: ['#1b2d1e', '#24392a', '#2f4834'],
  trunk: '#4a3524',
  rock: '#6a6961', rockHi: '#8b897f', rockDark: '#47463f',
  wood: '#7a5634', woodDark: '#4b351f', woodLight: '#9c7447', log: '#6e4f30',
  stone: '#7c7a72', stoneLight: '#9a988e', brick: '#8a5040', concrete: '#7d7f7a',
  canvas: '#7a7750', canvasDark: '#5b5a3b', metal: '#6a7176', metalDark: '#474d52', rust: '#7a4a2a',
  glass: 'rgba(170,215,225,0.22)',
  shadow: 'rgba(0,0,0,0.3)',
  ink: '#15140f',
  sel: '#e3d9a6', ok: '#86a95d', warn: '#d9a441', bad: '#c2412d',
  res: { wood: '#c08850', stone: '#b4b2a8', food: '#d8c25a', scrap: '#8fb3c4' },
  jackets: ['#3f6b93', '#94643a', '#5d7d48', '#86506a', '#4c8783', '#7a7838', '#8a4a3c', '#5a5f8e'],
  pants: ['#2c2f36', '#3b3428', '#2f3a2c', '#34302c'],
  hats: ['#8a3a2e', '#2e4a6b', '#4a5a2e', '#6b6b6b', '#c2a050'],
  hair: ['#2a1d14', '#4a3020', '#7a5a30', '#1a1a1a', '#8a7a6a'],
  skin: ['#d9b48f', '#b98a63', '#8c5f3d', '#e8c9a8', '#a8774f'],
  zSkin: { walker: '#8f9c78', runner: '#a08a7a', brute: '#7c8a68' },
  zCloth: ['#4a5560', '#5d4a3e', '#6b6650', '#3f4a3a', '#6a5a6a', '#55493a'],
  zPants: ['#33343a', '#3d3528', '#2e3530'],
  blood: '#5a1810',
  ruinWall: { casa: '#8a7d68', mercado: '#7b8580', oficina: '#6d6a62', cabana: '#6b5238' },
  roof: { casa: '#7d4b3a', mercado: '#56706b', oficina: '#6b5d4e', cabana: '#5f4a33' },
};

// Escurece/clareia uma cor hex por um fator (1 = igual).
const shadeCache = new Map();
export function shade(hex, f) {
  const key = hex + f;
  let v = shadeCache.get(key);
  if (v) return v;
  const n = parseInt(hex.slice(1), 16);
  const ch = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  v = `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  shadeCache.set(key, v);
  return v;
}

export const P = toIso;
export const up = (p, z) => [p[0], p[1] - z];
export const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export function poly(ctx, pts, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

export function line(ctx, a, b, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
}

export function disc(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

export function ellipse(ctx, x, y, rx, ry, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

// Losango de um retângulo de tiles, na altura z.
export function diamond(x, y, w, h, z = 0) {
  return [up(P(x, y), z), up(P(x + w, y), z), up(P(x + w, y + h), z), up(P(x, y + h), z)];
}

// Caixa isométrica sobre um retângulo de tiles, de z0 a z1 pixels de altura.
// Faces visíveis: W→S (frente-esquerda), S→E (frente-direita) e o topo.
export function box(ctx, x, y, w, h, z0, z1, color, dim = 1) {
  const N = P(x, y), E = P(x + w, y), S = P(x + w, y + h), W = P(x, y + h);
  poly(ctx, [up(W, z0), up(S, z0), up(S, z1), up(W, z1)], shade(color, 0.82 * dim));
  poly(ctx, [up(S, z0), up(E, z0), up(E, z1), up(S, z1)], shade(color, 0.62 * dim));
  poly(ctx, [up(N, z1), up(E, z1), up(S, z1), up(W, z1)], shade(color, 1.05 * dim));
  return { N, E, S, W };
}

// Recorte numa face vertical (janela, porta): frações ao longo da aresta A→B e alturas.
export function faceQuad(ctx, A, B, t0, t1, z0, z1, fill) {
  const a = lerp(A, B, t0), b = lerp(A, B, t1);
  poly(ctx, [up(a, z0), up(b, z0), up(b, z1), up(a, z1)], fill);
}

// Linhas horizontais numa face (toras, tijolos, tábuas).
export function faceLines(ctx, A, B, z0, z1, step, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let z = z0 + step; z < z1; z += step) {
    ctx.moveTo(A[0], A[1] - z);
    ctx.lineTo(B[0], B[1] - z);
  }
  ctx.stroke();
}

// Telhado de duas águas sobre o retângulo, apoiado na altura z, com cumeeira rh acima.
// Retorna a água da frente (para buracos e detalhes) e os pontos da cumeeira.
export function gable(ctx, x, y, w, h, z, rh, roof, wall, dim = 1) {
  const N = up(P(x, y), z), E = up(P(x + w, y), z), S = up(P(x + w, y + h), z), W = up(P(x, y + h), z);
  if (w >= h) {
    const R1 = up(P(x, y + h / 2), z + rh), R2 = up(P(x + w, y + h / 2), z + rh);
    poly(ctx, [N, E, R2, R1], shade(roof, 1.12 * dim));
    poly(ctx, [R1, R2, S, W], shade(roof, 0.9 * dim));
    poly(ctx, [E, S, R2], shade(wall, 0.6 * dim));
    return { front: [R1, R2, S, W], ridge: [R1, R2] };
  }
  const R1 = up(P(x + w / 2, y), z + rh), R2 = up(P(x + w / 2, y + h), z + rh);
  poly(ctx, [N, R1, R2, W], shade(roof, 1.12 * dim));
  poly(ctx, [R1, E, S, R2], shade(roof, 0.8 * dim));
  poly(ctx, [W, S, R2], shade(wall, 0.82 * dim));
  return { front: [R1, E, S, R2], ridge: [R1, R2] };
}

// Ponto dentro de um quadrilátero por interpolação bilinear.
export function quadPoint(q, u, v) {
  return lerp(lerp(q[0], q[1], u), lerp(q[3], q[2], u), v);
}

// Telhas: linhas ao longo de uma água do telhado.
export function roofLines(ctx, q, n, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let k = 1; k < n; k++) {
    const a = quadPoint(q, k / n, 0), b = quadPoint(q, k / n, 1);
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
  }
  ctx.stroke();
}

// Cilindro vertical (barril, poste) com base no ponto (x, y) da tela.
export function cylinder(ctx, x, y, r, hgt, color) {
  ellipse(ctx, x, y, r, r / 2, shade(color, 0.7));
  ctx.fillStyle = shade(color, 0.8);
  ctx.fillRect(x - r, y - hgt, r * 2, hgt);
  ctx.fillStyle = shade(color, 0.62);
  ctx.fillRect(x + r * 0.2, y - hgt, r * 0.8, hgt);
  ellipse(ctx, x, y - hgt, r, r / 2, shade(color, 1.1));
}
