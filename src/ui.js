import { BUILDINGS, BUILD_ORDER, RES_NAMES, RES_ORDER, RECRUIT, UNIT, WIN_DAY, DAY_LENGTH, NIGHT_LENGTH, T } from './config.js';
import { ACT_COLOR } from './draw/actors.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const costHtml = (cost) =>
  Object.keys(cost).length
    ? RES_ORDER.filter((k) => cost[k]).map((k) => `<span class="cost cost-${k}">${cost[k]} ${RES_NAMES[k].toLowerCase()}</span>`).join(' ')
    : '<span class="cost">grátis</span>';
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
      (k) => `<div class="chip" title="${RES_HINT[k]}"><i class="swatch swatch-${k}"></i><span class="chip-label">${RES_NAMES[k]}</span><b id="res-${k}">0</b>${k === 'food' ? '<small id="food-need"></small>' : ''}</div>`,
    ).join('') + '<div class="chip" title="Sobreviventes / abrigo. Barracas e o acampamento dão abrigo."><i class="swatch swatch-pop"></i><span class="chip-label">Grupo</span><b id="res-pop">0/0</b></div>';
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
    // Clique seleciona; duplo clique leva a câmera até a pessoa.
    this.rosterRows = new Map();
    $('roster-list').addEventListener('click', (e) => {
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

  recruit() {
    const r = this.game.recruit();
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
    $('end-title').textContent = won ? 'Vocês sobreviveram' : 'Fim da linha';
    $('end-reason').textContent = won
      ? `O grupo aguentou ${WIN_DAY} noites. Dá para continuar e ver até onde vai.`
      : g.overReason;
    $('end-stats').innerHTML = [
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
    if (now - this.lastUpdate < 120) return;
    this.lastUpdate = now;
    const g = this.game;
    const s = this.state;
    if (!s.started) return;

    for (const k of RES_ORDER) $(`res-${k}`).textContent = Math.floor(g.res[k]);
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
    $('clock-fill').style.width = pct(g.isNight ? (g.clock - DAY_LENGTH) / NIGHT_LENGTH : g.clock / DAY_LENGTH);
    $('clock-wrap').classList.toggle('night', g.isNight);

    const banner = $('banner');
    if (g.isNight && !g.hordeTonight) {
      banner.hidden = false;
      banner.className = 'banner warn';
      banner.textContent = 'Noite calma · a horda vem amanhã';
    } else if (g.isNight) {
      banner.hidden = false;
      banner.className = 'banner danger';
      banner.textContent = `Noite · ${g.hordeRemaining} zumbis na horda`;
    } else if (g.hordeWarned && g.hordeTonight) {
      banner.hidden = false;
      banner.className = 'banner warn';
      banner.textContent = `Horda em ${Math.ceil(g.secondsToNight)} s`;
    } else {
      banner.hidden = true;
    }

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

  updateMessages(g) {
    const box = $('messages');
    const recent = g.messages.filter((m) => g.time - m.t < 9).slice(-6);
    const html = recent.map((m) => `<li class="msg msg-${m.kind}" style="opacity:${Math.min(1, (9 - (g.time - m.t)) / 2)}">${esc(m.text)}</li>`).join('');
    if (box.innerHTML !== html) box.innerHTML = html;
  }

  updateRoster(g, s) {
    const list = $('roster-list');
    const idle = g.units.filter((u) => !u.task).length;
    $('roster-title').textContent = `Grupo · ${g.units.length}`;
    const ib = $('btn-idle');
    ib.textContent = `Ociosos ${idle}`;
    ib.classList.toggle('has-idle', idle > 0);
    const alive = new Set();
    for (const u of g.units) {
      alive.add(u.id);
      let row = this.rosterRows.get(u.id);
      if (!row) {
        row = document.createElement('li');
        row.innerHTML = `<button type="button" class="rrow" data-id="${u.id}"><i class="rdot"></i><span class="rname">${esc(u.name)}</span><span class="rcarry"></span><span class="rtask"></span><span class="rhp"><span></span></span></button>`;
        list.appendChild(row);
        this.rosterRows.set(u.id, row);
      }
      const act = g.activity(u);
      const btn = row.firstChild;
      btn.classList.toggle('idle', act === 'idle');
      btn.classList.toggle('sel', s.selection.has(u));
      btn.querySelector('.rdot').style.background = ACT_COLOR[act] || ACT_COLOR.move;
      btn.querySelector('.rtask').textContent = g.describeTask(u);
      btn.querySelector('.rcarry').textContent = u.carry.amount ? `${u.carry.amount} ${RES_NAMES[u.carry.type].toLowerCase()}` : '';
      const hp = btn.querySelector('.rhp span');
      hp.style.width = pct(u.hp / u.maxHp);
      hp.style.background = u.hp / u.maxHp > 0.6 ? 'var(--good)' : u.hp / u.maxHp > 0.3 ? 'var(--accent)' : 'var(--danger)';
    }
    for (const [id, row] of this.rosterRows) {
      if (alive.has(id)) continue;
      row.remove();
      this.rosterRows.delete(id);
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
      if (e.kind === 'ruin') {
        const loot = RES_ORDER.filter((k) => e.loot[k] > 0);
        const what = e.empty ? 'Já foi saqueada.' : e.visited ? loot.map((k) => `${e.loot[k]} ${RES_NAMES[k].toLowerCase()}`).join(' · ') : `Pode ter ${loot.map((k) => RES_NAMES[k].toLowerCase()).join(', ')}.`;
        html = `<strong>${esc(e.def.name)}</strong><span>${what}</span>${e.empty ? '' : '<em>Botão direito para saquear</em>'}`;
      } else if (e.kind === 'unit') {
        html = `<strong>${esc(e.name)}</strong><span>${esc(g.describeTask(e))}${e.carry.amount ? ` · leva ${e.carry.amount} ${RES_NAMES[e.carry.type].toLowerCase()}` : ''}</span>`;
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
    const el = $('selection');
    const units = [...s.selection];
    let html;
    if (units.length === 1) {
      const u = units[0];
      html = `<h2>${esc(u.name)}</h2>
        <div class="hpbar ${hpClass(u.hp / u.maxHp)}"><span style="width:${pct(u.hp / u.maxHp)}"></span></div>
        <p class="status">${esc(g.describeTask(u))}</p>
        <dl class="facts">
          <div><dt>Vida</dt><dd>${Math.ceil(u.hp)}/${u.maxHp}</dd></div>
          <div><dt>Carregando</dt><dd>${u.carry.amount ? `${u.carry.amount} ${RES_NAMES[u.carry.type].toLowerCase()}` : 'nada'}</dd></div>
          <div><dt>Arma</dt><dd>${UNIT.dmg} dano · alcance ${UNIT.range}</dd></div>
        </dl>`;
    } else if (units.length > 1) {
      const tasks = {};
      for (const u of units) {
        const t = g.describeTask(u);
        tasks[t] = (tasks[t] || 0) + 1;
      }
      html = `<h2>${units.length} sobreviventes</h2>
        <div class="roster">${units.slice(0, 24).map((u) => `<span class="mini ${hpClass(u.hp / u.maxHp)}" title="${esc(u.name)}">${esc(u.name.slice(0, 2))}</span>`).join('')}</div>
        <p class="status">${Object.entries(tasks).map(([t, n]) => `${n} ${esc(t.toLowerCase())}`).join(' · ')}</p>`;
    } else if (s.selected) {
      html = this.describeEntity(g, s.selected);
    } else {
      html = `<h2>Acampamento</h2>
        <p class="hint">Clique ou arraste para selecionar sobreviventes. Botão direito numa árvore, pedra ou casa para trabalhar. Use <kbd>E</kbd> para selecionar todos.</p>`;
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
    else if (b.type === 'hq') extra = `<p class="status">${b.queue.length ? `Recrutando: ${b.queue.length} na fila · próximo em ${Math.ceil(b.queue[0])} s` : 'Recebe recursos e recruta sobreviventes.'}</p>`;
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
        btn.addEventListener('click', () => this.onCard(btn.dataset.action, btn.dataset.type));
        btn.addEventListener('mouseenter', () => this.tip(btn));
        btn.addEventListener('mouseleave', () => ($('tooltip').hidden = true));
      }
    }
    for (const btn of el.querySelectorAll('button[data-type]')) {
      const def = BUILDINGS[btn.dataset.type];
      btn.disabled = !g.canAfford(def.cost);
      btn.setAttribute('aria-pressed', String(s.buildType === btn.dataset.type));
    }
    const rec = el.querySelector('[data-action="recruit"]');
    if (rec) rec.disabled = !g.canAfford(RECRUIT.cost) || g.popUsed >= g.popCap || g.hq.queue.length >= RECRUIT.maxQueue;
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
        <kbd>${d.key.toUpperCase()}</kbd><span class="cmd-name">${d.name}</span>${costHtml(d.cost)}</button>`;
    }).join('');
    if (key === 'units') {
      return `<div class="card-title">Construir</div><div class="grid">${buildButtons}
        <button type="button" class="cmd cmd-quiet" data-action="stop"><kbd>X</kbd><span class="cmd-name">Parar</span><span class="cost">cancela a ordem</span></button></div>`;
    }
    const upgradeBtn = () => {
      const next = this.game.nextLevel(sel);
      if (!next) return '<button type="button" class="cmd cmd-quiet" disabled><span class="cmd-name">Nível máximo</span><span class="cost">já está no topo</span></button>';
      if (sel.upgrade) return '<button type="button" class="cmd cmd-quiet" disabled><span class="cmd-name">Em reforma</span><span class="cost">botão direito com alguém para ajudar</span></button>';
      return `<button type="button" class="cmd" data-action="upgrade"><kbd>U</kbd><span class="cmd-name">Evoluir: ${esc(next.name)}</span>${costHtml(next.cost)}</button>`;
    };
    if (key.startsWith('hq')) {
      return `<div class="card-title">${esc(sel.def.name)}</div><div class="grid">
        <button type="button" class="cmd" data-action="recruit"><kbd>R</kbd><span class="cmd-name">Recrutar</span>${costHtml(RECRUIT.cost)}</button>
        ${upgradeBtn()}
        </div>`;
    }
    if (key.startsWith('b')) {
      return `<div class="card-title">${esc(sel.def.name)}</div><div class="grid">
        ${sel.complete ? upgradeBtn() : ''}
        <button type="button" class="cmd cmd-danger" data-action="demolish"><kbd>Del</kbd><span class="cmd-name">${sel.complete ? 'Demolir' : 'Cancelar obra'}</span>
        <span class="cost">${sel.complete ? 'devolve 25%' : sel.progress < 0.05 ? 'devolve tudo' : 'devolve metade'}</span></button></div>`;
    }
    return `<div class="card-title">Construir</div><div class="grid">${buildButtons}</div>`;
  }

  onCard(action, type) {
    $('tooltip').hidden = true;
    if (action === 'build') this.actions.startBuild(type);
    else if (action === 'stop') this.game.stop([...this.state.selection]);
    else if (action === 'recruit') this.recruit();
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
      html = `<strong>Recrutar sobrevivente</strong><p>Leva ${RECRUIT.time} s. Precisa de abrigo livre.</p>`;
    } else return;
    t.innerHTML = html;
    t.hidden = false;
    const r = btn.getBoundingClientRect();
    const tw = t.offsetWidth;
    t.style.left = `${Math.max(12, Math.min(window.innerWidth - tw - 12, r.left + r.width / 2 - tw / 2))}px`;
    t.style.top = `${r.top - t.offsetHeight - 8}px`;
  }
}
