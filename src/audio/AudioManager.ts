import { events } from '@/core/EventBus';
import { LocalStore } from '@/storage/LocalStore';

/**
 * Audio del juego con Web Audio API.
 *
 * Mientras no haya archivos en public/assets/audio, los efectos y la música
 * de percusión tribal se SINTETIZAN en tiempo real: no pesan nada y no tienen
 * derechos de autor. Para usar audio real basta con implementar `playSample`
 * y llamar a ella desde `sfx()` / `startMusic()`.
 *
 * Los navegadores móviles exigen un gesto del usuario antes de sonar:
 * `unlock()` se llama en el primer toque o tecla.
 */
export type SfxName =
  | 'coin' | 'jump' | 'superJump' | 'roll' | 'lane' | 'stumble' | 'hit'
  | 'powerup' | 'powerdown' | 'shield' | 'tick' | 'go'
  | 'battleStart' | 'punch' | 'dodge' | 'hurt' | 'victory' | 'defeat' | 'roar';

const BPM = 112;
const STEPS = 16;
const STEP_TIME = 60 / BPM / 4;

/** Patrón de 16 pasos: 1 = golpe. */
const DRUMS = {
  lowTom:  [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0],
  highTom: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1],
  shaker:  [1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1],
  clack:   [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
};
/** Línea de marimba en escala pentatónica (semitonos sobre La 220 Hz; null = silencio). */
const MARIMBA: Array<number | null> = [0, null, 3, null, 5, null, 7, 5, null, 3, null, 0, 10, null, 7, null];

export class AudioManager {
  private ctx?: AudioContext;
  private master?: GainNode;
  private sfxGain?: GainNode;
  private musicGain?: GainNode;
  private noiseBuffer?: AudioBuffer;
  private musicTimer?: number;
  private nextStepTime = 0;
  private step = 0;
  private bar = 0;
  private musicWanted = false;
  private lastCoinTime = 0;
  private coinPitch = 0;

  constructor() {
    LocalStore.onSettingsChange(() => this.applySettings());
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  /** Crea/reanuda el contexto. Debe llamarse dentro de un gesto del usuario. */
  unlock(): void {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.connect(this.master);
      this.noiseBuffer = this.createNoise();
      this.applySettings();
      if (this.musicWanted) this.startMusic();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private applySettings(): void {
    if (!this.sfxGain || !this.musicGain) return;
    const { sound, music } = LocalStore.settings;
    this.sfxGain.gain.value = sound ? 0.55 : 0;
    this.musicGain.gain.value = music ? 0.32 : 0;
  }

  /** Conecta los eventos del juego con sus sonidos. */
  bindGameEvents(): void {
    events.on('coin:collected', () => this.sfx('coin'));
    events.on('player:jump', (e) => this.sfx(e.super ? 'superJump' : 'jump'));
    events.on('player:roll', () => this.sfx('roll'));
    events.on('player:lane', () => this.sfx('lane'));
    events.on('player:stumble', () => this.sfx('stumble'));
    events.on('player:hit', () => {
      this.sfx('hit');
      this.setMusicIntensity(0);
    });
    events.on('powerup:start', () => this.sfx('powerup'));
    events.on('powerup:end', ({ type }) => type !== 'shield' && this.sfx('powerdown'));
    events.on('shield:break', () => this.sfx('shield'));
    events.on('run:countdown', ({ value }) => this.sfx(value > 0 ? 'tick' : 'go'));
    events.on('run:start', () => this.setMusicIntensity(1));
    events.on('run:pause', () => this.setMusicIntensity(0.35));
    events.on('run:resume', () => this.setMusicIntensity(1));
    events.on('run:over', () => this.setMusicIntensity(0.35));
    events.on('battle:trigger', () => this.sfx('battleStart'));
    events.on('battle:hit', ({ target, grade }) => {
      if (target === 'rival') this.sfx('punch');
      else this.sfx(grade === 'miss' ? 'hurt' : 'dodge');
    });
    events.on('battle:finished', ({ won }) => this.sfx(won ? 'victory' : 'defeat'));
    events.on('ability:used', ({ ability }) => ability === 'stun_roar' && this.sfx('roar'));
    // Los anuncios traen su propio sonido: el juego calla mientras tanto
    events.on('ad:start', () => this.master && (this.master.gain.value = 0));
    events.on('ad:end', () => this.master && (this.master.gain.value = 1));
    events.on('run:revived', () => this.setMusicIntensity(1));
  }

  // --- Efectos ----------------------------------------------------------------

  sfx(name: SfxName): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxGain || !LocalStore.settings.sound) return;
    const t = ctx.currentTime;

    switch (name) {
      case 'coin': {
        // Las monedas seguidas suben de tono (sensación de racha)
        const now = performance.now();
        this.coinPitch = now - this.lastCoinTime < 350 ? Math.min(this.coinPitch + 1, 8) : 0;
        this.lastCoinTime = now;
        const base = 990 * Math.pow(2, this.coinPitch / 24);
        this.tone(t, base, 0.06, 'square', 0.18);
        this.tone(t + 0.05, base * 1.5, 0.12, 'square', 0.16);
        break;
      }
      case 'jump':
        this.sweep(t, 260, 620, 0.16, 'triangle', 0.4);
        break;
      case 'superJump':
        this.sweep(t, 220, 1200, 0.32, 'triangle', 0.45);
        this.sweep(t + 0.05, 330, 1600, 0.3, 'sine', 0.2);
        break;
      case 'roll':
        this.noise(t, 0.22, 900, 'bandpass', 0.35, 2200);
        break;
      case 'lane':
        this.noise(t, 0.07, 2500, 'highpass', 0.12);
        break;
      case 'stumble':
        this.sweep(t, 200, 90, 0.15, 'square', 0.25);
        break;
      case 'hit':
        this.sweep(t, 160, 40, 0.45, 'sawtooth', 0.45);
        this.noise(t, 0.4, 500, 'lowpass', 0.6);
        break;
      case 'powerup':
        [0, 4, 7, 12].forEach((s, i) => this.tone(t + i * 0.07, 523 * Math.pow(2, s / 12), 0.12, 'triangle', 0.3));
        break;
      case 'powerdown':
        [12, 7, 0].forEach((s, i) => this.tone(t + i * 0.08, 523 * Math.pow(2, s / 12), 0.1, 'triangle', 0.18));
        break;
      case 'shield':
        this.noise(t, 0.35, 3000, 'highpass', 0.4);
        this.sweep(t, 1400, 500, 0.3, 'triangle', 0.25);
        break;
      case 'tick':
        this.tone(t, 660, 0.1, 'square', 0.25);
        break;
      case 'go':
        this.tone(t, 990, 0.25, 'square', 0.3);
        break;
      case 'battleStart':
        // Cuerno tribal + tambor
        this.sweep(t, 147, 196, 0.5, 'sawtooth', 0.28);
        this.sweep(t + 0.5, 196, 220, 0.6, 'sawtooth', 0.3);
        this.sweep(t, 120, 50, 0.4, 'sine', 0.9);
        break;
      case 'punch':
        this.sweep(t, 180, 60, 0.12, 'sine', 0.7);
        this.noise(t, 0.06, 1500, 'bandpass', 0.25);
        break;
      case 'dodge':
        this.noise(t, 0.18, 800, 'bandpass', 0.35, 3500);
        break;
      case 'hurt':
        this.sweep(t, 300, 120, 0.25, 'square', 0.3);
        this.noise(t, 0.2, 700, 'lowpass', 0.4);
        break;
      case 'victory':
        [0, 4, 7, 12, 16].forEach((st, i) => this.tone(t + i * 0.11, 392 * Math.pow(2, st / 12), 0.3, 'triangle', 0.32));
        break;
      case 'defeat':
        [7, 3, 0, -5].forEach((st, i) => this.tone(t + i * 0.18, 330 * Math.pow(2, st / 12), 0.3, 'triangle', 0.28));
        break;
      case 'roar':
        this.sweep(t, 220, 90, 0.6, 'sawtooth', 0.35);
        this.noise(t, 0.55, 400, 'lowpass', 0.5);
        break;
    }
  }

  private envelope(start: number, duration: number, peak: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    return g;
  }

  private tone(start: number, freq: number, duration: number, type: OscillatorType, peak: number, out = this.sfxGain!): void {
    const osc = this.ctx!.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    const g = this.envelope(start, duration, peak);
    osc.connect(g).connect(out);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  private sweep(start: number, from: number, to: number, duration: number, type: OscillatorType, peak: number, out = this.sfxGain!): void {
    const osc = this.ctx!.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(to, start + duration);
    const g = this.envelope(start, duration, peak);
    osc.connect(g).connect(out);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  private noise(
    start: number, duration: number, freq: number, type: BiquadFilterType, peak: number,
    sweepTo?: number, out = this.sfxGain!,
  ): void {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noiseBuffer!;
    const filter = this.ctx!.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, start);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, start + duration);
    const g = this.envelope(start, duration, peak);
    src.connect(filter).connect(g).connect(out);
    src.start(start, Math.random() * 0.5);
    src.stop(start + duration + 0.02);
  }

  private createNoise(): AudioBuffer {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  // --- Música -----------------------------------------------------------------

  startMusic(): void {
    this.musicWanted = true;
    if (!this.ctx || this.musicTimer !== undefined) return;
    this.nextStepTime = this.ctx.currentTime + 0.1;
    this.step = 0;
    // Programador con anticipación: robusto aunque el hilo principal vaya cargado
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 25);
  }

  stopMusic(): void {
    this.musicWanted = false;
    if (this.musicTimer !== undefined) window.clearInterval(this.musicTimer);
    this.musicTimer = undefined;
  }

  private intensity = 0.35;

  /** 0 = solo percusión suave (menú/pausa), 1 = completa (partida). */
  setMusicIntensity(value: number): void {
    this.intensity = value;
  }

  private scheduleMusic(): void {
    const ctx = this.ctx!;
    while (this.nextStepTime < ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextStepTime);
      this.nextStepTime += STEP_TIME;
      this.step = (this.step + 1) % STEPS;
      if (this.step === 0) this.bar++;
    }
  }

  private playStep(step: number, t: number): void {
    const out = this.musicGain!;
    const full = this.intensity >= 0.9;
    if (this.intensity <= 0) return;

    if (DRUMS.lowTom[step]) this.sweep(t, 110, 55, 0.35, 'sine', 0.9, out);
    if (full && DRUMS.highTom[step]) this.sweep(t, 220, 120, 0.22, 'sine', 0.55, out);
    if (DRUMS.shaker[step]) this.noise(t, 0.05, 6000, 'highpass', step % 4 === 0 ? 0.22 : 0.12, undefined, out);
    if (full && DRUMS.clack[step]) this.noise(t, 0.04, 1800, 'bandpass', 0.35, undefined, out);

    // La marimba entra en compases alternos para que no canse
    const note = MARIMBA[step];
    if (full && note !== null && this.bar % 4 >= 2) {
      const f = 220 * Math.pow(2, note / 12);
      this.tone(t, f, 0.25, 'sine', 0.25, out);
      this.tone(t, f * 4, 0.06, 'sine', 0.06, out); // "golpe" de mazo
    }
  }
}

export const audio = new AudioManager();
