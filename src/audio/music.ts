/**
 * Música xiptune original: llançador de passos amb anticipació sobre Web Audio.
 * Dues pistes: tema de menú (loop) i fanfàrria de celebració del campió.
 */
export type TrackName = 'menu' | 'champion';

interface Track {
  bpm: number;
  /** Notes en semitons des de A3 (null = silenci). 16 passos per compàs. */
  lead: (number | null)[];
  bass: (number | null)[];
  arp: (number | null)[];
  loop: boolean;
}

const N = null;

// Tema de menú: loop de 8 compassos (128 passos de semicorxera)
const MENU_LEAD: (number | null)[] = [
  // Am
  12, N, N, 15, N, 14, N, 12, N, N, 10, N, 12, N, N, N,
  // F
  8, N, N, 12, N, 10, N, 8, N, N, 5, N, 8, N, N, N,
  // C
  15, N, N, 19, N, 17, N, 15, N, N, 12, N, 15, N, N, N,
  // G
  14, N, N, 17, N, 15, N, 14, N, N, 10, N, 14, 12, N, N,
  // Am
  12, N, 15, N, 19, N, 17, N, 15, N, 12, N, 14, N, N, N,
  // F
  13, N, 17, N, 20, N, 17, N, 13, N, 12, N, 8, N, N, N,
  // C
  15, N, 19, N, 22, N, 19, N, 15, N, 14, N, 12, N, N, N,
  // G (turnaround)
  14, N, 17, N, 14, N, 10, N, 14, 15, 17, N, 14, N, N, N,
];

const bassLine = (roots: number[]): (number | null)[] => {
  const out: (number | null)[] = [];
  for (const r of roots) {
    for (let i = 0; i < 16; i++) out.push(i % 4 === 0 ? (i % 8 === 0 ? r : r + 12) : N);
  }
  return out;
};

const arpLine = (chords: number[][]): (number | null)[] => {
  const out: (number | null)[] = [];
  for (const c of chords) {
    for (let i = 0; i < 16; i++) out.push(i % 2 === 0 ? c[(i / 2) % c.length] : N);
  }
  return out;
};

const TRACKS: Record<TrackName, Track> = {
  menu: {
    bpm: 124,
    lead: MENU_LEAD,
    bass: bassLine([-12, -16, -9, -14, -12, -16, -9, -14]),
    arp: arpLine([[0, 3, 7, 12], [-4, 0, 3, 8], [3, 7, 10, 15], [2, 5, 9, 14], [0, 3, 7, 12], [-4, 0, 3, 8], [3, 7, 10, 15], [2, 5, 9, 14]]),
    loop: true,
  },
  champion: {
    bpm: 140,
    lead: [
      12, N, 16, N, 19, N, 24, N, N, N, 19, N, 24, N, N, N,
      23, N, 19, N, 16, N, 19, N, 23, N, 26, N, 28, N, N, N,
      24, N, 28, N, 31, N, 36, N, N, N, 31, N, 36, N, N, N,
      35, 33, 31, 28, 26, 28, 31, 35, 36, N, N, N, 36, N, N, N,
    ],
    bass: bassLine([0, -5, 0, -5]),
    arp: arpLine([[0, 4, 7, 12], [-5, 2, 7, 11], [0, 4, 7, 12], [-5, 2, 7, 12]]),
    loop: true,
  },
};

const A3 = 220;
const freq = (semi: number): number => A3 * Math.pow(2, semi / 12);

export class MusicPlayer {
  private timer: number | null = null;
  private step = 0;
  private nextTime = 0;
  private current: Track | null = null;
  private name: TrackName | null = null;

  constructor(
    private ctx: AudioContext,
    private bus: GainNode,
  ) {}

  play(name: TrackName): void {
    if (this.name === name && this.timer !== null) return;
    this.stop();
    this.name = name;
    this.current = TRACKS[name];
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.name = null;
    this.current = null;
  }

  private schedule(): void {
    const tr = this.current;
    if (!tr) return;
    const stepDur = 60 / tr.bpm / 4;
    while (this.nextTime < this.ctx.currentTime + 0.15) {
      const i = this.step % tr.lead.length;
      const t = this.nextTime;
      const lead = tr.lead[i];
      if (lead !== null) this.note(freq(lead), t, stepDur * 2.2, 'square', 0.13);
      const b = tr.bass[i % tr.bass.length];
      if (b !== null) this.note(freq(b), t, stepDur * 1.8, 'triangle', 0.3);
      const a = tr.arp[i % tr.arp.length];
      if (a !== null) this.note(freq(a + 12), t, stepDur * 0.9, 'square', 0.05);
      if (i % 4 === 2) this.hat(t, 0.06);
      if (i % 16 === 0) this.kick(t);
      this.step++;
      if (!tr.loop && this.step >= tr.lead.length) {
        this.stop();
        return;
      }
      this.nextTime += stepDur;
    }
  }

  private note(f: number, t: number, dur: number, type: OscillatorType, gain: number): void {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.bus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private hat(t: number, gain: number): void {
    const len = Math.floor(this.ctx.sampleRate * 0.04);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 6000;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    s.connect(f);
    f.connect(g);
    g.connect(this.bus);
    s.start(t);
  }

  private kick(t: number): void {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    o.connect(g);
    g.connect(this.bus);
    o.start(t);
    o.stop(t + 0.18);
  }
}
