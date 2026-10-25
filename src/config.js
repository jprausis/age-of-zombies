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
  },
  tent: {
    name: 'Barraca', w: 2, h: 2, hp: 220, cost: { wood: 30 }, buildTime: 10, pop: 3, sight: 4, key: 'b',
    desc: 'Abriga mais 3 sobreviventes.',
  },
  depot: {
    name: 'Depósito', w: 2, h: 2, hp: 320, cost: { wood: 40 }, buildTime: 12, dropoff: true, sight: 5, key: 'd',
    desc: 'Ponto de entrega perto dos recursos.',
  },
  palisade: {
    name: 'Cerca de madeira', w: 1, h: 1, hp: 180, cost: { wood: 5 }, buildTime: 2.5, wall: true, sight: 2, key: 'c',
    desc: 'Barreira barata. Arraste para fazer uma linha.',
  },
  stonewall: {
    name: 'Muro de pedra', w: 1, h: 1, hp: 520, cost: { stone: 8 }, buildTime: 5, wall: true, sight: 2, key: 'm',
    desc: 'Aguenta muito mais pancada. Arraste para fazer uma linha.',
  },
  gate: {
    name: 'Portão', w: 1, h: 1, hp: 320, cost: { wood: 12, scrap: 4 }, buildTime: 6, wall: true, gate: true, sight: 2, key: 'g',
    desc: 'Sobreviventes passam, zumbis não.',
  },
  tower: {
    name: 'Torre de vigia', w: 2, h: 2, hp: 420, cost: { wood: 40, stone: 25, scrap: 10 }, buildTime: 18, sight: 10,
    range: 7.5, dmg: 12, cooldown: 0.8, key: 't',
    desc: 'Atira sozinha nos zumbis ao alcance.',
  },
  farm: {
    name: 'Horta', w: 3, h: 3, hp: 160, cost: { wood: 50 }, buildTime: 15, sight: 3, foodInterval: 4, key: 'h',
    desc: 'Produz 1 de comida a cada 4 segundos.',
  },
};
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
