import { audio } from '../audio/audio';
import { DT, TIME_SCALE } from '../engine/constants';
import { HumanController, InputManager } from '../controls/input';
import { Renderer } from '../render/renderer';
import { Match, MatchEvent } from './match';

export interface HudState {
  names: [string, string];
  /** Sets acabats [jugador0, jugador1]. */
  sets: [number, number][];
  games: [number, number];
  points: [string, string];
  setsWon: [number, number];
  server: 0 | 1;
  tiebreak: boolean;
  serveStage: 1 | 2;
  phase: Match['phase'];
  /** Text del jutge (efímer). */
  banner: string;
  bannerId: number;
  /** Identificador que canvia cada punt (per a l'animació del marcador). */
  pointId: number;
  /** Jugador que ha guanyat l'últim punt. */
  lastWinner: number;
  paused: boolean;
  rally: number;
  /** Qui ha de servir i és humà (per mostrar el text SERVEI). */
  humanServing: boolean;
  humanIdx: 0 | 1 | null;
  serveSpeed: number;
  stamina: [number, number];
}

export interface RunnerOptions {
  assist: boolean;
  /** Mode demostració del menú: sense so ni entrada. */
  attract?: boolean;
  onHud: (h: HudState) => void;
  onEnd: (m: Match) => void;
}

/**
 * Bucle de joc: pas fix de física (DT) amb acumulador, independent dels FPS.
 * El renderitzat llegeix l'estat actual i transmet els esdeveniments al so i a la UI.
 */
export class GameRunner {
  private raf = 0;
  private last = 0;
  private acc = 0;
  private running = false;
  paused = false;
  private renderer: Renderer;
  private pointId = 0;
  private lastWinner = 0;
  private banner = '';
  private bannerId = 0;
  private hudTimer = 0;
  private ended = false;
  private serveSpeed = 0;
  private crowdTimer = 0;

  constructor(
    canvas: HTMLCanvasElement,
    readonly match: Match,
    private input: InputManager | null,
    private human: HumanController | null,
    private opts: RunnerOptions,
  ) {
    this.renderer = new Renderer(canvas);
    this.renderer.assist = opts.assist;
    this.renderer.humanIdx = match.cfg.humanIdx;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.input?.attach();
    if (!this.opts.attract) audio.startAmbience();
    this.raf = requestAnimationFrame(this.frame);
    this.emitHud();
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.input?.detach();
    if (!this.opts.attract) audio.stopAmbience();
  }

  setPaused(p: boolean): void {
    this.paused = p;
    if (p) this.input?.clear();
    this.emitHud();
  }

  private frame = (ts: number): void => {
    if (!this.running) return;
    let dt = (ts - this.last) / 1000;
    this.last = ts;
    if (dt > 0.1) dt = 0.1;
    if (!this.paused) {
      this.acc += dt * TIME_SCALE;
      let n = 0;
      while (this.acc >= DT && n < 40) {
        this.match.step(DT);
        this.acc -= DT;
        n++;
        if (this.match.events.length) this.route(this.match.drainEvents());
      }
      if (this.human) {
        this.renderer.aimX = this.human.aimX;
        this.renderer.aimY = this.human.aimY;
      }
    }
    this.renderer.draw(this.match, this.paused ? 0 : dt);
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.1;
      this.emitHud();
    }
    // Soroll ambient segons la intensitat de la jugada
    this.crowdTimer -= dt;
    if (this.crowdTimer <= 0 && !this.opts.attract) {
      this.crowdTimer = 0.5;
      audio.setCrowdLevel(Math.min(1, this.match.rallyHits / 14));
    }
    if (!this.ended && this.match.phase === 'match_end') {
      this.ended = true;
      window.setTimeout(() => this.opts.onEnd(this.match), 1800);
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  private route(events: MatchEvent[]): void {
    this.renderer.handleEvents(events);
    const attract = !!this.opts.attract;
    for (const e of events) {
      switch (e.type) {
        case 'hit':
          if (!attract) audio.hit(e.stroke, e.variant, e.power);
          break;
        case 'bounce':
          if (!attract) audio.bounce(e.vz, e.speed);
          break;
        case 'net':
          if (!attract) audio.net(e.speed, e.cord);
          break;
        case 'toss':
          if (!attract) audio.toss();
          break;
        case 'step':
          if (!attract) audio.step(e.slide);
          break;
        case 'fault':
        case 'out':
          if (!attract) audio.lineCall();
          break;
        case 'let':
          if (!attract) audio.lineCall();
          break;
        case 'point':
          this.pointId++;
          this.lastWinner = e.winner;
          if (!attract) audio.point();
          break;
        case 'announce':
          this.banner = e.text;
          this.bannerId++;
          if (e.speak && !attract) audio.announce(e.text);
          break;
        case 'crowd':
          if (attract) break;
          if (e.kind === 'cheer') audio.cheer(e.intensity);
          else if (e.kind === 'applause') audio.applause(e.intensity);
          else if (e.kind === 'gasp' || e.kind === 'ooh') audio.gasp(e.intensity);
          else audio.murmur(e.intensity);
          break;
        default:
          break;
      }
    }
    for (const e of events) {
      if (e.type === 'hit' && e.stroke === 'serve') {
        const b = this.match.ball;
        this.serveSpeed = Math.round(Math.hypot(b.vx, b.vy, b.vz) * 3.6);
      }
    }
  }

  private emitHud(): void {
    const m = this.match;
    const s = m.score;
    const hi = m.cfg.humanIdx;
    this.opts.onHud({
      names: m.names,
      sets: s.sets.map((x) => [x.games[0], x.games[1]] as [number, number]),
      games: [s.games[0], s.games[1]],
      points: [s.pointText(0), s.pointText(1)],
      setsWon: [s.setsWon[0], s.setsWon[1]],
      server: s.server,
      tiebreak: s.tiebreak,
      serveStage: m.serveStage,
      phase: m.phase,
      banner: this.banner,
      bannerId: this.bannerId,
      pointId: this.pointId,
      lastWinner: this.lastWinner,
      paused: this.paused,
      rally: m.rallyHits,
      humanServing: hi !== null && s.server === hi,
      humanIdx: hi,
      serveSpeed: this.serveSpeed,
      stamina: [m.players[0].stamina, m.players[1].stamina],
    });
  }

  celebrate(): void {
    this.renderer.celebrate();
  }
}
