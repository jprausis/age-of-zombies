import { MAP_W, MAP_H } from './config.js';
import { MinHeap } from './heap.js';

// A* em grade com 8 direções, sem cortar quinas. Buffers reaproveitados entre chamadas.
const N = MAP_W * MAP_H;
const SQ2 = Math.SQRT2;
const gScore = new Float64Array(N);
const came = new Int32Array(N);
const openGen = new Uint32Array(N);
const closedGen = new Uint32Array(N);
const heap = new MinHeap();
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];
let gen = 0;

// goal: { x0, y0, x1, y1, adjacent }. Com adjacent, o alvo é qualquer tile encostado no retângulo.
export function findPath(walk, sx, sy, goal, { partial = false, maxIter = 9000 } = {}) {
  const { x0, y0, x1, y1, adjacent } = goal;
  const gx0 = adjacent ? x0 - 1 : x0, gy0 = adjacent ? y0 - 1 : y0;
  const gx1 = adjacent ? x1 + 1 : x1, gy1 = adjacent ? y1 + 1 : y1;
  const isGoal = (x, y) =>
    x >= gx0 && x <= gx1 && y >= gy0 && y <= gy1 && !(adjacent && x >= x0 && x <= x1 && y >= y0 && y <= y1);
  const h = (x, y) => {
    const dx = Math.max(gx0 - x, 0, x - gx1);
    const dy = Math.max(gy0 - y, 0, y - gy1);
    return Math.max(dx, dy) + (SQ2 - 1) * Math.min(dx, dy);
  };

  if (isGoal(sx, sy)) return [];
  gen++;
  heap.clear();
  const start = sy * MAP_W + sx;
  gScore[start] = 0;
  came[start] = -1;
  openGen[start] = gen;
  heap.push(start, h(sx, sy));
  let best = start, bestH = h(sx, sy), iter = 0;

  while (heap.size) {
    const cur = heap.pop();
    if (closedGen[cur] === gen) continue;
    closedGen[cur] = gen;
    const cx = cur % MAP_W, cy = (cur / MAP_W) | 0;
    if (isGoal(cx, cy)) return build(cur);
    const ch = h(cx, cy);
    if (ch < bestH) {
      bestH = ch;
      best = cur;
    }
    if (++iter > maxIter) break;
    const cg = gScore[cur];
    for (let k = 0; k < 8; k++) {
      const nx = cx + DX[k], ny = cy + DY[k];
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      if (!walk(nx, ny)) continue;
      if (k >= 4 && (!walk(nx, cy) || !walk(cx, ny))) continue;
      const n = ny * MAP_W + nx;
      if (closedGen[n] === gen) continue;
      const ng = cg + (k >= 4 ? SQ2 : 1);
      if (openGen[n] !== gen || ng < gScore[n]) {
        openGen[n] = gen;
        gScore[n] = ng;
        came[n] = cur;
        heap.push(n, ng + h(nx, ny) * 1.001);
      }
    }
  }
  return partial && best !== start ? build(best) : null;
}

function build(end) {
  const out = [];
  for (let c = end; c !== -1; c = came[c]) out.push([c % MAP_W, (c / MAP_W) | 0]);
  out.pop(); // remove o tile de partida
  return out.reverse();
}

// Linha de visão entre centros de tiles, com folga lateral para o raio da unidade.
function lineClear(ax, ay, bx, by, walk) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len === 0) return true;
  const px = (-dy / len) * 0.3, py = (dx / len) * 0.3;
  const steps = Math.ceil(len * 4);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = ax + 0.5 + dx * t, y = ay + 0.5 + dy * t;
    if (!walk(Math.floor(x), Math.floor(y))) return false;
    if (!walk(Math.floor(x + px), Math.floor(y + py))) return false;
    if (!walk(Math.floor(x - px), Math.floor(y - py))) return false;
  }
  return true;
}

// Remove pontos intermediários quando há linha reta livre (olhando até 12 nós à frente).
export function smoothPath(path, sx, sy, walk) {
  if (path.length <= 1) return path;
  const out = [];
  let ax = sx, ay = sy, i = 0;
  while (i < path.length) {
    let j = Math.min(path.length - 1, i + 12);
    while (j > i && !lineClear(ax, ay, path[j][0], path[j][1], walk)) j--;
    out.push(path[j]);
    ax = path[j][0];
    ay = path[j][1];
    i = j + 1;
  }
  return out;
}
