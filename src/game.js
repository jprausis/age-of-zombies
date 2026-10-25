import {
  MAP_W, MAP_H, T, PASSABLE, UNIT, ZOMBIES, BUILDINGS, RUINS, RECRUIT, START_RES,
  DAY_LENGTH, NIGHT_LENGTH, WIN_DAY, GATHER_TIME, LOOT_TIME, LOOT_CAPACITY, FOOD_PER_SURVIVOR,
  REPAIR_RATE, REPAIR_HP_PER_WOOD, RES_NAMES, FIRST_HORDE_NIGHT, buildingDef,
} from './config.js';
import { makeRng } from './rng.js';
import { GameMap } from './map.js';
import { generateWorld } from './worldgen.js';
import { findPath, smoothPath } from './pathfinding.js';
import { computeFlow } from './flowfield.js';

const CELL = 4; // tamanho da célula da grade espacial de zumbis, em tiles
const SIDES = ['norte', 'leste', 'sul', 'oeste'];
const LOOT_ORDER = ['food', 'scrap', 'wood', 'stone'];
const NAMES = [
  'Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fábio', 'Gabi', 'Hugo', 'Iara', 'Joca', 'Kátia', 'Lucas',
  'Marta', 'Nando', 'Olga', 'Paulo', 'Rita', 'Sérgio', 'Tânia', 'Vitor', 'Wesley', 'Yara', 'Zeca', 'Bia',
  'Caio', 'Duda', 'Enzo', 'Lia', 'Rafa', 'Tito', 'Nina', 'Otto', 'Luna', 'Davi', 'Malu', 'Igor',
];

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Distância de uma entidade (ponto) até um retângulo de tiles {x, y, w, h}.
export function distToRect(e, r) {
  const dx = Math.max(r.x - e.x, 0, e.x - (r.x + r.w));
  const dy = Math.max(r.y - e.y, 0, e.y - (r.y + r.h));
  return Math.hypot(dx, dy);
}

const rectGoal = (r) => ({ x0: r.x, y0: r.y, x1: r.x + r.w - 1, y1: r.y + r.h - 1, adjacent: true });
const tileRect = (x, y) => ({ x, y, w: 1, h: 1 });

export class Game {
  constructor(seed) {
    this.seed = seed ?? Math.floor(Math.random() * 1e9);
    this.rng = makeRng(this.seed);
    this.map = new GameMap(MAP_W, MAP_H);
    this.units = [];
    this.zombies = [];
    this.buildings = [];
    this.ruins = [];
    this.towns = [];
    this.res = { ...START_RES };
    this.time = 0;
    this.clock = 0;
    this.day = 1;
    this.messages = [];
    this.tracers = [];
    this.texts = [];
    this.corpses = [];
    this.pings = [];
    this.pending = [];
    this.nextId = 1;
    this.flow = null;
    this.flowDirty = true;
    this.flowCd = 0;
    this.flowAge = 0;
    this.visT = 0;
    this.spawnT = 10;
    this.over = false;
    this.overReason = '';
    this.won = false;
    this.stats = { kills: 0, lost: 0, looted: 0, recruited: 0, rescued: 0, built: 0 };
    this.hordeWarned = false;
    this.hordeSide = 0;
    this.alertCd = 0;
    this.breachCd = 0;
    this.usedNames = new Set();
    this.gridCols = Math.ceil(MAP_W / CELL);
    this.gridRows = Math.ceil(MAP_H / CELL);
    this.grid = Array.from({ length: this.gridCols * this.gridRows }, () => []);

    const m = this.map;
    this.walkUnit = (x, y) => {
      if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return false;
      const i = y * MAP_W + x;
      if (!PASSABLE[m.tiles[i]]) return false;
      const o = m.occ[i];
      return !o || (o.kind === 'building' && o.def.gate && o.complete);
    };
    this.blockUnit = (x, y) => !this.walkUnit(x, y);
    this.blockZombie = (x, y) => {
      if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return true;
      const i = y * MAP_W + x;
      return !PASSABLE[m.tiles[i]] || m.occ[i] !== null;
    };

    generateWorld(this, this.rng);
    this.hq = this.buildings.find((b) => b.type === 'hq');
    this.flow = computeFlow(this);
    this.flowDirty = false;
    this.updateVisibility();
    this.msg('Dia 1. Junte madeira e pedra, e saqueie as casas por perto atrás de comida.', 'info');
    this.msg('A primeira noite costuma ser calma. A horda vem a partir da segunda.', 'info');
  }

  // ---------- estado derivado ----------

  get isNight() {
    return this.clock >= DAY_LENGTH;
  }

  // 0 = dia claro, 1 = noite fechada, com transições de 12 s no crepúsculo e na aurora.
  get darkness() {
    const c = this.clock, D = DAY_LENGTH, N = NIGHT_LENGTH, F = 12;
    if (c < D - F) return 0;
    if (c < D) return (c - (D - F)) / F;
    if (c < D + N - F) return 1;
    return 1 - (c - (D + N - F)) / F;
  }

  // Hora do relógio: o dia vai das 06:00 às 18:00 e a noite das 18:00 às 06:00.
  get hourOfDay() {
    const c = this.clock;
    const h = c < DAY_LENGTH ? 6 + (c / DAY_LENGTH) * 12 : 18 + ((c - DAY_LENGTH) / NIGHT_LENGTH) * 12;
    return h % 24;
  }

  get secondsToNight() {
    return this.isNight ? 0 : DAY_LENGTH - this.clock;
  }

  get popCap() {
    let cap = 0;
    for (const b of this.buildings) if (b.complete && b.def.pop) cap += b.def.pop;
    return cap;
  }

  get popUsed() {
    return this.units.length + (this.hq ? this.hq.queue.length : 0);
  }

  // Haverá horda ao fim deste dia?
  get hordeTonight() {
    return this.day >= FIRST_HORDE_NIGHT;
  }

  get foodNeed() {
    return this.units.length * FOOD_PER_SURVIVOR;
  }

  get hordeRemaining() {
    let n = 0;
    for (const z of this.zombies) if (z.mode === 'horde') n++;
    return n;
  }

  canAfford(cost) {
    for (const k in cost) if ((this.res[k] || 0) < cost[k]) return false;
    return true;
  }

  pay(cost) {
    for (const k in cost) this.res[k] -= cost[k];
  }

  refund(cost, frac) {
    for (const k in cost) this.res[k] += Math.floor(cost[k] * frac);
  }

  msg(text, kind = 'info') {
    this.messages.push({ text, kind, t: this.time, id: this.nextId++ });
    if (this.messages.length > 40) this.messages.shift();
  }

  floatText(x, y, text, color) {
    this.texts.push({ x, y, text, color, t: 0, life: 1.4 });
  }

  // ---------- criação de entidades ----------

  pickName() {
    const free = NAMES.filter((n) => !this.usedNames.has(n));
    const name = free.length ? this.rng.pick(free) : `${this.rng.pick(NAMES)} ${this.usedNames.size}`;
    this.usedNames.add(name);
    return name;
  }

  createRuin(type, x, y, w, h) {
    const def = RUINS[type];
    const loot = { food: 0, scrap: 0, wood: 0, stone: 0 };
    for (const k in def.loot) loot[k] = this.rng.int(def.loot[k][0], def.loot[k][1]);
    const r = {
      id: this.nextId++, kind: 'ruin', type, def, x, y, w, h, loot,
      survivor: this.rng.chance(def.survivor),
      lurkers: this.rng.chance(def.lurk) ? this.rng.int(1, type === 'mercado' ? 3 : 2) : 0,
      empty: false, visited: false, seed: this.rng(),
    };
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.map.occ[this.map.idx(xx, yy)] = r;
    this.ruins.push(r);
    return r;
  }

  createBuilding(type, x, y, complete = false) {
    const def = buildingDef(type, 0);
    const b = {
      id: this.nextId++, kind: 'building', type, def, level: 0, upgrade: null, x, y, w: def.w, h: def.h,
      maxHp: def.hp, hp: complete ? def.hp : Math.max(1, def.hp * 0.1),
      complete, progress: complete ? 1 : 0, cd: 0, angle: -Math.PI / 2, queue: [], foodT: 0, produced: 0,
      hitT: 0, dead: false,
    };
    for (let yy = y; yy < y + b.h; yy++) for (let xx = x; xx < x + b.w; xx++) this.map.occ[this.map.idx(xx, yy)] = b;
    this.buildings.push(b);
    this.flowDirty = true;
    return b;
  }

  freeTileNear(x, y, walk, maxR = 12) {
    for (let r = 0; r <= maxR; r++) {
      let best = null, bd = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (!walk(x + dx, y + dy)) continue;
          const d = dx * dx + dy * dy;
          if (d < bd) {
            bd = d;
            best = [x + dx, y + dy];
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  spawnUnit(x, y) {
    const spot = this.freeTileNear(Math.floor(x), Math.floor(y), this.walkUnit);
    if (!spot) return null;
    const u = {
      id: this.nextId++, kind: 'unit', name: this.pickName(),
      x: spot[0] + 0.5, y: spot[1] + 0.5, hp: UNIT.hp, maxHp: UNIT.hp,
      carry: { type: null, amount: 0 }, task: null, phase: 'go', path: null, pathI: 0,
      workT: 0, weaponCd: 0, aimT: 0, facing: this.rng() * Math.PI * 2, stuckT: 0, hitT: 0,
      dropB: null, repairAcc: 0, look: this.rng.int(0, 1000), dead: false,
    };
    this.units.push(u);
    return u;
  }

  spawnZombie(kind, x, y, mode) {
    const def = ZOMBIES[kind];
    const z = {
      id: this.nextId++, kind: 'zombie', type: kind, def, x, y, hp: def.hp, maxHp: def.hp, mode,
      target: null, bash: null, atkCd: 0, thinkT: this.rng() * 0.5, chaseT: 0,
      wx: x, wy: y, wanderT: 0, facing: this.rng() * Math.PI * 2, anim: this.rng() * 10, hitT: 0, dead: false,
    };
    this.zombies.push(z);
    return z;
  }

  // ---------- laço principal ----------

  update(dt) {
    if (this.over) return;
    this.time += dt;
    this.updateClock(dt);
    if (this.over) return;

    this.flowCd -= dt;
    this.flowAge += dt;
    if ((this.flowDirty || (this.isNight && this.flowAge > 6)) && this.flowCd <= 0) {
      this.flow = computeFlow(this);
      this.flowDirty = false;
      this.flowCd = 0.5;
      this.flowAge = 0;
    }

    this.rebuildGrid();
    for (const u of this.units) this.updateUnit(u, dt);
    this.separateUnits(dt);
    for (const z of this.zombies) this.updateZombie(z, dt);
    this.updateBuildings(dt);
    this.cleanupDead();
    this.updatePending(dt);
    this.updateEffects(dt);

    this.alertCd -= dt;
    this.breachCd -= dt;
    this.visT -= dt;
    if (this.visT <= 0) {
      this.visT = 0.25;
      this.updateVisibility();
    }
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 12;
      this.respawnWanderers();
    }
    this.checkDefeat();
  }

  updateClock(dt) {
    const prev = this.clock;
    this.clock += dt;
    if (!this.hordeWarned && this.clock >= DAY_LENGTH - 25) {
      this.hordeWarned = true;
      this.hordeSide = this.rng.int(0, 3);
      if (this.hordeTonight) this.msg(`Está escurecendo. Uma horda virá do ${SIDES[this.hordeSide]}!`, 'warn');
      else this.msg('Está escurecendo. Fiquem perto da fogueira.', 'info');
      if (this.res.food < this.foodNeed) {
        this.msg(`Falta comida: o grupo come ${this.foodNeed} ao amanhecer e só há ${Math.floor(this.res.food)}.`, 'warn');
      }
    }
    if (prev < DAY_LENGTH && this.clock >= DAY_LENGTH) this.startNight();
    if (this.clock >= DAY_LENGTH + NIGHT_LENGTH) {
      this.clock -= DAY_LENGTH + NIGHT_LENGTH;
      this.dawn();
    }
  }

  startNight() {
    const k = this.day - FIRST_HORDE_NIGHT + 1; // número da horda (1 = primeira)
    if (k < 1) {
      this.msg('Anoiteceu. Os mortos estão agitados, mas a horda ainda não veio.', 'info');
      return;
    }
    const n = this.spawnHorde(this.hordeSide, k);
    this.msg(`Anoiteceu. ${n} zumbis vêm do ${SIDES[this.hordeSide]}.`, 'danger');
    // O barulho do acampamento atrai os errantes que estão por perto.
    const hq = this.hq;
    if (!hq) return;
    for (const z of this.zombies) {
      if (z.mode === 'wander' && Math.hypot(z.x - hq.x, z.y - hq.y) < 25) z.mode = 'horde';
    }
  }

  dawn() {
    this.day++;
    this.hordeWarned = false;
    const need = this.units.length * FOOD_PER_SURVIVOR;
    if (this.res.food >= need) {
      this.res.food -= need;
      this.msg(`Amanheceu. Dia ${this.day}. O grupo comeu ${need} de comida.`, 'info');
    } else {
      this.res.food = 0;
      for (const u of this.units) this.damageUnit(u, 15);
      this.msg(`Amanheceu. Dia ${this.day}. Faltou comida e todos estão fracos.`, 'danger');
    }
    if (this.day > WIN_DAY && !this.won) {
      this.won = true;
      this.msg(`O grupo sobreviveu a ${WIN_DAY} noites!`, 'good');
    }
  }

  spawnHorde(side, k) {
    const count = Math.round(5 + 3 * k + Math.pow(k, 1.5));
    const flow = this.flow;
    let cand = [];
    for (let attempt = 0; attempt < 4 && !cand.length; attempt++) {
      const s = (side + attempt) % 4;
      for (let k = 2; k < MAP_W - 2; k++) {
        for (let depth = 1; depth <= 3; depth++) {
          let x, y;
          if (s === 0) [x, y] = [k, depth];
          else if (s === 1) [x, y] = [MAP_W - 1 - depth, k];
          else if (s === 2) [x, y] = [k, MAP_H - 1 - depth];
          else [x, y] = [depth, k];
          if (!this.blockZombie(x, y) && Number.isFinite(flow.dist[y * MAP_W + x])) cand.push([x, y]);
        }
      }
    }
    if (!cand.length) return 0;
    const c = this.rng.pick(cand);
    cand.sort((a, b) => Math.hypot(a[0] - c[0], a[1] - c[1]) - Math.hypot(b[0] - c[0], b[1] - c[1]));
    cand = cand.slice(0, Math.max(30, count * 2));
    const runner = k >= 2 ? Math.min(0.3, 0.08 * (k - 1)) : 0;
    const brute = k >= 3 ? Math.min(0.15, 0.04 * (k - 2)) : 0;
    for (let i = 0; i < count; i++) {
      const p = this.rng.pick(cand);
      const roll = this.rng();
      const kind = roll < brute ? 'brute' : roll < brute + runner ? 'runner' : 'walker';
      this.spawnZombie(kind, p[0] + this.rng.range(0.3, 0.7), p[1] + this.rng.range(0.3, 0.7), 'horde');
    }
    return count;
  }

  respawnWanderers() {
    let wandering = 0;
    for (const z of this.zombies) if (z.mode === 'wander') wandering++;
    const cap = Math.min(120, 25 + this.day * 4);
    if (wandering >= cap) return;
    const hq = this.hq;
    const n = this.rng.int(1, 3);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 20; k++) {
        const x = this.rng.int(1, MAP_W - 2), y = this.rng.int(1, MAP_H - 2);
        if (this.blockZombie(x, y) || this.map.visible[this.map.idx(x, y)]) continue;
        if (hq && Math.hypot(x - hq.x, y - hq.y) < 28) continue;
        this.spawnZombie('walker', x + 0.5, y + 0.5, 'wander');
        break;
      }
    }
  }

  rebuildGrid() {
    for (const cell of this.grid) cell.length = 0;
    for (const z of this.zombies) {
      const cx = Math.min(this.gridCols - 1, Math.max(0, Math.floor(z.x / CELL)));
      const cy = Math.min(this.gridRows - 1, Math.max(0, Math.floor(z.y / CELL)));
      this.grid[cy * this.gridCols + cx].push(z);
    }
  }

  forZombiesNear(x, y, r, fn) {
    const c0 = Math.max(0, Math.floor((x - r) / CELL)), c1 = Math.min(this.gridCols - 1, Math.floor((x + r) / CELL));
    const r0 = Math.max(0, Math.floor((y - r) / CELL)), r1 = Math.min(this.gridRows - 1, Math.floor((y + r) / CELL));
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) for (const z of this.grid[cy * this.gridCols + cx]) fn(z);
  }

  nearestZombie(x, y, r) {
    let best = null, bd = r * r;
    this.forZombiesNear(x, y, r, (z) => {
      if (z.hp <= 0) return;
      const d = (z.x - x) ** 2 + (z.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = z;
      }
    });
    return best;
  }

  nearestUnit(x, y, r) {
    let best = null, bd = r * r;
    for (const u of this.units) {
      if (u.hp <= 0) continue;
      const d = (u.x - x) ** 2 + (u.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = u;
      }
    }
    return best;
  }

  // Movimento com colisão por eixo contra tiles bloqueados. Retorna o índice do tile que bloqueou, ou -1.
  moveBy(e, dx, dy, blocked, r) {
    let hit = -1;
    if (dx) {
      const nx = e.x + dx;
      const ex = Math.floor(nx + Math.sign(dx) * r);
      const ya = Math.floor(e.y - r * 0.9), yb = Math.floor(e.y + r * 0.9);
      if (blocked(ex, ya)) hit = ya * MAP_W + ex;
      else if (blocked(ex, yb)) hit = yb * MAP_W + ex;
      else e.x = nx;
    }
    if (dy) {
      const ny = e.y + dy;
      const ey = Math.floor(ny + Math.sign(dy) * r);
      const xa = Math.floor(e.x - r * 0.9), xb = Math.floor(e.x + r * 0.9);
      if (blocked(xa, ey)) hit = ey * MAP_W + xa;
      else if (blocked(xb, ey)) hit = ey * MAP_W + xb;
      else e.y = ny;
    }
    return hit;
  }

  // ---------- sobreviventes ----------

  setTask(u, task) {
    u.task = task;
    u.phase = 'go';
    u.path = null;
    u.workT = 0;
    u.dropB = null;
    u.stuckT = 0;
  }

  goTo(u, goal, partial = false) {
    const sx = Math.floor(u.x), sy = Math.floor(u.y);
    const raw = findPath(this.walkUnit, sx, sy, goal, { partial });
    if (!raw) return false;
    // Já está no tile de destino: anda até o centro dele para ficar encostado no alvo.
    u.path = raw.length ? smoothPath(raw, sx, sy, this.walkUnit) : [[sx, sy]];
    u.pathI = 0;
    u.stuckT = 0;
    return true;
  }

  follow(u, dt) {
    const p = u.path;
    if (!p || u.pathI >= p.length) {
      u.path = null;
      return 'arrived';
    }
    const tx = p[u.pathI][0] + 0.5, ty = p[u.pathI][1] + 0.5;
    const dx = tx - u.x, dy = ty - u.y;
    const d = Math.hypot(dx, dy);
    const step = UNIT.speed * dt;
    if (d > 0.01) u.facing = Math.atan2(dy, dx);
    if (d <= Math.max(step, 0.12)) {
      this.moveBy(u, dx, dy, this.blockUnit, UNIT.radius);
      u.pathI++;
      if (u.pathI >= p.length) {
        u.path = null;
        return 'arrived';
      }
      return 'moving';
    }
    const ox = u.x, oy = u.y;
    this.moveBy(u, (dx / d) * step, (dy / d) * step, this.blockUnit, UNIT.radius);
    if (Math.hypot(u.x - ox, u.y - oy) < step * 0.3) {
      u.stuckT += dt;
      if (u.stuckT > 0.8) {
        u.stuckT = 0;
        u.path = null;
        return 'stuck';
      }
    } else {
      u.stuckT = Math.max(0, u.stuckT - dt);
    }
    return 'moving';
  }

  updateUnit(u, dt) {
    u.weaponCd -= dt;
    u.hitT = Math.max(0, u.hitT - dt);
    u.working = false;
    if (u.weaponCd <= 0) {
      const t = u.task;
      let target = null;
      if (t && t.kind === 'attack' && t.z.hp > 0 && dist(u, t.z) <= UNIT.range) target = t.z;
      else target = this.nearestZombie(u.x, u.y, UNIT.range);
      if (target) this.unitShoot(u, target);
    }
    if (u.aimT > 0) {
      u.aimT -= dt;
      return;
    }
    const t = u.task;
    if (!t) return;
    switch (t.kind) {
      case 'move': return this.taskMove(u, t, dt);
      case 'gather': return this.taskGather(u, t, dt);
      case 'loot': return this.taskLoot(u, t, dt);
      case 'build': return this.taskBuild(u, t, dt);
      case 'attack': return this.taskAttack(u, t, dt);
      case 'drop': return this.doDrop(u, t, dt);
    }
  }

  unitShoot(u, z) {
    z.hp -= UNIT.dmg;
    z.hitT = 0.15;
    u.weaponCd = UNIT.cooldown * (0.9 + this.rng() * 0.2);
    u.aimT = 0.25;
    u.facing = Math.atan2(z.y - u.y, z.x - u.x);
    this.tracers.push({ x1: u.x + Math.cos(u.facing) * 0.4, y1: u.y + Math.sin(u.facing) * 0.4, x2: z.x, y2: z.y, t: 0.08, kind: 'gun' });
    if (!z.target || z.target.dead) {
      z.target = u;
      z.chaseT = 6;
    }
  }

  taskMove(u, t, dt) {
    if (!u.path && !this.goTo(u, { x0: t.tx, y0: t.ty, x1: t.tx, y1: t.ty, adjacent: false }, true)) {
      u.task = null;
      return;
    }
    const r = this.follow(u, dt);
    if (r === 'arrived') u.task = null;
    else if (r === 'stuck' && ++t.retries > 4) u.task = null;
  }

  approach(u, rect, dt) {
    if (!u.path && !this.goTo(u, rectGoal(rect))) return false;
    this.follow(u, dt);
    return true;
  }

  taskGather(u, t, dt) {
    if (u.phase === 'drop') return this.doDrop(u, t, dt);
    if (u.carry.amount > 0 && u.carry.type !== t.res) {
      u.phase = 'drop';
      return;
    }
    const want = t.res === 'wood' ? T.TREE : T.ROCK;
    const i = this.map.idx(t.tx, t.ty);
    if (this.map.tiles[i] !== want) {
      const n = this.findNearestTile(t.tx, t.ty, want, 12, t.blacklist);
      if (n) {
        t.tx = n[0];
        t.ty = n[1];
        u.path = null;
      } else if (u.carry.amount > 0) {
        t.done = true;
        u.phase = 'drop';
      } else {
        u.task = null;
      }
      return;
    }
    const rect = tileRect(t.tx, t.ty);
    if (distToRect(u, rect) <= 0.8) {
      u.path = null;
      u.working = true;
      u.facing = Math.atan2(t.ty + 0.5 - u.y, t.tx + 0.5 - u.x);
      u.workT += dt;
      if (u.workT >= GATHER_TIME[t.res]) {
        u.workT = 0;
        this.map.res[i]--;
        u.carry.type = t.res;
        u.carry.amount++;
        if (this.map.res[i] <= 0) this.depleteTile(t.tx, t.ty);
        if (u.carry.amount >= UNIT.capacity) u.phase = 'drop';
      }
      return;
    }
    if (!this.approach(u, rect, dt)) {
      // Recurso cercado: tenta outro por perto antes de desistir.
      t.blacklist.add(i);
      const n = this.findNearestTile(t.tx, t.ty, want, 8, t.blacklist);
      if (n && t.blacklist.size < 6) {
        t.tx = n[0];
        t.ty = n[1];
      } else {
        u.task = null;
        this.msg(`${u.name} não consegue chegar até o recurso.`, 'warn');
      }
    }
  }

  taskLoot(u, t, dt) {
    if (u.phase === 'drop') return this.doDrop(u, t, dt);
    const r = t.ruin;
    if (r.empty) {
      const n = this.nearestRuin(r.x + r.w / 2, r.y + r.h / 2, 14);
      if (n) {
        t.ruin = n;
        u.path = null;
      } else if (u.carry.amount > 0) {
        t.done = true;
        u.phase = 'drop';
      } else {
        u.task = null;
      }
      return;
    }
    if (distToRect(u, r) <= 0.8) {
      u.path = null;
      u.working = true;
      u.facing = Math.atan2(r.y + r.h / 2 - u.y, r.x + r.w / 2 - u.x);
      if (!r.visited) this.visitRuin(r, u);
      u.workT += dt;
      if (u.workT < LOOT_TIME) return;
      u.workT = 0;
      const type = u.carry.amount > 0 && r.loot[u.carry.type] > 0 ? u.carry.type : LOOT_ORDER.find((k) => r.loot[k] > 0);
      if (u.carry.amount > 0 && type !== u.carry.type) {
        u.phase = 'drop';
        return;
      }
      const take = Math.min(Math.max(0, LOOT_CAPACITY - u.carry.amount), r.loot[type]);
      r.loot[type] -= take;
      u.carry.type = type;
      u.carry.amount += take;
      this.stats.looted += take;
      if (r.survivor) this.tryRescue(r);
      r.empty = LOOT_ORDER.every((k) => r.loot[k] <= 0);
      u.phase = 'drop';
      return;
    }
    if (!this.approach(u, r, dt)) {
      u.task = null;
      this.msg(`${u.name} não encontra caminho até a ${r.def.name.toLowerCase()}.`, 'warn');
    }
  }

  visitRuin(r, u) {
    r.visited = true;
    if (!r.lurkers) return;
    for (let k = 0; k < r.lurkers; k++) {
      const spot = this.freeTileNear(Math.floor(u.x), Math.floor(u.y), (x, y) => !this.blockZombie(x, y), 3);
      if (!spot) break;
      const z = this.spawnZombie('walker', spot[0] + 0.5, spot[1] + 0.5, 'wander');
      z.target = u;
      z.chaseT = 8;
    }
    this.msg(`Havia zumbis escondidos na ${r.def.name.toLowerCase()}!`, 'danger');
    this.pings.push({ x: r.x + r.w / 2, y: r.y + r.h / 2, t: 0, kind: 'danger' });
    r.lurkers = 0;
  }

  tryRescue(r) {
    if (this.popUsed >= this.popCap) {
      if (!r.survivorNotified) {
        r.survivorNotified = true;
        this.msg('Há alguém escondido aqui, mas falta abrigo. Construa uma barraca.', 'warn');
      }
      return;
    }
    const u = this.spawnUnit(r.x + r.w / 2, r.y + r.h + 0.5);
    if (!u) return;
    r.survivor = false;
    this.stats.rescued++;
    this.msg(`${u.name} estava escondido na ${r.def.name.toLowerCase()} e entrou para o grupo!`, 'good');
  }

  taskBuild(u, t, dt) {
    const b = t.b;
    if (b.dead || (b.complete && !b.upgrade && b.hp >= b.maxHp)) {
      const n = this.nearestSite(u.x, u.y, 10);
      if (n) {
        t.b = n;
        u.path = null;
      } else {
        u.task = null;
      }
      return;
    }
    if (distToRect(u, b) <= 0.8) {
      u.path = null;
      u.working = true;
      u.facing = Math.atan2(b.y + b.h / 2 - u.y, b.x + b.w / 2 - u.x);
      if (!b.complete) {
        const p = dt / b.def.buildTime;
        b.progress = Math.min(1, b.progress + p);
        b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.9 * p);
        if (b.progress >= 1) this.completeBuilding(b);
      } else if (b.upgrade) {
        b.upgrade.progress += dt / this.nextLevel(b).buildTime;
        if (b.upgrade.progress >= 1) this.finishUpgrade(b);
      } else {
        const heal = REPAIR_RATE * dt;
        u.repairAcc += heal / REPAIR_HP_PER_WOOD;
        if (u.repairAcc >= 1) {
          if (this.res.wood < 1) {
            u.task = null;
            this.msg('Sem madeira para consertar.', 'warn');
            return;
          }
          this.res.wood -= 1;
          u.repairAcc -= 1;
        }
        b.hp = Math.min(b.maxHp, b.hp + heal);
      }
      return;
    }
    if (!this.approach(u, b, dt)) {
      u.task = null;
      this.msg(`${u.name} não alcança a obra.`, 'warn');
    }
  }

  taskAttack(u, t, dt) {
    const z = t.z;
    if (z.dead || z.hp <= 0) {
      u.task = null;
      return;
    }
    if (dist(u, z) <= UNIT.range * 0.85) {
      u.path = null;
      return;
    }
    t.repath -= dt;
    if (!u.path || t.repath <= 0) {
      t.repath = 0.8;
      if (!this.goTo(u, rectGoal(tileRect(Math.floor(z.x), Math.floor(z.y))), true)) {
        u.task = null;
        return;
      }
    }
    this.follow(u, dt);
  }

  doDrop(u, t, dt) {
    if (u.carry.amount <= 0) {
      if (t.done || t.kind === 'drop') u.task = null;
      else u.phase = 'go';
      return;
    }
    let b = u.dropB;
    if (!b || b.dead) {
      b = u.dropB = this.nearestDropoff(u.x, u.y);
      u.path = null;
      if (!b) {
        u.task = null;
        this.msg('Não há onde guardar recursos. Construa um depósito.', 'warn');
        return;
      }
    }
    if (distToRect(u, b) <= 0.8) {
      const { type } = u.carry;
      const amount = Math.round(u.carry.amount * (1 + (b.def.bonus || 0)));
      this.res[type] += amount;
      this.floatText(u.x, u.y - 0.6, `+${amount} ${RES_NAMES[type].toLowerCase()}`, type);
      u.carry.amount = 0;
      u.carry.type = null;
      u.dropB = null;
      u.path = null;
      if (t.done || t.kind === 'drop') u.task = null;
      else u.phase = 'go';
      return;
    }
    if (!this.approach(u, b, dt)) {
      u.task = null;
      this.msg(`${u.name} não acha caminho até o depósito.`, 'warn');
    }
  }

  separateUnits(dt) {
    const us = this.units;
    for (let i = 0; i < us.length; i++) {
      for (let j = i + 1; j < us.length; j++) {
        const a = us[i], b = us[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= 0.5 || d === 0) continue;
        const push = Math.min((0.5 - d) * 0.5, 2 * dt);
        const nx = dx / d, ny = dy / d;
        this.moveBy(a, -nx * push, -ny * push, this.blockUnit, UNIT.radius);
        this.moveBy(b, nx * push, ny * push, this.blockUnit, UNIT.radius);
      }
    }
  }

  // ---------- buscas ----------

  findNearestTile(x, y, type, radius, blacklist) {
    let best = null, bd = Infinity;
    const m = this.map;
    for (let yy = y - radius; yy <= y + radius; yy++) {
      for (let xx = x - radius; xx <= x + radius; xx++) {
        if (!m.inBounds(xx, yy)) continue;
        const i = m.idx(xx, yy);
        if (m.tiles[i] !== type || (blacklist && blacklist.has(i))) continue;
        const d = (xx - x) ** 2 + (yy - y) ** 2;
        if (d < bd) {
          bd = d;
          best = [xx, yy];
        }
      }
    }
    return best;
  }

  nearestDropoff(x, y) {
    let best = null, bd = Infinity;
    for (const b of this.buildings) {
      if (!b.complete || !b.def.dropoff) continue;
      const d = distToRect({ x, y }, b);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }

  nearestSite(x, y, r) {
    let best = null, bd = r;
    for (const b of this.buildings) {
      if (b.complete && !b.upgrade) continue;
      const d = distToRect({ x, y }, b);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }

  nearestRuin(x, y, r) {
    let best = null, bd = r;
    for (const ru of this.ruins) {
      if (ru.empty || !this.map.explored[this.map.idx(ru.x, ru.y)]) continue;
      const d = distToRect({ x, y }, ru);
      if (d < bd) {
        bd = d;
        best = ru;
      }
    }
    return best;
  }

  depleteTile(x, y) {
    const t = this.map.get(x, y);
    this.map.set(x, y, t === T.TREE ? T.GRASS : T.DIRT);
    this.map.res[this.map.idx(x, y)] = 0;
    this.flowDirty = true;
  }

  // ---------- zumbis ----------

  updateZombie(z, dt) {
    const def = z.def;
    z.atkCd -= dt;
    z.anim += dt;
    z.hitT = Math.max(0, z.hitT - dt);
    z.chaseT -= dt;
    z.thinkT -= dt;
    if (z.thinkT <= 0) {
      z.thinkT = 0.3 + this.rng() * 0.3;
      if (z.target && (z.target.dead || z.target.hp <= 0)) z.target = null;
      const aggro = z.mode === 'horde' ? 5 : this.isNight ? 8 : 6;
      if (z.target && z.chaseT <= 0 && dist(z, z.target) > aggro * 1.8) z.target = null;
      if (!z.target) z.target = this.nearestUnit(z.x, z.y, aggro);
    }

    const tgt = z.target;
    if (tgt && dist(z, tgt) < def.radius + 0.45) {
      z.facing = Math.atan2(tgt.y - z.y, tgt.x - z.x);
      if (z.atkCd <= 0) {
        z.atkCd = def.cooldown;
        this.damageUnit(tgt, def.dmg);
      }
      return;
    }

    if (z.bash) {
      if (z.bash.dead || distToRect(z, z.bash) > def.radius + 0.3) {
        z.bash = null;
      } else {
        if (z.atkCd <= 0) {
          z.atkCd = def.cooldown;
          if (z.bash.def.thorns) {
            z.hp -= z.bash.def.thorns;
            z.hitT = 0.15;
          }
          this.damageBuilding(z.bash, def.dmg * def.buildingMult);
        }
        return;
      }
    }

    let gx, gy, speed = def.speed;
    if (tgt) {
      gx = tgt.x;
      gy = tgt.y;
    } else if (z.mode === 'horde') {
      const i = Math.floor(z.y) * MAP_W + Math.floor(z.x);
      const n = this.flow ? this.flow.next[i] : -1;
      if (n >= 0) {
        gx = (n % MAP_W) + 0.5;
        gy = Math.floor(n / MAP_W) + 0.5;
      } else if (this.hq) {
        gx = this.hq.x + 1.5;
        gy = this.hq.y + 1.5;
      } else {
        return;
      }
    } else {
      speed *= 0.4;
      z.wanderT -= dt;
      if (z.wanderT <= 0 || Math.hypot(z.wx - z.x, z.wy - z.y) < 0.3) {
        z.wanderT = 3 + this.rng() * 5;
        z.wx = z.x + this.rng.range(-5, 5);
        z.wy = z.y + this.rng.range(-5, 5);
      }
      gx = z.wx;
      gy = z.wy;
    }

    const dx = gx - z.x, dy = gy - z.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.05) {
      const step = Math.min(d, speed * dt);
      z.facing = Math.atan2(dy, dx);
      const hit = this.moveBy(z, (dx / d) * step, (dy / d) * step, this.blockZombie, def.radius);
      if (hit >= 0) {
        const o = this.map.occ[hit];
        if (o && o.kind === 'building') z.bash = o;
        else if (z.mode === 'wander') z.wanderT = 0;
      }
    }

    // Separação para a horda não virar um ponto só.
    let px = 0, py = 0;
    this.forZombiesNear(z.x, z.y, 1, (o) => {
      if (o === z) return;
      const ox = z.x - o.x, oy = z.y - o.y;
      const od = Math.hypot(ox, oy);
      const min = def.radius + o.def.radius;
      if (od > 0 && od < min) {
        px += (ox / od) * (min - od);
        py += (oy / od) * (min - od);
      }
    });
    if (px || py) {
      const lim = 1.5 * dt;
      this.moveBy(z, Math.max(-lim, Math.min(lim, px * 0.5)), Math.max(-lim, Math.min(lim, py * 0.5)), this.blockZombie, def.radius);
    }
  }

  damageUnit(u, amount) {
    if (u.hp <= 0) return;
    u.hp -= amount;
    u.hitT = 0.2;
  }

  damageBuilding(b, amount) {
    if (b.dead) return;
    b.hp -= amount;
    b.hitT = 0.2;
    if (!b.def.wall && this.alertCd <= 0) {
      this.alertCd = 10;
      this.msg(`${b.def.name} sob ataque!`, 'danger');
      this.pings.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, t: 0, kind: 'danger' });
    }
    if (b.hp <= 0) this.destroyBuilding(b);
  }

  destroyBuilding(b) {
    if (b.dead) return;
    b.dead = true;
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) this.map.occ[this.map.idx(x, y)] = null;
    this.buildings.splice(this.buildings.indexOf(b), 1);
    this.flowDirty = true;
    if (b.type === 'hq') {
      this.hq = null;
      this.gameOver('O acampamento foi tomado pelos mortos.');
      return;
    }
    if (b.def.wall) {
      if (this.breachCd <= 0) {
        this.breachCd = 6;
        this.msg('Brecha na defesa!', 'danger');
        this.pings.push({ x: b.x + 0.5, y: b.y + 0.5, t: 0, kind: 'danger' });
      }
    } else {
      this.msg(`${b.def.name} destruída.`, 'danger');
    }
  }

  // ---------- prédios ----------

  completeBuilding(b) {
    b.complete = true;
    b.progress = 1;
    this.stats.built++;
    this.flowDirty = true;
    if (!b.def.wall) this.msg(`Construção pronta: ${b.def.name}.`, 'good');
  }

  updateBuildings(dt) {
    for (const b of this.buildings) {
      b.hitT = Math.max(0, b.hitT - dt);
      if (!b.complete) continue;
      if (b.def.range) {
        b.cd -= dt;
        if (b.cd <= 0) {
          const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
          const z = this.nearestZombie(cx, cy, b.def.range);
          if (z) {
            z.hp -= b.def.dmg;
            z.hitT = 0.15;
            b.cd = b.def.cooldown;
            b.angle = Math.atan2(z.y - cy, z.x - cx);
            this.tracers.push({ x1: cx, y1: cy, x2: z.x, y2: z.y, t: 0.1, kind: 'tower' });
          }
        }
      }
      if (b.def.foodInterval) {
        b.foodT += dt;
        if (b.foodT >= b.def.foodInterval) {
          b.foodT -= b.def.foodInterval;
          this.res.food += 1;
          b.produced++;
          if (b.produced % 5 === 0) this.floatText(b.x + b.w / 2, b.y + 0.4, '+5 comida', 'food');
        }
      }
      if (b.queue.length) {
        b.queue[0] -= dt;
        if (b.queue[0] <= 0) {
          b.queue.shift();
          const u = this.spawnUnit(b.x + b.w / 2, b.y + b.h + 0.5);
          if (u) {
            this.stats.recruited++;
            this.msg(`${u.name} entrou para o grupo.`, 'good');
          }
        }
      }
    }
  }

  // ---------- evoluções ----------

  nextLevel(b) {
    const levels = BUILDINGS[b.type].levels;
    return levels && b.level < levels.length ? levels[b.level] : null;
  }

  startUpgrade(b, builders = []) {
    if (!b.complete) return { ok: false, reason: 'Termine a obra primeiro' };
    if (b.upgrade) return { ok: false, reason: 'Já está em reforma' };
    const next = this.nextLevel(b);
    if (!next) return { ok: false, reason: 'Já está no nível máximo' };
    if (!this.canAfford(next.cost)) return { ok: false, reason: `Faltam recursos para ${next.name.toLowerCase()}` };
    this.pay(next.cost);
    b.upgrade = { progress: 0 };
    let n = 0;
    for (const u of builders) {
      this.setTask(u, { kind: 'build', b });
      n++;
    }
    if (!n) n = this.assignIdle(b, 2);
    this.msg(n ? `Reforma começou: ${next.name}.` : `Reforma paga: ${next.name}. Mande alguém trabalhar nela (botão direito).`, n ? 'info' : 'warn');
    return { ok: true };
  }

  finishUpgrade(b) {
    const oldMax = b.maxHp;
    b.level++;
    b.def = buildingDef(b.type, b.level);
    b.maxHp = b.def.hp;
    b.hp = Math.min(b.maxHp, b.hp + b.maxHp - oldMax);
    b.upgrade = null;
    this.flowDirty = true;
    this.stats.built++;
    if (!b.def.wall) this.msg(`Reforma pronta: ${b.def.name}.`, 'good');
  }

  // Põe até n sobreviventes parados (os mais próximos) para trabalhar numa obra.
  assignIdle(b, n) {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const idle = this.units.filter((u) => !u.task).sort((a, c) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(c.x - cx, c.y - cy)).slice(0, n);
    for (const u of idle) this.setTask(u, { kind: 'build', b });
    return idle.length;
  }

  canPlace(type, tx, ty) {
    const def = BUILDINGS[type];
    const m = this.map;
    if (!this.canAfford(def.cost)) return { ok: false, reason: 'Recursos insuficientes' };
    if (tx < 1 || ty < 1 || tx + def.w > MAP_W - 1 || ty + def.h > MAP_H - 1) return { ok: false, reason: 'Fora do mapa' };
    for (let y = ty; y < ty + def.h; y++) {
      for (let x = tx; x < tx + def.w; x++) {
        const i = m.idx(x, y);
        if (!m.explored[i]) return { ok: false, reason: 'Área não explorada' };
        if (!PASSABLE[m.tiles[i]] || m.occ[i]) return { ok: false, reason: 'Terreno ocupado' };
      }
    }
    const inside = (e, pad) => e.x > tx - pad && e.x < tx + def.w + pad && e.y > ty - pad && e.y < ty + def.h + pad;
    if (this.units.some((u) => inside(u, UNIT.radius))) return { ok: false, reason: 'Há alguém no caminho' };
    if (this.zombies.some((z) => inside(z, z.def.radius))) return { ok: false, reason: 'Há zumbis no local' };
    return { ok: true };
  }

  placeBuilding(type, tx, ty, builders = []) {
    const check = this.canPlace(type, tx, ty);
    if (!check.ok) return { ok: false, reason: check.reason };
    const def = BUILDINGS[type];
    this.pay(def.cost);
    const b = this.createBuilding(type, tx, ty, false);
    for (const u of builders) {
      if (u.task && u.task.kind === 'build' && !u.task.b.complete && !u.task.b.dead) continue;
      this.setTask(u, { kind: 'build', b });
    }
    const helpers = builders.length ? builders.length : this.assignIdle(b, 1);
    return { ok: true, building: b, helpers };
  }

  // Cancela obra (devolve tudo se mal começou, metade depois) ou demole prédio pronto (devolve 25%).
  removeBuilding(b) {
    if (b.type === 'hq' || b.dead) return;
    const frac = b.complete ? 0.25 : b.progress < 0.05 ? 1 : 0.5;
    this.refund(b.def.cost, frac);
    b.dead = true;
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) this.map.occ[this.map.idx(x, y)] = null;
    this.buildings.splice(this.buildings.indexOf(b), 1);
    this.flowDirty = true;
  }

  recruit() {
    const hq = this.hq;
    if (!hq) return { ok: false, reason: 'Sem acampamento' };
    if (hq.queue.length >= RECRUIT.maxQueue) return { ok: false, reason: 'Fila cheia' };
    if (this.popUsed >= this.popCap) return { ok: false, reason: 'Sem abrigo. Construa barracas.' };
    if (!this.canAfford(RECRUIT.cost)) return { ok: false, reason: 'Comida insuficiente' };
    this.pay(RECRUIT.cost);
    hq.queue.push(RECRUIT.time);
    return { ok: true };
  }

  // ---------- comandos do jogador ----------

  formationSpots(tx, ty, n) {
    const spots = [];
    for (let r = 0; r <= 10 && spots.length < n; r++) {
      const ring = [];
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (this.walkUnit(tx + dx, ty + dy)) ring.push([tx + dx, ty + dy, dx * dx + dy * dy]);
        }
      }
      ring.sort((a, b) => a[2] - b[2]);
      for (const s of ring) spots.push([s[0], s[1]]);
    }
    return spots.length ? spots : [[tx, ty]];
  }

  orderMove(units, tx, ty) {
    const spots = this.formationSpots(tx, ty, units.length);
    const sorted = [...units].sort((a, b) => Math.hypot(a.x - tx, a.y - ty) - Math.hypot(b.x - tx, b.y - ty));
    sorted.forEach((u, k) => {
      const s = spots[k % spots.length];
      this.setTask(u, { kind: 'move', tx: s[0], ty: s[1], retries: 0 });
    });
  }

  zombieAt(wx, wy) {
    let best = null, bd = 0.7;
    this.forZombiesNear(wx, wy, 1, (z) => {
      if (!this.map.visible[this.map.idx(Math.floor(z.x), Math.floor(z.y))]) return;
      const d = Math.hypot(z.x - wx, z.y - wy);
      if (d < bd) {
        bd = d;
        best = z;
      }
    });
    return best;
  }

  // Ordem contextual (botão direito). `picked` é o que o jogador clicou na tela, se já foi
  // identificado (zumbi, prédio ou ruína). Retorna o tipo de ordem para o marcador visual.
  orderSmart(units, wx, wy, picked = null) {
    if (!units.length) return null;
    const tx = Math.floor(wx), ty = Math.floor(wy);
    const m = this.map;
    if (!m.inBounds(tx, ty)) return null;
    const z = picked ? (picked.kind === 'zombie' ? picked : null) : this.zombieAt(wx, wy);
    if (z) {
      for (const u of units) this.setTask(u, { kind: 'attack', z, repath: 0 });
      return 'attack';
    }
    const i = m.idx(tx, ty);
    if (!m.explored[i]) {
      this.orderMove(units, tx, ty);
      return 'move';
    }
    const o = picked || m.occ[i];
    if (o && o.kind === 'building') {
      if (!o.complete || o.upgrade || o.hp < o.maxHp) {
        for (const u of units) this.setTask(u, { kind: 'build', b: o });
        return 'build';
      }
      if (o.def.dropoff && units.some((u) => u.carry.amount > 0)) {
        for (const u of units) {
          this.setTask(u, { kind: 'drop', done: true });
          u.dropB = o;
        }
        return 'drop';
      }
      if (!o.def.gate) {
        const c = this.freeTileNear(tx, ty, this.walkUnit, 4);
        if (c) this.orderMove(units, c[0], c[1]);
        return 'move';
      }
    }
    if (o && o.kind === 'ruin') {
      if (o.empty) {
        this.msg(`Não sobrou nada nesta ${o.def.name.toLowerCase()}.`, 'info');
        return null;
      }
      for (const u of units) this.setTask(u, { kind: 'loot', ruin: o });
      return 'loot';
    }
    const tile = m.tiles[i];
    if (tile === T.TREE || tile === T.ROCK) {
      const res = tile === T.TREE ? 'wood' : 'stone';
      const spread = this.tilesNear(tx, ty, tile, 4, units.length);
      units.forEach((u, k) => {
        const s = spread[k % spread.length];
        this.setTask(u, { kind: 'gather', tx: s[0], ty: s[1], res, blacklist: new Set() });
      });
      return 'gather';
    }
    this.orderMove(units, tx, ty);
    return 'move';
  }

  tilesNear(x, y, type, radius, n) {
    const out = [];
    const m = this.map;
    for (let yy = y - radius; yy <= y + radius; yy++) {
      for (let xx = x - radius; xx <= x + radius; xx++) {
        if (m.inBounds(xx, yy) && m.tiles[m.idx(xx, yy)] === type) out.push([xx, yy, (xx - x) ** 2 + (yy - y) ** 2]);
      }
    }
    out.sort((a, b) => a[2] - b[2]);
    return out.slice(0, Math.max(1, n));
  }

  stop(units) {
    for (const u of units) this.setTask(u, null);
  }

  // ---------- manutenção ----------

  cleanupDead() {
    if (this.units.some((u) => u.hp <= 0)) {
      this.units = this.units.filter((u) => {
        if (u.hp > 0) return true;
        u.dead = true;
        this.stats.lost++;
        this.usedNames.delete(u.name);
        this.corpses.push({ x: u.x, y: u.y, t: 0, kind: 'unit', a: u.facing });
        if (this.rng.chance(0.5)) {
          this.pending.push({ t: 3, x: u.x, y: u.y, name: u.name });
          this.msg(`${u.name} foi mordido(a)...`, 'danger');
        } else {
          this.msg(`${u.name} caiu.`, 'danger');
        }
        return false;
      });
    }
    if (this.zombies.some((z) => z.hp <= 0)) {
      this.zombies = this.zombies.filter((z) => {
        if (z.hp > 0) return true;
        z.dead = true;
        this.stats.kills++;
        this.corpses.push({ x: z.x, y: z.y, t: 0, kind: z.type, a: z.facing });
        return false;
      });
      if (this.corpses.length > 220) this.corpses.splice(0, this.corpses.length - 220);
    }
  }

  updatePending(dt) {
    for (const p of this.pending) {
      p.t -= dt;
      if (p.t > 0) continue;
      const spot = this.freeTileNear(Math.floor(p.x), Math.floor(p.y), (x, y) => !this.blockZombie(x, y), 3);
      if (spot) {
        this.spawnZombie('walker', spot[0] + 0.5, spot[1] + 0.5, 'horde');
        this.msg(`${p.name} se levantou como zumbi!`, 'danger');
      }
    }
    this.pending = this.pending.filter((p) => p.t > 0);
  }

  updateEffects(dt) {
    for (const t of this.tracers) t.t -= dt;
    this.tracers = this.tracers.filter((t) => t.t > 0);
    for (const t of this.texts) t.t += dt;
    this.texts = this.texts.filter((t) => t.t < t.life);
    for (const c of this.corpses) c.t += dt;
    this.corpses = this.corpses.filter((c) => c.t < 45);
    for (const p of this.pings) p.t += dt;
    this.pings = this.pings.filter((p) => p.t < 3);
  }

  updateVisibility() {
    const m = this.map;
    m.visible.fill(0);
    const night = this.darkness > 0.5;
    for (const u of this.units) this.reveal(u.x, u.y, night ? UNIT.sightNight : UNIT.sight);
    for (const b of this.buildings) this.reveal(b.x + b.w / 2, b.y + b.h / 2, b.def.sight + Math.max(b.w, b.h) / 2);
  }

  reveal(cx, cy, r) {
    const m = this.map;
    const r2 = r * r;
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(m.w - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(m.h - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > r2) continue;
        const i = y * m.w + x;
        m.visible[i] = 1;
        m.explored[i] = 1;
      }
    }
  }

  checkDefeat() {
    if (this.over) return;
    if (!this.units.length && !this.pending.length && (!this.hq || !this.hq.queue.length) && !this.canAfford(RECRUIT.cost)) {
      this.gameOver('Não restou ninguém do grupo.');
    }
  }

  gameOver(reason) {
    this.over = true;
    this.overReason = reason;
    this.msg(reason, 'danger');
  }

  // Atividade resumida, para ícones e painel.
  activity(u) {
    const t = u.task;
    if (!t) return 'idle';
    if (u.phase === 'drop' || t.kind === 'drop') return 'drop';
    if (t.kind === 'gather') return t.res;
    if (t.kind === 'build') return t.b.complete ? 'repair' : 'build';
    return t.kind; // move, loot, attack
  }

  describeTask(u) {
    const t = u.task;
    if (!t) return 'Parado';
    if (u.phase === 'drop' || t.kind === 'drop') return 'Levando recursos';
    switch (t.kind) {
      case 'move': return 'Andando';
      case 'gather': return t.res === 'wood' ? 'Cortando madeira' : 'Quebrando pedra';
      case 'loot': return `Saqueando ${t.ruin.def.name.toLowerCase()}`;
      case 'build':
        if (!t.b.complete) return `Construindo ${t.b.def.name.toLowerCase()}`;
        if (t.b.upgrade) return `Reformando ${t.b.def.name.toLowerCase()}`;
        return `Consertando ${t.b.def.name.toLowerCase()}`;
      case 'attack': return 'Atacando';
      default: return '';
    }
  }
}
