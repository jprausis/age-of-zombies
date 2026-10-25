import { BUILDINGS, BUILD_ORDER, RES_NAMES, RES_ORDER, RECRUIT, UNIT, WIN_DAY, DAY_LENGTH, NIGHT_LENGTH } from './config.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const costHtml = (cost) =>
  Object.keys(cost).length
    ? RES_ORDER.filter((k) => cost[k]).map((k) => `<span class="cost cost-${k}">${cost[k]} ${RES_NAMES[k].toLowerCase()}</span>`).join(' ')
    : '<span class="cost">grátis</span>';
const pct = (v) => `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
const hpClass = (f) => (f > 0.6 ? 'ok' : f > 0.3 ? 'mid' : 'bad');

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
      (k) => `<div class="chip" title="${RES_NAMES[k]}"><i class="swatch swatch-${k}"></i><span class="chip-label">${RES_NAMES[k]}</span><b id="res-${k}">0</b></div>`,
    ).join('') + '<div class="chip" title="Sobreviventes / abrigo"><i class="swatch swatch-pop"></i><span class="chip-label">Grupo</span><b id="res-pop">0/0</b></div>';
    for (const btn of document.querySelectorAll('[data-speed]')) {
      btn.addEventListener('click', () => this.setSpeed(Number(btn.dataset.speed)));
    }
    $('btn-pause').addEventListener('click', () => this.togglePause());
    $('btn-help').addEventListener('click', () => this.showHelp(true));
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
    if (g.isNight) {
      banner.hidden = false;
      banner.className = 'banner danger';
      banner.textContent = `Noite · ${g.hordeRemaining} zumbis na horda`;
    } else if (g.hordeWarned) {
      banner.hidden = false;
      banner.className = 'banner warn';
      banner.textContent = `Horda em ${Math.ceil(g.secondsToNight)} s`;
    } else {
      banner.hidden = true;
    }

    this.updateMessages(g);
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
    if (!b.complete) extra = `<p class="status">Em obra · ${pct(b.progress)}</p>`;
    else if (b.type === 'hq') extra = `<p class="status">${b.queue.length ? `Recrutando: ${b.queue.length} na fila · próximo em ${Math.ceil(b.queue[0])} s` : 'Recebe recursos e recruta sobreviventes.'}</p>`;
    else if (b.def.range) extra = `<p class="status">${b.def.dmg} de dano · alcance ${b.def.range}</p>`;
    else if (b.def.foodInterval) extra = `<p class="status">Já produziu ${b.produced} de comida.</p>`;
    else if (b.def.pop) extra = `<p class="status">Abriga ${b.def.pop} pessoas.</p>`;
    return `<h2>${esc(b.def.name)}</h2>
      <div class="hpbar ${hpClass(b.hp / b.maxHp)}"><span style="width:${pct(b.hp / b.maxHp)}"></span></div>
      <dl class="facts"><div><dt>Vida</dt><dd>${Math.ceil(b.hp)}/${b.maxHp}</dd></div></dl>
      ${extra}`;
  }

  updateCard(g, s) {
    const el = $('commands');
    const sel = s.selected;
    let key;
    if (s.selection.size) key = 'units';
    else if (sel && sel.kind === 'building') key = sel.type === 'hq' ? 'hq' : `b${sel.id}${sel.complete}`;
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
    if (key === 'hq') {
      return `<div class="card-title">Acampamento</div><div class="grid">
        <button type="button" class="cmd" data-action="recruit"><kbd>R</kbd><span class="cmd-name">Recrutar</span>${costHtml(RECRUIT.cost)}</button>
        </div>`;
    }
    if (key.startsWith('b')) {
      return `<div class="card-title">${esc(sel.def.name)}</div><div class="grid">
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
  }

  tip(btn) {
    const t = $('tooltip');
    let html = '';
    if (btn.dataset.type) {
      const d = BUILDINGS[btn.dataset.type];
      html = `<strong>${d.name}</strong><p>${d.desc}</p><p>${costHtml(d.cost)} · vida ${d.hp}</p>`;
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
