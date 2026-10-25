import { TILE, MAP_W, MAP_H, CHUNK, T, BUILDINGS, TREE_AMOUNT } from './config.js';
import { hash2 } from './rng.js';
import { HW, HH, toIso, fromIso, screenDir } from './iso.js';

// Paleta do mundo: verdes apagados, terra, ferrugem e o âmbar das fogueiras.
const C = {
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
  tree: ['#22351b', '#2c4423', '#3b572b'],
  pine: ['#1b2d1e', '#24392a', '#2f4834'],
  trunk: '#4a3524',
  rock: '#6a6961', rockHi: '#8b897f', rockDark: '#47463f',
  wood: '#7a5634', woodDark: '#4b351f', woodLight: '#9c7447',
  stone: '#7c7a72', stoneLight: '#9a988e',
  canvas: '#7a7750', canvasDark: '#5b5a3b', metal: '#6a7176',
  shadow: 'rgba(0,0,0,0.3)',
  sel: '#e3d9a6', ok: '#86a95d', warn: '#d9a441', bad: '#c2412d',
  res: { wood: '#c08850', stone: '#b4b2a8', food: '#d8c25a', scrap: '#8fb3c4' },
  jackets: ['#3f6b93', '#94643a', '#5d7d48', '#86506a', '#4c8783', '#7a7838', '#8a4a3c', '#5a5f8e'],
  pants: ['#2c2f36', '#3b3428', '#2f3a2c', '#34302c'],
  skin: ['#d9b48f', '#b98a63', '#8c5f3d', '#e8c9a8', '#a8774f'],
  zombie: { walker: '#6c7859', runner: '#87594a', brute: '#4c5845' },
  zHead: { walker: '#94a07e', runner: '#a7847a', brute: '#7f8c6c' },
  zPants: '#3a3a30',
  ruinWall: { casa: '#8a7d68', mercado: '#7b8580', oficina: '#6d6a62', cabana: '#6b5238' },
  roof: { casa: '#7d4b3a', mercado: '#56706b', oficina: '#6b5d4e', cabana: '#5f4a33' },
};

// Escurece/clareia uma cor hex por um fator (1 = igual).
const shadeCache = new Map();
function shade(hex, f) {
  const key = hex + f;
  let v = shadeCache.get(key);
  if (v) return v;
  const n = parseInt(hex.slice(1), 16);
  const ch = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  v = `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  shadeCache.set(key, v);
  return v;
}

const P = toIso;

function poly(ctx, pts, fill, stroke) {
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

const up = (p, z) => [p[0], p[1] - z];
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// Caixa isométrica sobre um retângulo de tiles, de z0 a z1 pixels de altura.
function box(ctx, x, y, w, h, z0, z1, color, dim = 1) {
  const N = P(x, y), E = P(x + w, y), S = P(x + w, y + h), W = P(x, y + h);
  poly(ctx, [up(W, z0), up(S, z0), up(S, z1), up(W, z1)], shade(color, 0.82 * dim));
  poly(ctx, [up(S, z0), up(E, z0), up(E, z1), up(S, z1)], shade(color, 0.62 * dim));
  poly(ctx, [up(N, z1), up(E, z1), up(S, z1), up(W, z1)], shade(color, 1.05 * dim));
  return { N, E, S, W };
}

// Recorte numa face vertical (janela, porta): frações ao longo da aresta A→B e alturas.
function faceQuad(ctx, A, B, t0, t1, z0, z1, fill) {
  const a = lerp(A, B, t0), b = lerp(A, B, t1);
  poly(ctx, [up(a, z0), up(b, z0), up(b, z1), up(a, z1)], fill);
}

// Telhado de duas águas sobre o retângulo, apoiado na altura z, com cumeeira rh acima.
function gable(ctx, x, y, w, h, z, rh, roof, wall, dim = 1) {
  const N = up(P(x, y), z), E = up(P(x + w, y), z), S = up(P(x + w, y + h), z), W = up(P(x, y + h), z);
  if (w >= h) {
    const R1 = up(P(x, y + h / 2), z + rh), R2 = up(P(x + w, y + h / 2), z + rh);
    poly(ctx, [N, E, R2, R1], shade(roof, 1.12 * dim));
    poly(ctx, [R1, R2, S, W], shade(roof, 0.9 * dim));
    poly(ctx, [E, S, R2], shade(wall, 0.6 * dim));
    return { front: [R1, R2, S, W] };
  }
  const R1 = up(P(x + w / 2, y), z + rh), R2 = up(P(x + w / 2, y + h), z + rh);
  poly(ctx, [N, R1, R2, W], shade(roof, 1.12 * dim));
  poly(ctx, [R1, E, S, R2], shade(roof, 0.8 * dim));
  poly(ctx, [W, S, R2], shade(wall, 0.82 * dim));
  return { front: [R1, E, S, R2] };
}

// Ponto dentro de um quadrilátero por interpolação bilinear (u ao longo de 0→1, v ao longo de 0→3).
function quadPoint(q, u, v) {
  return lerp(lerp(q[0], q[1], u), lerp(q[3], q[2], u), v);
}

function diamond(ctx, x, y, w, h, z = 0) {
  return [up(P(x, y), z), up(P(x + w, y), z), up(P(x + w, y + h), z), up(P(x, y + h), z)];
}

// Árvore desenhada com a base do tronco na origem.
function paintTree(ctx, pine, variant) {
  const v = variant / 4;
  ctx.fillStyle = C.shadow;
  ctx.beginPath();
  ctx.ellipse(8, 2, 20, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.trunk;
  ctx.fillRect(-2.5, -16, 5, 16);
  if (pine) {
    const lean = (v - 0.4) * 3;
    for (let k = 0; k < 3; k++) {
      const base = -(10 + k * 13), half = 17 - k * 4 + v * 2, top = base - (20 - k * 2);
      poly(ctx, [[-half, base], [half, base], [lean * (k + 1), top]], C.pine[k]);
      poly(ctx, [[0, base], [half, base], [lean * (k + 1), top]], 'rgba(0,0,0,0.18)');
    }
    return;
  }
  const cy = -30;
  const blob = (ox, oy, r, col) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(ox, cy + oy, r, 0, Math.PI * 2);
    ctx.fill();
  };
  const j = (k) => (hash2(variant * 5 + k, 11) - 0.5) * 5;
  blob(0, 2, 17, C.tree[0]);
  blob(-5 + j(1), -3 + j(2), 12, C.tree[1]);
  blob(6 + j(3), -1 + j(4), 10, C.tree[1]);
  blob(-6 + j(5), -8, 6, C.tree[2]);
  blob(3 + j(6), 8, 7, 'rgba(0,0,0,0.12)');
}

// Pedra com o centro do tile na origem.
function paintRock(ctx, variant) {
  const pts = [];
  for (let s = 0; s < 7; s++) {
    const a = (s / 7) * Math.PI * 2 + variant;
    const rad = 0.85 + hash2(variant * 7 + s, 3 - s) * 0.3;
    pts.push([Math.cos(a) * 22 * rad, -8 + Math.sin(a) * 12 * rad - (Math.sin(a) < 0 ? 8 * rad : 0)]);
  }
  ctx.fillStyle = C.shadow;
  ctx.beginPath();
  ctx.ellipse(5, 2, 22, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  poly(ctx, pts, C.rock);
  poly(ctx, [pts[3], pts[4], pts[5], [0, -10]], C.rockHi);
  poly(ctx, [pts[0], pts[1], pts[2], [0, -6]], C.rockDark);
}

export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.fog = document.createElement('canvas');
    this.fogCtx = this.fog.getContext('2d');
    this.light = document.createElement('canvas');
    this.lightCtx = this.light.getContext('2d');
    this.mini = document.createElement('canvas');
    this.mini.width = MAP_W;
    this.mini.height = MAP_H;
    this.miniCtx = this.mini.getContext('2d');
    this.miniImg = this.miniCtx.createImageData(MAP_W, MAP_H);
    this.sprites = new Map();
    this.setGame(game);
  }

  setGame(game) {
    this.game = game;
    this.chunks = new Map();
  }

  resize(w, h) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.light.width = Math.ceil(this.canvas.width / 2);
    this.light.height = Math.ceil(this.canvas.height / 2);
  }

  // ---------- chão: chunks pintados vistos de cima, desenhados com transformação isométrica ----------

  // Cada chunk é pintado visto de cima (com 1 tile de borda repetida dos vizinhos, para não
  // abrir frestas) e projetado em losango uma única vez; por quadro só é copiado reto.
  getChunk(cx, cy) {
    const key = cy * Math.ceil(MAP_W / CHUNK) + cx;
    let c = this.chunks.get(key);
    if (c) {
      this.chunks.delete(key);
      this.chunks.set(key, c);
      return c;
    }
    const flat = this.flatChunk || (this.flatChunk = document.createElement('canvas'));
    flat.width = flat.height = (CHUNK + 2) * TILE;
    const fctx = flat.getContext('2d');
    const m = this.game.map;
    for (let ty = -1; ty <= CHUNK; ty++) {
      for (let tx = -1; tx <= CHUNK; tx++) {
        const x = cx * CHUNK + tx, y = cy * CHUNK + ty;
        if (!m.inBounds(x, y)) continue;
        this.paintTile(fctx, m, x, y, (tx + 1) * TILE, (ty + 1) * TILE);
      }
    }
    const x0 = cx * CHUNK - 1, y0 = cy * CHUNK - 1, n = CHUNK + 2;
    const minX = (x0 - y0 - n) * HW, minY = (x0 + y0) * HH;
    c = document.createElement('canvas');
    c.width = 2 * n * HW;
    c.height = 2 * n * HH;
    const ictx = c.getContext('2d');
    const [ox, oy] = P(x0, y0);
    ictx.setTransform(HW / TILE, HH / TILE, -HW / TILE, HH / TILE, ox - minX, oy - minY);
    ictx.imageSmoothingEnabled = true;
    ictx.drawImage(flat, 0, 0);
    c.ox = minX;
    c.oy = minY;
    this.chunks.set(key, c);
    if (this.chunks.size > 40) this.chunks.delete(this.chunks.keys().next().value);
    return c;
  }

  paintTile(ctx, m, x, y, px, py) {
    const t = m.get(x, y);
    const v = hash2(x, y), v2 = hash2(y + 91, x + 17);
    const pick = (arr) => arr[Math.floor(v * arr.length)];
    const base = {
      [T.GRASS]: C.grass, [T.DIRT]: C.dirt, [T.SAND]: C.sand, [T.WATER]: C.water, [T.TREE]: C.forest,
      [T.ROCK]: C.gravel, [T.ROAD]: C.road, [T.RUBBLE]: C.rubble,
    }[t];
    ctx.fillStyle = pick(base);
    ctx.fillRect(px, py, TILE, TILE);
    for (let k = 0; k < 3; k++) {
      const hx = hash2(x * 3 + k, y * 7 - k), hy = hash2(y * 5 + k, x * 11 + k);
      ctx.fillStyle = k % 2 ? 'rgba(255,255,240,0.035)' : 'rgba(0,0,0,0.06)';
      ctx.fillRect(px + hx * 26, py + hy * 26, 6 + v2 * 8, 4 + hx * 6);
    }
    if (t === T.GRASS && v2 > 0.55) {
      ctx.fillStyle = C.tuft;
      ctx.fillRect(px + 6 + v * 18, py + 8 + v2 * 14, 3, 3);
      ctx.fillRect(px + 12 + v * 10, py + 12 + v * 10, 2, 2);
    } else if (t === T.DIRT || t === T.ROCK || t === T.RUBBLE) {
      ctx.fillStyle = t === T.RUBBLE ? 'rgba(150,140,125,0.45)' : 'rgba(30,24,16,0.35)';
      for (let k = 0; k < (t === T.RUBBLE ? 5 : 3); k++) {
        ctx.fillRect(px + hash2(x + k * 13, y) * 28, py + hash2(x, y + k * 17) * 28, 2 + (k % 2), 2);
      }
    } else if (t === T.WATER) {
      ctx.strokeStyle = 'rgba(170,210,210,0.10)';
      ctx.beginPath();
      const wy = py + 8 + v * 16;
      ctx.moveTo(px + 4, wy);
      ctx.quadraticCurveTo(px + 12, wy - 3, px + 20, wy);
      ctx.stroke();
      ctx.fillStyle = C.shore;
      const dry = (dx, dy) => m.inBounds(x + dx, y + dy) && m.get(x + dx, y + dy) !== T.WATER;
      if (dry(0, -1)) ctx.fillRect(px, py, TILE, 3);
      if (dry(0, 1)) ctx.fillRect(px, py + TILE - 3, TILE, 3);
      if (dry(-1, 0)) ctx.fillRect(px, py, 3, TILE);
      if (dry(1, 0)) ctx.fillRect(px + TILE - 3, py, 3, TILE);
    } else if (t === T.ROAD) {
      const road = (dx, dy) => m.inBounds(x + dx, y + dy) && m.get(x + dx, y + dy) === T.ROAD;
      ctx.fillStyle = C.roadLine;
      if (road(1, 0) && road(-1, 0) && !road(0, 1) && road(0, -1) && x % 3 === 0) ctx.fillRect(px + 4, py - 1, 14, 2);
      if (road(0, 1) && road(0, -1) && !road(1, 0) && road(-1, 0) && y % 3 === 0) ctx.fillRect(px - 1, py + 4, 2, 14);
      if (v2 > 0.8) {
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.moveTo(px + v * 20, py + 6);
        ctx.lineTo(px + 10 + v * 10, py + 16);
        ctx.lineTo(px + 6 + v * 18, py + 26);
        ctx.stroke();
      }
    }
  }

  // ---------- quadro ----------

  viewTransform() {
    const { cam } = this.state;
    const s = this.dpr * cam.zoom;
    return [s, 0, 0, s, -cam.x * s, -cam.y * s];
  }

  // Modo chão: coordenadas em pixels de tile (tile * TILE), projetadas para o losango isométrico.
  groundMode(ctx) {
    ctx.setTransform(...this.viewTransform());
    ctx.transform(HW / TILE, HH / TILE, -HW / TILE, HH / TILE, 0, 0);
  }

  // Modo em pé: coordenadas em pixels isométricos.
  uprightMode(ctx) {
    ctx.setTransform(...this.viewTransform());
  }

  draw(state, now) {
    this.state = state;
    const g = this.game;
    const m = g.map;
    const ctx = this.ctx;
    const { cam } = state;
    const z = cam.zoom, dpr = this.dpr;

    for (const key of m.dirtyChunks) this.chunks.delete(key);
    m.dirtyChunks.clear();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.void;
    ctx.fillRect(0, 0, this.w, this.h);

    // Retângulo visível em pixels isométricos e o intervalo de tiles que ele cobre.
    const vx0 = cam.x, vy0 = cam.y, vx1 = cam.x + this.w / z, vy1 = cam.y + this.h / z;
    const corners = [fromIso(vx0, vy0), fromIso(vx1, vy0), fromIso(vx0, vy1), fromIso(vx1, vy1)];
    const pad = 4;
    const tx0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[0]))) - pad);
    const tx1 = Math.min(MAP_W - 1, Math.ceil(Math.max(...corners.map((c) => c[0]))) + pad);
    const ty0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[1]))) - pad);
    const ty1 = Math.min(MAP_H - 1, Math.ceil(Math.max(...corners.map((c) => c[1]))) + pad);
    const view = { tx0, ty0, tx1, ty1, vx0, vy0, vx1, vy1 };
    const onScreen = (ix, iy, above = 90) => ix > vx0 - 70 && ix < vx1 + 70 && iy > vy0 - 20 && iy < vy1 + above;

    // Chão
    this.uprightMode(ctx);
    ctx.imageSmoothingEnabled = true;
    const cx0 = Math.floor(tx0 / CHUNK), cx1 = Math.floor(tx1 / CHUNK);
    const cy0 = Math.floor(ty0 / CHUNK), cy1 = Math.floor(ty1 / CHUNK);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const x0 = cx * CHUNK, y0 = cy * CHUNK;
        const minX = (x0 - y0 - CHUNK) * HW, maxX = (x0 - y0 + CHUNK) * HW;
        const minY = (x0 + y0) * HH, maxY = (x0 + y0 + 2 * CHUNK) * HH;
        if (maxX < vx0 || minX > vx1 || maxY < vy0 || minY > vy1) continue;
        const c = this.getChunk(cx, cy);
        ctx.drawImage(c, c.ox, c.oy);
      }
    }
    this.groundMode(ctx);
    this.drawCorpses(ctx, view);
    this.drawMarkers(ctx, state, now);
    if (state.selected && state.selected.kind === 'building' && state.selected.def.range) this.drawRange(ctx, state.selected);

    // Tudo que fica em pé, ordenado por profundidade (x + y).
    this.uprightMode(ctx);
    const items = [];
    for (let y = ty0; y <= ty1; y++) {
      for (let x = tx0; x <= tx1; x++) {
        const t = m.tiles[y * MAP_W + x];
        if (t !== T.TREE && t !== T.ROCK) continue;
        const [ix, iy] = P(x + 0.5, y + 0.5);
        if (!onScreen(ix, iy)) continue;
        items.push({ d: x + y + 1, k: t === T.TREE ? 1 : 2, x, y });
      }
    }
    const rectVisible = (r) => {
      const [ix, iy] = P(r.x + r.w / 2, r.y + r.h / 2);
      return onScreen(ix, iy, 160) || ix > vx0 - (r.w + r.h) * HW && ix < vx1 + (r.w + r.h) * HW && iy > vy0 - 60 && iy < vy1 + 200;
    };
    for (const r of g.ruins) if (rectVisible(r)) items.push({ d: r.x + r.y + (r.w + r.h) / 2, k: 3, o: r });
    for (const b of g.buildings) if (rectVisible(b)) items.push({ d: b.x + b.y + (b.w + b.h) / 2, k: 4, o: b });
    for (const u of g.units) {
      const [ix, iy] = P(u.x, u.y);
      if (onScreen(ix, iy)) items.push({ d: u.x + u.y, k: 5, o: u });
    }
    for (const zb of g.zombies) {
      if (!m.visible[m.idx(Math.floor(zb.x), Math.floor(zb.y))]) continue;
      const [ix, iy] = P(zb.x, zb.y);
      if (onScreen(ix, iy)) items.push({ d: zb.x + zb.y, k: 6, o: zb });
    }
    items.sort((a, b) => a.d - b.d);
    for (const it of items) {
      switch (it.k) {
        case 1: this.drawTree(ctx, it.x, it.y, m.res[it.y * MAP_W + it.x] / TREE_AMOUNT); break;
        case 2: this.drawRock(ctx, it.x, it.y); break;
        case 3: this.drawRuin(ctx, it.o, state.selected === it.o); break;
        case 4: this.drawBuilding(ctx, it.o, now, state.selected === it.o); break;
        case 5: this.drawUnit(ctx, it.o, state.selection.has(it.o), now); break;
        case 6: this.drawZombie(ctx, it.o, state.selected === it.o); break;
      }
    }
    this.drawTracers(ctx);

    this.drawNight(state, now);

    this.drawFog(view);
    this.groundMode(ctx);
    this.drawGhost(ctx, state);
    this.uprightMode(ctx);
    this.drawTexts(ctx);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (state.dragBox) {
      const b = state.dragBox;
      ctx.strokeStyle = C.sel;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(Math.min(b.x0, b.x1) + 0.5, Math.min(b.y0, b.y1) + 0.5, Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(227,217,166,0.06)';
      ctx.fillRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
    }
  }

  // ---------- natureza ----------

  // Sprites pré-desenhados: árvores e pedras são centenas por quadro, então cada variação
  // é pintada uma vez num canvas (em 2x, para zoom e telas densas) e depois só copiada.
  sprite(key, w, h, ax, ay, paint) {
    let c = this.sprites.get(key);
    if (!c) {
      const S = 2;
      c = document.createElement('canvas');
      c.width = w * S;
      c.height = h * S;
      const g = c.getContext('2d');
      g.scale(S, S);
      g.translate(ax, ay);
      paint(g);
      c.meta = { w, h, ax, ay };
      this.sprites.set(key, c);
    }
    return c;
  }

  blit(ctx, c, x, y, scale = 1) {
    const { w, h, ax, ay } = c.meta;
    ctx.drawImage(c, x - ax * scale, y - ay * scale, w * scale, h * scale);
  }

  drawTree(ctx, tx, ty, frac) {
    const v = hash2(tx, ty), v2 = hash2(tx + 3, ty * 2 + 1);
    const [x, y] = P(tx + 0.5 + (v - 0.5) * 0.3, ty + 0.5 + (v2 - 0.5) * 0.3);
    const s = (0.8 + v * 0.35) * (0.75 + 0.25 * frac);
    const pine = v2 > 0.62;
    const variant = Math.floor(hash2(ty * 13, tx * 7) * 4);
    const c = this.sprite(`t${pine ? 1 : 0}${variant}`, 64, 80, 26, 72, (g) => paintTree(g, pine, variant));
    this.blit(ctx, c, x, y, s);
  }

  drawRock(ctx, tx, ty) {
    const variant = Math.floor(hash2(tx, ty) * 6);
    const [x, y] = P(tx + 0.5, ty + 0.5);
    const c = this.sprite(`r${variant}`, 60, 40, 28, 28, (g) => paintRock(g, variant));
    this.blit(ctx, c, x, y);
  }

  drawCorpses(ctx, v) {
    for (const c of this.game.corpses) {
      if (c.x < v.tx0 || c.x > v.tx1 + 1 || c.y < v.ty0 || c.y > v.ty1 + 1) continue;
      const a = Math.max(0, 1 - c.t / 45);
      const px = c.x * TILE, py = c.y * TILE;
      ctx.globalAlpha = a * 0.7;
      ctx.fillStyle = '#3b1712';
      ctx.beginPath();
      ctx.ellipse(px, py, 11, 8, c.a, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = c.kind === 'unit' ? '#4a4038' : C.zombie[c.kind] || C.zombie.walker;
      ctx.beginPath();
      ctx.ellipse(px, py, 9, 4.5, c.a, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // ---------- ruínas ----------

  drawRuin(ctx, r, selected) {
    const dim = r.empty ? 0.62 : 1;
    const wall = C.ruinWall[r.type], roof = C.roof[r.type];
    const ins = 0.12;
    const x = r.x + ins, y = r.y + ins, w = r.w - 2 * ins, h = r.h - 2 * ins;
    const wallH = r.type === 'mercado' || r.type === 'oficina' ? 26 : 20;
    const sh = diamond(ctx, x + 0.25, y + 0.25, w, h);
    poly(ctx, sh, C.shadow);
    const b = box(ctx, x, y, w, h, 0, wallH, wall, dim);
    const dark = shade('#1a1612', dim);
    // Janelas e porta nas duas faces visíveis
    faceQuad(ctx, b.W, b.S, 0.15, 0.3, 7, 15, dark);
    faceQuad(ctx, b.W, b.S, 0.62, 0.77, 7, 15, dark);
    faceQuad(ctx, b.S, b.E, 0.4, 0.6, 0, 14, shade('#2a2219', dim));
    if (r.type === 'oficina') faceQuad(ctx, b.W, b.S, 0.36, 0.56, 0, 18, shade('#5d6266', dim));
    if (r.type === 'mercado') {
      // Toldo listrado e telhado plano com mureta
      faceQuad(ctx, b.W, b.S, 0.05, 0.95, 16, 20, shade('#a86b4f', dim));
      box(ctx, x, y, w, h, wallH, wallH + 3, wall, dim * 0.9);
      poly(ctx, diamond(ctx, x + 0.15, y + 0.15, w - 0.3, h - 0.3, wallH + 3), shade(roof, dim));
    } else if (r.type === 'oficina') {
      box(ctx, x, y, w, h, wallH, wallH + 2, roof, dim);
      const top = diamond(ctx, x, y, w, h, wallH + 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 1; k < 8; k++) {
        const a = lerp(top[0], top[1], k / 8), c = lerp(top[3], top[2], k / 8);
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(c[0], c[1]);
      }
      ctx.stroke();
    } else {
      const g = gable(ctx, x - 0.05, y - 0.05, w + 0.1, h + 0.1, wallH, 16, roof, wall, dim);
      // Buracos no telhado
      const holes = 1 + Math.floor(r.seed * 3);
      for (let k = 0; k < holes; k++) {
        const u = 0.15 + hash2(r.id, k) * 0.6, v = 0.2 + hash2(k, r.id) * 0.5;
        poly(ctx, [quadPoint(g.front, u, v), quadPoint(g.front, u + 0.12, v + 0.05), quadPoint(g.front, u + 0.1, v + 0.3), quadPoint(g.front, u - 0.02, v + 0.25)], '#16130f');
      }
    }
    if (!r.empty && (r.visited || this.game.map.visible[this.game.map.idx(r.x, r.y)])) {
      const [mx, my] = P(r.x + r.w / 2, r.y + r.h / 2);
      const top = my - wallH - 30;
      ctx.fillStyle = '#14120e';
      ctx.beginPath();
      ctx.arc(mx, top, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = this.lootColor(r);
      ctx.beginPath();
      ctx.arc(mx, top, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (selected) this.selectDiamond(ctx, r);
  }

  lootColor(r) {
    let best = 'food', v = -1;
    for (const k in r.loot) if (r.loot[k] > v) { v = r.loot[k]; best = k; }
    return C.res[best];
  }

  selectDiamond(ctx, r) {
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    poly(ctx, diamond(ctx, r.x, r.y, r.w, r.h), null, C.sel);
    ctx.setLineDash([]);
  }

  // ---------- prédios ----------

  drawBuilding(ctx, b, now, selected) {
    if (!b.complete) ctx.globalAlpha = 0.6;
    let height = 30;
    switch (b.type) {
      case 'hq': height = this.drawHQ(ctx, b, now); break;
      case 'tent': height = this.drawTent(ctx, b); break;
      case 'depot': height = this.drawDepot(ctx, b); break;
      case 'farm': height = this.drawFarm(ctx, b); break;
      case 'tower': height = this.drawTower(ctx, b); break;
      default: height = this.drawWall(ctx, b);
    }
    ctx.globalAlpha = 1;
    const [cx, cy] = P(b.x + b.w / 2, b.y + b.h / 2);
    if (b.hitT > 0) {
      ctx.lineWidth = 2;
      poly(ctx, diamond(ctx, b.x, b.y, b.w, b.h), null, `rgba(208,83,60,${Math.min(1, b.hitT * 5)})`);
    }
    if (selected) this.selectDiamond(ctx, b);
    if (!b.complete) this.bar(ctx, cx - 18, cy - height - 12, 36, b.progress, C.warn);
    else if (selected || b.hp < b.maxHp) this.bar(ctx, cx - 18, cy - height - 12, 36, b.hp / b.maxHp);
  }

  drawHQ(ctx, b, now) {
    const { x, y } = b;
    poly(ctx, diamond(ctx, x + 0.1, y + 0.1, 2.8, 2.8), '#4c3e2b');
    // Lona grande sobre estacas
    box(ctx, x + 0.3, y + 0.25, 2.3, 1.3, 0, 6, C.woodDark);
    gable(ctx, x + 0.25, y + 0.2, 2.4, 1.4, 6, 22, C.canvas, C.canvasDark);
    // Caixotes
    box(ctx, x + 2.35, y + 1.9, 0.45, 0.45, 0, 12, C.woodLight);
    box(ctx, x + 2.4, y + 2.45, 0.35, 0.35, 0, 9, C.woodLight);
    // Fogueira
    const [fx, fy] = P(x + 1.3, y + 2.3);
    ctx.fillStyle = '#5c5a52';
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(fx + Math.cos(a) * 13, fy + Math.sin(a) * 6.5, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = C.woodDark;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(fx - 8, fy + 2); ctx.lineTo(fx + 8, fy - 2);
    ctx.moveTo(fx - 7, fy - 3); ctx.lineTo(fx + 7, fy + 3);
    ctx.stroke();
    const fl = Math.sin(now * 11) * 2 + Math.sin(now * 17) * 1.2;
    poly(ctx, [[fx - 8, fy], [fx + 8, fy], [fx + fl * 0.5, fy - 22 - fl]], '#c2412d');
    poly(ctx, [[fx - 5, fy], [fx + 5, fy], [fx - fl * 0.4, fy - 15 - fl * 0.6]], '#e89a3a');
    poly(ctx, [[fx - 2.5, fy], [fx + 2.5, fy], [fx, fy - 8]], '#f6d67a');
    // Bancos de tronco
    box(ctx, x + 0.4, y + 2.1, 0.5, 0.2, 0, 5, C.wood);
    box(ctx, x + 1.9, y + 2.5, 0.2, 0.45, 0, 5, C.wood);
    return 34;
  }

  drawTent(ctx, b) {
    const tint = hash2(b.id, 3) > 0.5 ? '#6f7a52' : C.canvas;
    poly(ctx, diamond(ctx, b.x + 0.35, b.y + 0.35, 1.7, 1.7), C.shadow);
    gable(ctx, b.x + 0.2, b.y + 0.2, 1.6, 1.6, 0, 30, tint, C.canvasDark);
    // Abertura da porta na empena da frente
    const [W, S, R] = [up(P(b.x + 0.2, b.y + 1.8), 0), up(P(b.x + 1.8, b.y + 1.8), 0), up(P(b.x + 1, b.y + 1.8), 30)];
    poly(ctx, [lerp(W, S, 0.35), lerp(W, S, 0.65), lerp(lerp(W, S, 0.5), R, 0.6)], '#1e1c12');
    return 32;
  }

  drawDepot(ctx, b) {
    const { x, y } = b;
    box(ctx, x + 0.1, y + 0.1, 1.8, 1.8, 0, 4, C.woodDark);
    box(ctx, x + 0.25, y + 0.25, 0.7, 0.7, 4, 20, C.woodLight);
    box(ctx, x + 1.05, y + 0.3, 0.6, 0.6, 4, 16, C.woodLight);
    box(ctx, x + 0.3, y + 1.05, 0.55, 0.55, 4, 14, C.wood);
    // Barril
    const [bx, by] = P(x + 1.45, y + 1.45);
    ctx.fillStyle = '#5c4630';
    ctx.fillRect(bx - 7, by - 20, 14, 16);
    ctx.fillStyle = '#6d543a';
    ctx.beginPath();
    ctx.ellipse(bx, by - 20, 7, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(bx, by - 4, 7, 3.5, 0, 0, Math.PI);
    ctx.fill();
    ctx.strokeStyle = C.metal;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bx - 7, by - 15); ctx.lineTo(bx + 7, by - 15);
    ctx.moveTo(bx - 7, by - 9); ctx.lineTo(bx + 7, by - 9);
    ctx.stroke();
    return 24;
  }

  drawFarm(ctx, b) {
    const { x, y } = b;
    poly(ctx, diamond(ctx, x + 0.05, y + 0.05, 2.9, 2.9), '#4a3826');
    ctx.strokeStyle = '#3a2b1c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let k = 0.3; k < 3; k += 0.4) {
      const a = P(x + 0.2, y + k), c = P(x + 2.8, y + k);
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(c[0], c[1]);
    }
    ctx.stroke();
    const grow = b.complete ? 0.6 + 0.4 * ((b.foodT / b.def.foodInterval + b.produced * 0.13) % 1) : 0.3;
    for (let row = 0; row < 7; row++) {
      for (let k = 0; k < 8; k++) {
        const [px, py] = P(x + 0.3 + k * 0.33, y + 0.3 + row * 0.4);
        const r = (2.5 + hash2(row, k) * 1.5) * grow;
        ctx.fillStyle = (row + k) % 3 ? '#5e7f3a' : '#7a9443';
        ctx.beginPath();
        ctx.ellipse(px, py - r, r * 1.2, r, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Cerquinha
    ctx.strokeStyle = C.woodLight;
    ctx.lineWidth = 1.5;
    const d = diamond(ctx, x + 0.05, y + 0.05, 2.9, 2.9, 5);
    ctx.beginPath();
    ctx.moveTo(d[3][0], d[3][1]); ctx.lineTo(d[2][0], d[2][1]); ctx.lineTo(d[1][0], d[1][1]);
    ctx.stroke();
    return 8;
  }

  drawTower(ctx, b) {
    const { x, y } = b;
    const H = 46;
    poly(ctx, diamond(ctx, x + 0.4, y + 0.4, 1.8, 1.8), C.shadow);
    // Pernas e travessas
    const legs = [[x + 0.3, y + 0.3], [x + 1.7, y + 0.3], [x + 1.7, y + 1.7], [x + 0.3, y + 1.7]];
    ctx.strokeStyle = C.woodDark;
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (const [lx, ly] of legs) {
      const p = P(lx, ly);
      ctx.moveTo(p[0], p[1]);
      ctx.lineTo(p[0], p[1] - H);
    }
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    const a = P(legs[3][0], legs[3][1]), c = P(legs[2][0], legs[2][1]), e = P(legs[1][0], legs[1][1]);
    ctx.moveTo(a[0], a[1] - 6); ctx.lineTo(c[0], c[1] - H + 6);
    ctx.moveTo(c[0], c[1] - 6); ctx.lineTo(a[0], a[1] - H + 6);
    ctx.moveTo(c[0], c[1] - 6); ctx.lineTo(e[0], e[1] - H + 6);
    ctx.stroke();
    // Plataforma, guarda-corpo e telhado
    box(ctx, x + 0.15, y + 0.15, 1.7, 1.7, H, H + 5, C.wood);
    const [cx, cy] = P(x + 1, y + 1);
    const [dx, dy] = screenDir(b.angle);
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy - H - 14);
    ctx.lineTo(cx + dx * 18, cy - H - 14 + dy * 9);
    ctx.stroke();
    ctx.fillStyle = '#41606f';
    ctx.beginPath();
    ctx.arc(cx, cy - H - 14, 6, 0, Math.PI * 2);
    ctx.fill();
    const rail = diamond(ctx, x + 0.15, y + 0.15, 1.7, 1.7, H + 14);
    ctx.strokeStyle = C.woodLight;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(rail[3][0], rail[3][1]); ctx.lineTo(rail[2][0], rail[2][1]); ctx.lineTo(rail[1][0], rail[1][1]);
    ctx.stroke();
    const roofBase = diamond(ctx, x + 0.05, y + 0.05, 1.9, 1.9, H + 28);
    const peak = [cx, cy - H - 44];
    poly(ctx, [roofBase[0], roofBase[1], peak], shade('#6b4c2d', 1.1));
    poly(ctx, [roofBase[3], roofBase[0], peak], shade('#6b4c2d', 1));
    poly(ctx, [roofBase[2], roofBase[3], peak], shade('#6b4c2d', 0.85));
    poly(ctx, [roofBase[1], roofBase[2], peak], shade('#6b4c2d', 0.65));
    return H + 46;
  }

  drawWall(ctx, b) {
    const m = this.game.map;
    const isWall = (dx, dy) => {
      const nx = b.x + dx, ny = b.y + dy;
      if (!m.inBounds(nx, ny)) return false;
      const o = m.occ[m.idx(nx, ny)];
      return o && o.kind === 'building' && o.def.wall;
    };
    const { x, y } = b;
    if (b.type === 'gate') {
      const horiz = isWall(1, 0) || isWall(-1, 0) || !(isWall(0, 1) || isWall(0, -1));
      const bx = horiz ? x : x + 0.3, by = horiz ? y + 0.3 : y, bw = horiz ? 1 : 0.4, bh = horiz ? 0.4 : 1;
      const f = box(ctx, bx, by, bw, bh, 0, 24, C.woodLight);
      const A = horiz ? f.W : f.S, B = horiz ? f.S : f.E;
      faceQuad(ctx, A, B, 0, 1, 10, 13, C.metal);
      faceQuad(ctx, A, B, 0.48, 0.52, 0, 24, C.woodDark);
      box(ctx, horiz ? x - 0.05 : x + 0.25, horiz ? y + 0.25 : y - 0.05, 0.2, 0.5, 0, 30, C.woodDark);
      return 30;
    }
    const stone = b.type === 'stonewall';
    const color = stone ? C.stone : C.wood;
    const H = stone ? 22 : 26, t = stone ? 0.5 : 0.3;
    const o = (1 - t) / 2;
    // Segmentos em direção aos vizinhos de trás primeiro, depois o poste, depois os da frente.
    if (isWall(0, -1)) box(ctx, x + o, y, t, 0.5, 0, H, color);
    if (isWall(-1, 0)) box(ctx, x, y + o, 0.5, t, 0, H, color);
    if (stone) box(ctx, x + 0.2, y + 0.2, 0.6, 0.6, 0, H + 3, C.stoneLight);
    else {
      box(ctx, x + 0.32, y + 0.32, 0.36, 0.36, 0, H + 4, C.woodDark);
      const [px, py] = P(x + 0.5, y + 0.5);
      poly(ctx, [[px - 6, py - H - 4], [px + 6, py - H - 4], [px, py - H - 12]], C.woodLight);
    }
    if (isWall(1, 0)) box(ctx, x + 0.5, y + o, 0.5, t, 0, H, color);
    if (isWall(0, 1)) box(ctx, x + o, y + 0.5, t, 0.5, 0, H, color);
    return H + 8;
  }

  drawRange(ctx, b) {
    ctx.strokeStyle = 'rgba(217,164,65,0.5)';
    ctx.setLineDash([10, 8]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc((b.x + b.w / 2) * TILE, (b.y + b.h / 2) * TILE, b.def.range * TILE, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ---------- personagens ----------

  drawUnit(ctx, u, selected, now) {
    const [x, y] = P(u.x, u.y);
    const jacket = C.jackets[u.look % C.jackets.length];
    const skin = C.skin[(u.look >> 3) % C.skin.length];
    const pants = C.pants[(u.look >> 5) % C.pants.length];
    ctx.fillStyle = C.shadow;
    ctx.beginPath();
    ctx.ellipse(x + 3, y + 1, 9, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    if (selected) {
      ctx.strokeStyle = C.sel;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(x, y, 13, 6.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    const [dx, dy] = screenDir(u.facing);
    const walking = u.path && u.aimT <= 0;
    const step = walking ? Math.sin(now * 12 + u.id) * 2.5 : 0;
    ctx.strokeStyle = pants;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(x - 2.5, y - 1 + step * 0.3); ctx.lineTo(x - 2.5, y - 10);
    ctx.moveTo(x + 2.5, y - 1 - step * 0.3); ctx.lineTo(x + 2.5, y - 10);
    ctx.stroke();
    const gun = () => {
      ctx.strokeStyle = '#1f2224';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + dx * 3, y - 15);
      ctx.lineTo(x + dx * 15, y - 15 + dy * 7);
      ctx.stroke();
    };
    const pack = () => {
      if (!u.carry.amount) return;
      ctx.fillStyle = C.res[u.carry.type];
      ctx.fillRect(x - dx * 7 - 4, y - 21 - dy * 3, 8, 8);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - dx * 7 - 4, y - 21 - dy * 3, 8, 8);
    };
    if (dy < 0) gun();
    else pack();
    ctx.fillStyle = jacket;
    ctx.beginPath();
    ctx.ellipse(x, y - 15, 6.5, 7.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(x + dx * 1.2, y - 26, 4.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(30,22,16,0.8)';
    ctx.beginPath();
    ctx.arc(x + dx * 1.2, y - 27.5, 4.8, Math.PI, 0);
    ctx.fill();
    if (dy < 0) pack();
    else gun();
    if (u.hitT > 0) {
      ctx.fillStyle = `rgba(194,65,45,${u.hitT * 3})`;
      ctx.beginPath();
      ctx.ellipse(x, y - 17, 8, 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (selected || u.hp < u.maxHp) this.bar(ctx, x - 11, y - 40, 22, u.hp / u.maxHp);
  }

  drawZombie(ctx, z, selected) {
    const [x, y] = P(z.x, z.y);
    const s = z.type === 'brute' ? 1.45 : z.type === 'runner' ? 0.9 : 1;
    const body = C.zombie[z.type];
    ctx.fillStyle = C.shadow;
    ctx.beginPath();
    ctx.ellipse(x + 3, y + 1, 9 * s, 4.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    if (selected) {
      ctx.strokeStyle = C.bad;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(x, y, 14 * s, 7 * s, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    const [dx, dy] = screenDir(z.facing);
    const sway = Math.sin(z.anim * (z.type === 'runner' ? 10 : 4));
    ctx.strokeStyle = C.zPants;
    ctx.lineWidth = 3.5 * s;
    ctx.beginPath();
    ctx.moveTo(x - 2.5 * s, y - 1 + sway); ctx.lineTo(x - 2 * s, y - 9 * s);
    ctx.moveTo(x + 2.5 * s, y - 1 - sway); ctx.lineTo(x + 2 * s, y - 9 * s);
    ctx.stroke();
    const arms = () => {
      ctx.strokeStyle = body;
      ctx.lineWidth = 3 * s;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const side of [-1, 1]) {
        const sx = x + side * 5 * s, sy = y - 15 * s;
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + dx * 13 * s + side * sway, sy + dy * 6 * s + 2);
      }
      ctx.stroke();
      ctx.lineCap = 'butt';
    };
    if (dy < 0) arms();
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(x + dx * 1.5, y - 13 * s, 6.5 * s, 7 * s, dx * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,10,8,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#5a1d14';
    ctx.beginPath();
    ctx.arc(x - dx * 2, y - 12 * s, 2.2 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.zHead[z.type];
    ctx.beginPath();
    ctx.arc(x + dx * 4 * s, y - 22 * s + Math.abs(sway), 4.6 * s, 0, Math.PI * 2);
    ctx.fill();
    if (dy >= 0) arms();
    if (z.hitT > 0) {
      ctx.fillStyle = `rgba(240,230,200,${z.hitT * 3})`;
      ctx.beginPath();
      ctx.ellipse(x, y - 14 * s, 8 * s, 11 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (selected || z.hp < z.maxHp) this.bar(ctx, x - 11, y - 36 * s, 22, z.hp / z.maxHp, C.bad);
  }

  bar(ctx, x, y, w, frac, color) {
    frac = Math.max(0, Math.min(1, frac));
    ctx.fillStyle = 'rgba(10,10,8,0.75)';
    ctx.fillRect(x - 1, y - 1, w + 2, 5);
    ctx.fillStyle = color || (frac > 0.6 ? C.ok : frac > 0.3 ? C.warn : C.bad);
    ctx.fillRect(x, y, w * frac, 3);
  }

  drawTracers(ctx) {
    for (const t of this.game.tracers) {
      const tower = t.kind === 'tower';
      const [x1, y1] = P(t.x1, t.y1), [x2, y2] = P(t.x2, t.y2);
      ctx.strokeStyle = tower ? `rgba(255,220,140,${t.t * 9})` : `rgba(255,236,180,${t.t * 10})`;
      ctx.lineWidth = tower ? 2 : 1.3;
      ctx.beginPath();
      ctx.moveTo(x1, y1 - (tower ? 60 : 16));
      ctx.lineTo(x2, y2 - 13);
      ctx.stroke();
    }
  }

  drawMarkers(ctx, state, now) {
    state.markers = state.markers.filter((mk) => now - mk.t < 0.6);
    for (const mk of state.markers) {
      const k = (now - mk.t) / 0.6;
      ctx.strokeStyle = mk.kind === 'attack' ? `rgba(194,65,45,${1 - k})` : `rgba(227,217,166,${1 - k})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mk.x * TILE, mk.y * TILE, 4 + k * 12, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  drawTexts(ctx) {
    ctx.font = '600 14px "Barlow Condensed", "Arial Narrow", sans-serif';
    ctx.textAlign = 'center';
    for (const t of this.game.texts) {
      const k = t.t / t.life;
      const [x, y] = P(t.x, t.y);
      const ty = y - 34 - k * 24;
      ctx.globalAlpha = 1 - k * k;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillText(t.text, x + 1, ty + 1);
      ctx.fillStyle = C.res[t.color] || '#e8e2cf';
      ctx.fillText(t.text, x, ty);
    }
    ctx.globalAlpha = 1;
  }

  // ---------- noite e névoa ----------

  drawNight(state, now) {
    const g = this.game;
    const dark = g.darkness;
    if (dark <= 0.01) return;
    const { cam } = state;
    const z = cam.zoom, dpr = this.dpr / 2; // luz em meia resolução
    const lc = this.lightCtx;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalCompositeOperation = 'source-over';
    lc.clearRect(0, 0, this.light.width, this.light.height);
    lc.fillStyle = `rgba(6,10,26,${0.8 * dark})`;
    lc.fillRect(0, 0, this.light.width, this.light.height);
    lc.globalCompositeOperation = 'destination-out';
    const fires = [];
    // Um círculo no chão vira elipse 2:1 na tela.
    const light = (wx, wy, radius, flicker, fire) => {
      const [ix, iy] = P(wx, wy);
      const sx = (ix - cam.x) * z * dpr, sy = (iy - cam.y) * z * dpr;
      const r = radius * HW * Math.SQRT2 * z * dpr * (1 + Math.sin(now * 9 + flicker) * 0.025);
      if (sx < -r || sy < -r || sx > this.light.width + r || sy > this.light.height + r) return;
      lc.save();
      lc.translate(sx, sy);
      lc.scale(1, 0.5);
      const grad = lc.createRadialGradient(0, 0, 0, 0, 0, r);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(0.55, 'rgba(0,0,0,0.75)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      lc.fillStyle = grad;
      lc.beginPath();
      lc.arc(0, 0, r, 0, Math.PI * 2);
      lc.fill();
      lc.restore();
      if (fire) fires.push([sx, sy, r]);
    };
    for (const b of g.buildings) {
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      if (b.type === 'hq') light(b.x + 1.3, b.y + 2.3, 8, 0, true);
      else if (b.type === 'tower' && b.complete) light(cx, cy, 6.5, b.id, true);
      else if (!b.def.wall) light(cx, cy, 2.5, b.id, false);
    }
    for (const u of g.units) light(u.x + Math.cos(u.facing) * 1.5, u.y + Math.sin(u.facing) * 1.5, 3.2, u.id, false);
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.light, 0, 0, this.canvas.width, this.canvas.height);
    ctx.globalCompositeOperation = 'lighter';
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    for (const [sx, sy, r] of fires) {
      ctx.save();
      ctx.translate(sx, sy);
      ctx.scale(1, 0.55);
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.8);
      grad.addColorStop(0, `rgba(232,140,50,${0.24 * dark})`);
      grad.addColorStop(1, 'rgba(232,140,50,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // Névoa: uma imagem de 1 pixel por tile, projetada num canvas de 1/4 da tela e ampliada.
  drawFog(v) {
    const m = this.game.map;
    const w = v.tx1 - v.tx0 + 3, h = v.ty1 - v.ty0 + 3;
    if (this.fog.width !== w || this.fog.height !== h) {
      this.fog.width = w;
      this.fog.height = h;
      this.fogImg = this.fogCtx.createImageData(w, h);
    }
    const data = this.fogImg.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const mx = v.tx0 - 1 + x, my = v.ty0 - 1 + y;
        let a = 255;
        if (m.inBounds(mx, my)) {
          const i = m.idx(mx, my);
          a = m.visible[i] ? 0 : m.explored[i] ? 125 : 255;
        }
        const p = (y * w + x) * 4;
        data[p] = 8;
        data[p + 1] = 10;
        data[p + 2] = 8;
        data[p + 3] = a;
      }
    }
    this.fogCtx.putImageData(this.fogImg, 0, 0);

    const Q = 4;
    const low = this.fogLow || (this.fogLow = document.createElement('canvas'));
    const lw = Math.ceil(this.w / Q), lh = Math.ceil(this.h / Q);
    if (low.width !== lw || low.height !== lh) {
      low.width = lw;
      low.height = lh;
    }
    const lc = low.getContext('2d');
    const { cam } = this.state;
    const s = cam.zoom / Q;
    // 'copy' substitui o quadro anterior inteiro; fora do mapa fica transparente sobre o fundo vazio.
    lc.setTransform(s, 0, 0, s, -cam.x * s, -cam.y * s);
    lc.transform(HW, HH, -HW, HH, 0, 0);
    lc.globalCompositeOperation = 'copy';
    lc.imageSmoothingEnabled = true;
    lc.drawImage(this.fog, v.tx0 - 1, v.ty0 - 1, w, h);
    lc.globalCompositeOperation = 'source-over';
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(low, 0, 0, lw * Q, lh * Q);
  }

  drawGhost(ctx, state) {
    const gh = state.ghost;
    if (!gh) return;
    const def = BUILDINGS[gh.type];
    for (const p of gh.tiles) {
      ctx.fillStyle = p.ok ? 'rgba(134,169,93,0.4)' : 'rgba(194,65,45,0.45)';
      ctx.fillRect(p.x * TILE, p.y * TILE, def.w * TILE, def.h * TILE);
      ctx.strokeStyle = p.ok ? 'rgba(170,210,120,0.9)' : 'rgba(230,90,70,0.9)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(p.x * TILE + 0.75, p.y * TILE + 0.75, def.w * TILE - 1.5, def.h * TILE - 1.5);
    }
    if (def.range && gh.tiles.length) {
      const p = gh.tiles[0];
      ctx.strokeStyle = 'rgba(217,164,65,0.5)';
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.arc((p.x + def.w / 2) * TILE, (p.y + def.h / 2) * TILE, def.range * TILE, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // ---------- minimapa em losango ----------

  // Minimapa: canvas 2:1 com o mapa desenhado em losango. (u, v) são frações 0..1 do canvas.
  miniToTile(u, v) {
    const X = (u - 0.5) * (MAP_W + MAP_H), Y = v * (MAP_W + MAP_H) * 0.5;
    return [(X + 2 * Y) / 2, (2 * Y - X) / 2];
  }

  drawMinimap(target, state) {
    const g = this.game, m = g.map;
    const d = this.miniImg.data;
    const col = {
      [T.GRASS]: [62, 78, 45], [T.DIRT]: [92, 76, 54], [T.SAND]: [130, 118, 84], [T.WATER]: [30, 56, 64],
      [T.TREE]: [34, 52, 28], [T.ROCK]: [100, 98, 90], [T.ROAD]: [70, 68, 62], [T.RUBBLE]: [80, 74, 66],
    };
    for (let i = 0; i < MAP_W * MAP_H; i++) {
      const p = i * 4;
      if (!m.explored[i]) {
        d[p] = 16; d[p + 1] = 19; d[p + 2] = 15; d[p + 3] = 255;
        continue;
      }
      const o = m.occ[i];
      let c = col[m.tiles[i]];
      if (o && o.kind === 'ruin') c = o.empty ? [70, 58, 48] : [150, 100, 70];
      else if (o && o.kind === 'building') c = o.def.wall ? [160, 140, 100] : [210, 170, 90];
      const k = m.visible[i] ? 1 : 0.6;
      d[p] = c[0] * k; d[p + 1] = c[1] * k; d[p + 2] = c[2] * k; d[p + 3] = 255;
    }
    const dot = (x, y, r, gg, b) => {
      const i = (Math.floor(y) * MAP_W + Math.floor(x)) * 4;
      if (i < 0 || i >= d.length) return;
      d[i] = r; d[i + 1] = gg; d[i + 2] = b;
    };
    for (const z of g.zombies) if (m.visible[m.idx(Math.floor(z.x), Math.floor(z.y))]) dot(z.x, z.y, 220, 60, 45);
    for (const u of g.units) dot(u.x, u.y, 140, 200, 240);
    this.miniCtx.putImageData(this.miniImg, 0, 0);

    const tc = target.getContext('2d');
    const W = target.width, H = target.height;
    // Escala: um tile vale k px na horizontal do losango (largura total = (MAP_W + MAP_H) * k / 2 * 2).
    const k = W / (MAP_W + MAP_H);
    tc.setTransform(1, 0, 0, 1, 0, 0);
    tc.clearRect(0, 0, W, H);
    tc.imageSmoothingEnabled = false;
    tc.setTransform(k, k / 2, -k, k / 2, W / 2, 0);
    tc.drawImage(this.mini, 0, 0);
    tc.setTransform(1, 0, 0, 1, 0, 0);
    const toMini = (tx, ty) => [W / 2 + (tx - ty) * k, (tx + ty) * k / 2];
    for (const p of g.pings) {
      const f = p.t % 1;
      const [px, py] = toMini(p.x, p.y);
      tc.strokeStyle = `rgba(230,80,60,${1 - f})`;
      tc.lineWidth = 2;
      tc.beginPath();
      tc.ellipse(px, py, 3 + f * 12, (3 + f * 12) / 2, 0, 0, Math.PI * 2);
      tc.stroke();
    }
    const { cam } = state;
    // Pixels isométricos -> minimapa: x / HW * k, y / HH * k / 2
    tc.strokeStyle = '#e3d9a6';
    tc.lineWidth = 1;
    tc.strokeRect(
      W / 2 + (cam.x / HW) * k + 0.5, (cam.y / HH) * k / 2 + 0.5,
      (this.w / cam.zoom / HW) * k, (this.h / cam.zoom / HH) * k / 2,
    );
  }
}
