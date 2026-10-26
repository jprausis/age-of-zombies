import { BUILDINGS, BUILD_ORDER, RES_NAMES, RES_ORDER, RECRUIT, ROLES, ROLE_ORDER, NEST, DAY_LENGTH, NIGHT_LENGTH, FIRST_HORDE_NIGHT, T } from './config.js';
import { ACT_COLOR, drawUnit, drawZombie } from './draw/actors.js';
import { drawRuin, drawNest, drawHQ, drawTent, drawDepot, drawFarm, drawTower, drawWall } from './draw/buildings.js';
import { toIso, HW } from './iso.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const icon = (name, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const costHtml = (cost) =>
  `<span class="costs">${Object.keys(cost).length
    ? RES_ORDER.filter((k) => cost[k]).map((k) => `<span class="cost cost-${k}" title="${RES_NAMES[k]}">${icon(k, 'ic-sm')}${cost[k]}</span>`).join('')
    : '<span class="cost">grátis</span>'}</span>`;
const MSG_ICON = { info: 'info', warn: 'alert', danger: 'skull', good: 'check' };
const ACT_ICON = { idle: null, wood: 'wood', stone: 'stone', loot: 'food', build: 'tent', repair: 'tent', attack: 'target', drop: 'depot', move: 'walk' };
const CYCLE = DAY_LENGTH + NIGHT_LENGTH;
const WARN_AT = DAY_LENGTH - 25; // mesmo instante do aviso em game.js
const pct = (v) => `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
const hpClass = (f) => (f > 0.6 ? 'ok' : f > 0.3 ? 'mid' : 'bad');
const RES_HINT = {
  wood: 'Madeira: corte árvores (botão direito numa árvore).',
  stone: 'Pedra: quebre rochas cinzentas.',
  food: 'Comida: saqueie casas e mercadinhos (marcador amarelo sobre o telhado) ou construa uma horta. Cada pessoa come 4 ao amanhecer.',
  scrap: 'Sucata: saqueie oficinas mecânicas (marcador azul) e casas.',
};

// HUD em DOM por cima do canvas. Atualiza ~8 vezes por segundo.
export class HUD {
  constructor(state, actions) {
    this.state = state;
    this.actions = actions;
    this.lastUpdate = 0;
    this.cardKey = '';
    this.seenMessages = new Set();
    this.toastT = 0;
    this.buildTopbar();
    this.bindScreens();
    this.bindMinimap();
  }

  get game() {
    return this.state.game;
  }

  buildTopbar() {
    $('resources').innerHTML = RES_ORDER.map(
      (k) => `<div class="chip" id="chip-${k}" title="${RES_HINT[k]}"><span class="chip-icon c-${k}">${icon(k)}</span><span class="chip-label">${RES_NAMES[k]}</span><b id="res-${k}">0</b>${k === 'food' ? '<small id="food-need"></small>' : ''}</div>`,
    ).join('') + `<div class="chip" title="Sobreviventes / abrigo. Barracas e o acampamento dão abrigo."><span class="chip-icon">${icon('pop')}</span><span class="chip-label">Grupo</span><b id="res-pop">0/0</b></div>`;
    document.querySelector('.clock-bar').style.setProperty('--night', `${(DAY_LENGTH / CYCLE) * 100}%`);
    $('clock-warn').style.left = `${(WARN_AT / CYCLE) * 100}%`;
    this.resShown = {};
    this.resDelta = {};
    this.deltaT = 0;
    this.msgRows = new Map();
    this.track = null;
    this.portraitKey = '';
    for (const btn of document.querySelectorAll('[data-speed]')) {
      btn.addEventListener('click', () => this.setSpeed(Number(btn.dataset.speed)));
    }
    $('btn-pause').addEventListener('click', () => this.togglePause());
    $('btn-sound').addEventListener('click', () => this.toggleSound());
    $('btn-sound').setAttribute('aria-pressed', String(this.actions.sound.enabled));
    $('btn-help').addEventListener('click', () => this.showHelp(true));
    $('btn-idle').addEventListener('click', () => {
      const idle = this.game.units.filter((u) => !u.task);
      if (idle.length) this.actions.select(idle);
      else this.toast('Ninguém está parado.');
    });
    $('btn-roster').addEventListener('click', () => {
      const r = $('roster');
      r.classList.toggle('collapsed');
      $('btn-roster').textContent = r.classList.contains('collapsed') ? '+' : '–';
    });
    if (window.innerWidth < 700) {
      $('roster').classList.add('collapsed');
      $('btn-roster').textContent = '+';
    }
    // Clique seleciona; duplo clique leva a câmera até a pessoa. Cabeçalho da classe seleciona a classe toda.
    this.rosterRows = new Map();
    this.rosterHeads = new Map();
    this.rosterOrder = '';
    $('roster-list').addEventListener('click', (e) => {
      const head = e.target.closest('[data-role]');
      if (head) {
        const units = this.game.units.filter((u) => u.role === head.dataset.role);
        if (e.shiftKey) this.actions.select([...this.state.selection, ...units]);
        else this.actions.select(units);
        return;
      }
      const row = e.target.closest('[data-id]');
      if (!row) return;
      const u = this.game.units.find((x) => x.id === Number(row.dataset.id));
      if (!u) return;
      if (e.shiftKey) this.actions.select([...this.state.selection, u]);
      else this.actions.select([u]);
      if (e.detail >= 2) this.actions.centerOn(u.x, u.y);
    });
  }

  bindScreens() {
    $('btn-start').addEventListener('click', () => this.actions.start());
    $('btn-resume').addEventListener('click', () => this.togglePause(false));
    $('btn-restart').addEventListener('click', () => this.actions.newGame());
    $('btn-again').addEventListener('click', () => this.actions.newGame());
    $('btn-continue').addEventListener('click', () => {
      this.state.continueAfterWin = true;
      $('screen-end').hidden = true;
    });
    $('btn-help-close').addEventListener('click', () => this.showHelp(false));
    // Cartões do objetivo levam a câmera até o ninho.
    $('nest-list').addEventListener('click', (e) => {
      const card = e.target.closest('[data-nest]');
      if (!card) return;
      const n = this.game.nests[Number(card.dataset.nest)];
      if (n && !n.dead) this.actions.centerOn(n.x + n.w / 2, n.y + n.h / 2);
    });
  }

  bindMinimap() {
    const mm = $('minimap');
    const toTile = (e) => {
      const r = mm.getBoundingClientRect();
      return this.actions.miniToTile((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    };
    let dragging = false;
    mm.addEventListener('contextmenu', (e) => e.preventDefault());
    mm.addEventListener('mousedown', (e) => {
      const [tx, ty] = toTile(e);
      if (e.button === 2) {
        this.actions.commandAt(Math.floor(tx), Math.floor(ty));
        return;
      }
      dragging = true;
      this.actions.centerOn(tx, ty);
    });
    window.addEventListener('mousemove', (e) => {
      if (dragging) this.actions.centerOn(...toTile(e));
    });
    window.addEventListener('mouseup', () => (dragging = false));
  }

  // ---------- ações ----------

  setSpeed(n) {
    this.state.speed = n;
    for (const btn of document.querySelectorAll('[data-speed]')) btn.setAttribute('aria-pressed', String(Number(btn.dataset.speed) === n));
  }

  togglePause(force) {
    const s = this.state;
    if (!s.started || this.game.over) return;
    s.paused = force ?? !s.paused;
    $('screen-pause').hidden = !s.paused;
    $('btn-pause').textContent = s.paused ? 'Continuar' : 'Pausar';
  }

  showHelp(show) {
    $('screen-help').hidden = !show;
    if (this.state.started && !this.game.over) {
      this.state.paused = show;
      $('btn-pause').textContent = show ? 'Continuar' : 'Pausar';
    }
  }

  toggleSound() {
    const s = this.actions.sound;
    s.unlock();
    s.setEnabled(!s.enabled);
    $('btn-sound').setAttribute('aria-pressed', String(s.enabled));
    this.toast(s.enabled ? 'Som ligado.' : 'Som desligado.');
  }

  upgrade() {
    const b = this.state.selected;
    if (!b || b.kind !== 'building') return;
    const r = this.game.startUpgrade(b, [...this.state.selection]);
    if (!r.ok) this.toast(r.reason);
  }

  recruit(role) {
    const r = this.game.recruit(role);
    if (!r.ok) this.toast(r.reason);
  }

  demolish() {
    const b = this.state.selected;
    if (!b || b.kind !== 'building' || b.type === 'hq') return;
    this.game.removeBuilding(b);
    this.state.selected = null;
  }

  toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.hidden = false;
    this.toastT = performance.now() + 2600;
  }

  showEnd(won) {
    const g = this.game;
    const s = g.stats;
    $('end-title').textContent = won ? 'Foco eliminado' : 'Fim da linha';
    $('end-reason').textContent = won
      ? `Os ${g.nests.length} ninhos caíram no dia ${g.day}. Sem eles, as hordas acabaram. Dá para continuar e limpar o resto do mapa.`
      : g.overReason;
    $('end-stats').innerHTML = [
      ['Ninhos destruídos', `${g.stats.nests}/${g.nests.length}`],
      ['Noites sobrevividas', g.day - 1],
      ['Zumbis abatidos', s.kills],
      ['Recursos saqueados', s.looted],
      ['Construções erguidas', s.built],
      ['Pessoas resgatadas', s.rescued + s.recruited],
      ['Pessoas perdidas', s.lost],
    ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    $('btn-continue').hidden = !won;
    $('screen-end').hidden = false;
  }

  // ---------- atualização ----------

  update(now) {
    const g = this.game;
    const s = this.state;
    if (!s.started) return;
    // Seta da horda e retrato acompanham a câmera e a animação a cada quadro.
    this.updateHordeArrow(g);
    this.updatePortrait(g, s, now);
    if (now - this.lastUpdate < 120) return;
    this.lastUpdate = now;

    this.updateResources(g, now);
    const need = $('food-need');
    need.textContent = `−${g.foodNeed}/dia`;
    need.classList.toggle('short', g.res.food < g.foodNeed);
    const pop = $('res-pop');
    pop.textContent = `${g.popUsed}/${g.popCap}`;
    pop.classList.toggle('full', g.popUsed >= g.popCap);

    const h = g.hourOfDay;
    const hh = String(Math.floor(h)).padStart(2, '0'), mm = String(Math.floor((h % 1) * 60)).padStart(2, '0');
    $('day').textContent = `Dia ${g.day}`;
    $('clock').textContent = `${hh}:${mm}`;
    const fill = $('clock-fill');
    fill.style.width = pct(g.clock / CYCLE);
    fill.style.setProperty('--night-rel', `${(DAY_LENGTH / Math.max(g.clock, 1)) * 100}%`);
    $('clock-warn').classList.toggle('calm', !g.hordeTonight);
    const wrap = $('clock-wrap');
    if (wrap.classList.contains('night') !== g.isNight) {
      wrap.classList.toggle('night', g.isNight);
      $('clock-icon').firstElementChild.setAttribute('href', g.isNight ? '#i-moon' : '#i-sun');
    }

    const banner = $('banner');
    const setBanner = (cls, ic, text) => {
      const html = `${icon(ic)}<span>${esc(text)}</span>`;
      banner.hidden = false;
      banner.className = `banner ${cls}`;
      if (banner.innerHTML !== html) banner.innerHTML = html;
    };
    if (g.isNight && !g.hordeTonight && g.won) setBanner('calm', 'moon', 'Noite tranquila · sem ninhos, sem hordas');
    else if (g.isNight && !g.hordeTonight) setBanner('warn', 'moon', 'Noite calma · a horda vem amanhã');
    else if (g.isNight) setBanner('danger', 'skull', `Noite · ${g.hordeRemaining} zumbis na horda`);
    else if (g.hordeWarned && g.hordeTonight) setBanner('warn', 'alert', `Horda ${g.hordeOrigin()} em ${Math.ceil(g.secondsToNight)} s`);
    else banner.hidden = true;
    $('danger-vignette').classList.toggle('on', g.isNight && g.hordeRemaining > 0);

    this.updateObjectives(g);
    this.updateAlerts(g);
    this.updateMessages(g);
    this.updateRoster(g, s);
    this.updateHover(g);
    this.updateSelection(g, s);
    this.updateCard(g, s);
    if (this.toastT && now > this.toastT) {
      $('toast').hidden = true;
      this.toastT = 0;
    }
    if (g.over && !s.endShown) {
      s.endShown = true;
      this.showEnd(false);
    } else if (g.won && !s.winShown) {
      s.winShown = true;
      this.showEnd(true);
    }
  }

  // Mensagens recentes: cada uma ganha um <li> próprio (para a animação de entrada rodar uma vez só) e some aos poucos.
  updateMessages(g) {
    const box = $('messages');
    const recent = g.messages.filter((m) => g.time - m.t < 9 && m.t <= g.time).slice(-6);
    const keep = new Set(recent.map((m) => m.id));
    for (const [id, li] of this.msgRows) {
      if (keep.has(id)) continue;
      li.remove();
      this.msgRows.delete(id);
    }
    for (const m of recent) {
      let li = this.msgRows.get(m.id);
      if (!li) {
        li = document.createElement('li');
        li.className = `msg msg-${m.kind}`;
        li.innerHTML = `${icon(MSG_ICON[m.kind] || 'info', 'ic-sm')}<span>${esc(m.text)}</span>`;
        box.appendChild(li);
        this.msgRows.set(m.id, li);
      }
      li.style.opacity = String(Math.min(1, (9 - (g.time - m.t)) / 2));
    }
  }

  updateResources(g, now) {
    for (const k of RES_ORDER) {
      const v = Math.floor(g.res[k]);
      const prev = this.resShown[k];
      if (prev !== undefined && v !== prev) this.resDelta[k] = (this.resDelta[k] || 0) + (v - prev);
      this.resShown[k] = v;
      $(`res-${k}`).textContent = v;
    }
    // Junta as variações por um segundo antes de mostrar, para a horta não piscar sem parar.
    if (now - this.deltaT < 1000) return;
    this.deltaT = now;
    for (const k of RES_ORDER) {
      const d = this.resDelta[k];
      if (!d) continue;
      this.resDelta[k] = 0;
      const chip = $(`chip-${k}`), b = $(`res-${k}`);
      const tag = document.createElement('span');
      tag.className = `delta ${d > 0 ? 'pos' : 'neg'}`;
      tag.textContent = d > 0 ? `+${d}` : `${d}`;
      chip.appendChild(tag);
      setTimeout(() => tag.remove(), 1200);
      b.classList.remove('up', 'down');
      b.classList.add(d > 0 ? 'up' : 'down');
      setTimeout(() => b.classList.remove('up', 'down'), 350);
    }
  }

  // Painel do objetivo: um cartão por ninho, montado de novo a cada partida.
  updateObjectives(g) {
    const list = $('nest-list');
    if (this.objFor !== g) {
      this.objFor = g;
      list.innerHTML = g.nests.map((n, i) => {
        const dir = g.compassFrom(n.x + n.w / 2, n.y + n.h / 2);
        return `<button type="button" class="nest" data-nest="${i}" title="Leva a câmera até o ninho">${icon('nest')}<span class="nest-name">Ninho ${dir}</span><span class="nest-state"></span><span class="nest-hp"><span></span></span></button>`;
      }).join('');
    }
    const cards = list.children;
    g.nests.forEach((n, i) => {
      const card = cards[i];
      if (!card) return;
      const hit = !n.dead && g.time - n.lastHit < 3;
      const origin = !n.dead && n === g.hordeNest && g.hordeTonight && (g.hordeWarned || g.isNight);
      card.classList.toggle('dead', n.dead);
      card.classList.toggle('hit', hit);
      card.classList.toggle('origin', origin && !hit);
      const state = n.dead ? 'Destruído' : hit ? 'Sob ataque!' : origin ? 'Origem da horda' : `${Math.ceil(n.hp)} de vida`;
      const st = card.querySelector('.nest-state');
      if (st.textContent !== state) st.textContent = state;
      card.querySelector('.nest-hp span').style.width = pct(n.dead ? 0 : n.hp / n.maxHp);
    });
    const done = g.nests.length - g.nestsAlive;
    $('objective').textContent = `${done}/${g.nests.length} destruídos`;
    $('objectives').classList.toggle('done', !g.nestsAlive);
  }

  // Alertas grandes nos momentos que importam: aviso da horda, anoitecer, amanhecer e ninho destruído.
  updateAlerts(g) {
    const t = this.track;
    const now = { g, warned: g.hordeWarned, night: g.isNight, day: g.day, nests: g.stats.nests };
    this.track = now;
    if (!t || t.g !== g) return;
    if (now.nests > t.nests && g.nestsAlive) {
      this.alert('good', 'Ninho destruído', `Restam ${g.nestsAlive}. As hordas vão ficar menores.`, 'Objetivo');
    } else if (now.warned && !t.warned && g.hordeTonight) {
      this.alert('danger', 'A horda se aproxima', `Vem ${g.hordeOrigin()} · anoitece em ${Math.ceil(g.secondsToNight)} s`, `Dia ${g.day}`);
    } else if (now.night && !t.night) {
      if (g.hordeTonight) this.alert('danger', 'Anoiteceu', `${g.hordeRemaining} zumbis vêm ${g.hordeOrigin()}`, `Noite ${g.day}`);
      else if (g.day < FIRST_HORDE_NIGHT) this.alert('info', 'Primeira noite', 'Os mortos estão agitados, mas a horda ainda não veio.', `Noite ${g.day}`);
    } else if (now.day > t.day) {
      const m = [...g.messages].reverse().find((x) => x.text.startsWith('Amanheceu'));
      this.alert(m && m.kind === 'danger' ? 'danger' : 'info', `Dia ${g.day}`, m ? m.text.replace(/^Amanheceu\. Dia \d+\. /, '') : '', 'Amanheceu');
    }
  }

  alert(kind, title, sub, kicker = '') {
    const el = $('alert');
    el.hidden = true;
    el.className = kind;
    el.innerHTML = `<div class="alert-kicker">${esc(kicker)}</div><div class="alert-title">${esc(title)}</div><div class="alert-sub">${esc(sub)}</div><div class="alert-rule"></div>`;
    void el.offsetWidth; // reinicia a animação
    el.hidden = false;
    clearTimeout(this.alertTimer);
    this.alertTimer = setTimeout(() => (el.hidden = true), 4300);
  }

  // Seta na borda da tela apontando para a horda (ou para o ninho de onde ela vai sair).
  updateHordeArrow(g) {
    const el = $('horde-arrow');
    let target = null, label = '';
    if (g.isNight && g.hordeRemaining > 0) {
      let x = 0, y = 0, n = 0;
      for (const z of g.zombies) if (z.mode === 'horde') { x += z.x; y += z.y; n++; }
      target = { x: x / n, y: y / n };
      label = `Horda · ${g.compassFrom(target.x, target.y)}`;
    } else if (!g.isNight && g.hordeWarned && g.hordeTonight && g.hordeNest && !g.hordeNest.dead) {
      const n = g.hordeNest;
      target = { x: n.x + n.w / 2, y: n.y + n.h / 2 };
      label = `Ninho da horda · ${g.compassFrom(target.x, target.y)}`;
    }
    if (!target) {
      el.hidden = true;
      return;
    }
    const [sx, sy] = this.actions.toScreen(target.x, target.y);
    // Área livre: abaixo do painel do objetivo, acima do painel inferior e à esquerda do grupo.
    const H = window.innerHeight;
    const roster = $('roster').getBoundingClientRect();
    const top = $('center-stack').getBoundingClientRect().bottom + 34, bottom = H - $('bottom').offsetHeight - 40;
    const left = 50, right = roster.left - 50;
    if (sx > left && sx < right && sy > top && sy < bottom) {
      el.hidden = true;
      return;
    }
    // Do centro da área livre até o alvo, cortado na borda.
    const cx = (left + right) / 2, cy = (top + bottom) / 2;
    const dx = sx - cx, dy = sy - cy;
    const k = Math.min(Math.abs((right - cx) / (dx || 1e-6)), Math.abs((bottom - cy) / (dy || 1e-6)));
    const ax = cx + dx * Math.min(1, k), ay = cy + dy * Math.min(1, k);
    el.hidden = false;
    el.style.transform = `translate(${ax}px, ${ay}px) translate(-50%, -50%)`;
    el.firstElementChild.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    const span = el.lastElementChild;
    if (span.textContent !== label) span.textContent = label;
  }

  // Retrato animado de quem (ou do que) está selecionado, desenhado com os mesmos sprites do mapa.
  updatePortrait(g, s, now) {
    const wrap = $('portrait-wrap');
    const subject = s.selection.size === 1 ? [...s.selection][0] : s.selection.size ? null : s.selected;
    if (!subject || subject.dead) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    const cv = $('portrait');
    const ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    const env = { now: now / 1000, dark: 0, map: g.map, smoke() {}, ember() {} };
    const actor = subject.kind === 'unit' || subject.kind === 'zombie';
    const cx = actor ? subject.x : subject.x + subject.w / 2, cy = actor ? subject.y : subject.y + subject.h / 2;
    const [px, py] = toIso(cx, cy);
    const scale = actor ? (subject.type === 'brute' ? 2.6 : 3.4) : Math.min(2.2, 168 / ((subject.w + subject.h) * HW));
    ctx.translate(cv.width / 2, cv.height * (actor ? 0.86 : 0.72));
    ctx.scale(scale, scale);
    ctx.translate(-px, -py);
    if (subject.kind === 'unit') drawUnit(ctx, { ...subject, hp: subject.maxHp }, false, env, g.activity(subject));
    else if (subject.kind === 'zombie') drawZombie(ctx, { ...subject, hp: subject.maxHp }, false, env);
    else if (subject.kind === 'ruin') drawRuin(ctx, subject, env);
    else if (subject.kind === 'nest') drawNest(ctx, subject, env);
    else {
      const draw = { hq: drawHQ, tent: drawTent, depot: drawDepot, farm: drawFarm, tower: drawTower }[subject.type] || drawWall;
      draw(ctx, subject, env);
    }
  }

  updateRoster(g, s) {
    const list = $('roster-list');
    const idle = g.units.filter((u) => !u.task).length;
    $('roster-title').textContent = `Grupo · ${g.units.length}`;
    const ib = $('btn-idle');
    ib.textContent = `Ociosos ${idle}`;
    ib.classList.toggle('has-idle', idle > 0);
    const alive = new Set();
    const order = [];
    for (const role of ROLE_ORDER) {
      const members = g.units.filter((u) => u.role === role);
      let head = this.rosterHeads.get(role);
      if (!head) {
        head = document.createElement('li');
        head.innerHTML = `<button type="button" class="rgroup" data-role="${role}" title="Seleciona todos os ${ROLES[role].plural}">${icon(role, 'ic-sm')}<span>${ROLES[role].plural}</span><b></b></button>`;
        this.rosterHeads.set(role, head);
      }
      head.hidden = !members.length;
      head.querySelector('b').textContent = members.length;
      order.push(head);
      for (const u of members) {
        alive.add(u.id);
        let row = this.rosterRows.get(u.id);
        if (!row) {
          row = document.createElement('li');
          row.innerHTML = `<button type="button" class="rrow" data-id="${u.id}"><i class="rdot"></i><span class="rname">${esc(u.name)}</span><span class="rcarry"></span><span class="rtask"></span><span class="rhp"><span></span></span></button>`;
          this.rosterRows.set(u.id, row);
        }
        order.push(row);
        const act = g.activity(u);
        const btn = row.firstChild;
        btn.classList.toggle('idle', act === 'idle');
        btn.classList.toggle('sel', s.selection.has(u));
        const dot = btn.querySelector('.rdot');
        dot.style.background = ACT_COLOR[act] || ACT_COLOR.move;
        const ic = ACT_ICON[act] || u.role;
        if (dot.dataset.ic !== ic) {
          dot.dataset.ic = ic;
          dot.innerHTML = icon(ic);
        }
        const task = g.describeTask(u);
        const rt = btn.querySelector('.rtask');
        if (rt.textContent !== task) rt.textContent = task;
        btn.querySelector('.rcarry').textContent = u.carry.amount ? `${u.carry.amount} ${RES_NAMES[u.carry.type].toLowerCase()}` : '';
        const hp = btn.querySelector('.rhp span');
        hp.style.width = pct(u.hp / u.maxHp);
        hp.style.background = u.hp / u.maxHp > 0.6 ? 'var(--good)' : u.hp / u.maxHp > 0.3 ? 'var(--accent)' : 'var(--danger)';
      }
    }
    for (const [id, row] of this.rosterRows) {
      if (alive.has(id)) continue;
      row.remove();
      this.rosterRows.delete(id);
    }
    // Só reordena o DOM quando a ordem muda (alguém entrou, saiu ou trocou de classe).
    const key = order.map((li) => li.firstChild.dataset.id || li.firstChild.dataset.role).join(',');
    if (key !== this.rosterOrder) {
      this.rosterOrder = key;
      for (const li of order) list.appendChild(li);
    }
  }

  updateHover(g) {
    const tip = $('hovertip');
    const h = this.actions.hoverInfo();
    if (!h) {
      tip.hidden = true;
      return;
    }
    let html = '';
    if (h.tile) {
      const [tx, ty] = h.tile;
      const i = g.map.idx(tx, ty);
      const tree = g.map.tiles[i] === T.TREE;
      html = `<strong>${tree ? 'Árvore' : 'Rocha'}</strong><span>${g.map.res[i]} de ${tree ? 'madeira' : 'pedra'}</span><em>Botão direito para coletar</em>`;
    } else {
      const e = h.hit;
      if (e.kind === 'nest') {
        html = `<strong>Ninho ${g.compassFrom(e.x + 1.5, e.y + 1.5)}</strong><span>Vida ${Math.ceil(e.hp)}/${e.maxHp}</span><em>Botão direito para atacar. As hordas saem daqui.</em>`;
      } else if (e.kind === 'ruin') {
        const loot = RES_ORDER.filter((k) => e.loot[k] > 0);
        const what = e.empty ? 'Já foi saqueada.' : e.visited ? loot.map((k) => `${e.loot[k]} ${RES_NAMES[k].toLowerCase()}`).join(' · ') : `Pode ter ${loot.map((k) => RES_NAMES[k].toLowerCase()).join(', ')}.`;
        html = `<strong>${esc(e.def.name)}</strong><span>${what}</span>${e.empty ? '' : '<em>Botão direito para saquear</em>'}`;
      } else if (e.kind === 'unit') {
        html = `<strong>${esc(e.name)}</strong><span>${e.rd.name} · ${esc(g.describeTask(e))}${e.carry.amount ? ` · leva ${e.carry.amount} ${RES_NAMES[e.carry.type].toLowerCase()}` : ''}</span>`;
      } else if (e.kind === 'zombie') {
        html = `<strong>${esc(e.def.name)}</strong><span>Vida ${Math.ceil(e.hp)}/${e.maxHp}</span><em>Botão direito para atacar</em>`;
      } else {
        const next = g.nextLevel(e);
        html = `<strong>${esc(e.def.name)}</strong><span>Vida ${Math.ceil(e.hp)}/${e.maxHp}${e.def.maxLevel ? ` · nível ${e.level + 1}/${e.def.maxLevel + 1}` : ''}</span>${next && e.complete ? `<em>Pode evoluir para ${esc(next.name.toLowerCase())}</em>` : ''}`;
      }
    }
    if (tip.innerHTML !== html) tip.innerHTML = html;
    tip.hidden = false;
    const mx = this.state.mouse.x, my = this.state.mouse.y;
    const r = document.getElementById('game').getBoundingClientRect();
    tip.style.left = `${Math.min(window.innerWidth - tip.offsetWidth - 8, r.left + mx + 16)}px`;
    tip.style.top = `${Math.min(window.innerHeight - tip.offsetHeight - 8, r.top + my + 18)}px`;
  }

  updateSelection(g, s) {
    const el = $('selection-body');
    const units = [...s.selection];
    let html;
    if (units.length === 1) {
      const u = units[0];
      html = `<span class="level">${u.rd.name}${u.rd.worker ? ' · trabalha' : ' · combate'}</span><h2>${esc(u.name)}</h2>
        <div class="hpbar ${hpClass(u.hp / u.maxHp)}"><span style="width:${pct(u.hp / u.maxHp)}"></span></div>
        <p class="status">${esc(g.describeTask(u))}</p>
        <dl class="facts">
          <div><dt>Vida</dt><dd>${Math.ceil(u.hp)}/${u.maxHp}</dd></div>
          <div><dt>Carregando</dt><dd>${u.carry.amount ? `${u.carry.amount} ${RES_NAMES[u.carry.type].toLowerCase()}` : 'nada'}</dd></div>
          <div><dt>Arma</dt><dd>${u.rd.weapon} · ${u.rd.dmg} dano · alcance ${String(u.rd.range).replace('.', ',')}</dd></div>
        </dl>`;
    } else if (units.length > 1) {
      const tasks = {};
      for (const u of units) {
        const t = g.describeTask(u);
        tasks[t] = (tasks[t] || 0) + 1;
      }
      const byRole = ROLE_ORDER.map((r) => [r, units.filter((u) => u.role === r).length]).filter(([, n]) => n);
      html = `<span class="level">${byRole.map(([r, n]) => `${n} ${n > 1 ? ROLES[r].plural : ROLES[r].name.toLowerCase()}`).join(' · ')}</span><h2>${units.length} sobreviventes</h2>
        <div class="roster">${units.slice(0, 24).map((u) => `<span class="mini ${u.role} ${hpClass(u.hp / u.maxHp)}" title="${esc(u.name)} · ${u.rd.name}">${esc(u.name.slice(0, 2))}</span>`).join('')}</div>
        <p class="status">${Object.entries(tasks).map(([t, n]) => `${n} ${esc(t.toLowerCase())}`).join(' · ')}</p>`;
    } else if (s.selected) {
      html = this.describeEntity(g, s.selected);
    } else {
      html = `<h2>Acampamento</h2>
        <p class="hint">Catadores trabalham, soldados lutam. Botão direito num ninho (marcado no minimapa) para atacar. Destrua os ${g.nests.length} para vencer.</p>`;
    }
    if (el.innerHTML !== html) el.innerHTML = html;
  }

  describeEntity(g, e) {
    if (e.kind === 'zombie') {
      return `<h2>${esc(e.def.name)}</h2>
        <div class="hpbar bad"><span style="width:${pct(e.hp / e.maxHp)}"></span></div>
        <dl class="facts">
          <div><dt>Vida</dt><dd>${Math.ceil(e.hp)}/${e.maxHp}</dd></div>
          <div><dt>Mordida</dt><dd>${e.def.dmg}</dd></div>
          <div><dt>Estado</dt><dd>${e.mode === 'horde' ? 'Na horda' : 'Vagando'}</dd></div>
        </dl>`;
    }
    if (e.kind === 'nest') {
      const hot = g.time - e.lastHit < 8;
      return `<span class="level">Objetivo</span><h2>Ninho ${g.compassFrom(e.x + 1.5, e.y + 1.5)}</h2>
        <div class="hpbar nestbar"><span style="width:${pct(e.hp / e.maxHp)}"></span></div>
        <dl class="facts"><div><dt>Vida</dt><dd>${Math.ceil(e.hp)}/${e.maxHp}</dd></div></dl>
        <p class="status">${hot ? 'Sob ataque: soltando defensores.' : `Regenera ${NEST.regen}/s quando ninguém atira. Cresce a cada dia.`}</p>
        <p class="hint">As hordas saem daqui. Leve soldados e use o botão direito.</p>`;
    }
    if (e.kind === 'ruin') {
      const loot = RES_ORDER.filter((k) => e.loot[k] > 0);
      const lootLine = e.empty
        ? 'Já foi saqueada.'
        : e.visited
          ? loot.map((k) => `${e.loot[k]} ${RES_NAMES[k].toLowerCase()}`).join(' · ')
          : `Pode ter ${loot.map((k) => RES_NAMES[k].toLowerCase()).join(', ')}.`;
      return `<h2>${esc(e.def.name)}</h2>
        <p class="status">${lootLine}</p>
        <p class="hint">${e.empty ? '' : 'Selecione sobreviventes e clique com o botão direito para saquear.'}</p>`;
    }
    const b = e;
    let extra = '';
    const lvl = b.def.maxLevel ? `<span class="level">Nível ${b.level + 1} de ${b.def.maxLevel + 1}</span>` : '';
    if (!b.complete) extra = `<p class="status">Em obra · ${pct(b.progress)}</p>`;
    else if (b.type === 'hq') extra = `<p class="status">${b.queue.length ? `Recrutando: ${b.queue.length} na fila · ${ROLES[b.queue[0].role].name.toLowerCase()} em ${Math.ceil(b.queue[0].t)} s` : 'Recebe recursos e recruta sobreviventes.'}</p>`;
    else if (b.def.range) extra = `<p class="status">${b.def.dmg} de dano · alcance ${b.def.range}</p>`;
    else if (b.upgrade) extra = `<p class="status">Em reforma · ${pct(b.upgrade.progress)}</p>`;
    else if (b.def.foodInterval) extra = `<p class="status">1 de comida a cada ${String(b.def.foodInterval).replace('.', ',')} s · já produziu ${b.produced}.</p>`;
    else if (b.def.bonus) extra = `<p class="status">Entregas aqui rendem ${Math.round(b.def.bonus * 100)}% a mais.</p>`;
    else if (b.def.thorns) extra = `<p class="status">Espetos: ${b.def.thorns} de dano em quem bate.</p>`;
    else if (b.def.pop) extra = `<p class="status">Abriga ${b.def.pop} pessoas.</p>`;
    return `${lvl}<h2>${esc(b.def.name)}</h2>
      <div class="hpbar ${hpClass(b.hp / b.maxHp)}"><span style="width:${pct(b.hp / b.maxHp)}"></span></div>
      <dl class="facts"><div><dt>Vida</dt><dd>${Math.ceil(b.hp)}/${b.maxHp}</dd></div></dl>
      ${extra}`;
  }

  updateCard(g, s) {
    const el = $('commands');
    const sel = s.selected;
    let key;
    if (s.selection.size) key = 'units';
    else if (sel && sel.kind === 'building') key = `${sel.type === 'hq' ? 'hq' : 'b'}${sel.id}:${sel.complete}:${sel.level}:${!!sel.upgrade}`;
    else key = 'none';
    if (key !== this.cardKey) {
      this.cardKey = key;
      el.innerHTML = this.cardHtml(key, sel);
      for (const btn of el.querySelectorAll('button')) {
        btn.addEventListener('click', () => this.onCard(btn.dataset.action, btn.dataset.type || btn.dataset.role));
        btn.addEventListener('mouseenter', () => this.tip(btn));
        btn.addEventListener('mouseleave', () => ($('tooltip').hidden = true));
      }
    }
    for (const btn of el.querySelectorAll('button[data-type]')) {
      const def = BUILDINGS[btn.dataset.type];
      btn.disabled = !g.canAfford(def.cost);
      btn.setAttribute('aria-pressed', String(s.buildType === btn.dataset.type));
    }
    for (const rec of el.querySelectorAll('[data-action="recruit"]')) {
      rec.disabled = !g.canAfford(ROLES[rec.dataset.role].cost) || g.popUsed >= g.popCap || g.hq.queue.length >= RECRUIT.maxQueue;
    }
    const upg = el.querySelector('[data-action="upgrade"]');
    if (upg && sel) {
      const next = g.nextLevel(sel);
      upg.disabled = !next || !sel.complete || !!sel.upgrade || !g.canAfford(next.cost);
    }
  }

  cardHtml(key, sel) {
    const buildButtons = BUILD_ORDER.map((t) => {
      const d = BUILDINGS[t];
      return `<button type="button" class="cmd" data-action="build" data-type="${t}">
        ${icon(t)}<kbd>${d.key.toUpperCase()}</kbd><span class="cmd-name">${d.name}</span>${costHtml(d.cost)}</button>`;
    }).join('');
    if (key === 'units') {
      return `<div class="card-title">Construir</div><div class="grid">${buildButtons}
        <button type="button" class="cmd cmd-quiet" data-action="stop">${icon('stop')}<kbd>X</kbd><span class="cmd-name">Parar</span><span class="cost">cancela a ordem</span></button></div>`;
    }
    const upgradeBtn = () => {
      const next = this.game.nextLevel(sel);
      if (!next) return `<button type="button" class="cmd cmd-quiet" disabled>${icon('max')}<span class="cmd-name">Nível máximo</span><span class="cost">já está no topo</span></button>`;
      if (sel.upgrade) return `<button type="button" class="cmd cmd-quiet" disabled>${icon('upgrade')}<span class="cmd-name">Em reforma</span><span class="cost">botão direito com alguém para ajudar</span></button>`;
      return `<button type="button" class="cmd" data-action="upgrade">${icon('upgrade')}<kbd>U</kbd><span class="cmd-name">Evoluir: ${esc(next.name)}</span>${costHtml(next.cost)}</button>`;
    };
    if (key.startsWith('hq')) {
      return `<div class="card-title">${esc(sel.def.name)}</div><div class="grid">
        ${ROLE_ORDER.map((r) => `<button type="button" class="cmd" data-action="recruit" data-role="${r}">${icon(r)}<kbd>${ROLES[r].key.toUpperCase()}</kbd><span class="cmd-name">${ROLES[r].name}</span>${costHtml(ROLES[r].cost)}</button>`).join('')}
        ${upgradeBtn()}
        </div>`;
    }
    if (key.startsWith('b')) {
      return `<div class="card-title">${esc(sel.def.name)}</div><div class="grid">
        ${sel.complete ? upgradeBtn() : ''}
        <button type="button" class="cmd cmd-danger" data-action="demolish">${icon('trash')}<kbd>Del</kbd><span class="cmd-name">${sel.complete ? 'Demolir' : 'Cancelar obra'}</span>
        <span class="cost">${sel.complete ? 'devolve 25%' : sel.progress < 0.05 ? 'devolve tudo' : 'devolve metade'}</span></button></div>`;
    }
    return `<div class="card-title">Construir</div><div class="grid">${buildButtons}</div>`;
  }

  onCard(action, type) {
    $('tooltip').hidden = true;
    if (action === 'build') this.actions.startBuild(type);
    else if (action === 'stop') this.game.stop([...this.state.selection]);
    else if (action === 'recruit') this.recruit(type);
    else if (action === 'demolish') this.demolish();
    else if (action === 'upgrade') this.upgrade();
  }

  tip(btn) {
    const t = $('tooltip');
    let html = '';
    if (btn.dataset.type) {
      const d = BUILDINGS[btn.dataset.type];
      html = `<strong>${d.name}</strong><p>${d.desc}</p><p>${costHtml(d.cost)} · vida ${d.hp}</p>`;
    } else if (btn.dataset.action === 'upgrade') {
      const next = this.game.nextLevel(this.state.selected);
      if (!next) return;
      html = `<strong>${next.name}</strong><p>${next.desc || ''}</p><p>${costHtml(next.cost)} · ${next.buildTime} s de obra</p>`;
    } else if (btn.dataset.action === 'recruit') {
      const rd = ROLES[btn.dataset.role];
      html = `<strong>Recrutar ${rd.name.toLowerCase()}</strong><p>${rd.desc}</p><p>Vida ${rd.hp} · ${rd.dmg} de dano · leva ${RECRUIT.time} s. Precisa de abrigo livre.</p>`;
    } else return;
    t.innerHTML = html;
    t.hidden = false;
    const r = btn.getBoundingClientRect();
    const tw = t.offsetWidth;
    t.style.left = `${Math.max(12, Math.min(window.innerWidth - tw - 12, r.left + r.width / 2 - tw / 2))}px`;
    t.style.top = `${r.top - t.offsetHeight - 8}px`;
  }
}
