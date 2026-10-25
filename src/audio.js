import { fromIso, toIso } from './iso.js';

// Efeitos sonoros sintetizados com Web Audio (sem arquivos de áudio).
// A simulação só registra eventos em game.sfx; aqui eles viram som, com volume e
// panorâmica pela distância até o centro da câmera.

const HEAR = 26; // tiles: além disso, silêncio
const LIMIT = { shot: 5, rifle: 3, mg: 4, groan: 3, bite: 3, bash: 3, zdeath: 3 }; // por janela de 120 ms

export class Sound {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    try {
      this.enabled = localStorage.getItem('aoz-sound') !== 'off';
    } catch {
      // armazenamento bloqueado: fica ligado
    }
    this.window = {};
    this.windowT = 0;
    this.groans = 0;
    this.ambientT = 2;
  }

  // Precisa ser chamado dentro de um clique (política de autoplay dos navegadores).
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 4;
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.7 : 0;
      this.master.connect(comp).connect(this.ctx.destination);
      // Ruído branco reutilizado por todos os sons de impacto
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      // Eco curto para tiros de torre
      this.echo = this.ctx.createDelay(1);
      this.echo.delayTime.value = 0.16;
      const fb = this.ctx.createGain();
      fb.gain.value = 0.28;
      const wet = this.ctx.createGain();
      wet.gain.value = 0.35;
      this.echo.connect(fb).connect(this.echo);
      this.echo.connect(wet).connect(this.master);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setEnabled(on) {
    this.enabled = on;
    try {
      localStorage.setItem('aoz-sound', on ? 'on' : 'off');
    } catch {
      // ignora
    }
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.7 : 0, this.ctx.currentTime, 0.05);
  }

  get ready() {
    return this.ctx && this.enabled && this.ctx.state === 'running';
  }

  // ---------- encaminhamento ----------

  // listener: { tx, ty, cam, w } para calcular distância e panorâmica.
  consume(events, listener, dt) {
    this.windowT -= dt;
    if (this.windowT <= 0) {
      this.windowT = 0.12;
      this.window = {};
    }
    if (!this.ready) return;
    for (const e of events) {
      if (e.type === 'horde_warning') this.bell();
      else if (e.type === 'horde_start') this.horn();
      else this.spatial(e, listener);
    }
  }

  spatial(e, L) {
    const d = Math.hypot(e.x - L.tx, e.y - L.ty);
    if (d > HEAR) return;
    const n = (this.window[e.type] || 0) + 1;
    if (n > (LIMIT[e.type] || 4)) return;
    this.window[e.type] = n;
    const vol = Math.pow(1 - d / HEAR, 1.6);
    const [ix] = toIso(e.x, e.y);
    const sx = (ix - L.cam.x) * L.cam.zoom;
    const pan = Math.max(-0.9, Math.min(0.9, (sx - L.w / 2) / (L.w / 2)));
    switch (e.type) {
      case 'shot': return this.shot(vol, pan, 1);
      case 'rifle': return this.shot(vol * 1.2, pan, 2);
      case 'mg': return this.shot(vol * 0.8, pan, 3);
      case 'groan': return this.groan(vol, pan, e.kind);
      case 'bite': return this.bite(vol, pan);
      case 'bash': return this.bash(vol, pan, e.stone);
      case 'zdeath': return this.zdeath(vol, pan, e.kind);
    }
  }

  // Gemidos ambiente: de vez em quando um zumbi visível perto da câmera geme.
  ambient(dt, game, L) {
    if (!this.ready) return;
    this.ambientT -= dt;
    if (this.ambientT > 0) return;
    const near = game.zombies.filter((z) => {
      if (Math.hypot(z.x - L.tx, z.y - L.ty) > HEAR * 0.8) return false;
      return game.map.visible[game.map.idx(Math.floor(z.x), Math.floor(z.y))];
    });
    // Quanto mais zumbis por perto, mais gemidos.
    this.ambientT = near.length ? Math.max(0.6, 5 / Math.sqrt(near.length)) * (0.6 + Math.random() * 0.8) : 2;
    if (!near.length) return;
    const z = near[Math.floor(Math.random() * near.length)];
    this.spatial({ type: 'groan', x: z.x, y: z.y, kind: z.type }, L);
  }

  static listener(state, renderer) {
    const { cam } = state;
    const [tx, ty] = fromIso(cam.x + renderer.w / cam.zoom / 2, cam.y + renderer.h / cam.zoom / 2);
    return { tx, ty, cam, w: renderer.w };
  }

  // ---------- blocos ----------

  out(vol, pan) {
    const g = this.ctx.createGain();
    g.gain.value = vol;
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p).connect(this.master);
    } else {
      g.connect(this.master);
    }
    return g;
  }

  noiseSrc(t, dur) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.start(t, Math.random() * 0.5, dur + 0.05);
    return s;
  }

  env(param, t, peak, attack, decay) {
    param.setValueAtTime(0.0001, t);
    param.exponentialRampToValueAtTime(peak, t + attack);
    param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  // ---------- sons ----------

  // kind 1 = espingarda, 2 = rifle da torre (com eco), 3 = metralhadora (curto e seco)
  shot(vol, pan, kind) {
    const t = this.ctx.currentTime + Math.random() * 0.02;
    const out = this.out(vol, pan);
    const decay = kind === 2 ? 0.28 : kind === 3 ? 0.07 : 0.16;
    const n = this.noiseSrc(t, decay + 0.05);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(kind === 3 ? 3500 : 2600, t);
    f.frequency.exponentialRampToValueAtTime(kind === 2 ? 300 : 500, t + decay);
    const g = this.ctx.createGain();
    this.env(g.gain, t, kind === 2 ? 1.8 : 1.3, 0.002, decay);
    n.connect(f).connect(g).connect(out);
    if (kind === 2) g.connect(this.echo);
    // Estalo grave
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(kind === 2 ? 140 : 180, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.1);
    const og = this.ctx.createGain();
    this.env(og.gain, t, kind === 2 ? 1.6 : 1.0, 0.002, 0.11);
    o.connect(og).connect(out);
    o.start(t);
    o.stop(t + 0.15);
  }

  groan(vol, pan, kind = 'walker') {
    if (this.groans >= 4) return;
    this.groans++;
    const t = this.ctx.currentTime;
    const dur = kind === 'runner' ? 0.5 + Math.random() * 0.3 : 0.8 + Math.random() * 0.7;
    const base = kind === 'brute' ? 55 + Math.random() * 15 : kind === 'runner' ? 150 + Math.random() * 40 : 85 + Math.random() * 30;
    const out = this.out(vol * (kind === 'brute' ? 0.95 : 0.75), pan);
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(base * 1.15, t);
    o.frequency.linearRampToValueAtTime(base, t + dur * 0.4);
    o.frequency.linearRampToValueAtTime(base * (kind === 'runner' ? 1.4 : 0.8), t + dur);
    // Vibrato irregular
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 5 + Math.random() * 4;
    const lg = this.ctx.createGain();
    lg.gain.value = base * 0.06;
    lfo.connect(lg).connect(o.frequency);
    // Formante que abre e fecha (a "boca")
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 4;
    const f0 = kind === 'runner' ? 900 : 450;
    f.frequency.setValueAtTime(f0 * 0.7, t);
    f.frequency.linearRampToValueAtTime(f0 * 1.4, t + dur * 0.5);
    f.frequency.linearRampToValueAtTime(f0 * 0.6, t + dur);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1.2, t + 0.12);
    g.gain.setValueAtTime(1.2, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(lp).connect(g).connect(out);
    // Respiração rouca por baixo
    const n = this.noiseSrc(t, dur);
    const nf = this.ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 700;
    nf.Q.value = 1.5;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.3, t + 0.1);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(nf).connect(ng).connect(out);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
    o.onended = () => this.groans--;
  }

  bite(vol, pan) {
    const t = this.ctx.currentTime;
    const out = this.out(vol * 2.2, pan);
    const n = this.noiseSrc(t, 0.12);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1200;
    f.Q.value = 2;
    const g = this.ctx.createGain();
    this.env(g.gain, t, 0.6, 0.005, 0.09);
    n.connect(f).connect(g).connect(out);
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(90, t + 0.08);
    const og = this.ctx.createGain();
    this.env(og.gain, t, 0.35, 0.003, 0.08);
    o.connect(og).connect(out);
    o.start(t);
    o.stop(t + 0.12);
  }

  bash(vol, pan, stone) {
    const t = this.ctx.currentTime;
    const out = this.out(vol * 2.2, pan);
    const n = this.noiseSrc(t, 0.15);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = stone ? 500 : 900;
    const g = this.ctx.createGain();
    this.env(g.gain, t, 0.7, 0.003, 0.12);
    n.connect(f).connect(g).connect(out);
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(stone ? 110 : 170, t);
    o.frequency.exponentialRampToValueAtTime(stone ? 60 : 90, t + 0.12);
    const og = this.ctx.createGain();
    this.env(og.gain, t, 0.6, 0.002, 0.14);
    o.connect(og).connect(out);
    o.start(t);
    o.stop(t + 0.2);
  }

  zdeath(vol, pan, kind) {
    const t = this.ctx.currentTime;
    const out = this.out(vol * 1.6, pan);
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    const base = kind === 'brute' ? 70 : kind === 'runner' ? 170 : 110;
    o.frequency.setValueAtTime(base * 1.3, t);
    o.frequency.exponentialRampToValueAtTime(base * 0.45, t + 0.45);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(1200, t);
    f.frequency.exponentialRampToValueAtTime(250, t + 0.45);
    const g = this.ctx.createGain();
    this.env(g.gain, t, 0.45, 0.01, 0.45);
    o.connect(f).connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.5);
    // Baque do corpo no chão
    const n = this.noiseSrc(t + 0.28, 0.12);
    const nf = this.ctx.createBiquadFilter();
    nf.type = 'lowpass';
    nf.frequency.value = 300;
    const ng = this.ctx.createGain();
    this.env(ng.gain, t + 0.28, 0.6, 0.004, 0.1);
    n.connect(nf).connect(ng).connect(out);
  }

  // Sino de alerta: três badaladas com parciais inarmônicos.
  bell() {
    const out = this.out(0.55, 0);
    for (let k = 0; k < 3; k++) {
      const t = this.ctx.currentTime + 0.05 + k * 1.1;
      for (const [ratio, amp, dec] of [[1, 0.5, 2.4], [2.76, 0.25, 1.6], [5.4, 0.12, 0.9], [8.9, 0.05, 0.5]]) {
        const o = this.ctx.createOscillator();
        o.frequency.value = 392 * ratio;
        const g = this.ctx.createGain();
        this.env(g.gain, t, amp, 0.004, dec);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + dec + 0.1);
      }
      // Batida do badalo
      const n = this.noiseSrc(t, 0.03);
      const ng = this.ctx.createGain();
      this.env(ng.gain, t, 0.3, 0.001, 0.03);
      n.connect(ng).connect(out);
    }
  }

  // Corneta grave quando a horda chega, seguida de um coro de gemidos.
  horn() {
    const t = this.ctx.currentTime + 0.05;
    const out = this.out(0.6, 0);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.linearRampToValueAtTime(900, t + 0.6);
    lp.frequency.linearRampToValueAtTime(400, t + 2.6);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.5);
    g.gain.setValueAtTime(0.5, t + 1.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
    lp.connect(g).connect(out);
    for (const [f, det] of [[98, 0], [98, 7], [147, -5]]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * 0.94, t);
      o.frequency.linearRampToValueAtTime(f, t + 0.4);
      o.detune.value = det;
      o.connect(lp);
      o.start(t);
      o.stop(t + 2.9);
    }
    for (let k = 0; k < 5; k++) {
      setTimeout(() => {
        if (this.ready) this.groan(0.35 + Math.random() * 0.2, Math.random() * 1.6 - 0.8, ['walker', 'brute', 'walker', 'runner', 'walker'][k]);
      }, 1800 + k * 380);
    }
  }
}
