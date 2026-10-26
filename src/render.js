import { TILE, MAP_W, MAP_H, CHUNK, T, BUILDINGS, TREE_AMOUNT } from './config.js';
import { hash2 } from './rng.js';
import { HW, HH, fromIso } from './iso.js';
import { C, P, poly, diamond } from './draw/shapes.js';
import { paintTree, paintRock, decorAt, paintDecor, DECOR_SIZE, waterGlint } from './draw/nature.js';
import { drawRuin, drawNest, lootMarker, drawHQ, drawTent, drawDepot, drawFarm, drawTower, drawWall, drawScrapyard, scaffold } from './draw/buildings.js';
import { drawUnit, drawZombie, drawZombieEyes, drawBadge, bar } from './draw/actors.js';

// Grupos de terreno para as transições: o de prioridade maior "invade" a borda do vizinho.
const GROUP = { [T.GRASS]: 'g', [T.TREE]: 'g', [T.DIRT]: 'd', [T.ROCK]: 'd', [T.RUBBLE]: 'd', [T.SAND]: 's', [T.WATER]: 'w', [T.ROAD]: 'r' };
const PRIORITY = { g: 3, d: 2, s: 1 };
const GROUP_COLORS = { g: C.grass, d: C.dirt, s: C.sand };

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
    this.particles = [];
    this.lastNow = 0;
    this.setGame(game);
  }

  setGame(game) {
    this.game = game;
    this.chunks = new Map();
    this.particles = [];
  }

  resize(w, h) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.light.width = Math.ceil(this.canvas.width / 2);
    this.light.height = Math.ceil(this.canvas.height / 2);
    // Vinheta pronta, só copiada por quadro.
    this.vignette = document.createElement('canvas');
    this.vignette.width = Math.ceil(w / 4);
    this.vignette.height = Math.ceil(h / 4);
    const v = this.vignette.getContext('2d');
    const r = Math.hypot(this.vignette.width, this.vignette.height) / 2;
    const g = v.createRadialGradient(this.vignette.width / 2, this.vignette.height / 2, r * 0.45, this.vignette.width / 2, this.vignette.height / 2, r);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(4,6,4,0.55)');
    v.fillStyle = g;
    v.fillRect(0, 0, this.vignette.width, this.vignette.height);
  }

  // ---------- sprites ----------

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

  // ---------- chão ----------

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
        if (m.inBounds(x, y)) this.paintTile(fctx, m, x, y, (tx + 1) * TILE, (ty + 1) * TILE);
      }
    }
    // Segunda passada: transições por cima dos tiles já pintados.
    for (let ty = -1; ty <= CHUNK; ty++) {
      for (let tx = -1; tx <= CHUNK; tx++) {
        const x = cx * CHUNK + tx, y = cy * CHUNK + ty;
        if (m.inBounds(x, y)) this.blendTile(fctx, m, x, y, (tx + 1) * TILE, (ty + 1) * TILE);
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
    for (let k = 0; k < 4; k++) {
      const hx = hash2(x * 3 + k, y * 7 - k), hy = hash2(y * 5 + k, x * 11 + k);
      ctx.fillStyle = k % 2 ? 'rgba(255,255,240,0.035)' : 'rgba(0,0,0,0.06)';
      ctx.beginPath();
      ctx.ellipse(px + 4 + hx * 24, py + 4 + hy * 24, 4 + v2 * 6, 3 + hx * 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (t === T.GRASS || t === T.TREE) {
      ctx.fillStyle = t === T.TREE ? 'rgba(40,30,18,0.35)' : C.tuft;
      for (let k = 0; k < 3; k++) ctx.fillRect(px + hash2(x + k, y * 3) * 28, py + hash2(x * 3, y + k) * 28, 2, 2);
    } else if (t === T.DIRT || t === T.ROCK || t === T.RUBBLE) {
      ctx.fillStyle = t === T.RUBBLE ? 'rgba(150,140,125,0.45)' : 'rgba(30,24,16,0.35)';
      for (let k = 0; k < (t === T.RUBBLE ? 6 : 4); k++) {
        ctx.fillRect(px + hash2(x + k * 13, y) * 28, py + hash2(x, y + k * 17) * 28, 2 + (k % 2), 2);
      }
      if (t === T.DIRT && v2 > 0.7) {
        // Marcas de pegadas/rodas
        ctx.strokeStyle = 'rgba(30,24,16,0.25)';
        ctx.beginPath();
        ctx.moveTo(px + 4, py + 10 + v * 10);
        ctx.lineTo(px + 28, py + 14 + v * 10);
        ctx.stroke();
      }
    } else if (t === T.WATER) {
      // Mais escuro longe da margem
      let shore = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (m.inBounds(x + dx, y + dy) && m.get(x + dx, y + dy) !== T.WATER) shore++;
      if (!shore) {
        ctx.fillStyle = 'rgba(5,15,20,0.25)';
        ctx.fillRect(px, py, TILE, TILE);
      }
      ctx.strokeStyle = 'rgba(170,210,210,0.10)';
      ctx.beginPath();
      const wy = py + 8 + v * 16;
      ctx.moveTo(px + 4, wy);
      ctx.quadraticCurveTo(px + 12, wy - 3, px + 20, wy);
      ctx.stroke();
      ctx.fillStyle = C.shore;
      const dry = (dx, dy) => m.inBounds(x + dx, y + dy) && m.get(x + dx, y + dy) !== T.WATER;
      if (dry(0, -1)) ctx.fillRect(px, py, TILE, 4);
      if (dry(0, 1)) ctx.fillRect(px, py + TILE - 4, TILE, 4);
      if (dry(-1, 0)) ctx.fillRect(px, py, 4, TILE);
      if (dry(1, 0)) ctx.fillRect(px + TILE - 4, py, 4, TILE);
    } else if (t === T.ROAD) {
      const road = (dx, dy) => m.inBounds(x + dx, y + dy) && m.get(x + dx, y + dy) === T.ROAD;
      ctx.fillStyle = C.roadLine;
      if (road(1, 0) && road(-1, 0) && !road(0, 1) && road(0, -1) && x % 3 === 0) ctx.fillRect(px + 4, py - 1, 14, 2);
      if (road(0, 1) && road(0, -1) && !road(1, 0) && road(-1, 0) && y % 3 === 0) ctx.fillRect(px - 1, py + 4, 2, 14);
      // Calçada nas bordas da rua
      ctx.fillStyle = 'rgba(150,145,130,0.22)';
      if (!road(0, -1)) ctx.fillRect(px, py, TILE, 3);
      if (!road(0, 1)) ctx.fillRect(px, py + TILE - 3, TILE, 3);
      if (!road(-1, 0)) ctx.fillRect(px, py, 3, TILE);
      if (!road(1, 0)) ctx.fillRect(px + TILE - 3, py, 3, TILE);
      if (v2 > 0.78) {
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.moveTo(px + v * 20, py + 6);
        ctx.lineTo(px + 10 + v * 10, py + 16);
        ctx.lineTo(px + 6 + v * 18, py + 26);
        ctx.stroke();
      }
      if (v > 0.9) {
        // Mancha de óleo / buraco
        ctx.fillStyle = 'rgba(10,10,12,0.35)';
        ctx.beginPath();
        ctx.ellipse(px + 16, py + 16, 6, 4, v, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Bordas orgânicas: manchas do terreno vizinho avançando sobre este tile.
  blendTile(ctx, m, x, y, px, py) {
    const g = GROUP[m.get(x, y)];
    if (!PRIORITY[g]) return;
    const sides = [[0, -1, 'n'], [0, 1, 's'], [-1, 0, 'w'], [1, 0, 'e']];
    for (const [dx, dy, side] of sides) {
      if (!m.inBounds(x + dx, y + dy)) continue;
      const ng = GROUP[m.get(x + dx, y + dy)];
      if (!PRIORITY[ng] || PRIORITY[ng] <= PRIORITY[g]) continue;
      const pal = GROUP_COLORS[ng];
      for (let k = 0; k < 5; k++) {
        const h1 = hash2(x * 31 + k * 7 + dx, y * 17 + k * 3 + dy), h2 = hash2(y * 13 + k, x * 23 - k);
        const along = 2 + h1 * 28, depth = 2 + h2 * 7, r = 3 + h2 * 5;
        let cx, cy;
        if (side === 'n') [cx, cy] = [px + along, py + depth - r * 0.5];
        else if (side === 's') [cx, cy] = [px + along, py + TILE - depth + r * 0.5];
        else if (side === 'w') [cx, cy] = [px + depth - r * 0.5, py + along];
        else [cx, cy] = [px + TILE - depth + r * 0.5, py + along];
        ctx.fillStyle = pal[(k + Math.floor(h1 * 4)) % pal.length];
        ctx.beginPath();
        ctx.ellipse(cx, cy, r, r * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
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
    const dt = Math.min(0.05, Math.max(0, now - this.lastNow));
    this.lastNow = now;

    for (const key of m.dirtyChunks) this.chunks.delete(key);
    m.dirtyChunks.clear();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.void;
    ctx.fillRect(0, 0, this.w, this.h);

    const vx0 = cam.x, vy0 = cam.y, vx1 = cam.x + this.w / z, vy1 = cam.y + this.h / z;
    const corners = [fromIso(vx0, vy0), fromIso(vx1, vy0), fromIso(vx0, vy1), fromIso(vx1, vy1)];
    const pad = 4;
    const tx0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[0]))) - pad);
    const tx1 = Math.min(MAP_W - 1, Math.ceil(Math.max(...corners.map((c) => c[0]))) + pad);
    const ty0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[1]))) - pad);
    const ty1 = Math.min(MAP_H - 1, Math.ceil(Math.max(...corners.map((c) => c[1]))) + pad);
    const view = { tx0, ty0, tx1, ty1 };
    const onScreen = (ix, iy, above = 90) => ix > vx0 - 70 && ix < vx1 + 70 && iy > vy0 - 20 && iy < vy1 + above;

    const env = {
      now,
      dark: g.darkness,
      map: m,
      ember: (x, y) => this.emit('ember', x, y),
      smoke: (x, y, rate) => this.emit('smoke', x, y, rate),
    };

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

    // Coleta do que fica em pé (e brilhos da água, desenhados já).
    const items = [];
    for (let y = ty0; y <= ty1; y++) {
      for (let x = tx0; x <= tx1; x++) {
        const i = y * MAP_W + x;
        const t = m.tiles[i];
        const [ix, iy] = P(x + 0.5, y + 0.5);
        if (!onScreen(ix, iy)) continue;
        if (t === T.TREE) items.push({ d: x + y + 1, k: 1, x, y });
        else if (t === T.ROCK) items.push({ d: x + y + 1, k: 2, x, y });
        else if (!m.explored[i]) continue;
        else if (t === T.WATER) {
          const h = hash2(x * 7, y * 11);
          if (h < 0.3) waterGlint(ctx, ix, iy, h, now);
        } else if (!m.occ[i]) {
          const dec = decorAt(x, y, t);
          if (dec) items.push({ d: x + y + 0.9, k: 7, x, y, o: dec });
        }
      }
    }

    this.groundMode(ctx);
    this.drawCorpses(ctx, view);
    this.drawMarkers(ctx, state, now);
    if (state.selected && state.selected.kind === 'building' && state.selected.def.range) this.drawRange(ctx, state.selected);
    this.uprightMode(ctx);

    const rectVisible = (r) => {
      const [ix, iy] = P(r.x + r.w / 2, r.y + r.h / 2);
      return ix > vx0 - (r.w + r.h) * HW && ix < vx1 + (r.w + r.h) * HW && iy > vy0 - 60 && iy < vy1 + 200;
    };
    for (const r of g.ruins) if (rectVisible(r)) items.push({ d: r.x + r.y + (r.w + r.h) / 2, k: 3, o: r });
    for (const b of g.buildings) if (rectVisible(b)) items.push({ d: b.x + b.y + (b.w + b.h) / 2, k: 4, o: b });
    for (const n of g.nests) {
      if (!n.dead && m.explored[m.idx(n.x + 1, n.y + 1)] && rectVisible(n)) items.push({ d: n.x + n.y + (n.w + n.h) / 2, k: 8, o: n });
    }
    const units = [];
    for (const u of g.units) {
      const [ix, iy] = P(u.x, u.y);
      if (onScreen(ix, iy)) {
        items.push({ d: u.x + u.y, k: 5, o: u });
        units.push(u);
      }
    }
    const zombies = [];
    for (const zb of g.zombies) {
      if (!m.visible[m.idx(Math.floor(zb.x), Math.floor(zb.y))]) continue;
      const [ix, iy] = P(zb.x, zb.y);
      if (onScreen(ix, iy)) {
        items.push({ d: zb.x + zb.y, k: 6, o: zb });
        zombies.push(zb);
      }
    }
    items.sort((a, b) => a.d - b.d);
    for (const it of items) {
      switch (it.k) {
        case 1: this.drawTree(ctx, it.x, it.y, m.res[it.y * MAP_W + it.x] / TREE_AMOUNT); break;
        case 2: this.drawRock(ctx, it.x, it.y); break;
        case 3: this.drawRuinItem(ctx, it.o, state.selected === it.o, env); break;
        case 4: this.drawBuilding(ctx, it.o, state.selected === it.o, env); break;
        case 5: drawUnit(ctx, it.o, state.selection.has(it.o), env, g.activity(it.o)); break;
        case 6: drawZombie(ctx, it.o, state.selected === it.o, env); break;
        case 7: this.drawDecor(ctx, it.x, it.y, it.o); break;
        case 8: this.drawNestItem(ctx, it.o, state.selected === it.o, env); break;
      }
    }
    this.updateParticles(dt);
    this.drawParticles(ctx, 'smoke');
    this.drawTracers(ctx);

    this.drawNight(state, now);
    this.uprightMode(ctx);
    if (env.dark > 0.2) for (const zb of zombies) drawZombieEyes(ctx, zb, env.dark);
    this.drawParticles(ctx, 'ember');

    this.drawFog(view);
    this.uprightMode(ctx);
    for (const r of g.ruins) {
      if (r.empty || !m.explored[m.idx(r.x, r.y)] || !rectVisible(r)) continue;
      lootMarker(ctx, r, this.lootColor(r), now);
    }
    for (const u of units) drawBadge(ctx, u, g.activity(u), now);
    this.groundMode(ctx);
    this.drawGhost(ctx, state);
    this.uprightMode(ctx);
    this.drawTexts(ctx);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(this.vignette, 0, 0, this.w, this.h);
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

  drawTree(ctx, tx, ty, frac) {
    const v = hash2(tx, ty), v2 = hash2(tx + 3, ty * 2 + 1), v3 = hash2(tx * 3 + 5, ty + 11);
    const [x, y] = P(tx + 0.5 + (v - 0.5) * 0.3, ty + 0.5 + (v2 - 0.5) * 0.3);
    const s = (0.8 + v * 0.35) * (0.75 + 0.25 * frac);
    const kind = v3 < 0.035 ? 2 : v2 > 0.62 ? 1 : v3 < 0.13 ? 3 : 0; // 0 copada, 1 pinheiro, 2 seca, 3 outono
    const variant = Math.floor(hash2(ty * 13, tx * 7) * 4);
    const c = this.sprite(`t${kind}${variant}`, 76, 80, 36, 68, (g) => paintTree(g, kind, variant));
    this.blit(ctx, c, x, y, s);
  }

  drawRock(ctx, tx, ty) {
    const variant = Math.floor(hash2(tx, ty) * 6);
    const [x, y] = P(tx + 0.5, ty + 0.5);
    this.blit(ctx, this.sprite(`r${variant}`, 60, 46, 30, 32, (g) => paintRock(g, variant)), x, y);
  }

  drawDecor(ctx, tx, ty, dec) {
    const [w, h, ax, ay] = DECOR_SIZE[dec.kind];
    const jx = (hash2(tx * 9, ty) - 0.5) * 0.4, jy = (hash2(tx, ty * 9) - 0.5) * 0.4;
    const [x, y] = P(tx + 0.5 + jx, ty + 0.5 + jy);
    this.blit(ctx, this.sprite(`d${dec.kind}${dec.v}`, w, h, ax, ay, (g) => paintDecor(g, dec.kind, dec.v)), x, y);
  }

  drawCorpses(ctx, v) {
    for (const c of this.game.corpses) {
      if (c.x < v.tx0 || c.x > v.tx1 + 1 || c.y < v.ty0 || c.y > v.ty1 + 1) continue;
      const a = Math.max(0, 1 - c.t / 45);
      const px = c.x * TILE, py = c.y * TILE;
      ctx.globalAlpha = a * 0.75;
      ctx.fillStyle = '#3b1712';
      ctx.beginPath();
      ctx.ellipse(px, py, 12, 9, c.a, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = c.kind === 'unit' ? '#4a4038' : C.zSkin[c.kind] || C.zSkin.walker;
      ctx.beginPath();
      ctx.ellipse(px, py, 9, 4.5, c.a, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(30,25,20,0.8)';
      ctx.beginPath();
      ctx.arc(px + Math.cos(c.a) * 8, py + Math.sin(c.a) * 8, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // ---------- ruínas e prédios ----------

  drawRuinItem(ctx, r, selected, env) {
    drawRuin(ctx, r, env);
    if (selected) this.selectDiamond(ctx, r);
  }

  drawNestItem(ctx, n, selected, env) {
    const h = drawNest(ctx, n, env);
    if (selected) this.selectDiamond(ctx, n);
    const [cx, cy] = P(n.x + n.w / 2, n.y + n.h / 2);
    if (selected || n.hp < n.maxHp) bar(ctx, cx - 26, cy - h - 12, 52, n.hp / n.maxHp, C.bad);
  }

  lootColor(r) {
    let best = 'food', v = -1;
    for (const k in r.loot) if (r.loot[k] > v) { v = r.loot[k]; best = k; }
    return C.res[best];
  }

  selectDiamond(ctx, r) {
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    poly(ctx, diamond(r.x, r.y, r.w, r.h), null, C.sel);
    ctx.setLineDash([]);
  }

  drawBuilding(ctx, b, selected, env) {
    if (!b.complete) ctx.globalAlpha = 0.5;
    let height;
    switch (b.type) {
      case 'hq': height = drawHQ(ctx, b, env); break;
      case 'tent': height = drawTent(ctx, b, env); break;
      case 'depot': height = drawDepot(ctx, b, env); break;
      case 'farm': height = drawFarm(ctx, b, env); break;
      case 'tower': height = drawTower(ctx, b, env); break;
      case 'scrapyard': height = drawScrapyard(ctx, b, env); break;
      default: height = drawWall(ctx, b, env);
    }
    ctx.globalAlpha = 1;
    if (!b.complete || b.upgrade) scaffold(ctx, b, height);
    const [cx, cy] = P(b.x + b.w / 2, b.y + b.h / 2);
    if (b.hitT > 0) {
      ctx.lineWidth = 2;
      poly(ctx, diamond(b.x, b.y, b.w, b.h), null, `rgba(208,83,60,${Math.min(1, b.hitT * 5)})`);
    }
    if (selected) this.selectDiamond(ctx, b);
    if (!b.complete) bar(ctx, cx - 18, cy - height - 12, 36, b.progress, C.warn);
    else if (b.upgrade) bar(ctx, cx - 18, cy - height - 12, 36, b.upgrade.progress, '#9cbccb');
    else if (selected || b.hp < b.maxHp) bar(ctx, cx - 18, cy - height - 12, 36, b.hp / b.maxHp);
    // Estrelinhas de nível
    if (b.level > 0 && !b.def.wall) {
      for (let k = 0; k < b.level; k++) {
        const sx = cx - (b.level - 1) * 5 + k * 10, sy = cy - height - 20;
        poly(ctx, [[sx, sy - 4], [sx + 1.3, sy - 1.2], [sx + 4, sy - 1], [sx + 2, sy + 1], [sx + 2.6, sy + 4], [sx, sy + 2.4], [sx - 2.6, sy + 4], [sx - 2, sy + 1], [sx - 4, sy - 1], [sx - 1.3, sy - 1.2]], C.warn);
      }
    }
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

  // ---------- partículas (só visuais) ----------

  emit(kind, x, y, rate = 1) {
    if (this.particles.length > 220) return;
    if (kind === 'ember') {
      if (Math.random() > 0.3) return;
      this.particles.push({ kind, x: x + (Math.random() - 0.5) * 8, y, vx: (Math.random() - 0.5) * 10, vy: -25 - Math.random() * 25, t: 0, life: 0.8 + Math.random() * 0.8 });
    } else {
      if (Math.random() > 0.08 * rate) return;
      this.particles.push({ kind, x: x + (Math.random() - 0.5) * 4, y, vx: 5 + Math.random() * 5, vy: -12 - Math.random() * 6, t: 0, life: 2.5 + Math.random() * 1.5 });
    }
  }

  updateParticles(dt) {
    for (const p of this.particles) {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'ember') p.vx += (Math.random() - 0.5) * 30 * dt;
    }
    this.particles = this.particles.filter((p) => p.t < p.life);
  }

  drawParticles(ctx, kind) {
    if (kind === 'ember') ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      if (p.kind !== kind) continue;
      const k = p.t / p.life;
      if (kind === 'ember') {
        ctx.fillStyle = `rgba(255,${150 + 80 * (1 - k)},60,${1 - k})`;
        ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
      } else {
        ctx.fillStyle = `rgba(120,118,110,${0.28 * (1 - k)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3 + k * 9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  drawTracers(ctx) {
    for (const t of this.game.tracers) {
      if (t.kind === 'acid') {
        const [x1, y1] = P(t.x1, t.y1), [x2, y2] = P(t.x2, t.y2);
        const k = 1 - t.t / 0.25; // 0 = saiu da boca, 1 = chegou
        const mx = (x1 + x2) / 2, my = Math.min(y1, y2) - 70;
        const bx = (1 - k) ** 2 * x1 + 2 * (1 - k) * k * mx + k * k * x2;
        const by = (1 - k) ** 2 * (y1 - 36) + 2 * (1 - k) * k * my + k * k * (y2 - 14);
        ctx.fillStyle = 'rgba(170,215,90,0.9)';
        ctx.beginPath();
        ctx.arc(bx, by, 4.5, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      const tower = t.kind === 'tower';
      const [x1, y1] = P(t.x1, t.y1), [x2, y2] = P(t.x2, t.y2);
      ctx.strokeStyle = tower ? `rgba(255,220,140,${t.t * 9})` : `rgba(255,236,180,${t.t * 10})`;
      ctx.lineWidth = tower ? 2 : 1.3;
      ctx.beginPath();
      ctx.moveTo(x1, y1 - (tower ? 62 : 16));
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
      if (b.type === 'hq') light(b.x + 1.3, b.y + 2.3, 8 + b.level, 0, true);
      else if (b.type === 'tower' && b.complete) light(cx, cy, 6.5 + b.level, b.id, true);
      else if (!b.def.wall) light(cx, cy, 2.5 + b.level * 0.8, b.id, b.level > 0);
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

  // (u, v) são frações 0..1 do canvas do minimapa.
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
      if (o && o.kind === 'ruin') c = o.empty ? [70, 58, 48] : [216, 194, 90];
      else if (o && o.kind === 'nest') c = [190, 60, 90];
      else if (o && o.kind === 'building') c = o.def.wall ? [160, 140, 100] : [140, 200, 240];
      const k = m.visible[i] ? 1 : 0.6;
      d[p] = c[0] * k; d[p + 1] = c[1] * k; d[p + 2] = c[2] * k; d[p + 3] = 255;
    }
    const dot = (x, y, r, gg, b) => {
      const i = (Math.floor(y) * MAP_W + Math.floor(x)) * 4;
      if (i < 0 || i >= d.length) return;
      d[i] = r; d[i + 1] = gg; d[i + 2] = b;
    };
    for (const z of g.zombies) if (m.visible[m.idx(Math.floor(z.x), Math.floor(z.y))]) dot(z.x, z.y, 220, 60, 45);
    for (const u of g.units) dot(u.x, u.y, 255, 255, 255);
    this.miniCtx.putImageData(this.miniImg, 0, 0);

    const tc = target.getContext('2d');
    const W = target.width, H = target.height;
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
    // Ninhos sempre aparecem no minimapa: são o objetivo.
    const beat = 0.5 + 0.5 * Math.sin(performance.now() / 300);
    for (const n of g.nests) {
      if (n.dead) continue;
      const [px, py] = toMini(n.x + n.w / 2, n.y + n.h / 2);
      tc.fillStyle = `rgba(200,60,90,${0.25 + beat * 0.3})`;
      tc.beginPath();
      tc.ellipse(px, py, 9, 4.5, 0, 0, Math.PI * 2);
      tc.fill();
      tc.fillStyle = '#e04a6a';
      tc.strokeStyle = '#1a0a0e';
      tc.lineWidth = 1.5;
      tc.beginPath();
      tc.ellipse(px, py, 4.5, 2.6, 0, 0, Math.PI * 2);
      tc.fill();
      tc.stroke();
    }
    const { cam } = state;
    tc.strokeStyle = '#e3d9a6';
    tc.lineWidth = 1;
    tc.strokeRect(
      W / 2 + (cam.x / HW) * k + 0.5, (cam.y / HH) * k / 2 + 0.5,
      (this.w / cam.zoom / HW) * k, (this.h / cam.zoom / HH) * k / 2,
    );
  }
}
