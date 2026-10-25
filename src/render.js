import { TILE, MAP_W, MAP_H, CHUNK, T, BUILDINGS, TREE_AMOUNT } from './config.js';
import { hash2 } from './rng.js';

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
  rock: '#6a6961', rockHi: '#87857b', rockDark: '#47463f',
  wood: '#7a5634', woodDark: '#4b351f', woodLight: '#9c7447',
  stone: '#7c7a72', stoneDark: '#55534d', stoneLight: '#98968c',
  canvas: '#77744d', canvasDark: '#57553a', metal: '#6a7176',
  shadow: 'rgba(0,0,0,0.32)',
  sel: '#e3d9a6', ok: '#86a95d', warn: '#d9a441', bad: '#c2412d',
  res: { wood: '#c08850', stone: '#b4b2a8', food: '#d8c25a', scrap: '#8fb3c4' },
  jackets: ['#3f6b93', '#94643a', '#5d7d48', '#86506a', '#4c8783', '#7a7838', '#8a4a3c', '#5a5f8e'],
  skin: ['#d9b48f', '#b98a63', '#8c5f3d', '#e8c9a8', '#a8774f'],
  zombie: { walker: '#6c7859', runner: '#87594a', brute: '#4c5845' },
  zHead: { walker: '#94a07e', runner: '#a7847a', brute: '#7f8c6c' },
  roof: { casa: ['#7d4b3a', '#653b2e'], mercado: ['#4f6a66', '#3f5552'], oficina: ['#6e5a48', '#594838'], cabana: ['#5f4a33', '#4b3a28'] },
};
const RUIN_LOOT_COLOR = (r) => {
  let best = 'food', v = -1;
  for (const k in r.loot) if (r.loot[k] > v) { v = r.loot[k]; best = k; }
  return C.res[best];
};

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
    this.light.width = this.canvas.width;
    this.light.height = this.canvas.height;
  }

  // ---------- chão em chunks pré-renderizados ----------

  getChunk(cx, cy) {
    const key = cy * Math.ceil(MAP_W / CHUNK) + cx;
    let c = this.chunks.get(key);
    if (c) {
      this.chunks.delete(key);
      this.chunks.set(key, c);
      return c;
    }
    c = document.createElement('canvas');
    c.width = c.height = CHUNK * TILE;
    this.paintChunk(c.getContext('2d'), cx, cy);
    this.chunks.set(key, c);
    if (this.chunks.size > 56) this.chunks.delete(this.chunks.keys().next().value);
    return c;
  }

  paintChunk(ctx, cx, cy) {
    const m = this.game.map;
    for (let ty = 0; ty < CHUNK; ty++) {
      for (let tx = 0; tx < CHUNK; tx++) {
        const x = cx * CHUNK + tx, y = cy * CHUNK + ty;
        if (!m.inBounds(x, y)) continue;
        this.paintTile(ctx, m, x, y, tx * TILE, ty * TILE);
      }
    }
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

    // Manchas para quebrar a grade.
    for (let k = 0; k < 3; k++) {
      const hx = hash2(x * 3 + k, y * 7 - k), hy = hash2(y * 5 + k, x * 11 + k);
      ctx.fillStyle = k % 2 ? 'rgba(255,255,240,0.035)' : 'rgba(0,0,0,0.06)';
      ctx.fillRect(px + hx * 26, py + hy * 26, 6 + v2 * 8, 4 + hx * 6);
    }

    if (t === T.GRASS && v2 > 0.55) {
      ctx.strokeStyle = C.tuft;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const gx = px + 6 + v * 20, gy = py + 8 + v2 * 16;
      ctx.moveTo(gx, gy); ctx.lineTo(gx - 2, gy - 5);
      ctx.moveTo(gx + 2, gy); ctx.lineTo(gx + 3, gy - 6);
      ctx.moveTo(gx + 4, gy); ctx.lineTo(gx + 7, gy - 4);
      ctx.stroke();
    } else if (t === T.DIRT || t === T.ROCK || t === T.RUBBLE) {
      ctx.fillStyle = t === T.RUBBLE ? 'rgba(150,140,125,0.45)' : 'rgba(30,24,16,0.35)';
      for (let k = 0; k < (t === T.RUBBLE ? 5 : 3); k++) {
        ctx.fillRect(px + hash2(x + k * 13, y) * 28, py + hash2(x, y + k * 17) * 28, 2 + (k % 2), 2);
      }
    } else if (t === T.WATER) {
      ctx.strokeStyle = 'rgba(170,210,210,0.10)';
      ctx.beginPath();
      const wy = py + 8 + v * 16;
      ctx.moveTo(px + 4, wy); ctx.quadraticCurveTo(px + 12, wy - 3, px + 20, wy);
      ctx.stroke();
      ctx.fillStyle = C.shore;
      const dry = (dx, dy) => m.inBounds(x + dx, y + dy) && m.get(x + dx, y + dy) !== T.WATER;
      if (dry(0, -1)) ctx.fillRect(px, py, TILE, 3);
      if (dry(0, 1)) ctx.fillRect(px, py + TILE - 3, TILE, 3);
      if (dry(-1, 0)) ctx.fillRect(px, py, 3, TILE);
      if (dry(1, 0)) ctx.fillRect(px + TILE - 3, py, 3, TILE);
    } else if (t === T.ROAD) {
      // Faixa central tracejada só onde a rua é reta.
      const road = (dx, dy) => m.inBounds(x + dx, y + dy) && m.get(x + dx, y + dy) === T.ROAD;
      ctx.fillStyle = C.roadLine;
      if (road(1, 0) && road(-1, 0) && !road(0, 1) && road(0, -1) && x % 3 === 0) ctx.fillRect(px + 4, py - 1, 14, 2);
      if (road(0, 1) && road(0, -1) && !road(1, 0) && road(-1, 0) && y % 3 === 0) ctx.fillRect(px - 1, py + 4, 2, 14);
      if (v2 > 0.8) {
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.moveTo(px + v * 20, py + 6); ctx.lineTo(px + 10 + v * 10, py + 16); ctx.lineTo(px + 6 + v * 18, py + 26);
        ctx.stroke();
      }
    }
  }

  // ---------- quadro ----------

  draw(state, now) {
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

    const tx0 = Math.max(0, Math.floor(cam.x / TILE) - 1);
    const ty0 = Math.max(0, Math.floor(cam.y / TILE) - 1);
    const tx1 = Math.min(MAP_W - 1, Math.ceil((cam.x + this.w / z) / TILE) + 1);
    const ty1 = Math.min(MAP_H - 1, Math.ceil((cam.y + this.h / z) / TILE) + 1);
    const view = { tx0, ty0, tx1, ty1 };

    ctx.setTransform(dpr * z, 0, 0, dpr * z, -cam.x * z * dpr, -cam.y * z * dpr);
    ctx.imageSmoothingEnabled = z < 1;

    const cx0 = Math.floor(tx0 / CHUNK), cx1 = Math.floor(tx1 / CHUNK);
    const cy0 = Math.floor(ty0 / CHUNK), cy1 = Math.floor(ty1 / CHUNK);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) ctx.drawImage(this.getChunk(cx, cy), cx * CHUNK * TILE, cy * CHUNK * TILE);
    }

    this.drawCorpses(ctx, view);
    this.drawTerrainObjects(ctx, view, now);
    for (const r of g.ruins) if (this.inView(r, view)) this.drawRuin(ctx, r, state.selected === r);
    for (const b of g.buildings) if (this.inView(b, view)) this.drawBuilding(ctx, b, now, state.selected === b);

    const actors = [];
    for (const u of g.units) if (u.x >= tx0 - 1 && u.x <= tx1 + 1 && u.y >= ty0 - 1 && u.y <= ty1 + 1) actors.push(u);
    for (const zb of g.zombies) {
      if (zb.x < tx0 - 1 || zb.x > tx1 + 1 || zb.y < ty0 - 1 || zb.y > ty1 + 1) continue;
      if (!m.visible[m.idx(Math.floor(zb.x), Math.floor(zb.y))]) continue;
      actors.push(zb);
    }
    actors.sort((a, b) => a.y - b.y);
    for (const a of actors) {
      if (a.kind === 'unit') this.drawUnit(ctx, a, state.selection.has(a), now);
      else this.drawZombie(ctx, a, state.selected === a);
    }
    this.drawTracers(ctx);
    this.drawMarkers(ctx, state, now);

    if (state.selected && state.selected.kind === 'building' && state.selected.def.range) this.drawRange(ctx, state.selected);

    this.drawNight(state, now);

    ctx.setTransform(dpr * z, 0, 0, dpr * z, -cam.x * z * dpr, -cam.y * z * dpr);
    this.drawFog(ctx, view);
    this.drawGhost(ctx, state);
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

  inView(r, v) {
    return r.x + r.w >= v.tx0 && r.x <= v.tx1 && r.y + r.h >= v.ty0 && r.y <= v.ty1;
  }

  // ---------- árvores, pedras e restos ----------

  drawTerrainObjects(ctx, v, now) {
    const m = this.game.map;
    for (let y = v.ty0; y <= v.ty1; y++) {
      for (let x = v.tx0; x <= v.tx1; x++) {
        const i = m.idx(x, y);
        const t = m.tiles[i];
        if (t === T.ROCK) this.drawRock(ctx, x, y);
        else if (t === T.TREE) this.drawTree(ctx, x, y, m.res[i] / TREE_AMOUNT, now);
      }
    }
  }

  drawTree(ctx, x, y, frac, now) {
    const v = hash2(x, y), v2 = hash2(x + 3, y * 2 + 1);
    const px = x * TILE + 16 + (v - 0.5) * 8, py = y * TILE + 16 + (v2 - 0.5) * 8;
    const r = (12 + v * 5) * (0.75 + 0.25 * frac);
    const pine = v2 > 0.62;
    const pal = pine ? C.pine : C.tree;
    ctx.fillStyle = C.shadow;
    ctx.beginPath();
    ctx.ellipse(px + 5, py + 7, r, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    const sway = Math.sin(now * 0.8 + v * 20) * 0.8;
    if (pine) {
      for (let k = 0; k < 3; k++) {
        const rr = r * (1 - k * 0.28);
        ctx.fillStyle = pal[k];
        ctx.beginPath();
        for (let s = 0; s < 8; s++) {
          const a = (s / 8) * Math.PI * 2 + v * 3;
          const rad = s % 2 ? rr * 0.62 : rr;
          ctx.lineTo(px + sway * k + Math.cos(a) * rad, py - k * 2 + Math.sin(a) * rad);
        }
        ctx.closePath();
        ctx.fill();
      }
    } else {
      ctx.fillStyle = pal[0];
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pal[1];
      ctx.beginPath();
      ctx.arc(px - 2 + sway, py - 3, r * 0.72, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pal[2];
      ctx.beginPath();
      ctx.arc(px - 4 + sway, py - 6, r * 0.38, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawRock(ctx, x, y) {
    const v = hash2(x, y);
    const px = x * TILE + 16, py = y * TILE + 17;
    const pts = [];
    for (let s = 0; s < 7; s++) {
      const a = (s / 7) * Math.PI * 2 + v;
      const rad = 11 + hash2(x * 7 + s, y * 3 - s) * 4;
      pts.push([px + Math.cos(a) * rad, py + Math.sin(a) * rad * 0.82]);
    }
    ctx.fillStyle = C.shadow;
    ctx.beginPath();
    pts.forEach(([a, b]) => ctx.lineTo(a + 3, b + 4));
    ctx.fill();
    ctx.fillStyle = C.rock;
    ctx.beginPath();
    pts.forEach(([a, b]) => ctx.lineTo(a, b));
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.rockHi;
    ctx.beginPath();
    ctx.moveTo(pts[3][0], pts[3][1]);
    ctx.lineTo(pts[4][0], pts[4][1]);
    ctx.lineTo(pts[5][0], pts[5][1]);
    ctx.lineTo(px, py - 2);
    ctx.fill();
    ctx.strokeStyle = C.rockDark;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px - 3, py - 4);
    ctx.lineTo(px + 1, py + 2);
    ctx.lineTo(px + 5, py + 3);
    ctx.stroke();
  }

  drawCorpses(ctx, v) {
    for (const c of this.game.corpses) {
      if (c.x < v.tx0 || c.x > v.tx1 + 1 || c.y < v.ty0 || c.y > v.ty1 + 1) continue;
      const a = Math.max(0, 1 - c.t / 45);
      const px = c.x * TILE, py = c.y * TILE;
      ctx.globalAlpha = a * 0.7;
      ctx.fillStyle = '#3b1712';
      ctx.beginPath();
      ctx.ellipse(px, py, 11, 7, c.a, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = c.kind === 'unit' ? '#4a4038' : C.zombie[c.kind] || C.zombie.walker;
      ctx.beginPath();
      ctx.ellipse(px, py, 8, 4.5, c.a, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // ---------- ruínas ----------

  drawRuin(ctx, r, selected) {
    const x = r.x * TILE, y = r.y * TILE, w = r.w * TILE, h = r.h * TILE;
    const [roofA, roofB] = C.roof[r.type];
    ctx.fillStyle = C.shadow;
    ctx.fillRect(x + 6, y + 8, w - 6, h - 6);
    ctx.fillStyle = '#4a463e';
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    const horizontal = w >= h;
    ctx.fillStyle = roofA;
    if (horizontal) ctx.fillRect(x + 4, y + 4, w - 8, (h - 8) / 2);
    else ctx.fillRect(x + 4, y + 4, (w - 8) / 2, h - 8);
    ctx.fillStyle = roofB;
    if (horizontal) ctx.fillRect(x + 4, y + h / 2, w - 8, (h - 8) / 2);
    else ctx.fillRect(x + w / 2, y + 4, (w - 8) / 2, h - 8);
    // Telhas
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (horizontal) for (let k = x + 10; k < x + w - 6; k += 7) { ctx.moveTo(k, y + 5); ctx.lineTo(k, y + h - 5); }
    else for (let k = y + 10; k < y + h - 6; k += 7) { ctx.moveTo(x + 5, k); ctx.lineTo(x + w - 5, k); }
    ctx.stroke();
    // Buracos no telhado
    const holes = 1 + Math.floor(r.seed * 3);
    ctx.fillStyle = '#16130f';
    for (let k = 0; k < holes; k++) {
      const hx = x + 8 + hash2(r.id, k) * (w - 22), hy = y + 8 + hash2(k, r.id) * (h - 22);
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + 9, hy + 2);
      ctx.lineTo(hx + 7, hy + 9);
      ctx.lineTo(hx + 1, hy + 7);
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,90,60,0.6)';
      ctx.beginPath();
      ctx.moveTo(hx + 1, hy + 3);
      ctx.lineTo(hx + 8, hy + 6);
      ctx.stroke();
    }
    if (r.type === 'mercado') {
      ctx.fillStyle = 'rgba(210,200,170,0.5)';
      ctx.fillRect(horizontal ? x + 6 : x + w - 9, horizontal ? y + h - 9 : y + 6, horizontal ? w - 12 : 3, horizontal ? 3 : h - 12);
    }
    if (r.empty) {
      ctx.fillStyle = 'rgba(8,8,6,0.42)';
      ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    } else if (r.visited || this.game.map.visible[this.game.map.idx(r.x, r.y)]) {
      ctx.fillStyle = '#14120e';
      ctx.beginPath();
      ctx.arc(x + w - 7, y + 7, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = RUIN_LOOT_COLOR(r);
      ctx.beginPath();
      ctx.arc(x + w - 7, y + 7, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    if (selected) this.selectRect(ctx, x, y, w, h);
  }

  selectRect(ctx, x, y, w, h) {
    ctx.strokeStyle = C.sel;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
    ctx.setLineDash([]);
  }

  // ---------- prédios ----------

  drawBuilding(ctx, b, now, selected) {
    const x = b.x * TILE, y = b.y * TILE, w = b.w * TILE, h = b.h * TILE;
    if (!b.complete) ctx.globalAlpha = 0.55;
    switch (b.type) {
      case 'hq': this.drawHQ(ctx, x, y, w, h, now); break;
      case 'tent': this.drawTent(ctx, x, y, w, h, b); break;
      case 'depot': this.drawDepot(ctx, x, y, w, h); break;
      case 'farm': this.drawFarm(ctx, x, y, w, h, b); break;
      case 'tower': this.drawTower(ctx, x, y, w, h, b); break;
      case 'palisade':
      case 'stonewall':
      case 'gate': this.drawWall(ctx, b); break;
    }
    ctx.globalAlpha = 1;
    if (!b.complete) {
      // Andaime: hachura diagonal recortada na área da obra.
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.strokeStyle = 'rgba(217,164,65,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = -h; k < w; k += 8) {
        ctx.moveTo(x + k, y + h);
        ctx.lineTo(x + k + h, y);
      }
      ctx.stroke();
      ctx.restore();
      this.bar(ctx, x + 3, y + h - 6, w - 6, b.progress, C.warn);
    }
    if (b.hitT > 0) {
      ctx.fillStyle = `rgba(194,65,45,${b.hitT * 1.5})`;
      ctx.fillRect(x, y, w, h);
    }
    if (b.complete && b.hp < b.maxHp * 0.5) {
      ctx.strokeStyle = 'rgba(15,10,8,0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.3, y + 4); ctx.lineTo(x + w * 0.45, y + h * 0.4); ctx.lineTo(x + w * 0.35, y + h * 0.7);
      ctx.stroke();
    }
    if (selected) this.selectRect(ctx, x, y, w, h);
    if (b.complete && (selected || b.hp < b.maxHp)) this.bar(ctx, x + 2, y - 6, w - 4, b.hp / b.maxHp);
  }

  drawHQ(ctx, x, y, w, h, now) {
    ctx.fillStyle = '#4c3e2b';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    // Lona grande
    ctx.fillStyle = C.shadow;
    ctx.fillRect(x + 12, y + 10, 64, 40);
    ctx.fillStyle = C.canvas;
    ctx.fillRect(x + 8, y + 6, 64, 20);
    ctx.fillStyle = C.canvasDark;
    ctx.fillRect(x + 8, y + 26, 64, 20);
    ctx.strokeStyle = '#3d3b26';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 8, y + 26);
    ctx.lineTo(x + 72, y + 26);
    ctx.stroke();
    // Caixotes
    this.crate(ctx, x + 74, y + 10, 14);
    this.crate(ctx, x + 76, y + 28, 11);
    // Fogueira
    const fx = x + 48, fy = y + 70;
    ctx.fillStyle = '#5c5a52';
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(fx + Math.cos(a) * 9, fy + Math.sin(a) * 7, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    const fl = Math.sin(now * 11) * 1.5 + Math.sin(now * 17) * 1;
    ctx.fillStyle = '#c2412d';
    ctx.beginPath();
    ctx.arc(fx, fy, 6 + fl * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e89a3a';
    ctx.beginPath();
    ctx.arc(fx, fy - 1, 4 + fl * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f6d67a';
    ctx.beginPath();
    ctx.arc(fx, fy - 1.5, 2, 0, Math.PI * 2);
    ctx.fill();
    // Bancos de tronco
    ctx.fillStyle = C.wood;
    ctx.fillRect(fx - 24, fy - 3, 8, 6);
    ctx.fillRect(fx + 16, fy - 3, 8, 6);
  }

  crate(ctx, x, y, s) {
    ctx.fillStyle = C.woodLight;
    ctx.fillRect(x, y, s, s);
    ctx.strokeStyle = C.woodDark;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + s, y + s);
    ctx.moveTo(x + s, y);
    ctx.lineTo(x, y + s);
    ctx.stroke();
  }

  drawTent(ctx, x, y, w, h, b) {
    const tint = hash2(b.id, 3) > 0.5;
    ctx.fillStyle = C.shadow;
    ctx.fillRect(x + 9, y + 10, w - 12, h - 12);
    ctx.fillStyle = tint ? '#6f7a52' : C.canvas;
    ctx.fillRect(x + 5, y + 6, (w - 10) / 2, h - 12);
    ctx.fillStyle = tint ? '#545e3e' : C.canvasDark;
    ctx.fillRect(x + w / 2, y + 6, (w - 10) / 2, h - 12);
    ctx.strokeStyle = '#33321f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + 6);
    ctx.lineTo(x + w / 2, y + h - 6);
    ctx.stroke();
    ctx.fillStyle = '#1e1c12';
    ctx.beginPath();
    ctx.moveTo(x + w / 2 - 7, y + h - 6);
    ctx.lineTo(x + w / 2, y + h - 18);
    ctx.lineTo(x + w / 2 + 7, y + h - 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(220,210,180,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 5, y + 8); ctx.lineTo(x + 1, y + 2);
    ctx.moveTo(x + w - 5, y + 8); ctx.lineTo(x + w - 1, y + 2);
    ctx.moveTo(x + 5, y + h - 8); ctx.lineTo(x + 1, y + h - 2);
    ctx.moveTo(x + w - 5, y + h - 8); ctx.lineTo(x + w - 1, y + h - 2);
    ctx.stroke();
  }

  drawDepot(ctx, x, y, w, h) {
    ctx.fillStyle = C.shadow;
    ctx.fillRect(x + 6, y + 7, w - 6, h - 6);
    ctx.fillStyle = C.woodDark;
    ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = y + 9; k < y + h - 3; k += 6) { ctx.moveTo(x + 3, k); ctx.lineTo(x + w - 3, k); }
    ctx.stroke();
    this.crate(ctx, x + 8, y + 8, 18);
    this.crate(ctx, x + 30, y + 10, 14);
    this.crate(ctx, x + 10, y + 32, 14);
    ctx.fillStyle = '#5c4630';
    ctx.beginPath();
    ctx.arc(x + 44, y + 44, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = C.metal;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  drawFarm(ctx, x, y, w, h, b) {
    ctx.fillStyle = '#4a3826';
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    ctx.strokeStyle = '#3a2b1c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let k = y + 12; k < y + h - 4; k += 12) { ctx.moveTo(x + 6, k); ctx.lineTo(x + w - 6, k); }
    ctx.stroke();
    const grow = b.complete ? 0.6 + 0.4 * ((b.foodT / b.def.foodInterval + b.produced * 0.13) % 1) : 0.3;
    for (let row = 0; row < 7; row++) {
      for (let k = 0; k < 9; k++) {
        const px = x + 10 + k * 9.5, py = y + 9 + row * 12;
        ctx.fillStyle = (row + k) % 3 ? '#5e7f3a' : '#7a9443';
        ctx.beginPath();
        ctx.arc(px, py, 2.6 * grow + hash2(row, k) * 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.strokeStyle = C.woodLight;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5);
  }

  drawTower(ctx, x, y, w, h, b) {
    ctx.fillStyle = C.shadow;
    ctx.fillRect(x + 12, y + 14, w - 12, h - 10);
    ctx.strokeStyle = C.woodDark;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x + 6, y + 6); ctx.lineTo(x + w - 6, y + h - 6);
    ctx.moveTo(x + w - 6, y + 6); ctx.lineTo(x + 6, y + h - 6);
    ctx.stroke();
    ctx.fillStyle = C.wood;
    ctx.fillRect(x + 8, y + 6, w - 16, h - 16);
    ctx.strokeStyle = C.woodDark;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 8, y + 6, w - 16, h - 16);
    ctx.fillStyle = '#5a4026';
    ctx.fillRect(x + 14, y + 2, w - 28, h - 26);
    ctx.fillStyle = '#6b4c2d';
    ctx.fillRect(x + 14, y + 2, (w - 28) / 2, h - 26);
    // Atirador e cano
    const cx = x + w / 2, cy = y + h / 2 - 6;
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(b.angle) * 16, cy + Math.sin(b.angle) * 16);
    ctx.stroke();
    ctx.fillStyle = '#41606f';
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  drawWall(ctx, b) {
    const g = this.game, m = g.map;
    const cx = b.x * TILE + 16, cy = b.y * TILE + 16;
    const isWall = (dx, dy) => {
      const nx = b.x + dx, ny = b.y + dy;
      if (!m.inBounds(nx, ny)) return false;
      const o = m.occ[m.idx(nx, ny)];
      return o && o.kind === 'building' && o.def.wall;
    };
    const links = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => isWall(dx, dy));
    const stone = b.type === 'stonewall';
    if (b.type === 'gate') {
      const horiz = isWall(1, 0) || isWall(-1, 0) || !(isWall(0, 1) || isWall(0, -1));
      ctx.save();
      ctx.translate(cx, cy);
      if (!horiz) ctx.rotate(Math.PI / 2);
      ctx.fillStyle = C.shadow;
      ctx.fillRect(-16, -4, 32, 12);
      ctx.fillStyle = C.woodLight;
      ctx.fillRect(-16, -6, 15, 12);
      ctx.fillRect(1, -6, 15, 12);
      ctx.fillStyle = C.metal;
      ctx.fillRect(-16, -2, 32, 3);
      ctx.fillStyle = C.woodDark;
      ctx.fillRect(-17, -8, 4, 16);
      ctx.fillRect(13, -8, 4, 16);
      ctx.restore();
      return;
    }
    ctx.lineCap = 'butt';
    ctx.strokeStyle = C.shadow;
    ctx.lineWidth = stone ? 15 : 9;
    ctx.beginPath();
    for (const [dx, dy] of links) { ctx.moveTo(cx + 3, cy + 4); ctx.lineTo(cx + 3 + dx * 16, cy + 4 + dy * 16); }
    ctx.stroke();
    ctx.strokeStyle = stone ? C.stone : C.wood;
    ctx.lineWidth = stone ? 13 : 7;
    ctx.beginPath();
    for (const [dx, dy] of links) { ctx.moveTo(cx, cy); ctx.lineTo(cx + dx * 16, cy + dy * 16); }
    ctx.stroke();
    if (stone) {
      ctx.fillStyle = C.stoneLight;
      ctx.fillRect(cx - 8, cy - 8, 16, 16);
      ctx.strokeStyle = C.stoneDark;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cx - 8, cy - 8, 16, 16);
      ctx.beginPath();
      ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 8, cy);
      ctx.moveTo(cx, cy - 8); ctx.lineTo(cx, cy);
      ctx.stroke();
    } else {
      for (const [ox, oy] of [[0, 0], ...links.map(([dx, dy]) => [dx * 9, dy * 9])]) {
        ctx.fillStyle = C.woodDark;
        ctx.beginPath();
        ctx.arc(cx + ox, cy + oy, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = C.woodLight;
        ctx.beginPath();
        ctx.arc(cx + ox - 1, cy + oy - 1, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawRange(ctx, b) {
    ctx.strokeStyle = 'rgba(217,164,65,0.5)';
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc((b.x + b.w / 2) * TILE, (b.y + b.h / 2) * TILE, b.def.range * TILE, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ---------- personagens ----------

  drawUnit(ctx, u, selected) {
    const x = u.x * TILE, y = u.y * TILE;
    const jacket = C.jackets[u.look % C.jackets.length];
    const skin = C.skin[(u.look >> 3) % C.skin.length];
    ctx.fillStyle = C.shadow;
    ctx.beginPath();
    ctx.ellipse(x + 2, y + 4, 9, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    if (selected) {
      ctx.strokeStyle = C.sel;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(x, y + 2, 12, 8, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    const f = u.facing;
    const cos = Math.cos(f), sin = Math.sin(f);
    if (u.carry.amount > 0) {
      ctx.fillStyle = C.res[u.carry.type];
      ctx.fillRect(x - cos * 7 - 4, y - sin * 7 - 4, 8, 8);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - cos * 7 - 4, y - sin * 7 - 4, 8, 8);
    }
    ctx.strokeStyle = '#1f2224';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + cos * 3, y + sin * 3);
    ctx.lineTo(x + cos * 14, y + sin * 14);
    ctx.stroke();
    ctx.fillStyle = jacket;
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(x + cos * 1.5, y + sin * 1.5, 4.6, 0, Math.PI * 2);
    ctx.fill();
    if (u.hitT > 0) {
      ctx.fillStyle = `rgba(194,65,45,${u.hitT * 3})`;
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    if (selected || u.hp < u.maxHp) this.bar(ctx, x - 11, y - 16, 22, u.hp / u.maxHp);
  }

  drawZombie(ctx, z, selected) {
    const x = z.x * TILE, y = z.y * TILE;
    const big = z.type === 'brute', thin = z.type === 'runner';
    const r = big ? 12 : thin ? 7.5 : 8.5;
    ctx.fillStyle = C.shadow;
    ctx.beginPath();
    ctx.ellipse(x + 2, y + 4, r + 1, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    if (selected) {
      ctx.strokeStyle = C.bad;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(x, y + 2, r + 4, r * 0.8, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    const f = z.facing;
    const sway = Math.sin(z.anim * (thin ? 10 : 4)) * 0.18;
    ctx.strokeStyle = C.zombie[z.type];
    ctx.lineWidth = big ? 5 : 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const side of [-1, 1]) {
      const sx = x + Math.cos(f + side * 1.3) * r * 0.8, sy = y + Math.sin(f + side * 1.3) * r * 0.8;
      const a = f + side * sway;
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(a) * r * 1.3, sy + Math.sin(a) * r * 1.3);
    }
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = C.zombie[z.type];
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,10,8,0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#5a1d14';
    ctx.beginPath();
    ctx.arc(x - Math.cos(f) * 3, y - Math.sin(f) * 3 + 2, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.zHead[z.type];
    ctx.beginPath();
    ctx.arc(x + Math.cos(f) * 2, y + Math.sin(f) * 2, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    if (z.hitT > 0) {
      ctx.fillStyle = `rgba(240,230,200,${z.hitT * 3})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (selected || z.hp < z.maxHp) this.bar(ctx, x - 11, y - r - 8, 22, z.hp / z.maxHp, C.bad);
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
      ctx.strokeStyle = t.kind === 'tower' ? `rgba(255,220,140,${t.t * 9})` : `rgba(255,236,180,${t.t * 10})`;
      ctx.lineWidth = t.kind === 'tower' ? 2 : 1.2;
      ctx.beginPath();
      ctx.moveTo(t.x1 * TILE, t.y1 * TILE);
      ctx.lineTo(t.x2 * TILE, t.y2 * TILE);
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
      ctx.ellipse(mk.x * TILE, mk.y * TILE, 4 + k * 12, (4 + k * 12) * 0.6, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  drawTexts(ctx) {
    ctx.font = '600 13px "Barlow Condensed", "Arial Narrow", sans-serif';
    ctx.textAlign = 'center';
    for (const t of this.game.texts) {
      const k = t.t / t.life;
      ctx.globalAlpha = 1 - k * k;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillText(t.text, t.x * TILE + 1, (t.y - k * 0.8) * TILE + 1);
      ctx.fillStyle = C.res[t.color] || '#e8e2cf';
      ctx.fillText(t.text, t.x * TILE, (t.y - k * 0.8) * TILE);
    }
    ctx.globalAlpha = 1;
  }

  // ---------- noite e névoa ----------

  drawNight(state, now) {
    const g = this.game;
    const dark = g.darkness;
    if (dark <= 0.01) return;
    const { cam } = state;
    const z = cam.zoom, dpr = this.dpr;
    const lc = this.lightCtx;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalCompositeOperation = 'source-over';
    lc.clearRect(0, 0, this.light.width, this.light.height);
    lc.fillStyle = `rgba(6,10,26,${0.8 * dark})`;
    lc.fillRect(0, 0, this.light.width, this.light.height);
    lc.globalCompositeOperation = 'destination-out';
    const toScreen = (wx, wy) => [((wx * TILE) - cam.x) * z * dpr, ((wy * TILE) - cam.y) * z * dpr];
    const fires = [];
    const light = (wx, wy, radius, flicker, fire) => {
      const [sx, sy] = toScreen(wx, wy);
      const r = radius * TILE * z * dpr * (1 + Math.sin(now * 9 + flicker) * 0.025);
      if (sx < -r || sy < -r || sx > this.light.width + r || sy > this.light.height + r) return;
      const grad = lc.createRadialGradient(sx, sy, 0, sx, sy, r);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(0.55, 'rgba(0,0,0,0.75)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      lc.fillStyle = grad;
      lc.beginPath();
      lc.arc(sx, sy, r, 0, Math.PI * 2);
      lc.fill();
      if (fire) fires.push([sx, sy, r]);
    };
    for (const b of g.buildings) {
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      if (b.type === 'hq') light(b.x + 1.5, b.y + 2.2, 8, 0, true);
      else if (b.type === 'tower' && b.complete) light(cx, cy, 6.5, b.id, true);
      else if (!b.def.wall) light(cx, cy, 2.5, b.id, false);
    }
    for (const u of g.units) light(u.x + Math.cos(u.facing) * 1.5, u.y + Math.sin(u.facing) * 1.5, 3.2, u.id, false);
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.light, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    for (const [sx, sy, r] of fires) {
      const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 0.8);
      grad.addColorStop(0, `rgba(232,140,50,${0.22 * dark})`);
      grad.addColorStop(1, 'rgba(232,140,50,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(sx, sy, r * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  drawFog(ctx, v) {
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
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.fog, (v.tx0 - 1) * TILE, (v.ty0 - 1) * TILE, w * TILE, h * TILE);
  }

  drawGhost(ctx, state) {
    const gh = state.ghost;
    if (!gh) return;
    const def = BUILDINGS[gh.type];
    for (const p of gh.tiles) {
      ctx.fillStyle = p.ok ? 'rgba(134,169,93,0.35)' : 'rgba(194,65,45,0.4)';
      ctx.fillRect(p.x * TILE, p.y * TILE, def.w * TILE, def.h * TILE);
      ctx.strokeStyle = p.ok ? 'rgba(170,210,120,0.8)' : 'rgba(230,90,70,0.8)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(p.x * TILE + 0.75, p.y * TILE + 0.75, def.w * TILE - 1.5, def.h * TILE - 1.5);
    }
    if (def.range && gh.tiles.length) {
      const p = gh.tiles[0];
      ctx.strokeStyle = 'rgba(217,164,65,0.45)';
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc((p.x + def.w / 2) * TILE, (p.y + def.h / 2) * TILE, def.range * TILE, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // ---------- minimapa ----------

  drawMinimap(target, state, now) {
    const g = this.game, m = g.map;
    const d = this.miniImg.data;
    const col = {
      [T.GRASS]: [62, 78, 45], [T.DIRT]: [92, 76, 54], [T.SAND]: [130, 118, 84], [T.WATER]: [30, 56, 64],
      [T.TREE]: [34, 52, 28], [T.ROCK]: [100, 98, 90], [T.ROAD]: [70, 68, 62], [T.RUBBLE]: [80, 74, 66],
    };
    for (let i = 0; i < MAP_W * MAP_H; i++) {
      const p = i * 4;
      if (!m.explored[i]) {
        d[p] = 10; d[p + 1] = 12; d[p + 2] = 10; d[p + 3] = 255;
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
    const s = target.width / MAP_W;
    tc.imageSmoothingEnabled = false;
    tc.clearRect(0, 0, target.width, target.height);
    tc.drawImage(this.mini, 0, 0, target.width, target.height);
    for (const p of g.pings) {
      const k = (p.t % 1);
      tc.strokeStyle = `rgba(230,80,60,${1 - k})`;
      tc.lineWidth = 2;
      tc.beginPath();
      tc.arc(p.x * s, p.y * s, 3 + k * 12, 0, Math.PI * 2);
      tc.stroke();
    }
    const { cam } = state;
    tc.strokeStyle = '#e3d9a6';
    tc.lineWidth = 1;
    tc.strokeRect(
      (cam.x / TILE) * s + 0.5, (cam.y / TILE) * s + 0.5,
      (this.w / cam.zoom / TILE) * s, (this.h / cam.zoom / TILE) * s,
    );
  }
}
