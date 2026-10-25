// Constantes e tabelas de balanceamento do jogo.
// Posições da simulação são em unidades de tile (float); TILE só importa para o desenho.

export const TILE = 32;
export const MAP_W = 128;
export const MAP_H = 128;
export const CHUNK = 16;

export const T = { GRASS: 0, DIRT: 1, SAND: 2, WATER: 3, TREE: 4, ROCK: 5, ROAD: 6, RUBBLE: 7 };
export const PASSABLE = [true, true, true, false, false, false, true, true];

export const TREE_AMOUNT = 30;
export const ROCK_AMOUNT = 60;

// Um ciclo = dia + noite, em segundos de jogo.
export const DAY_LENGTH = 150;
export const NIGHT_LENGTH = 90;
export const WIN_DAY = 10; // sobreviver a 10 noites
export const FIRST_HORDE_NIGHT = 2; // a primeira noite é calma

export const RES_NAMES = { wood: 'Madeira', stone: 'Pedra', food: 'Comida', scrap: 'Sucata' };
export const RES_ORDER = ['wood', 'stone', 'food', 'scrap'];

export const START_RES = { wood: 120, stone: 40, food: 120, scrap: 0 };
export const START_UNITS = 5;
export const FOOD_PER_SURVIVOR = 4; // consumido a cada amanhecer

export const UNIT = {
  hp: 60,
  speed: 2.6,
  radius: 0.25,
  range: 4.5,
  dmg: 7,
  cooldown: 1.1,
  capacity: 10,
  sight: 7,
  sightNight: 5,
};

export const GATHER_TIME = { wood: 0.7, stone: 1.0 };
export const LOOT_TIME = 2.5;
export const LOOT_CAPACITY = 12;
export const REPAIR_RATE = 15; // pontos de vida por segundo por sobrevivente
export const REPAIR_HP_PER_WOOD = 10;

export const ZOMBIES = {
  walker: { name: 'Errante', hp: 40, speed: 0.9, dmg: 8, cooldown: 1.2, radius: 0.3, buildingMult: 1 },
  runner: { name: 'Corredor', hp: 25, speed: 2.1, dmg: 6, cooldown: 0.8, radius: 0.25, buildingMult: 0.6 },
  brute: { name: 'Brutamontes', hp: 180, speed: 0.65, dmg: 22, cooldown: 1.6, radius: 0.42, buildingMult: 2.5 },
};

export const BUILDINGS = {
  hq: {
    name: 'Acampamento', w: 3, h: 3, hp: 1500, cost: {}, buildTime: 1, pop: 5, dropoff: true, sight: 8,
    desc: 'O coração do grupo. Se cair, acabou.',
    levels: [
      { name: 'Acampamento fortificado', cost: { wood: 120, stone: 60 }, buildTime: 30, hp: 2200, pop: 8, sight: 9, desc: 'Abriga 8 e aguenta mais.' },
      { name: 'Base de sobreviventes', cost: { wood: 200, stone: 120, scrap: 40 }, buildTime: 45, hp: 3200, pop: 12, sight: 10, desc: 'Abriga 12. Salão de pedra e madeira.' },
    ],
  },
  tent: {
    name: 'Barraca', w: 2, h: 2, hp: 220, cost: { wood: 30 }, buildTime: 10, pop: 3, sight: 4, key: 'b',
    desc: 'Abriga mais 3 sobreviventes.',
    levels: [
      { name: 'Cabana de toras', cost: { wood: 45, stone: 10 }, buildTime: 14, hp: 420, pop: 5, desc: 'Abriga 5.' },
      { name: 'Casa de tijolos', cost: { wood: 40, stone: 50, scrap: 10 }, buildTime: 20, hp: 750, pop: 7, desc: 'Abriga 7.' },
    ],
  },
  depot: {
    name: 'Depósito', w: 2, h: 2, hp: 320, cost: { wood: 40 }, buildTime: 12, dropoff: true, sight: 5, key: 'd',
    desc: 'Ponto de entrega perto dos recursos.',
    levels: [
      { name: 'Armazém', cost: { wood: 60, stone: 30 }, buildTime: 18, hp: 650, bonus: 0.2, desc: 'Cada entrega rende 20% a mais.' },
    ],
  },
  palisade: {
    name: 'Cerca de madeira', w: 1, h: 1, hp: 180, cost: { wood: 5 }, buildTime: 2.5, wall: true, sight: 2, key: 'c',
    desc: 'Barreira barata. Arraste para fazer uma linha.',
    levels: [
      { name: 'Cerca com espetos', cost: { wood: 6, scrap: 2 }, buildTime: 3, hp: 260, thorns: 4, desc: 'Fere quem bate nela.' },
    ],
  },
  stonewall: {
    name: 'Muro de pedra', w: 1, h: 1, hp: 520, cost: { stone: 8 }, buildTime: 5, wall: true, sight: 2, key: 'm',
    desc: 'Aguenta muito mais pancada. Arraste para fazer uma linha.',
    levels: [
      { name: 'Muralha', cost: { stone: 10, scrap: 2 }, buildTime: 6, hp: 950, desc: 'Quase o dobro de vida.' },
    ],
  },
  gate: {
    name: 'Portão', w: 1, h: 1, hp: 320, cost: { wood: 12, scrap: 4 }, buildTime: 6, wall: true, gate: true, sight: 2, key: 'g',
    desc: 'Sobreviventes passam, zumbis não.',
    levels: [
      { name: 'Portão de ferro', cost: { scrap: 15 }, buildTime: 8, hp: 750, desc: 'Chapas de metal rebitadas.' },
    ],
  },
  tower: {
    name: 'Torre de vigia', w: 2, h: 2, hp: 420, cost: { wood: 40, stone: 25, scrap: 10 }, buildTime: 18, sight: 10,
    range: 7.5, dmg: 12, cooldown: 0.8, key: 't',
    desc: 'Atira sozinha nos zumbis ao alcance.',
    levels: [
      { name: 'Torre de tiro', cost: { wood: 30, stone: 30, scrap: 25 }, buildTime: 20, hp: 600, range: 8.5, dmg: 18, desc: 'Mais dano e alcance.' },
      { name: 'Ninho de metralhadora', cost: { stone: 40, scrap: 60 }, buildTime: 28, hp: 850, range: 9, dmg: 9, cooldown: 0.25, desc: 'Rajadas contínuas.' },
    ],
  },
  farm: {
    name: 'Horta', w: 3, h: 3, hp: 160, cost: { wood: 50 }, buildTime: 15, sight: 3, foodInterval: 4, key: 'h',
    desc: 'Produz 1 de comida a cada 4 segundos.',
    levels: [
      { name: 'Horta irrigada', cost: { wood: 40, stone: 20 }, buildTime: 15, hp: 240, foodInterval: 2.5, desc: '1 de comida a cada 2,5 s.' },
      { name: 'Estufa', cost: { wood: 50, scrap: 30 }, buildTime: 22, hp: 320, foodInterval: 1.6, desc: '1 de comida a cada 1,6 s.' },
    ],
  },
};
// Definição efetiva de um prédio num nível (0 = básico), com o nome da linha toda preservado em `base`.
const defCache = new Map();
export function buildingDef(type, level = 0) {
  const key = `${type}:${level}`;
  let d = defCache.get(key);
  if (!d) {
    const base = BUILDINGS[type];
    d = level ? { ...base, ...base.levels[level - 1], cost: base.cost, base } : { ...base, base };
    d.maxLevel = base.levels ? base.levels.length : 0;
    defCache.set(key, d);
  }
  return d;
}

export const BUILD_ORDER = ['tent', 'depot', 'palisade', 'stonewall', 'gate', 'tower', 'farm'];

export const RECRUIT = { cost: { food: 40 }, time: 15, maxQueue: 5 };

export const RUINS = {
  casa: {
    name: 'Casa abandonada', w: 2, h: 2,
    loot: { food: [15, 35], scrap: [4, 12], wood: [5, 15] }, survivor: 0.18, lurk: 0.25,
  },
  mercado: {
    name: 'Mercadinho', w: 3, h: 2,
    loot: { food: [50, 90], scrap: [4, 10] }, survivor: 0.1, lurk: 0.45,
  },
  oficina: {
    name: 'Oficina mecânica', w: 3, h: 2,
    loot: { scrap: [30, 60], wood: [8, 20], stone: [0, 10] }, survivor: 0.1, lurk: 0.3,
  },
  cabana: {
    name: 'Cabana', w: 2, h: 2,
    loot: { food: [10, 20], wood: [10, 25] }, survivor: 0.25, lurk: 0.2,
  },
};
