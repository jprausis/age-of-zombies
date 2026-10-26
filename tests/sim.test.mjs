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

// 4. Primeira noite calma; na segunda, os errantes perto do acampamento atacam
for (let i = 0; i < 10; i++) {
  const a = (i / 10) * Math.PI * 2;
  const spot = g.freeTileNear(Math.round(hq.x + 1 + Math.cos(a) * 19), Math.round(hq.y + 1 + Math.sin(a) * 19), (x, y) => !g.blockZombie(x, y), 4);
  if (spot) g.spawnZombie('walker', spot[0] + 0.5, spot[1] + 0.5, 'wander');
}
run(g, DAY_LENGTH - g.clock + 2);
assert.equal(g.hordeRemaining, 0, 'primeira noite sem ataque');
run(g, DAY_LENGTH + NIGHT_LENGTH - g.clock + 1); // amanhece no dia 2
assert.equal(g.day, 2);
for (let i = 0; i < 10; i++) {
  const a = (i / 10) * Math.PI * 2;
  const spot = g.freeTileNear(Math.round(hq.x + 1 + Math.cos(a) * 19), Math.round(hq.y + 1 + Math.sin(a) * 19), (x, y) => !g.blockZombie(x, y), 4);
  if (spot) g.spawnZombie('walker', spot[0] + 0.5, spot[1] + 0.5, 'wander');
}
run(g, DAY_LENGTH - g.clock - 1);
const nearCamp = g.zombiesNearCamp().length;
run(g, 2);
const horde = g.zombies.filter((z) => z.mode === 'horde');
console.log(`noite: ${nearCamp} errantes perto do acampamento, ${horde.length} atacando`);
assert.ok(horde.length >= 6 && horde.length >= nearCamp * 0.8, 'errantes por perto atacam à noite');
assert.ok(!g.zombies.some((z) => z.mode === 'horde' && Math.hypot(z.x - hq.x, z.y - hq.y) > 30), 'quem está longe não vem');
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

  // Ninhos soltam zumbis com o tempo, cada vez mais rápido, e eles se espalham pelo mapa.
  const g5 = new Game(8);
  const n5 = g5.nests[0];
  const c5 = { x: n5.x + 1.5, y: n5.y + 1.5 };
  run(g5, 120);
  const day1 = g5.zombies.filter((z) => z.from === n5);
  const far = day1.filter((z) => Math.hypot(z.x - c5.x, z.y - c5.y) > 8).length;
  console.log(`ninho em 120 s (dia 1): ${day1.length} soltos, ${far} já a mais de 8 tiles`);
  assert.ok(day1.length >= 3 && day1.length <= 7, 'ritmo do dia 1');
  assert.ok(far >= 1, 'zumbis soltos se espalham');
  g5.day = 6;
  const before5 = g5.zombies.filter((z) => z.from === n5).length;
  run(g5, 60);
  const gained = g5.zombies.filter((z) => z.from === n5).length - before5;
  console.log(`ninho no dia 6: +${gained} em 60 s (um a cada ${g5.nestSpawnEvery} s)`);
  assert.ok(gained >= 3, 'solta mais rápido com os dias');
  g5.destroyNest(n5);
  const after = g5.zombies.filter((z) => z.from === n5).length;
  run(g5, 60);
  assert.equal(g5.zombies.filter((z) => z.from === n5 && !z.dead).length <= after, true, 'ninho destruído para de soltar');
}

// 5c. Sucata: veículos no mapa, desmontar rende sucata, e o ferro-velho produz sozinho.
{
  const g6 = new Game(42);
  g6.map.explored.fill(1);
  const cars = g6.ruins.filter((r) => r.def.vehicle);
  console.log(`veículos: ${cars.length}`);
  assert.ok(cars.length >= 12, 'há veículos no mapa');
  const car = [...cars].sort((p, q) => Math.hypot(p.x - g6.hq.x, p.y - g6.hq.y) - Math.hypot(q.x - g6.hq.x, q.y - g6.hq.y))[0];
  car.lurkers = 0;
  const pickers = g6.units.filter((u) => u.role === 'catador').slice(0, 2);
  assert.equal(g6.orderSmart(pickers, car.x + 0.5, car.y + 0.5), 'loot');
  assert.ok(g6.describeTask(pickers[0]).startsWith('Desmontando'));
  const scrap0 = g6.res.scrap;
  run(g6, 45);
  console.log(`desmonte: sucata ${scrap0} → ${g6.res.scrap}`);
  assert.ok(g6.res.scrap > scrap0 + 10, 'desmontar rende sucata');

  g6.res.wood += 200; g6.res.stone += 100;
  const spot = g6.freeTileNear(g6.hq.x - 6, g6.hq.y - 6, (x, y) => g6.canPlace('scrapyard', x, y).ok, 10);
  const yard = g6.placeBuilding('scrapyard', spot[0], spot[1]).building;
  yard.complete = true; yard.hp = yard.maxHp;
  const s1 = g6.res.scrap;
  for (const u of g6.units) g6.setTask(u, null);
  run(g6, 35);
  console.log(`ferro-velho: +${g6.res.scrap - s1} sucata em 35 s`);
  assert.ok(g6.res.scrap - s1 >= 4, 'ferro-velho produz sucata');
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
