import { MAP_W, MAP_H, BUILDINGS, BUILD_ORDER, T } from './config.js';
import { HW, HH, toIso, fromIso } from './iso.js';

const KEY_TO_BUILD = Object.fromEntries(BUILD_ORDER.map((t) => [BUILDINGS[t].key, t]));
const EDGE = 10;
const PAN_SPEED = 900; // px de tela por segundo
// Altura aproximada (px isométricos) de cada coisa, para clicar no telhado e não só no chão.
const HEIGHT = { hq: 40, tent: 32, depot: 24, farm: 10, tower: 92, palisade: 32, stonewall: 28, gate: 30 };
const RUIN_HEIGHT = 44;

export class Input {
  constructor(canvas, state, renderer, hud) {
    this.canvas = canvas;
    this.state = state;
    this.renderer = renderer;
    this.hud = hud;
    this.panning = null;
    this.lastClick = { t: 0, id: null };
    this.lastGroupKey = { t: 0, n: -1 };
    this.bind();
  }

  get game() {
    return this.state.game;
  }

  toWorld(sx, sy) {
    const { cam } = this.state;
    const [wx, wy] = fromIso(sx / cam.zoom + cam.x, sy / cam.zoom + cam.y);
    return { wx, wy };
  }

  toScreen(tx, ty) {
    const { cam } = this.state;
    const [ix, iy] = toIso(tx, ty);
    return [(ix - cam.x) * cam.zoom, (iy - cam.y) * cam.zoom];
  }

  centerOn(tx, ty) {
    const { cam } = this.state;
    const [ix, iy] = toIso(tx, ty);
    cam.x = ix - this.renderer.w / cam.zoom / 2;
    cam.y = iy - this.renderer.h / cam.zoom / 2;
    this.clamp();
  }

  // O mapa é um losango: x vai de -MAP_H*HW a MAP_W*HW e y de 0 a (MAP_W+MAP_H)*HH.
  clamp() {
    const { cam } = this.state;
    const vw = this.renderer.w / cam.zoom, vh = this.renderer.h / cam.zoom;
    const minX = -MAP_H * HW - 200, maxX = MAP_W * HW + 200, minY = -200, maxY = (MAP_W + MAP_H) * HH + 300;
    cam.x = Math.max(minX, Math.min(maxX - vw, cam.x));
    cam.y = Math.max(minY, Math.min(maxY - vh, cam.y));
  }

  bind() {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('mousedown', (e) => this.onDown(e));
    window.addEventListener('mousemove', (e) => this.onMove(e));
    window.addEventListener('mouseup', (e) => this.onUp(e));
    c.addEventListener('mouseleave', () => (this.state.mouse.inside = false));
    c.addEventListener('mouseenter', () => (this.state.mouse.inside = true));
    c.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('keyup', (e) => this.state.keys.delete(e.key));
    window.addEventListener('blur', () => this.state.keys.clear());
  }

  local(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  onDown(e) {
    const s = this.state;
    if (!s.started) return;
    const p = this.local(e);
    const { wx, wy } = this.toWorld(p.x, p.y);
    if (e.button === 1) {
      e.preventDefault();
      this.panning = { x: p.x, y: p.y, cx: s.cam.x, cy: s.cam.y };
      return;
    }
    if (e.button === 2) {
      if (s.buildType) {
        this.cancelBuild();
        return;
      }
      this.command(p);
      return;
    }
    if (e.button !== 0) return;
    if (s.buildType) {
      const def = BUILDINGS[s.buildType];
      if (def.wall) s.wallStart = this.footprint(s.buildType, wx, wy);
      else this.placeAt([this.footprint(s.buildType, wx, wy)], e.shiftKey);
      return;
    }
    s.dragStart = { x: p.x, y: p.y };
  }

  onMove(e) {
    const s = this.state;
    const p = this.local(e);
    s.mouse.x = p.x;
    s.mouse.y = p.y;
    if (this.panning) {
      s.cam.x = this.panning.cx - (p.x - this.panning.x) / s.cam.zoom;
      s.cam.y = this.panning.cy - (p.y - this.panning.y) / s.cam.zoom;
      this.clamp();
      return;
    }
    if (s.dragStart && Math.hypot(p.x - s.dragStart.x, p.y - s.dragStart.y) > 6) {
      s.dragBox = { x0: s.dragStart.x, y0: s.dragStart.y, x1: p.x, y1: p.y };
    }
  }

  onUp(e) {
    const s = this.state;
    if (e.button === 1) {
      this.panning = null;
      return;
    }
    if (e.button !== 0) return;
    const p = this.local(e);
    if (s.wallStart) {
      const w = this.toWorld(p.x, p.y);
      const tiles = this.wallLine(s.wallStart, this.footprint(s.buildType, w.wx, w.wy));
      s.wallStart = null;
      this.placeAt(tiles, e.shiftKey);
      return;
    }
    if (!s.dragStart) return;
    if (s.dragBox) this.boxSelect(s.dragBox, e.shiftKey);
    else this.clickSelect(p, e.shiftKey);
    s.dragStart = null;
    s.dragBox = null;
  }

  onWheel(e) {
    e.preventDefault();
    const s = this.state;
    const p = this.local(e);
    const ix = p.x / s.cam.zoom + s.cam.x, iy = p.y / s.cam.zoom + s.cam.y;
    const factor = Math.exp(-e.deltaY * 0.0015);
    s.cam.zoom = Math.max(0.55, Math.min(1.6, s.cam.zoom * factor));
    s.cam.x = ix - p.x / s.cam.zoom;
    s.cam.y = iy - p.y / s.cam.zoom;
    this.clamp();
  }

  onKey(e) {
    const s = this.state;
    if (e.target instanceof HTMLInputElement) return;
    if (!s.started) return;
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    s.keys.add(e.key);
    if (e.repeat) return;
    const g = this.game;

    if (k === 'escape') {
      if (s.buildType) this.cancelBuild();
      else this.clearSelection();
      return;
    }
    if (k === 'p') {
      this.hud.togglePause();
      return;
    }
    if (k === 'n') {
      this.hud.toggleSound();
      return;
    }
    if (k === 'f') {
      const el = document.getElementById('fps');
      el.hidden = !el.hidden;
      return;
    }
    if (s.paused || g.over) return;

    if (/^[0-9]$/.test(k)) {
      const n = Number(k);
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        s.groups[n] = [...s.selection];
        this.hud.toast(`Grupo ${n} definido (${s.groups[n].length}).`);
      } else if (s.groups[n]) {
        const alive = s.groups[n].filter((u) => !u.dead);
        this.select(alive);
        const now = performance.now();
        if (this.lastGroupKey.n === n && now - this.lastGroupKey.t < 350 && alive.length) {
          const cx = alive.reduce((a, u) => a + u.x, 0) / alive.length, cy = alive.reduce((a, u) => a + u.y, 0) / alive.length;
          this.centerOn(cx, cy);
        }
        this.lastGroupKey = { t: now, n };
      }
      return;
    }
    if (KEY_TO_BUILD[k] && !e.ctrlKey && !e.metaKey) {
      this.startBuild(KEY_TO_BUILD[k]);
      return;
    }
    if (k === '.') this.nextIdle();
    else if (k === 'u') this.hud.upgrade();
    else if (k === 'x') g.stop([...s.selection]);
    else if (k === 'r') this.hud.recruit();
    else if (k === 'e') this.select(g.units);
    else if (k === ' ') {
      const ping = g.pings[g.pings.length - 1];
      if (ping && ping.t < 3) this.centerOn(ping.x, ping.y);
      else if (g.hq) this.centerOn(g.hq.x + 1.5, g.hq.y + 1.5);
    } else if (k === 'delete' || k === 'backspace') this.hud.demolish();
    else if (k === '+' || k === '=') this.hud.setSpeed(Math.min(3, s.speed + 1));
    else if (k === '-') this.hud.setSpeed(Math.max(1, s.speed - 1));
  }

  // ---------- seleção ----------

  // Seleciona o próximo sobrevivente parado e leva a câmera até ele.
  nextIdle() {
    const idle = this.game.units.filter((u) => !u.task);
    if (!idle.length) {
      this.hud.toast('Ninguém está parado.');
      return;
    }
    this.idleIndex = ((this.idleIndex ?? -1) + 1) % idle.length;
    const u = idle[this.idleIndex];
    this.select([u]);
    this.centerOn(u.x, u.y);
  }

  // O que está sob o cursor, para a dica flutuante.
  hoverTarget() {
    const s = this.state;
    if (!s.mouse.inside || s.dragBox || s.buildType || this.panning) return null;
    const p = { x: s.mouse.x, y: s.mouse.y };
    const hit = this.pick(p);
    if (hit) return { hit };
    const res = this.pickResource(p);
    return res ? { tile: res } : null;
  }

  clearSelection() {
    this.state.selection.clear();
    this.state.selected = null;
  }

  select(units, add = false) {
    const s = this.state;
    if (!add) s.selection.clear();
    for (const u of units) s.selection.add(u);
    if (units.length) s.selected = null;
  }

  // Seleção na tela: pessoas pelo corpo, construções pelo volume (amostra o chão abaixo do cursor).
  pick(p) {
    const g = this.game;
    const m = g.map;
    const z = this.state.cam.zoom;
    const body = (e, s) => {
      const [x, y] = this.toScreen(e.x, e.y);
      return Math.abs(p.x - x) < (9 * s + 3) * z && p.y < y + 5 * z && p.y > y - 32 * s * z;
    };
    let best = null, bd = -Infinity;
    for (const u of g.units) if (body(u, 1) && u.x + u.y > bd) { bd = u.x + u.y; best = u; }
    if (best) return best;
    for (const zb of g.zombies) {
      if (!m.visible[m.idx(Math.floor(zb.x), Math.floor(zb.y))]) continue;
      if (body(zb, zb.type === 'brute' ? 1.45 : 1) && zb.x + zb.y > bd) { bd = zb.x + zb.y; best = zb; }
    }
    if (best) return best;
    return this.pickVolume(p, (tx, ty, off) => {
      const o = m.occ[m.idx(tx, ty)];
      if (!o) return null;
      const h = o.kind === 'ruin' ? RUIN_HEIGHT : HEIGHT[o.type] || 30;
      return off <= h ? { hit: o, d: o.x + o.y + (o.w + o.h) / 2 } : null;
    });
  }

  // Árvore ou pedra sob o cursor (a copa fica acima do tile).
  pickResource(p) {
    const m = this.game.map;
    return this.pickVolume(p, (tx, ty, off) => {
      const t = m.tiles[m.idx(tx, ty)];
      if (t === T.TREE && off <= 56) return { hit: [tx, ty], d: tx + ty };
      if (t === T.ROCK && off <= 20) return { hit: [tx, ty], d: tx + ty };
      return null;
    });
  }

  pickVolume(p, test) {
    const m = this.game.map;
    const { cam } = this.state;
    let best = null, bd = -Infinity;
    for (let off = 0; off <= 96; off += 4) {
      const [wx, wy] = fromIso(p.x / cam.zoom + cam.x, p.y / cam.zoom + cam.y + off);
      const tx = Math.floor(wx), ty = Math.floor(wy);
      if (!m.inBounds(tx, ty) || !m.explored[m.idx(tx, ty)]) continue;
      const r = test(tx, ty, off);
      if (r && r.d > bd) {
        bd = r.d;
        best = r.hit;
      }
    }
    return best;
  }

  clickSelect(p, shift) {
    const s = this.state;
    const hit = this.pick(p);
    const now = performance.now();
    if (hit && hit.kind === 'unit') {
      if (this.lastClick.id === hit.id && now - this.lastClick.t < 350) {
        this.select(this.unitsOnScreen());
      } else if (shift && s.selection.has(hit)) {
        s.selection.delete(hit);
      } else {
        this.select([hit], shift);
      }
      this.lastClick = { t: now, id: hit.id };
      return;
    }
    this.lastClick = { t: now, id: null };
    if (shift) return;
    s.selection.clear();
    s.selected = hit || null;
  }

  unitsOnScreen() {
    return this.game.units.filter((u) => {
      const [x, y] = this.toScreen(u.x, u.y);
      return x >= 0 && x <= this.renderer.w && y >= 0 && y <= this.renderer.h;
    });
  }

  boxSelect(b, shift) {
    const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1), y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
    const units = this.game.units.filter((u) => {
      const [x, y] = this.toScreen(u.x, u.y);
      const cy = y - 14 * this.state.cam.zoom; // meio do corpo
      return x >= x0 && x <= x1 && cy >= y0 && cy <= y1;
    });
    if (units.length) this.select(units, shift);
    else if (!shift) this.clearSelection();
  }

  command(p) {
    const s = this.state;
    const units = [...s.selection];
    if (!units.length) return;
    const g = this.game;
    const hit = this.pick(p);
    let wx, wy, kind;
    if (hit && hit.kind !== 'unit') {
      [wx, wy] = hit.kind === 'zombie' ? [hit.x, hit.y] : [hit.x + hit.w / 2, hit.y + hit.h / 2];
      kind = g.orderSmart(units, wx, wy, hit);
    } else {
      const res = this.pickResource(p);
      if (res) [wx, wy] = [res[0] + 0.5, res[1] + 0.5];
      else ({ wx, wy } = this.toWorld(p.x, p.y));
      kind = g.orderSmart(units, wx, wy);
    }
    if (kind) s.markers.push({ x: wx, y: wy, t: performance.now() / 1000, kind });
  }

  commandAt(tx, ty) {
    const units = [...this.state.selection];
    if (!units.length) return;
    const kind = this.game.orderSmart(units, tx + 0.5, ty + 0.5);
    if (kind) this.state.markers.push({ x: tx + 0.5, y: ty + 0.5, t: performance.now() / 1000, kind });
  }

  // ---------- construção ----------

  startBuild(type) {
    const g = this.game;
    const def = BUILDINGS[type];
    if (!g.canAfford(def.cost)) {
      this.hud.toast(`Faltam recursos para ${def.name.toLowerCase()}.`);
      return;
    }
    this.state.buildType = type;
    this.state.selected = null;
  }

  cancelBuild() {
    this.state.buildType = null;
    this.state.wallStart = null;
    this.state.ghost = null;
  }

  footprint(type, wx, wy) {
    const def = BUILDINGS[type];
    return { x: Math.floor(wx - def.w / 2 + 0.5), y: Math.floor(wy - def.h / 2 + 0.5) };
  }

  wallLine(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const out = [];
    if (Math.abs(dx) >= Math.abs(dy)) {
      const s = Math.sign(dx) || 1;
      for (let k = 0; k <= Math.abs(dx); k++) out.push({ x: a.x + k * s, y: a.y });
    } else {
      const s = Math.sign(dy);
      for (let k = 0; k <= Math.abs(dy); k++) out.push({ x: a.x, y: a.y + k * s });
    }
    return out.slice(0, 40);
  }

  placeAt(tiles, keepMode) {
    const s = this.state;
    const g = this.game;
    const type = s.buildType;
    const builders = [...s.selection];
    let placed = 0, reason = '';
    for (const t of tiles) {
      const r = g.placeBuilding(type, t.x, t.y, builders);
      if (r.ok) placed++;
      else reason = r.reason;
    }
    if (!placed && reason) this.hud.toast(reason);
    if (placed && !builders.length) this.hud.toast('Selecione sobreviventes e clique com o botão direito na obra para construir.');
    if (!keepMode || !g.canAfford(BUILDINGS[type].cost)) this.cancelBuild();
  }

  updateGhost() {
    const s = this.state;
    if (!s.buildType || !s.mouse.inside) {
      s.ghost = null;
      return;
    }
    const g = this.game;
    const def = BUILDINGS[s.buildType];
    const { wx, wy } = this.toWorld(s.mouse.x, s.mouse.y);
    const here = this.footprint(s.buildType, wx, wy);
    const tiles = s.wallStart ? this.wallLine(s.wallStart, here) : [here];
    // Confere o custo acumulado da linha inteira.
    const budget = { ...g.res };
    s.ghost = {
      type: s.buildType,
      tiles: tiles.map((t) => {
        let ok = g.canPlace(s.buildType, t.x, t.y).ok;
        for (const k in def.cost) if (budget[k] < def.cost[k]) ok = false;
        if (ok) for (const k in def.cost) budget[k] -= def.cost[k];
        return { ...t, ok };
      }),
    };
  }

  // ---------- por quadro ----------

  update(dt) {
    const s = this.state;
    if (!s.started) return;
    let vx = 0, vy = 0;
    const k = s.keys;
    if (k.has('ArrowLeft')) vx -= 1;
    if (k.has('ArrowRight')) vx += 1;
    if (k.has('ArrowUp')) vy -= 1;
    if (k.has('ArrowDown')) vy += 1;
    if (s.mouse.inside && !this.panning && document.hasFocus()) {
      if (s.mouse.x < EDGE) vx -= 1;
      if (s.mouse.x > this.renderer.w - EDGE) vx += 1;
      if (s.mouse.y < EDGE) vy -= 1;
      if (s.mouse.y > this.renderer.h - EDGE) vy += 1;
    }
    if (vx || vy) {
      s.cam.x += (vx * PAN_SPEED * dt) / s.cam.zoom;
      s.cam.y += (vy * PAN_SPEED * dt) / s.cam.zoom;
      this.clamp();
    }
    for (const u of s.selection) if (u.dead) s.selection.delete(u);
    if (s.selected && s.selected.dead) s.selected = null;
    this.updateGhost();
  }
}
