// Teste de fumaça da simulação, sem navegador: node tests/sim.test.mjs
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { T, MAP_W, MAP_H, DAY_LENGTH, NIGHT_LENGTH } from '../src/config.js';

const STEP = 1 / 30;
const run = (g, seconds) => {
  for (let t = 0; t < seconds; t += STEP) g.update(STEP);
};

// 1. Geração do mundo em várias sementes
for (const seed of [1, 42, 777, 2026, 99999]) {
  const g = new Game(seed);
  const counts = new Array(8).fill(0);
  for (const t of g.map.tiles) counts[t]++;
  const pct = (n) => ((n / (MAP_W * MAP_H)) * 100).toFixed(1) + '%';
  console.log(
    `seed ${seed}: água ${pct(counts[T.WATER])} árvores ${pct(counts[T.TREE])} pedras ${pct(counts[T.ROCK])} ` +
    `estrada ${pct(counts[T.ROAD])} | cidades ${g.towns.length} ruínas ${g.ruins.length} zumbis ${g.zombies.length}`,
  );
  assert.ok(g.hq, 'acampamento existe');
  assert.equal(g.units.length, 5);
  assert.ok(g.ruins.length >= 15, 'ruínas suficientes');
  assert.ok(counts[T.TREE] > 500 && counts[T.ROCK] > 60, 'recursos suficientes');
  const touchesReachable = (r) => {
    for (let y = r.y - 1; y <= r.y + r.h; y++) {
      for (let x = r.x - 1; x <= r.x + r.w; x++) {
        if (g.map.inBounds(x, y) && Number.isFinite(g.flow.dist[g.map.idx(x, y)]) && !g.map.occ[g.map.idx(x, y)]) return true;
      }
    }
    return false;
  };
  const reachable = g.ruins.filter(touchesReachable).length;
  console.log(`  ruínas alcançáveis: ${reachable}/${g.ruins.length}`);
  assert.ok(reachable / g.ruins.length > 0.85, 'maioria das ruínas alcançável');
  const nestsOk = g.nests.filter(touchesReachable).length;
  const nd = g.nests.map((n) => Math.hypot(n.x - g.hq.x, n.y - g.hq.y).toFixed(0)).join(', ');
  console.log(`  ninhos: ${g.nests.length} (alcançáveis ${nestsOk}) a ${nd} tiles`);
  assert.equal(g.nests.length, 3, 'três ninhos');
  assert.equal(nestsOk, 3, 'todos os ninhos alcançáveis');
}

// 2. Coleta, saque e construção
const g = new Game(42);
const hq = g.hq;
const workers = g.units.filter((u) => u.role === 'catador');
const soldier = g.units.find((u) => u.role === 'soldado');
assert.equal(workers.length, 4, 'começa com 4 catadores');
assert.ok(soldier && soldier.maxHp > workers[0].maxHp, 'e 1 soldado mais resistente');
assert.equal(g.nests.length, 3, 'três ninhos no mapa');
const [a, b, c, e] = workers;
const d = c;
const tree = g.findNearestTile(hq.x + 1, hq.y + 1, T.TREE, 30);
const rock = g.findNearestTile(hq.x + 1, hq.y + 1, T.ROCK, 30);
assert.ok(tree && rock, 'há árvore e pedra perto do acampamento');
console.log('árvore a', Math.hypot(tree[0] - hq.x, tree[1] - hq.y).toFixed(1), 'pedra a', Math.hypot(rock[0] - hq.x, rock[1] - hq.y).toFixed(1));
// Revela tudo para poder dar ordens em tiles fora da visão inicial.
g.map.explored.fill(1);
assert.equal(g.orderSmart([a, b], tree[0] + 0.5, tree[1] + 0.5), 'gather');
assert.equal(g.orderSmart([b], rock[0] + 0.5, rock[1] + 0.5), 'gather');
// Soldado mandado coletar só faz escolta.
g.orderSmart([soldier], tree[0] + 0.5, tree[1] + 0.5);
assert.equal(soldier.task?.kind, 'move', 'soldado não coleta');

const ruin = [...g.ruins].sort((r1, r2) => Math.hypot(r1.x - hq.x, r1.y - hq.y) - Math.hypot(r2.x - hq.x, r2.y - hq.y))[0];
ruin.lurkers = 0;
assert.equal(g.orderSmart([d], ruin.x + 0.5, ruin.y + 0.5), 'loot');

// Constrói uma linha de cercas e uma barraca com o último sobrevivente.
const spot = { x: hq.x + 5, y: hq.y - 1 };
let placed = g.placeBuilding('tent', spot.x, spot.y, [e]);
assert.ok(placed.ok, 'barraca posicionada: ' + placed.reason);
const res0 = { ...g.res };
const t0 = performance.now();
run(g, 60);
console.log('após 60s:', JSON.stringify(g.res), 'tarefas:', g.units.map((u) => g.describeTask(u)).join(' | '));
assert.ok(g.res.wood > res0.wood, 'madeira aumentou');
assert.ok(g.res.stone > res0.stone, 'pedra aumentou');
assert.ok(placed.building.complete, 'barraca concluída');
assert.equal(g.popCap, 8);

// 3. Recrutamento
assert.ok(g.recruit().ok);
run(g, 16);
assert.equal(g.units.length + g.stats.lost, 6 + g.stats.rescued, 'recruta chegou');

// 3b. Evolução: barraca vira cabana (abrigo 3 -> 5) usando quem estiver parado
g.res.wood += 100;
g.res.stone += 20;
const tent = placed.building;
const capBefore = g.popCap;
for (const u of g.units) g.setTask(u, null);
const up = g.startUpgrade(tent);
assert.ok(up.ok, 'reforma começou: ' + up.reason);
run(g, 25);
assert.equal(tent.level, 1, 'barraca evoluiu');
assert.equal(tent.def.name, 'Cabana de toras');
assert.equal(g.popCap, capBefore + 2, 'abrigo aumentou');
console.log('evolução ok:', tent.def.name, 'abrigo', g.popCap);

// 4. Primeira noite calma; na segunda, a horda nasce e vai em direção ao acampamento
run(g, DAY_LENGTH - g.clock + 2);
assert.equal(g.hordeRemaining, 0, 'primeira noite sem horda');
run(g, DAY_LENGTH + NIGHT_LENGTH - g.clock + 1); // amanhece no dia 2
assert.equal(g.day, 2);
run(g, DAY_LENGTH - g.clock - 1);
const before = g.zombies.length;
run(g, 2);
const horde = g.zombies.filter((z) => z.mode === 'horde');
console.log(`noite: ${before} → ${g.zombies.length} zumbis, ${horde.length} em horda`);
assert.ok(horde.length >= 8, 'horda nasceu');
const avgDist = (zs) => zs.reduce((s, z) => s + Math.hypot(z.x - hq.x, z.y - hq.y), 0) / zs.length;
const d0 = avgDist(horde);
run(g, 20);
const alive = horde.filter((z) => !z.dead);
const d1 = avgDist(alive);
console.log(`distância média da horda: ${d0.toFixed(1)} → ${d1.toFixed(1)}`);
assert.ok(d1 < d0 - 5, 'horda se aproxima');

// 5. Muro fechado: zumbis atacam a parede
const g2 = new Game(7);
g2.map.explored.fill(1);
g2.res.wood = 9999;
const h2 = g2.hq;
let walls = 0;
for (let x = h2.x - 3; x <= h2.x + 5; x++) {
  for (const y of [h2.y - 3, h2.y + 5]) if (g2.placeBuilding('palisade', x, y).ok) walls++;
}
for (let y = h2.y - 2; y <= h2.y + 4; y++) {
  for (const x of [h2.x - 3, h2.x + 5]) if (g2.placeBuilding('palisade', x, y).ok) walls++;
}
for (const bb of g2.buildings) if (bb.def.wall) { bb.complete = true; bb.progress = 1; bb.hp = bb.maxHp; }
g2.flowDirty = true;
console.log('cercas colocadas:', walls);
g2.zombies.length = 0;
for (let i = 0; i < 8; i++) g2.spawnZombie('walker', h2.x + 1.5 + i * 0.3, h2.y - 12.5, 'horde');
run(g2, 40);
const damaged = g2.buildings.filter((bb) => bb.def.wall && bb.hp < bb.maxHp).length;
const bashing = g2.zombies.filter((z) => z.bash).length;
console.log(`muros danificados: ${damaged}, zumbis batendo: ${bashing}, vida do QG: ${g2.hq?.hp}`);
assert.ok(damaged > 0 || g2.stats.kills > 0, 'zumbis chegam à cerca');

// 5b. Ninho: um pelotão chega, atira, o ninho reage com defensores e acaba caindo.
{
  const g4 = new Game(31);
  g4.map.explored.fill(1);
  const nest = g4.nests[0];
  const nc = { x: nest.x + 1.5, y: nest.y + 1.5 };
  // Pelotão de 10 soldados ao lado do ninho, com vida de sobra para o teste.
  g4.units.length = 0;
  const squad = [];
  for (let i = 0; i < 10; i++) {
    const u = g4.spawnUnit(nc.x, nc.y + 4, 'soldado');
    u.hp = u.maxHp = 5000;
    squad.push(u);
  }
  assert.equal(g4.orderSmart(squad, nc.x, nc.y, nest), 'attack');
  assert.equal(squad[0].task.kind, 'assault');
  let sawDefenders = false;
  for (let s = 0; s < 120 && !nest.dead; s += STEP) {
    g4.update(STEP);
    if (g4.zombies.some((z) => z.defender)) sawDefenders = true;
  }
  console.log(`ninho: morto=${nest.dead} vida=${Math.ceil(nest.hp)} defensores=${sawDefenders} restam ${g4.nestsAlive}`);
  assert.ok(sawDefenders, 'ninho manda defensores');
  assert.ok(nest.dead, 'ninho destruído');
  assert.equal(g4.nestsAlive, 2);
  assert.ok(!g4.won, 'ainda não venceu');
  for (const n of g4.nests) if (!n.dead) g4.destroyNest(n);
  assert.ok(g4.won, 'vence ao destruir todos os ninhos');

  // Hordas saem de um ninho vivo.
  const g5 = new Game(8);
  g5.day = 3;
  g5.clock = DAY_LENGTH - 26;
  run(g5, 2);
  const origin = g5.hordeNest;
  assert.ok(origin, 'horda tem ninho de origem');
  run(g5, 26);
  const hz = g5.zombies.filter((z) => z.mode === 'horde');
  const near = hz.filter((z) => Math.hypot(z.x - origin.x - 1.5, z.y - origin.y - 1.5) < 10).length;
  console.log(`horda do ninho: ${hz.length} zumbis, ${near} perto da origem`);
  assert.ok(hz.length >= 8 && near / hz.length > 0.7, 'horda nasce perto do ninho');
}

// 6. Partida longa sem jogador: não pode quebrar
const g3 = new Game(2026);
const t1 = performance.now();
let ticks = 0;
for (let s = 0; s < (DAY_LENGTH + NIGHT_LENGTH) * 3 && !g3.over; s += STEP) {
  g3.update(STEP);
  ticks++;
}
const ms = (performance.now() - t1) / ticks;
console.log(`partida passiva: dia ${g3.day}, acabou=${g3.over} (${g3.overReason}), zumbis ${g3.zombies.length}, ${ms.toFixed(3)} ms/tick`);
console.log(`tempo total coleta ${(performance.now() - t0).toFixed(0)} ms`);
console.log('OK');
