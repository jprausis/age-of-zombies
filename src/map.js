import { MAP_W, MAP_H, CHUNK, PASSABLE } from './config.js';

// Grade do mundo: tipo de terreno, recurso restante, ocupação (prédios e ruínas) e névoa.
export class GameMap {
  constructor(w = MAP_W, h = MAP_H) {
    this.w = w;
    this.h = h;
    const n = w * h;
    this.tiles = new Uint8Array(n);
    this.res = new Uint16Array(n);
    this.occ = new Array(n).fill(null);
    this.explored = new Uint8Array(n);
    this.visible = new Uint8Array(n);
    this.chunkCols = Math.ceil(w / CHUNK);
    this.dirtyChunks = new Set();
    this.version = 0;
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  idx(x, y) {
    return y * this.w + x;
  }

  get(x, y) {
    return this.tiles[y * this.w + x];
  }

  set(x, y, t) {
    this.tiles[y * this.w + x] = t;
    this.markDirty(x, y);
  }

  terrainPassable(x, y) {
    return this.inBounds(x, y) && PASSABLE[this.tiles[y * this.w + x]];
  }

  // Marca o chunk do tile e os vizinhos, porque o desenho do chão olha os tiles ao lado.
  markDirty(x, y) {
    this.version++;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (!this.inBounds(nx, ny)) continue;
        this.dirtyChunks.add(Math.floor(ny / CHUNK) * this.chunkCols + Math.floor(nx / CHUNK));
      }
    }
  }
}
