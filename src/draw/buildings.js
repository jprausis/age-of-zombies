import { hash2 } from '../rng.js';
import { screenDir } from '../iso.js';
import {
  C, P, up, lerp, poly, line, disc, ellipse, shade, diamond, box, faceQuad, faceLines, gable, quadPoint, roofLines, cylinder,
} from './shapes.js';

// Cada função desenha o prédio no nível atual e retorna a altura (px) para posicionar a barra de vida.
// `env` traz: now, dark (0..1), map, smoke(x, y) e ember(x, y) para partículas.

const litWindow = (env) => (env.dark > 0.3 ? `rgba(240,190,90,${0.35 + env.dark * 0.6})` : '#1d1a15');

export function drawRuin(ctx, r, env) {
  if (r.def.vehicle) return drawVehicle(ctx, r);
  const dim = r.empty ? 0.62 : 1;
  const wall = C.ruinWall[r.type], roof = C.roof[r.type];
  const ins = 0.12;
  const x = r.x + ins, y = r.y + ins, w = r.w - 2 * ins, h = r.h - 2 * ins;
  const wallH = r.type === 'mercado' || r.type === 'oficina' ? 26 : 20;
  poly(ctx, diamond(x + 0.3, y + 0.3, w, h), C.shadow);
  const b = box(ctx, x, y, w, h, 0, wallH, wall, dim);
  // Sujeira e rachaduras na base das paredes
  faceQuad(ctx, b.W, b.S, 0, 1, 0, 4, 'rgba(30,24,16,0.35)');
  faceQuad(ctx, b.S, b.E, 0, 1, 0, 4, 'rgba(30,24,16,0.35)');
  const dark = shade('#1a1612', dim);
  faceQuad(ctx, b.W, b.S, 0.15, 0.3, 7, 15, dark);
  faceQuad(ctx, b.W, b.S, 0.62, 0.77, 7, 15, dark);
  // Tábuas pregadas na janela
  const plank = lerp(b.W, b.S, 0.13), plank2 = lerp(b.W, b.S, 0.32);
  line(ctx, [plank[0], plank[1] - 9], [plank2[0], plank2[1] - 13], shade(C.woodLight, dim), 2);
  faceQuad(ctx, b.S, b.E, 0.4, 0.6, 0, 14, shade('#2a2219', dim));
  if (r.type === 'oficina') {
    faceQuad(ctx, b.W, b.S, 0.36, 0.58, 0, 18, shade('#5d6266', dim));
    faceLines(ctx, lerp(b.W, b.S, 0.36), lerp(b.W, b.S, 0.58), 0, 18, 3, 'rgba(0,0,0,0.25)');
  }
  if (r.type === 'mercado') {
    // Toldo listrado, letreiro e telhado plano com mureta
    for (let k = 0; k < 6; k++) faceQuad(ctx, b.W, b.S, 0.05 + k * 0.15, 0.2 + k * 0.15, 15, 20, shade(k % 2 ? '#c9c2b0' : '#a8503f', dim));
    faceQuad(ctx, b.S, b.E, 0.15, 0.85, 20, 25, shade('#3e4a48', dim));
    box(ctx, x, y, w, h, wallH, wallH + 3, wall, dim * 0.9);
    poly(ctx, diamond(x + 0.15, y + 0.15, w - 0.3, h - 0.3, wallH + 3), shade(roof, dim));
    // Caixa d'água no teto
    const [tx, ty] = P(x + w * 0.3, y + h * 0.4);
    cylinder(ctx, tx, ty - wallH - 3, 6, 10, '#5d6266');
  } else if (r.type === 'oficina') {
    box(ctx, x, y, w, h, wallH, wallH + 2, roof, dim);
    const top = diamond(x, y, w, h, wallH + 2);
    roofLines(ctx, [top[0], top[1], top[2], top[3]], 9, 'rgba(0,0,0,0.25)');
    ellipse(ctx, (top[0][0] + top[2][0]) / 2, (top[0][1] + top[2][1]) / 2, 10, 4, 'rgba(122,74,42,0.45)');
  } else {
    const g = gable(ctx, x - 0.06, y - 0.06, w + 0.12, h + 0.12, wallH, 16, roof, wall, dim);
    roofLines(ctx, g.front, 7, 'rgba(0,0,0,0.16)');
    const holes = 1 + Math.floor(r.seed * 3);
    for (let k = 0; k < holes; k++) {
      const u = 0.15 + hash2(r.id, k) * 0.6, v = 0.2 + hash2(k, r.id) * 0.5;
      poly(ctx, [quadPoint(g.front, u, v), quadPoint(g.front, u + 0.12, v + 0.05), quadPoint(g.front, u + 0.1, v + 0.3), quadPoint(g.front, u - 0.02, v + 0.25)], '#16130f');
    }
    if (r.type === 'cabana') box(ctx, x + w * 0.65, y + h * 0.2, 0.22, 0.22, wallH + 4, wallH + 20, C.stone, dim);
  }
  // Mato crescendo junto à parede
  const gw = lerp(b.W, b.S, 0.85);
  ctx.strokeStyle = 'rgba(80,105,55,0.9)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let k = 0; k < 5; k++) {
    ctx.moveTo(gw[0] + k * 2, gw[1]);
    ctx.lineTo(gw[0] + k * 2 + (k % 2 ? 2 : -2), gw[1] - 6 - (k % 3) * 2);
  }
  ctx.stroke();
  return wallH + 18;
}

// Marcador de saque flutuando acima do telhado: cor do recurso principal.
export function lootMarker(ctx, r, color, now) {
  const [mx, my] = P(r.x + r.w / 2, r.y + r.h / 2);
  const bob = Math.sin(now * 2.2 + r.id) * 2;
  const top = my - (r.def.vehicle ? 40 : 62) + bob;
  poly(ctx, [[mx - 7, top - 6], [mx + 7, top - 6], [mx, top + 6]], 'rgba(20,18,14,0.9)');
  disc(ctx, mx, top - 7, 7, 'rgba(20,18,14,0.9)');
  disc(ctx, mx, top - 7, 4.5, color);
}

// ---------------------------------------------------------------- acampamento

function campfire(ctx, fx, fy, env, big = 1) {
  ctx.fillStyle = '#5c5a52';
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    ellipse(ctx, fx + Math.cos(a) * 13 * big, fy + Math.sin(a) * 6.5 * big, 3.2, 2.4, k % 2 ? '#6a675e' : '#55534b');
  }
  line(ctx, [fx - 8, fy + 2], [fx + 8, fy - 2], C.woodDark, 3);
  line(ctx, [fx - 7, fy - 3], [fx + 7, fy + 3], C.woodDark, 3);
  const t = env.now;
  const fl = Math.sin(t * 11) * 2 + Math.sin(t * 17) * 1.2;
  poly(ctx, [[fx - 8, fy], [fx + 8, fy], [fx + fl * 0.5, fy - 22 - fl]], '#c2412d');
  poly(ctx, [[fx - 5, fy], [fx + 5, fy], [fx - fl * 0.4, fy - 15 - fl * 0.6]], '#e89a3a');
  poly(ctx, [[fx - 2.5, fy], [fx + 2.5, fy], [fx, fy - 8]], '#f6d67a');
  env.ember(fx, fy - 12);
  env.smoke(fx, fy - 26, 0.5);
}

function flag(ctx, px, py, hgt, color, now) {
  line(ctx, [px, py], [px, py - hgt], '#3a3530', 2);
  const wave = Math.sin(now * 3) * 2;
  poly(ctx, [[px, py - hgt], [px + 16, py - hgt + 3 + wave], [px + 14, py - hgt + 9 + wave], [px, py - hgt + 10]], color);
}

export function drawHQ(ctx, b, env) {
  const { x, y, level } = b;
  poly(ctx, diamond(x + 0.05, y + 0.05, 2.9, 2.9), level >= 2 ? '#5a5048' : '#4c3e2b');
  const [fx, fy] = P(x + 1.3, y + 2.3);
  if (level >= 2) {
    // Salão: base de pedra, paredes de tábua, telhado de madeira e chaminé
    const f = box(ctx, x + 0.2, y + 0.15, 2.5, 1.5, 0, 9, C.stone);
    faceLines(ctx, f.W, f.S, 0, 9, 4.5, 'rgba(0,0,0,0.25)');
    const w = box(ctx, x + 0.25, y + 0.2, 2.4, 1.4, 9, 30, C.wood);
    faceLines(ctx, w.W, w.S, 9, 30, 4, 'rgba(0,0,0,0.22)');
    faceLines(ctx, w.S, w.E, 9, 30, 4, 'rgba(0,0,0,0.22)');
    for (const t of [0.12, 0.38, 0.62]) faceQuad(ctx, w.W, w.S, t, t + 0.12, 15, 24, litWindow(env));
    faceQuad(ctx, w.W, w.S, 0.8, 0.94, 9, 25, '#2a2219');
    const g = gable(ctx, x + 0.15, y + 0.1, 2.6, 1.6, 30, 20, '#5a3d28', C.wood);
    roofLines(ctx, g.front, 10, 'rgba(0,0,0,0.2)');
    box(ctx, x + 2.0, y + 0.35, 0.3, 0.3, 36, 58, C.stone);
    const [cx, cy] = P(x + 2.15, y + 0.5);
    env.smoke(cx, cy - 60, 1);
    // Postes de luz
    for (const [lx, ly] of [[x + 0.1, y + 2.85], [x + 2.85, y + 2.85]]) {
      const [px, py] = P(lx, ly);
      line(ctx, [px, py], [px, py - 30], '#2e2b26', 2);
      disc(ctx, px, py - 31, 3, env.dark > 0.3 ? '#f6d67a' : '#8a8270');
    }
    flag(ctx, ...P(x + 0.2, y + 0.15), 62, '#a8503f', env.now);
    campfire(ctx, fx, fy, env);
    return 58;
  }
  if (level >= 1) {
    // Barracas extras no fundo e bandeira
    gable(ctx, x + 0.1, y + 0.05, 0.9, 0.9, 0, 18, '#6f7a52', C.canvasDark);
    gable(ctx, x + 2.0, y + 0.05, 0.9, 0.9, 0, 18, C.canvas, C.canvasDark);
    flag(ctx, ...P(x + 2.8, y + 1.5), 48, '#d9a441', env.now);
  }
  box(ctx, x + 0.4, y + 0.55, 2.1, 1.1, 0, 6, C.woodDark);
  const g = gable(ctx, x + 0.35, y + 0.5, 2.2, 1.2, 6, 22, C.canvas, C.canvasDark);
  roofLines(ctx, g.front, 6, 'rgba(0,0,0,0.12)');
  box(ctx, x + 2.35, y + 1.9, 0.45, 0.45, 0, 12, C.woodLight);
  box(ctx, x + 2.4, y + 2.45, 0.35, 0.35, 0, 9, C.woodLight);
  box(ctx, x + 0.4, y + 2.1, 0.5, 0.2, 0, 5, C.log);
  box(ctx, x + 1.9, y + 2.5, 0.2, 0.45, 0, 5, C.log);
  campfire(ctx, fx, fy, env);
  return level >= 1 ? 48 : 34;
}

// ---------------------------------------------------------------- moradias

export function drawTent(ctx, b, env) {
  const { x, y, level } = b;
  poly(ctx, diamond(x + 0.35, y + 0.35, 1.7, 1.7), C.shadow);
  if (level >= 2) {
    // Casa de tijolos com telhado de telha, janelas acesas à noite e chaminé
    const w = box(ctx, x + 0.15, y + 0.15, 1.7, 1.7, 0, 24, C.brick);
    faceLines(ctx, w.W, w.S, 0, 24, 3, 'rgba(40,20,14,0.35)');
    faceLines(ctx, w.S, w.E, 0, 24, 3, 'rgba(40,20,14,0.35)');
    faceQuad(ctx, w.W, w.S, 0.15, 0.38, 9, 18, litWindow(env));
    faceQuad(ctx, w.W, w.S, 0.62, 0.85, 9, 18, litWindow(env));
    faceQuad(ctx, w.S, w.E, 0.38, 0.62, 0, 16, '#3a2a1e');
    const g = gable(ctx, x + 0.08, y + 0.08, 1.84, 1.84, 24, 18, '#8a3e2e', C.brick);
    roofLines(ctx, g.front, 8, 'rgba(0,0,0,0.2)');
    box(ctx, x + 1.3, y + 0.35, 0.25, 0.25, 30, 48, C.brick);
    const [cx, cy] = P(x + 1.42, y + 0.47);
    env.smoke(cx, cy - 50, 0.6);
    return 44;
  }
  if (level >= 1) {
    // Cabana de toras
    const w = box(ctx, x + 0.15, y + 0.15, 1.7, 1.7, 0, 20, C.log);
    faceLines(ctx, w.W, w.S, 0, 20, 4, 'rgba(0,0,0,0.3)');
    faceLines(ctx, w.S, w.E, 0, 20, 4, 'rgba(0,0,0,0.3)');
    for (const t of [0, 1]) {
      const p = lerp(w.W, w.S, t);
      for (let z = 2; z < 20; z += 4) disc(ctx, p[0], p[1] - z, 2, '#a07a50');
    }
    faceQuad(ctx, w.W, w.S, 0.35, 0.6, 6, 13, litWindow(env));
    faceQuad(ctx, w.S, w.E, 0.4, 0.62, 0, 14, '#2a2219');
    const g = gable(ctx, x + 0.05, y + 0.05, 1.9, 1.9, 20, 16, '#4e3a26', C.log);
    roofLines(ctx, g.front, 6, 'rgba(0,0,0,0.25)');
    return 38;
  }
  const tint = hash2(b.id, 3) > 0.5 ? '#6f7a52' : C.canvas;
  gable(ctx, x + 0.2, y + 0.2, 1.6, 1.6, 0, 30, tint, C.canvasDark);
  const W = up(P(x + 0.2, y + 1.8), 0), S = up(P(x + 1.8, y + 1.8), 0), R = up(P(x + 1, y + 1.8), 30);
  poly(ctx, [lerp(W, S, 0.35), lerp(W, S, 0.65), lerp(lerp(W, S, 0.5), R, 0.6)], '#1e1c12');
  // Cordas e estacas
  ctx.strokeStyle = 'rgba(220,210,180,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const [ax, ay, bx, by] of [[x + 0.2, y + 1, x - 0.05, y + 1], [x + 1, y + 1.8, x + 1, y + 2.0]]) {
    const a = up(P(ax, ay), 14), c = P(bx, by);
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(c[0], c[1]);
  }
  ctx.stroke();
  return 32;
}

// ---------------------------------------------------------------- depósito

export function drawDepot(ctx, b) {
  const { x, y, level } = b;
  if (level >= 1) {
    // Armazém: galpão com portão de correr e telhado de zinco
    const w = box(ctx, x + 0.1, y + 0.1, 1.8, 1.8, 0, 26, C.metal);
    faceLines(ctx, w.W, w.S, 0, 26, 3, 'rgba(0,0,0,0.18)');
    faceQuad(ctx, w.W, w.S, 0.2, 0.75, 0, 20, C.metalDark);
    faceQuad(ctx, w.W, w.S, 0.47, 0.49, 0, 20, '#2a2e30');
    faceQuad(ctx, w.S, w.E, 0.3, 0.7, 14, 20, '#1d1a15');
    const top = diamond(x + 0.05, y + 0.05, 1.9, 1.9, 26);
    poly(ctx, top, shade('#7a8288', 1));
    roofLines(ctx, top, 10, 'rgba(0,0,0,0.2)');
    box(ctx, x + 1.55, y + 1.6, 0.35, 0.35, 0, 10, C.woodLight);
    return 30;
  }
  box(ctx, x + 0.1, y + 0.1, 1.8, 1.8, 0, 4, C.woodDark);
  const top = diamond(x + 0.1, y + 0.1, 1.8, 1.8, 4);
  roofLines(ctx, top, 8, 'rgba(0,0,0,0.25)');
  box(ctx, x + 0.25, y + 0.25, 0.7, 0.7, 4, 20, C.woodLight);
  box(ctx, x + 1.05, y + 0.3, 0.6, 0.6, 4, 16, C.woodLight);
  box(ctx, x + 0.3, y + 1.05, 0.55, 0.55, 4, 14, C.wood);
  const [bx, by] = P(x + 1.45, y + 1.45);
  cylinder(ctx, bx, by - 4, 7, 16, '#5c4630');
  line(ctx, [bx - 7, by - 10], [bx + 7, by - 10], C.metal, 1.5);
  return 24;
}

// ---------------------------------------------------------------- horta

export function drawFarm(ctx, b) {
  const { x, y, level } = b;
  poly(ctx, diamond(x + 0.05, y + 0.05, 2.9, 2.9), '#4a3826');
  ctx.strokeStyle = '#3a2b1c';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let k = 0.3; k < 3; k += 0.4) {
    const a = P(x + 0.2, y + k), c = P(x + 2.8, y + k);
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(c[0], c[1]);
  }
  ctx.stroke();
  if (level >= 1) {
    // Canal de irrigação ao longo da borda
    const a = P(x + 0.1, y + 2.85), c = P(x + 2.9, y + 2.85);
    line(ctx, a, c, '#2c5560', 4);
    line(ctx, [a[0], a[1] - 1], [c[0], c[1] - 1], 'rgba(170,215,225,0.4)', 1);
  }
  const grow = b.complete ? 0.6 + 0.4 * ((b.foodT / b.def.foodInterval + b.produced * 0.13) % 1) : 0.3;
  for (let row = 0; row < 7; row++) {
    for (let k = 0; k < 8; k++) {
      const [px, py] = P(x + 0.3 + k * 0.33, y + 0.3 + row * 0.4);
      const r = (2.5 + hash2(row, k) * 1.5) * grow * (level >= 1 ? 1.2 : 1);
      ellipse(ctx, px, py - r, r * 1.2, r, (row + k) % 3 ? '#5e7f3a' : '#7a9443');
      if (level >= 1 && (row + k) % 4 === 0) disc(ctx, px + 1, py - r * 1.4, 1.4, '#c8503a');
    }
  }
  if (level >= 2) {
    // Estufa: armação branca e vidro translúcido por cima das plantas
    const x0 = x + 0.1, y0 = y + 0.1, w = 2.8, h = 2.8, z = 26;
    const N = P(x0, y0), E = P(x0 + w, y0), S = P(x0 + w, y0 + h), W = P(x0, y0 + h);
    poly(ctx, [W, S, up(S, z), up(W, z)], C.glass);
    poly(ctx, [S, E, up(E, z), up(S, z)], 'rgba(150,195,205,0.18)');
    const g = { R1: up(P(x0, y0 + h / 2), z + 14), R2: up(P(x0 + w, y0 + h / 2), z + 14) };
    poly(ctx, [up(N, z), up(E, z), g.R2, g.R1], 'rgba(190,225,235,0.16)');
    poly(ctx, [g.R1, g.R2, up(S, z), up(W, z)], 'rgba(200,235,240,0.24)');
    ctx.strokeStyle = 'rgba(230,235,230,0.75)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let t = 0; t <= 1.001; t += 0.25) {
      const a = lerp(W, S, t), c = lerp(S, E, t);
      ctx.moveTo(a[0], a[1]); ctx.lineTo(a[0], a[1] - z);
      ctx.moveTo(c[0], c[1]); ctx.lineTo(c[0], c[1] - z);
    }
    ctx.moveTo(W[0], W[1] - z); ctx.lineTo(S[0], S[1] - z); ctx.lineTo(E[0], E[1] - z);
    ctx.moveTo(g.R1[0], g.R1[1]); ctx.lineTo(g.R2[0], g.R2[1]);
    ctx.moveTo(S[0], S[1] - z); ctx.lineTo(g.R2[0], g.R2[1]);
    ctx.moveTo(W[0], W[1] - z); ctx.lineTo(g.R1[0], g.R1[1]);
    ctx.stroke();
    return 44;
  }
  ctx.strokeStyle = C.woodLight;
  ctx.lineWidth = 1.5;
  const d = diamond(x + 0.05, y + 0.05, 2.9, 2.9, 5);
  ctx.beginPath();
  ctx.moveTo(d[3][0], d[3][1]); ctx.lineTo(d[2][0], d[2][1]); ctx.lineTo(d[1][0], d[1][1]);
  ctx.stroke();
  if (level >= 1) {
    const [bx, by] = P(x + 2.75, y + 0.3);
    cylinder(ctx, bx, by, 7, 16, '#3e5a66');
  }
  return 10;
}

// ---------------------------------------------------------------- torre

export function drawTower(ctx, b, env) {
  const { x, y, level } = b;
  const H = level >= 1 ? 50 : 46;
  poly(ctx, diamond(x + 0.4, y + 0.4, 1.8, 1.8), C.shadow);
  let base = 0;
  if (level >= 1) {
    const f = box(ctx, x + 0.15, y + 0.15, 1.7, 1.7, 0, level >= 2 ? 22 : 14, level >= 2 ? C.concrete : C.stone);
    faceLines(ctx, f.W, f.S, 0, level >= 2 ? 22 : 14, 5, 'rgba(0,0,0,0.22)');
    base = level >= 2 ? 22 : 14;
  }
  const legs = [[x + 0.3, y + 0.3], [x + 1.7, y + 0.3], [x + 1.7, y + 1.7], [x + 0.3, y + 1.7]];
  const legColor = level >= 2 ? C.metalDark : C.woodDark;
  ctx.strokeStyle = legColor;
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (const [lx, ly] of legs) {
    const p = P(lx, ly);
    ctx.moveTo(p[0], p[1] - base);
    ctx.lineTo(p[0], p[1] - H);
  }
  ctx.stroke();
  const a = P(...legs[3]), c = P(...legs[2]), e = P(...legs[1]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(a[0], a[1] - base - 4); ctx.lineTo(c[0], c[1] - H + 6);
  ctx.moveTo(c[0], c[1] - base - 4); ctx.lineTo(a[0], a[1] - H + 6);
  ctx.moveTo(c[0], c[1] - base - 4); ctx.lineTo(e[0], e[1] - H + 6);
  ctx.stroke();
  box(ctx, x + 0.15, y + 0.15, 1.7, 1.7, H, H + 5, level >= 2 ? C.metal : C.wood);
  const [cx, cy] = P(x + 1, y + 1);
  const [dx, dy] = screenDir(b.angle);
  // Sacos de areia (nível 2+)
  if (level >= 1) {
    for (let k = 0; k < 5; k++) {
      const p = up(lerp(P(x + 0.2, y + 1.8), P(x + 1.8, y + 1.8), 0.1 + k * 0.2), H + 8);
      ellipse(ctx, p[0], p[1], 6, 3.5, k % 2 ? '#8a7a58' : '#9a8a66');
    }
  }
  // Atirador / arma
  const gunLen = level >= 2 ? 24 : 18;
  line(ctx, [cx, cy - H - 14], [cx + dx * gunLen, cy - H - 14 + dy * gunLen / 2], '#1d1d1d', level >= 2 ? 4 : 3);
  if (level >= 2) line(ctx, [cx + 2, cy - H - 11], [cx + 2 + dx * gunLen, cy - H - 11 + dy * gunLen / 2], '#1d1d1d', 3);
  disc(ctx, cx, cy - H - 14, 6, '#41606f');
  disc(ctx, cx - 1.5, cy - H - 22, 4.5, '#d9b48f');
  if (b.cd > b.def.cooldown - 0.07) disc(ctx, cx + dx * (gunLen + 3), cy - H - 14 + dy * (gunLen + 3) / 2, 4, 'rgba(255,220,120,0.95)');
  if (level < 2) {
    const rail = diamond(x + 0.15, y + 0.15, 1.7, 1.7, H + 14);
    ctx.strokeStyle = C.woodLight;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(rail[3][0], rail[3][1]); ctx.lineTo(rail[2][0], rail[2][1]); ctx.lineTo(rail[1][0], rail[1][1]);
    ctx.stroke();
    const roofBase = diamond(x + 0.05, y + 0.05, 1.9, 1.9, H + 28);
    const peak = [cx, cy - H - 46];
    const rc = level >= 1 ? '#5a4a3a' : '#6b4c2d';
    poly(ctx, [roofBase[0], roofBase[1], peak], shade(rc, 1.1));
    poly(ctx, [roofBase[3], roofBase[0], peak], shade(rc, 1));
    poly(ctx, [roofBase[2], roofBase[3], peak], shade(rc, 0.85));
    poly(ctx, [roofBase[1], roofBase[2], peak], shade(rc, 0.65));
    return H + 46;
  }
  // Ninho de metralhadora: escudo de chapa e holofote
  const sh = diamond(x + 0.15, y + 0.15, 1.7, 1.7, H + 5);
  poly(ctx, [sh[3], sh[2], up(sh[2], 12), up(sh[3], 12)], shade(C.metal, 0.9));
  poly(ctx, [sh[2], sh[1], up(sh[1], 12), up(sh[2], 12)], shade(C.metal, 0.7));
  const [lx, ly] = P(x + 1.6, y + 0.4);
  line(ctx, [lx, ly - H - 5], [lx, ly - H - 24], '#2e2b26', 2);
  disc(ctx, lx, ly - H - 26, 4, env.dark > 0.3 ? '#fff4c8' : '#9a9a8a');
  return H + 30;
}

// ---------------------------------------------------------------- muros e portões

export function drawWall(ctx, b, env) {
  const m = env.map;
  const isWall = (dx, dy) => {
    const nx = b.x + dx, ny = b.y + dy;
    if (!m.inBounds(nx, ny)) return false;
    const o = m.occ[m.idx(nx, ny)];
    return o && o.kind === 'building' && o.def.wall;
  };
  const { x, y, level } = b;
  if (b.type === 'gate') {
    const horiz = isWall(1, 0) || isWall(-1, 0) || !(isWall(0, 1) || isWall(0, -1));
    const bx = horiz ? x : x + 0.3, by = horiz ? y + 0.3 : y, bw = horiz ? 1 : 0.4, bh = horiz ? 0.4 : 1;
    const color = level >= 1 ? C.metal : C.woodLight;
    const f = box(ctx, bx, by, bw, bh, 0, 26, color);
    const A = horiz ? f.W : f.S, B = horiz ? f.S : f.E;
    if (level >= 1) {
      for (let z = 4; z < 26; z += 7) faceQuad(ctx, A, B, 0, 1, z, z + 1.2, C.metalDark);
      for (const t of [0.1, 0.9]) for (let z = 5; z < 26; z += 7) {
        const p = up(lerp(A, B, t), z);
        disc(ctx, p[0], p[1], 1.2, '#9aa0a4');
      }
    } else {
      for (let t = 0.2; t < 1; t += 0.2) {
        const p = lerp(A, B, t);
        line(ctx, p, [p[0], p[1] - 26], 'rgba(0,0,0,0.2)', 1);
      }
      faceQuad(ctx, A, B, 0, 1, 10, 13, C.metal);
    }
    faceQuad(ctx, A, B, 0.48, 0.52, 0, 26, 'rgba(0,0,0,0.45)');
    box(ctx, horiz ? x - 0.05 : x + 0.25, horiz ? y + 0.25 : y - 0.05, 0.2, 0.5, 0, 32, level >= 1 ? C.stone : C.woodDark);
    return 32;
  }
  const stone = b.type === 'stonewall';
  const color = stone ? C.stone : C.wood;
  const H = stone ? (level >= 1 ? 30 : 22) : 26, t = stone ? (level >= 1 ? 0.6 : 0.5) : 0.3;
  const o = (1 - t) / 2;
  const seg = (sx, sy, sw, sh) => {
    const f = box(ctx, sx, sy, sw, sh, 0, H, color);
    if (stone) {
      faceLines(ctx, f.W, f.S, 0, H, 5, 'rgba(0,0,0,0.22)');
      faceLines(ctx, f.S, f.E, 0, H, 5, 'rgba(0,0,0,0.22)');
    }
  };
  if (isWall(0, -1)) seg(x + o, y, t, 0.5);
  if (isWall(-1, 0)) seg(x, y + o, 0.5, t);
  if (stone) {
    box(ctx, x + 0.2, y + 0.2, 0.6, 0.6, 0, H + 3, C.stoneLight);
    if (level >= 1) {
      // Ameias
      box(ctx, x + 0.2, y + 0.2, 0.22, 0.22, H + 3, H + 9, C.stoneLight);
      box(ctx, x + 0.58, y + 0.58, 0.22, 0.22, H + 3, H + 9, C.stoneLight);
    }
  } else {
    box(ctx, x + 0.32, y + 0.32, 0.36, 0.36, 0, H + 4, C.woodDark);
    const [px, py] = P(x + 0.5, y + 0.5);
    poly(ctx, [[px - 6, py - H - 4], [px + 6, py - H - 4], [px, py - H - 12]], C.woodLight);
  }
  if (isWall(1, 0)) seg(x + 0.5, y + o, 0.5, t);
  if (isWall(0, 1)) seg(x + o, y + 0.5, t, 0.5);
  if (!stone) {
    // Estacas pontudas no topo de cada trecho
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      if (!isWall(dx, dy)) continue;
      for (const k of [0.25, 0.42]) {
        const [px, py] = P(x + 0.5 + dx * k, y + 0.5 + dy * k);
        poly(ctx, [[px - 3.5, py - H], [px + 3.5, py - H], [px, py - H - 6]], C.woodLight);
      }
    }
    if (level >= 1) {
      // Espetos apontando para fora, nas duas frentes visíveis
      ctx.strokeStyle = '#8a8478';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (const k of [0.25, 0.75]) {
        for (const [ax, ay, bx2, by2] of [[x + k, y + 0.6, x + k, y + 0.85], [x + 0.6, y + k, x + 0.85, y + k]]) {
          const a = up(P(ax, ay), 12), c = up(P(bx2, by2), 15);
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(c[0], c[1]);
        }
      }
      ctx.stroke();
    }
  }
  return H + 10;
}

// Andaime sobre obras e reformas.
export function scaffold(ctx, b, hgt) {
  const corners = [[b.x + 0.08, b.y + 0.08], [b.x + b.w - 0.08, b.y + 0.08], [b.x + b.w - 0.08, b.y + b.h - 0.08], [b.x + 0.08, b.y + b.h - 0.08]];
  const top = Math.max(10, hgt * 0.9);
  ctx.strokeStyle = '#b08a52';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const [cx, cy] of corners) {
    const p = P(cx, cy);
    ctx.moveTo(p[0], p[1]);
    ctx.lineTo(p[0], p[1] - top);
  }
  const front = [corners[3], corners[2], corners[1]].map((c) => P(...c));
  for (let z = 8; z < top; z += 12) {
    ctx.moveTo(front[0][0], front[0][1] - z);
    ctx.lineTo(front[1][0], front[1][1] - z);
    ctx.lineTo(front[2][0], front[2][1] - z);
  }
  ctx.stroke();
  // Tábuas cruzadas
  ctx.strokeStyle = 'rgba(176,138,82,0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(front[0][0], front[0][1]);
  ctx.lineTo(front[1][0], front[1][1] - top);
  ctx.moveTo(front[1][0], front[1][1]);
  ctx.lineTo(front[2][0], front[2][1] - top);
  ctx.stroke();
}

// Ninho: um monte de carne e entulho que pulsa, com bolhas que brilham à noite.
export function drawNest(ctx, n, env) {
  const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
  const [x, y] = P(cx, cy);
  const beat = 1 + Math.sin(env.now * 2.4 + n.seed * 10) * 0.035;
  // Gavinhas espalhadas pelo chão
  ctx.lineCap = 'round';
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + n.seed * 6;
    const len = 1.9 + hash2(n.id, k) * 1.4;
    const p0 = P(cx + Math.cos(a) * 1.1, cy + Math.sin(a) * 1.1);
    const p1 = P(cx + Math.cos(a + 0.25) * (len * 0.6), cy + Math.sin(a + 0.25) * (len * 0.6));
    const p2 = P(cx + Math.cos(a - 0.1) * len, cy + Math.sin(a - 0.1) * len);
    ctx.strokeStyle = '#3d1a22';
    ctx.lineWidth = 4 - hash2(k, n.id) * 1.5;
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.quadraticCurveTo(p1[0], p1[1], p2[0], p2[1]);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
  ellipse(ctx, x + 6, y + 4, 52, 24, C.shadow);
  // Corpo em camadas, do mais escuro (base) ao mais claro (topo)
  const layers = [['#3a1820', 50, 24, 0], ['#552530', 42, 21, 10], ['#6e3038', 32, 17, 21], ['#82404a', 21, 12, 31]];
  for (const [col, rx, ry, h] of layers) {
    ellipse(ctx, x, y - h * beat, rx * beat, ry * beat, col);
  }
  // Costelas e entulho presos na massa
  for (let k = 0; k < 5; k++) {
    const a = -2.6 + k * 0.55 + n.seed;
    const bx = x + Math.cos(a) * 30, by = y - 12 + Math.sin(a) * 12;
    line(ctx, [bx, by], [bx + Math.cos(a) * 9, by - 10], '#cfc4a8', 2);
  }
  // Bolhas pulsando
  const glow = 0.5 + env.dark * 0.5;
  for (let k = 0; k < 7; k++) {
    const a = hash2(n.id * 3, k) * Math.PI * 2, r = 0.3 + hash2(k * 5, n.id) * 0.6;
    const bx = x + Math.cos(a) * 34 * r, by = y - 14 - Math.sin(a) * 14 * r - hash2(k, k) * 14;
    const p = 0.6 + 0.4 * Math.sin(env.now * 3 + k * 1.7);
    disc(ctx, bx, by, 4 + 2 * p, `rgba(170,215,90,${(0.25 + 0.35 * p) * glow})`);
    disc(ctx, bx, by, 2.2 + p, `rgba(215,240,140,${0.6 * glow + 0.2})`);
  }
  // Boca no topo
  ellipse(ctx, x, y - 35 * beat, 9 * beat, 4 * beat, '#1a0a0e');
  if (n.hitT > 0) ellipse(ctx, x, y - 16, 46, 26, `rgba(230,120,90,${Math.min(0.5, n.hitT * 3)})`);
  env.smoke(x, y - 38, 0.3);
  return 46;
}

// ---------------------------------------------------------------- veículos e ferro-velho

const CAR_PAINT = ['#7a3b2e', '#4d5f6e', '#8a8064', '#5b6b4a', '#9a9c94', '#6b4a5e'];

// Carro abandonado (ou caminhão tombado): carroceria, cabine com vidro quebrado, rodas e ferrugem.
// Depois de desmontado, sobra só o chassi.
function drawVehicle(ctx, r) {
  const along = r.w >= r.h; // eixo comprido ao longo de x?
  const truck = r.type === 'caminhao';
  const ins = 0.1;
  const x = r.x + ins, y = r.y + ins, w = r.w - 2 * ins, h = r.h - 2 * ins;
  const paint = truck ? '#5d6a72' : CAR_PAINT[r.id % CAR_PAINT.length];
  const dim = r.empty ? 0.55 : 1;
  poly(ctx, diamond(x + 0.15, y + 0.15, w, h), C.shadow);
  // Rodas nas faces visíveis
  const wheel = (tx, ty) => {
    const [wx, wy] = P(tx, ty);
    ellipse(ctx, wx, wy - 3, 4, 3.4, '#1b1a18');
    ellipse(ctx, wx, wy - 3, 1.6, 1.3, '#55534c');
  };
  if (along) {
    for (const f of truck ? [0.15, 0.5, 0.85] : [0.2, 0.8]) wheel(x + w * f, y + h);
  } else {
    for (const f of truck ? [0.15, 0.5, 0.85] : [0.2, 0.8]) wheel(x + w, y + h * f);
  }
  if (r.empty) {
    // Só o chassi enferrujado
    box(ctx, x + 0.1, y + 0.1, w - 0.2, h - 0.2, 3, 6, C.rust, dim);
    return 14;
  }
  const bodyH = truck ? 10 : 9;
  const b = box(ctx, x, y, w, h, 3, bodyH, paint, dim);
  // Ferrugem e amassados
  faceQuad(ctx, b.W, b.S, 0.1 + hash2(r.id, 1) * 0.5, 0.25 + hash2(r.id, 1) * 0.5, 3, 7, 'rgba(122,74,42,0.65)');
  faceQuad(ctx, b.S, b.E, 0.2, 0.45, 4, 8, 'rgba(122,74,42,0.5)');
  if (truck) {
    // Baú do caminhão em 2/3 do comprimento e cabine na ponta
    const cut = 0.68;
    const [bx, by, bw, bh] = along ? [x, y, w * cut, h] : [x, y, w, h * cut];
    const cargo = box(ctx, bx, by, bw, bh, bodyH, 30, '#8a8a80', dim);
    faceLines(ctx, cargo.W, cargo.S, bodyH, 30, 5, 'rgba(0,0,0,0.18)');
    faceQuad(ctx, cargo.W, cargo.S, 0.55, 0.9, 14, 24, 'rgba(122,74,42,0.45)');
    const [cx, cy, cw, ch] = along ? [x + w * (cut + 0.04), y, w * (1 - cut - 0.04), h] : [x, y + h * (cut + 0.04), w, h * (1 - cut - 0.04)];
    const cab = box(ctx, cx, cy, cw, ch, bodyH, 22, paint, dim);
    faceQuad(ctx, cab.W, cab.S, 0.15, 0.85, 14, 20, 'rgba(25,30,32,0.85)');
    faceQuad(ctx, cab.S, cab.E, 0.15, 0.85, 14, 20, 'rgba(25,30,32,0.85)');
    return 34;
  }
  // Cabine no meio do carro, vidros escuros com rachaduras
  const [cx, cy, cw, ch] = along ? [x + w * 0.28, y + 0.04, w * 0.46, h - 0.08] : [x + 0.04, y + h * 0.28, w - 0.08, h * 0.46];
  const cab = box(ctx, cx, cy, cw, ch, bodyH, bodyH + 7, paint, dim * 0.95);
  faceQuad(ctx, cab.W, cab.S, 0.08, 0.92, bodyH + 1, bodyH + 6, 'rgba(25,30,32,0.88)');
  faceQuad(ctx, cab.S, cab.E, 0.1, 0.9, bodyH + 1, bodyH + 6, 'rgba(40,48,52,0.88)');
  const crack = lerp(cab.W, cab.S, 0.3 + hash2(r.id, 3) * 0.4);
  line(ctx, [crack[0], crack[1] - bodyH - 1], [crack[0] + 3, crack[1] - bodyH - 6], 'rgba(200,215,220,0.55)', 1);
  // Porta aberta pendurada, de vez em quando
  if (hash2(r.id, 7) > 0.5) {
    const d = lerp(b.W, b.S, 0.55);
    poly(ctx, [[d[0], d[1] - 3], [d[0] - 5, d[1] + 1], [d[0] - 5, d[1] - 6], [d[0], d[1] - bodyH]], shade(paint, 0.7 * dim));
  }
  return 22;
}

// Ferro-velho: pátio cercado com montes de lata, prensa (nível 2) e fundição com chaminé (nível 3).
export function drawScrapyard(ctx, b, env) {
  const { x, y, level } = b;
  poly(ctx, diamond(x + 0.05, y + 0.05, 2.9, 2.9), '#4b4438');
  // Manchas de óleo
  const [ox, oy] = P(x + 1.9, y + 1.1);
  ellipse(ctx, ox, oy, 12, 5, 'rgba(20,18,16,0.5)');
  // Montes de sucata coloridos
  const heap = (tx, ty, s, k) => {
    const [hx, hy] = P(tx, ty);
    poly(ctx, [[hx - 16 * s, hy], [hx - 6 * s, hy - 14 * s], [hx + 4 * s, hy - 17 * s], [hx + 16 * s, hy]], '#5d5a52');
    for (let i = 0; i < 6; i++) {
      const px = hx + (hash2(k, i) - 0.5) * 22 * s, py = hy - 3 - hash2(i, k) * 11 * s;
      const col = ['#7a4a2a', '#6a7176', '#8a3a2e', '#9a9c94', '#4d5f6e', '#a8843c'][(i + k) % 6];
      poly(ctx, [[px - 4 * s, py], [px - 1 * s, py - 4 * s], [px + 4 * s, py - 2 * s], [px + 2 * s, py + 2 * s]], col);
    }
    disc(ctx, hx + 6 * s, hy - 6 * s, 3 * s, '#1b1a18'); // pneu
    disc(ctx, hx + 6 * s, hy - 6 * s, 1.3 * s, '#4a4842');
  };
  heap(x + 0.8, y + 0.9, 1, 1);
  heap(x + 2.1, y + 0.7, 0.8, 2);
  if (level < 1) heap(x + 1.6, y + 2.0, 1.1, 3);
  if (level >= 1) {
    // Prensa hidráulica e um cubo de lata prensada
    const pr = box(ctx, x + 1.2, y + 1.6, 0.9, 0.9, 0, 18, '#6a6a3a');
    faceQuad(ctx, pr.W, pr.S, 0.15, 0.85, 4, 12, '#2a2a20');
    const k = (Math.sin((env ? env.now : 0) * 2 + b.id) + 1) / 2;
    box(ctx, x + 1.35, y + 1.75, 0.6, 0.6, 18, 22 + k * 4, '#8a8a80');
    box(ctx, x + 2.3, y + 2.2, 0.45, 0.45, 0, 8, '#7a6a5a');
  }
  if (level >= 2) {
    // Fundição: forno de tijolo com chaminé e brilho
    const f = box(ctx, x + 0.25, y + 1.9, 0.8, 0.8, 0, 16, C.brick);
    faceQuad(ctx, f.W, f.S, 0.3, 0.7, 2, 9, `rgba(240,140,50,${0.7 + 0.3 * Math.sin((env ? env.now : 0) * 6)})`);
    const [cx, cy] = P(x + 0.5, y + 2.15);
    cylinder(ctx, cx, cy - 16, 3.5, 22, '#5a4a42');
    if (env) env.smoke(cx, cy - 40, 0.6);
  }
  // Cerca de arame com postes nas duas frentes visíveis
  ctx.strokeStyle = 'rgba(170,175,170,0.55)';
  ctx.lineWidth = 1;
  const W0 = P(x + 0.05, y + 2.95), S0 = P(x + 2.95, y + 2.95), E0 = P(x + 2.95, y + 0.05);
  for (const [A, B] of [[W0, S0], [S0, E0]]) {
    for (let k = 0; k <= 4; k++) {
      const p = lerp(A, B, k / 4);
      line(ctx, p, [p[0], p[1] - 12], '#5a5650', 1.6);
    }
    ctx.strokeStyle = 'rgba(170,175,170,0.5)';
    ctx.beginPath();
    for (const z of [4, 8, 12]) {
      ctx.moveTo(A[0], A[1] - z);
      ctx.lineTo(B[0], B[1] - z);
    }
    ctx.stroke();
  }
  return level >= 2 ? 44 : level >= 1 ? 30 : 24;
}
