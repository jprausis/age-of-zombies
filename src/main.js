import { Game } from './game.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { HUD } from './ui.js';

const STEP = 1 / 30; // passo fixo da simulação

const canvas = document.getElementById('game');
const minimap = document.getElementById('minimap');

const state = {
  game: new Game(),
  cam: { x: 0, y: 0, zoom: 0.9 },
  selection: new Set(),
  selected: null,
  buildType: null,
  wallStart: null,
  ghost: null,
  dragStart: null,
  dragBox: null,
  mouse: { x: 0, y: 0, inside: false },
  keys: new Set(),
  groups: {},
  markers: [],
  speed: 1,
  paused: false,
  started: false,
  continueAfterWin: false,
  endShown: false,
  winShown: false,
};

const renderer = new Renderer(canvas, state.game);
let input;
const hud = new HUD(state, {
  start() {
    state.started = true;
    document.getElementById('screen-start').hidden = true;
    canvas.focus();
  },
  newGame() {
    state.game = new Game();
    renderer.setGame(state.game);
    Object.assign(state, {
      selection: new Set(), selected: null, buildType: null, wallStart: null, ghost: null, groups: {}, markers: [],
      paused: false, continueAfterWin: false, endShown: false, winShown: false, started: true,
    });
    for (const id of ['screen-end', 'screen-pause', 'screen-start']) document.getElementById(id).hidden = true;
    document.getElementById('btn-pause').textContent = 'Pausar';
    centerOnCamp();
  },
  centerOn: (tx, ty) => input.centerOn(tx, ty),
  commandAt: (tx, ty) => input.commandAt(tx, ty),
  startBuild: (type) => input.startBuild(type),
  miniToTile: (u, v) => renderer.miniToTile(u, v),
});
input = new Input(canvas, state, renderer, hud);
// Acesso ao estado pelo console: abra com ?debug na URL.
if (new URLSearchParams(location.search).has('debug')) window.aoz = { state, input, renderer };

function centerOnCamp() {
  const hq = state.game.hq;
  if (hq) input.centerOn(hq.x + 1.5, hq.y + 1.5);
}

function resize() {
  renderer.resize(window.innerWidth, window.innerHeight);
  const top = document.getElementById('topbar').offsetHeight;
  document.documentElement.style.setProperty('--top-h', `${top}px`);
  input.clamp();
}
window.addEventListener('resize', resize);
resize();
centerOnCamp();

let last = performance.now();
let acc = 0;
let miniT = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const g = state.game;
  const running = state.started && !state.paused && !g.over && !(g.won && !state.continueAfterWin);
  if (running) {
    acc += dt * state.speed;
    let steps = 0;
    while (acc >= STEP && steps < 12) {
      g.update(STEP);
      acc -= STEP;
      steps++;
    }
    if (steps === 12) acc = 0;
  }
  input.update(dt);
  renderer.draw(state, now / 1000);
  if (now - miniT > 200) {
    miniT = now;
    renderer.drawMinimap(minimap, state);
  }
  hud.update(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
