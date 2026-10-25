import { MAP_W, MAP_H, PASSABLE } from './config.js';
import { MinHeap } from './heap.js';

// Campo de fluxo das hordas: Dijkstra a partir de todos os prédios que não são muro.
// Muros entram como terreno caro (proporcional à vida), então a horda contorna quando
// existe brecha e, se o acampamento estiver fechado, ataca o trecho mais fraco.
const N = MAP_W * MAP_H;
const SQ2 = Math.SQRT2;
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];

export function computeFlow(game) {
  const m = game.map;
  const dist = new Float64Array(N).fill(Infinity);
  const next = new Int32Array(N).fill(-1);
  const cost = new Float32Array(N);
  const free = new Uint8Array(N);

  for (let i = 0; i < N; i++) {
    if (!PASSABLE[m.tiles[i]]) continue;
    const o = m.occ[i];
    if (!o) {
      cost[i] = 1;
      free[i] = 1;
    } else if (o.kind === 'building') {
      cost[i] = o.def.wall ? 1 + o.hp / 25 : 1;
    }
  }

  const heap = new MinHeap();
  for (const b of game.buildings) {
    if (b.def.wall) continue;
    for (let y = b.y; y < b.y + b.h; y++) {
      for (let x = b.x; x < b.x + b.w; x++) {
        const i = y * MAP_W + x;
        dist[i] = 0;
        heap.push(i, 0);
      }
    }
  }

  while (heap.size) {
    const i = heap.pop();
    const d = heap.lastKey;
    if (d > dist[i]) continue;
    const x = i % MAP_W, y = (i / MAP_W) | 0;
    for (let k = 0; k < 8; k++) {
      const nx = x + DX[k], ny = y + DY[k];
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      const n = ny * MAP_W + nx;
      const c = cost[n];
      if (!c) continue;
      if (k >= 4 && (!free[y * MAP_W + nx] || !free[ny * MAP_W + x])) continue;
      const nd = d + c * (k >= 4 ? SQ2 : 1);
      if (nd < dist[n]) {
        dist[n] = nd;
        heap.push(n, nd);
      }
    }
  }

  for (let i = 0; i < N; i++) {
    if (!(dist[i] > 0) || dist[i] === Infinity) continue;
    const x = i % MAP_W, y = (i / MAP_W) | 0;
    let best = -1, bd = dist[i];
    for (let k = 0; k < 8; k++) {
      const nx = x + DX[k], ny = y + DY[k];
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      if (k >= 4 && (!free[y * MAP_W + nx] || !free[ny * MAP_W + x])) continue;
      const n = ny * MAP_W + nx;
      if (dist[n] < bd) {
        bd = dist[n];
        best = n;
      }
    }
    next[i] = best;
  }

  return { dist, next };
}
