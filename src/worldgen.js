import { T, TREE_AMOUNT, ROCK_AMOUNT, RUINS, START_ROLES, NEST } from './config.js';
import { makeNoise } from './rng.js';

const TOWN_NAMES = ['Vila Esperança', 'São Bento', 'Pedra Branca', 'Porto Velho', 'Santa Clara', 'Boa Vista', 'Rio Seco'];

// Gera terreno, recursos, cidades abandonadas, o acampamento inicial e os primeiros zumbis.
export function generateWorld(game, rng) {
  const m = game.map;
  const W = m.w, H = m.h;
  const cx = W >> 1, cy = H >> 1;
  const elev = makeNoise(rng), forest = makeNoise(rng), rock = makeNoise(rng), dirt = makeNoise(rng);

  const setTile = (x, y, t) => {
    const i = m.idx(x, y);
    m.tiles[i] = t;
    m.res[i] = t === T.TREE ? TREE_AMOUNT : t === T.ROCK ? ROCK_AMOUNT : 0;
  };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - cx, y - cy);
      const e = elev(x / 26, y / 26) + Math.max(0, 16 - d) * 0.015;
      let t = T.GRASS;
      if (e < 0.34) t = T.WATER;
      else if (e < 0.37) t = T.SAND;
      else {
        const r = rock(x / 7, y / 7), f = forest(x / 12, y / 12);
        if (r > 0.7) t = T.ROCK;
        else if (f > 0.57 && rng() < 0.9) t = T.TREE;
        else if (f > 0.5 && rng() < 0.22) t = T.TREE;
        else if (dirt(x / 10, y / 10) > 0.63) t = T.DIRT;
      }
      if (d < 9) t = d < 4.5 ? T.DIRT : T.GRASS;
      setTile(x, y, t);
    }
  }

  // Garante madeira e pedra a uma caminhada curta do acampamento.
  const cluster = (type, angle, distance, radius, density) => {
    const px = cx + Math.cos(angle) * distance, py = cy + Math.sin(angle) * distance;
    for (let y = Math.floor(py - radius); y <= py + radius; y++) {
      for (let x = Math.floor(px - radius); x <= px + radius; x++) {
        if (!m.inBounds(x, y) || Math.hypot(x - px, y - py) > radius) continue;
        if (m.get(x, y) === T.WATER || !rng.chance(density)) continue;
        setTile(x, y, type);
      }
    }
  };
  const a0 = rng() * Math.PI * 2;
  cluster(T.TREE, a0, 14, 4, 0.8);
  cluster(T.TREE, a0 + 2.2, 17, 3.5, 0.75);
  cluster(T.ROCK, a0 + Math.PI * 0.85, 15, 2.4, 0.85);

  // Cidades: posição, ruas e depois as casas ao longo das ruas.
  const towns = [];
  for (let tries = 0; towns.length < 4 && tries < 400; tries++) {
    const a = rng() * Math.PI * 2, r = rng.range(30, 52);
    const tx = Math.round(cx + Math.cos(a) * r), ty = Math.round(cy + Math.sin(a) * r);
    if (tx < 16 || ty < 16 || tx > W - 17 || ty > H - 17) continue;
    if (towns.some((t) => Math.hypot(t.x - tx, t.y - ty) < 30)) continue;
    towns.push({ x: tx, y: ty, horizontal: rng.chance(0.5), name: TOWN_NAMES[towns.length % TOWN_NAMES.length] });
  }

  for (const town of towns) {
    for (let y = town.y - 13; y <= town.y + 13; y++) {
      for (let x = town.x - 13; x <= town.x + 13; x++) {
        if (!m.inBounds(x, y) || Math.hypot(x - town.x, y - town.y) > 12.5) continue;
        const t = m.get(x, y);
        if (t === T.WATER || t === T.SAND) setTile(x, y, T.GRASS);
        else if (t === T.TREE && rng.chance(0.75)) setTile(x, y, T.GRASS);
        else if (t === T.ROCK) setTile(x, y, T.DIRT);
      }
    }
    town.mainLen = rng.int(22, 28);
    town.crossOffset = rng.int(-6, 6);
    town.crossLen = rng.int(12, 16);
    roadSegment(m, setTile, town, town.mainLen, town.horizontal);
    roadSegment(m, setTile, { ...town, x: town.horizontal ? town.x + town.crossOffset : town.x, y: town.horizontal ? town.y : town.y + town.crossOffset }, town.crossLen, !town.horizontal);
  }

  for (const town of towns) connectRoad(m, setTile, cx, cy, town.x, town.y, rng);

  const placeRuin = (type, x, y, w, h) => {
    if (x < 2 || y < 2 || x + w > W - 2 || y + h > H - 2) return null;
    for (let yy = y - 1; yy <= y + h; yy++) {
      for (let xx = x - 1; xx <= x + w; xx++) {
        const t = m.get(xx, yy);
        if (t === T.ROAD || m.occ[m.idx(xx, yy)]) return null;
        const inside = xx >= x && xx < x + w && yy >= y && yy < y + h;
        if (inside && t === T.WATER) return null;
      }
    }
    for (let yy = y - 1; yy <= y + h; yy++) {
      for (let xx = x - 1; xx <= x + w; xx++) {
        const inside = xx >= x && xx < x + w && yy >= y && yy < y + h;
        const t = m.get(xx, yy);
        if (inside) setTile(xx, yy, T.DIRT);
        else if (t === T.TREE || t === T.ROCK || t === T.WATER) setTile(xx, yy, rng.chance(0.5) ? T.RUBBLE : T.GRASS);
      }
    }
    return game.createRuin(type, x, y, w, h);
  };

  for (const town of towns) {
    town.ruins = [];
    const streets = [
      { x: town.x, y: town.y, len: town.mainLen, horizontal: town.horizontal },
      {
        x: town.horizontal ? town.x + town.crossOffset : town.x,
        y: town.horizontal ? town.y : town.y + town.crossOffset,
        len: town.crossLen,
        horizontal: !town.horizontal,
      },
    ];
    for (const s of streets) {
      const half = Math.floor(s.len / 2);
      for (let p = -half + 1; p < half - 2; p += rng.int(4, 5)) {
        for (const side of [-1, 1]) {
          if (!rng.chance(0.8)) continue;
          const roll = rng();
          const type = roll < 0.6 ? 'casa' : roll < 0.8 ? 'mercado' : 'oficina';
          let { w, h } = RUINS[type];
          if (!s.horizontal) [w, h] = [h, w];
          let x, y;
          if (s.horizontal) {
            x = s.x + p;
            y = side < 0 ? s.y - 1 - h : s.y + 3;
          } else {
            y = s.y + p;
            x = side < 0 ? s.x - 1 - w : s.x + 3;
          }
          const r = placeRuin(type, x, y, w, h);
          if (r) town.ruins.push(r);
        }
      }
    }
  }

  let cabins = 0;
  for (let tries = 0; cabins < 10 && tries < 200; tries++) {
    const x = rng.int(4, W - 6), y = rng.int(4, H - 6);
    const d = Math.hypot(x - cx, y - cy);
    if (d < 20 || towns.some((t) => Math.hypot(t.x - x, t.y - y) < 16)) continue;
    if (placeRuin('cabana', x, y, 2, 2)) cabins++;
  }

  // Duas casas a uma caminhada curta, para garantir comida no começo.
  let near = 0;
  for (let tries = 0; near < 2 && tries < 400; tries++) {
    const a = rng() * Math.PI * 2, d = rng.range(11, 17);
    const r = placeRuin('casa', Math.round(cx + Math.cos(a) * d) - 1, Math.round(cy + Math.sin(a) * d) - 1, 2, 2);
    if (!r) continue;
    r.lurkers = 0;
    r.loot.food = Math.max(r.loot.food, 25);
    near++;
  }

  // Ninhos longe do acampamento e longe uns dos outros, em clareiras abertas na marra.
  const nests = [];
  for (let tries = 0; nests.length < NEST.count && tries < 600; tries++) {
    const a = rng() * Math.PI * 2, r = rng.range(40, 56);
    const x = Math.round(cx + Math.cos(a) * r) - 1, y = Math.round(cy + Math.sin(a) * r) - 1;
    if (x < 6 || y < 6 || x + NEST.w > W - 6 || y + NEST.h > H - 6) continue;
    if (nests.some((n) => Math.hypot(n.x - x, n.y - y) < 38 - tries / 40)) continue;
    if (towns.some((t) => Math.hypot(t.x - x, t.y - y) < 15)) continue;
    let clash = false;
    for (let yy = y - 3; yy < y + NEST.h + 3 && !clash; yy++) {
      for (let xx = x - 3; xx < x + NEST.w + 3; xx++) if (m.occ[m.idx(xx, yy)]) { clash = true; break; }
    }
    if (clash) continue;
    for (let yy = y - 3; yy < y + NEST.h + 3; yy++) {
      for (let xx = x - 3; xx < x + NEST.w + 3; xx++) {
        const d = Math.hypot(xx - x - 1, yy - y - 1);
        if (d < 3.2) setTile(xx, yy, T.DIRT);
        else if (d < 4.5) setTile(xx, yy, rng.chance(0.4) ? T.RUBBLE : T.DIRT);
      }
    }
    nests.push({ x, y, d: Math.hypot(x - cx, y - cy) });
  }
  nests.sort((p, q) => p.d - q.d);
  // Abre uma trilha até cada ninho, para não ficarem ilhados atrás de água ou pedra.
  nests.forEach((n, k) => {
    connectRoad(m, setTile, cx, cy, n.x + 1, n.y + 1, rng);
    game.createNest(n.x, n.y, NEST.hp[Math.min(k, NEST.hp.length - 1)]);
  });

  const hq = game.createBuilding('hq', cx - 1, cy - 1, true);
  START_ROLES.forEach((role, i) => {
    const a = (i / START_ROLES.length) * Math.PI * 2;
    game.spawnUnit(cx + 0.5 + Math.cos(a) * 3, cy + 0.5 + Math.sin(a) * 3, role);
  });

  const randomPassable = (px, py, radius, minFromCamp) => {
    for (let k = 0; k < 40; k++) {
      const x = Math.floor(px + rng.range(-radius, radius)), y = Math.floor(py + rng.range(-radius, radius));
      if (!m.inBounds(x, y) || game.blockZombie(x, y)) continue;
      if (Math.hypot(x - cx, y - cy) < minFromCamp) continue;
      return [x + 0.5, y + 0.5];
    }
    return null;
  };
  for (const town of towns) {
    const n = rng.int(5, 9);
    for (let i = 0; i < n; i++) {
      const p = randomPassable(town.x, town.y, 11, 22);
      if (p) game.spawnZombie('walker', p[0], p[1], 'wander');
    }
  }
  for (let i = 0; i < 22; i++) {
    const p = randomPassable(cx, cy, W / 2 - 2, 26);
    if (p) game.spawnZombie('walker', p[0], p[1], 'wander');
  }

  for (const n of game.nests) {
    for (let i = 0; i < NEST.guards; i++) {
      const p = randomPassable(n.x + 1.5, n.y + 1.5, 4, 22);
      if (p) game.spawnZombie('walker', p[0], p[1], 'wander').home = n;
    }
  }

  game.towns = towns;
  return hq;
}

function roadSegment(m, setTile, center, len, horizontal) {
  const half = Math.floor(len / 2);
  for (let p = -half; p <= half; p++) {
    for (let w = 0; w < 2; w++) {
      const x = horizontal ? center.x + p : center.x + w;
      const y = horizontal ? center.y + w : center.y + p;
      if (m.inBounds(x, y)) setTile(x, y, T.ROAD);
    }
  }
}

// Trilha de terra do acampamento até a cidade, com leve curva; vira ponte (asfalto) sobre a água.
function connectRoad(m, setTile, x0, y0, x1, y1, rng) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
  const bend = rng.range(-8, 8);
  const steps = Math.ceil(len * 2);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const off = Math.sin(t * Math.PI) * bend;
    const x = Math.floor(x0 + (x1 - x0) * t + nx * off);
    const y = Math.floor(y0 + (y1 - y0) * t + ny * off);
    if (Math.hypot(x - x0, y - y0) < 6) continue;
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const nx = x + dx, ny = y + dy;
        if (!m.inBounds(nx, ny) || m.occ[m.idx(nx, ny)] || m.get(nx, ny) === T.ROAD) continue;
        setTile(nx, ny, m.get(nx, ny) === T.WATER ? T.ROAD : T.DIRT);
      }
    }
  }
}
