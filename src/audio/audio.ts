import { HitKey, Stroke } from '../players/player';
import { MusicPlayer, TrackName } from './music';

export interface AudioSettings {
  master: number;
  sfx: number;
  crowd: number;
  music: number;
  voice: boolean;
}

export const DEFAULT_AUDIO: AudioSettings = { master: 0.8, sfx: 0.9, crowd: 0.7, music: 0.6, voice: true };

/**
 * Tot el so es sintetitza amb Web Audio (sense fitxers): cops de raqueta,
 * bots, xarxa, passos, públic, veu del jutge (síntesi de veu del navegador)
 * i música xiptune per als menús i la celebració.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private crowdBus!: GainNode;
  private musicBus!: GainNode;
  private noise!: AudioBuffer;
  private ambience: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private music: MusicPlayer | null = null;
  settings: AudioSettings = { ...DEFAULT_AUDIO };
  private lastStep = 0;

  /** Ha de cridar-se des d'un gest de l'usuari. */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const c = this.ctx;
      this.master = c.createGain();
      this.sfxBus = c.createGain();
      this.crowdBus = c.createGain();
      this.musicBus = c.createGain();
      this.sfxBus.connect(this.master);
      this.crowdBus.connect(this.master);
      this.musicBus.connect(this.master);
      const comp = c.createDynamicsCompressor();
      this.master.connect(comp);
      comp.connect(c.destination);
      this.noise = this.makeNoise(c);
      this.music = new MusicPlayer(c, this.musicBus);
      this.apply();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  setSettings(s: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...s };
    this.apply();
    if (!this.settings.voice && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  private apply(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.settings.master, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.settings.sfx, t, 0.05);
    this.crowdBus.gain.setTargetAtTime(this.settings.crowd, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.settings.music * 0.55, t, 0.05);
  }

  private makeNoise(c: AudioContext): AudioBuffer {
    const len = c.sampleRate * 2;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      // soroll rosa aproximat
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.25;
    }
    return buf;
  }

  private noiseSrc(loop = false): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.loop = loop;
    return s;
  }

  // ------------------------------------------------------------------- SFX
  private burst(dur: number, freq: number, q: number, gain: number, type: BiquadFilterType = 'bandpass', bus?: GainNode, delay = 0): void {
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const src = this.noiseSrc();
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(bus ?? this.sfxBus);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.02);
  }

  private tone(freq0: number, freq1: number, dur: number, gain: number, type: OscillatorType = 'sine', bus?: GainNode, delay = 0): void {
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, freq1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(bus ?? this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** Impacte de la pilota amb les cordes. */
  hit(stroke: Stroke, variant: HitKey, power: number): void {
    if (!this.ready) return;
    const p = Math.max(0.2, Math.min(1, power));
    let bright = 1800 + p * 1600;
    let q = 1.4;
    if (variant === 'slice') {
      bright *= 0.65;
      q = 0.9;
    } else if (variant === 'top') {
      bright *= 1.2;
      q = 1.8;
    } else if (variant === 'lob') bright *= 0.75;
    if (stroke === 'serve' || stroke === 'smash') {
      bright *= 1.1;
      this.burst(0.05, 4200, 1.2, 0.5 * p, 'highpass');
    }
    if (stroke === 'vol') {
      bright *= 0.8;
    }
    this.burst(0.07, bright, q, 0.75 * p + 0.15);
    this.tone(220 + p * 60, 120, 0.07, 0.35 * p + 0.1, 'sine');
    this.tone(1100 + p * 500, 700, 0.025, 0.12, 'triangle');
  }

  bounce(vz: number, speed: number): void {
    if (!this.ready) return;
    const g = Math.min(1, 0.15 + vz / 14);
    this.burst(0.05, 900 + speed * 12, 0.9, 0.5 * g, 'lowpass');
    this.tone(150 + Math.min(80, speed * 2), 80, 0.06, 0.28 * g, 'sine');
  }

  net(speed: number, cord: boolean): void {
    if (!this.ready) return;
    const g = Math.min(1, speed / 25);
    this.burst(0.18, 420, 0.7, 0.55 * g + 0.1, 'lowpass');
    this.burst(0.22, 3200, 1.5, 0.3 * g + 0.08, 'highpass', undefined, 0.01);
    if (cord) this.tone(1500, 900, 0.1, 0.12, 'triangle');
  }

  step(slide: boolean): void {
    if (!this.ready) return;
    const now = this.ctx!.currentTime;
    if (now - this.lastStep < 0.09) return;
    this.lastStep = now;
    if (slide) {
      this.burst(0.2, 2000, 0.8, 0.14, 'bandpass');
      return;
    }
    this.burst(0.03, 2400 + Math.random() * 600, 1.5, 0.09);
    if (Math.random() < 0.18) this.tone(1900 + Math.random() * 500, 2600, 0.025, 0.04, 'sine');
  }

  toss(): void {
    if (!this.ready) return;
    this.tone(500, 900, 0.1, 0.05, 'sine');
  }

  /** Avís de falta / fora: bip del jutge de línia. */
  lineCall(): void {
    if (!this.ready) return;
    this.tone(880, 880, 0.14, 0.18, 'square');
    this.tone(880, 880, 0.14, 0.18, 'square', undefined, 0.18);
  }

  point(): void {
    if (!this.ready) return;
    this.tone(660, 660, 0.09, 0.1, 'triangle');
    this.tone(990, 990, 0.14, 0.1, 'triangle', undefined, 0.09);
  }

  // ---------------------------------------------------------------- Públic
  startAmbience(): void {
    if (!this.ctx || this.ambience) return;
    const c = this.ctx;
    const src = this.noiseSrc(true);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 650;
    f.Q.value = 0.5;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    const g = c.createGain();
    g.gain.value = 0.0001;
    g.gain.setTargetAtTime(0.09, c.currentTime, 0.8);
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.23;
    const lg = c.createGain();
    lg.gain.value = 0.025;
    lfo.connect(lg);
    lg.connect(g.gain);
    lfo.start();
    src.connect(f);
    f.connect(lp);
    lp.connect(g);
    g.connect(this.crowdBus);
    src.start();
    this.ambience = { gain: g, filter: f };
  }

  stopAmbience(): void {
    if (!this.ctx || !this.ambience) return;
    this.ambience.gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.3);
    this.ambience = null;
  }

  setCrowdLevel(level: number): void {
    if (!this.ctx || !this.ambience) return;
    const t = this.ctx.currentTime;
    this.ambience.gain.gain.setTargetAtTime(0.07 + 0.12 * level, t, 0.4);
    this.ambience.filter.frequency.setTargetAtTime(600 + 500 * level, t, 0.4);
  }

  cheer(level: number): void {
    if (!this.ready) return;
    const c = this.ctx!;
    const t = c.currentTime;
    const dur = 0.8 + level * 1.8;
    const src = this.noiseSrc(true);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.linearRampToValueAtTime(1500 + level * 500, t + 0.3);
    f.Q.value = 0.6;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.25 + level * 0.35, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.crowdBus);
    src.start(t, Math.random());
    src.stop(t + dur + 0.1);
    // veus "ooh" tonals
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(190, t);
    o.frequency.linearRampToValueAtTime(260, t + 0.5);
    const of = c.createBiquadFilter();
    of.type = 'bandpass';
    of.frequency.value = 800;
    of.Q.value = 2;
    const og = c.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.linearRampToValueAtTime(0.05 + 0.05 * level, t + 0.25);
    og.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.8);
    o.connect(of);
    of.connect(og);
    og.connect(this.crowdBus);
    o.start(t);
    o.stop(t + dur);
  }

  applause(level: number): void {
    if (!this.ready) return;
    const n = 30 + Math.floor(level * 90);
    const dur = 1.5 + level * 2.2;
    for (let i = 0; i < n; i++) {
      const d = Math.pow(Math.random(), 0.8) * dur;
      const fade = 1 - d / (dur * 1.1);
      this.burst(0.03, 1800 + Math.random() * 2200, 0.8, 0.07 * fade + 0.01, 'bandpass', this.crowdBus, d);
    }
    this.cheer(level * 0.7);
  }

  gasp(level: number): void {
    if (!this.ready) return;
    const c = this.ctx!;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(260, t);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.7);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.linearRampToValueAtTime(500, t + 0.7);
    f.Q.value = 2.5;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.1 * level + 0.03, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    o.connect(f);
    f.connect(g);
    g.connect(this.crowdBus);
    o.start(t);
    o.stop(t + 0.85);
    this.burst(0.5, 1100, 0.7, 0.12 * level, 'bandpass', this.crowdBus);
  }

  murmur(level: number): void {
    if (!this.ready) return;
    this.burst(0.7, 700 + level * 400, 0.6, 0.08 + 0.06 * level, 'bandpass', this.crowdBus);
  }

  // ------------------------------------------------------------ Jutge de cadira
  private voice: SpeechSynthesisVoice | null = null;

  announce(text: string): void {
    if (!this.settings.voice || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const voices = synth.getVoices();
      if (!this.voice && voices.length) {
        this.voice =
          voices.find((v) => v.lang.toLowerCase().startsWith('ca')) ??
          voices.find((v) => v.lang.toLowerCase().startsWith('es')) ??
          voices[0] ??
          null;
      }
      if (this.voice) {
        u.voice = this.voice;
        u.lang = this.voice.lang;
      } else u.lang = 'ca-ES';
      u.pitch = 0.8;
      u.rate = 0.95;
      u.volume = Math.min(1, this.settings.master * 0.9);
      synth.speak(u);
    } catch {
      /* sense veu disponible */
    }
  }

  // ----------------------------------------------------------------- Música
  playMusic(track: TrackName): void {
    this.music?.play(track);
  }

  stopMusic(): void {
    this.music?.stop();
  }
}

export const audio = new AudioEngine();
