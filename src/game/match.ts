import { BALL, COURT } from '../engine/constants';
import { clamp } from '../engine/math';
import { Rng } from '../engine/rng';
import { BallState, newBall, stepBall, BallEvents } from '../physics/ball';
import { Difficulty, DIFFICULTY } from '../ai/difficulty';
import { HitKey, Intent, NO_INTENT, Player, Stroke } from '../players/player';
import { PlayerDef } from '../players/roster';
import { ServeCtx, buildHit, chooseStroke, contactQuality, inServiceBox } from '../players/shots';
import { MatchScore, Side } from '../scoring/score';

export type Phase = 'intro' | 'serve_wait' | 'toss' | 'rally' | 'point_end' | 'match_end';

export interface Controller {
  update(m: Match, idx: 0 | 1, dt: number): Intent;
}

export type MatchEvent =
  | { type: 'hit'; player: number; stroke: Stroke; variant: HitKey; power: number; quality: number; x: number; y: number; z: number }
  | { type: 'bounce'; x: number; y: number; vz: number; speed: number; inBounds: boolean }
  | { type: 'net'; speed: number; cord: boolean }
  | { type: 'toss'; player: number }
  | { type: 'whiff'; player: number }
  | { type: 'fault'; player: number; double: boolean }
  | { type: 'let' }
  | { type: 'out'; near: boolean }
  | { type: 'point'; winner: number; reason: PointReason; rally: number }
  | { type: 'game'; winner: number }
  | { type: 'set'; winner: number }
  | { type: 'match'; winner: number }
  | { type: 'announce'; text: string; speak: boolean }
  | { type: 'step'; player: number; slide: boolean }
  | { type: 'crowd'; kind: 'cheer' | 'gasp' | 'applause' | 'murmur' | 'ooh'; intensity: number }
  | { type: 'pointStart' };

export type PointReason = 'ace' | 'winner' | 'out' | 'net' | 'doublefault' | 'double_bounce' | 'dead';

export interface PlayerMatchStats {
  aces: number;
  doubleFaults: number;
  winners: number;
  errors: number;
  firstServeIn: number;
  firstServeTotal: number;
  pointsWon: number;
  maxServeKmh: number;
  netPointsWon: number;
}

export interface MatchStats {
  p: [PlayerMatchStats, PlayerMatchStats];
  longestRally: number;
  totalPoints: number;
  duration: number;
}

const emptyStats = (): PlayerMatchStats => ({
  aces: 0,
  doubleFaults: 0,
  winners: 0,
  errors: 0,
  firstServeIn: 0,
  firstServeTotal: 0,
  pointsWon: 0,
  maxServeKmh: 0,
  netPointsWon: 0,
});

export interface MatchConfig {
  p0: PlayerDef;
  p1: PlayerDef;
  /** Qui és humà (0 = proper a la càmera) o null si ambdós són IA. */
  humanIdx: 0 | 1 | null;
  difficulty: Difficulty;
  seed: number;
  /** Temps morts reduïts (simulació ràpida). */
  fast?: boolean;
  firstServer?: Side;
}

export class Match {
  readonly players: [Player, Player];
  readonly ball: BallState = newBall();
  readonly score: MatchScore;
  readonly stats: MatchStats = { p: [emptyStats(), emptyStats()], longestRally: 0, totalPoints: 0, duration: 0 };
  readonly rng: Rng;
  readonly cfg: MatchConfig;
  controllers: [Controller, Controller];
  phase: Phase = 'intro';
  time = 0;
  events: MatchEvent[] = [];
  recordEvents = true;
  ballVisible = false;

  // Estat de la jugada
  lastHitter: number = -1;
  bounced = false; // la pilota ha botat després de l'últim cop
  bounceCount = 0;
  netTouched = false;
  serveAwait = false;
  serveStage: 1 | 2 = 1;
  rallyHits = 0;
  hitSeq = 0;
  lastHit: { player: number; x: number; y: number; z: number; stroke: Stroke; variant: HitKey; quality: number } | null = null;
  serveCtx: ServeCtx = { second: false, boxSign: -1 };
  pointDelay = 0;
  private timer = 0;
  private rollTime = 0;
  private sinceHit = 0;
  private lastPoint: { winner: number; reason: PointReason } | null = null;
  private matchOverPending = false;
  private evBall: BallEvents;
  lastRallyLen = 0;

  constructor(cfg: MatchConfig, controllers: [Controller, Controller]) {
    this.cfg = cfg;
    this.rng = new Rng(cfg.seed);
    this.players = [new Player(0, cfg.p0), new Player(1, cfg.p1)];
    const first: Side = cfg.firstServer ?? (this.rng.chance(0.5) ? 0 : 1);
    this.score = new MatchScore(first, 3);
    this.controllers = controllers;
    const dp = DIFFICULTY[cfg.difficulty];
    for (const p of this.players) {
      const isHuman = cfg.humanIdx === p.idx;
      p.diff = isHuman ? null : dp;
    }
    this.evBall = {
      bounce: (x, y, vz, speed) => this.onBounce(x, y, vz, speed),
      net: (speed, cord) => this.onNet(speed, cord),
      wall: () => this.onWall(),
    };
    this.timer = cfg.fast ? 0.01 : 1.8;
    this.ball.z = 5;
  }

  get server(): Side {
    return this.score.server;
  }

  emit(e: MatchEvent): void {
    if (this.recordEvents) this.events.push(e);
  }

  drainEvents(): MatchEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  get names(): [string, string] {
    return [this.cfg.p0.name, this.cfg.p1.name];
  }

  // ---------------------------------------------------------------- pas
  step(dt: number): void {
    this.time += dt;
    if (this.phase !== 'match_end') this.stats.duration += dt;

    // Controladors
    const intents: [Intent, Intent] = [NO_INTENT, NO_INTENT];
    for (const i of [0, 1] as const) {
      intents[i] = this.controllers[i].update(this, i, dt);
    }

    // Jugadors
    for (const p of this.players) {
      const it = intents[p.idx];
      const frozen = this.phase === 'intro' || this.phase === 'match_end';
      const stepped = p.update(dt, frozen ? NO_INTENT : it, true);
      if (stepped) this.emit({ type: 'step', player: p.idx, slide: p.slide > 0.5 });
    }

    switch (this.phase) {
      case 'intro':
        this.timer -= dt;
        if (this.timer <= 0) this.setupPoint(true);
        break;
      case 'serve_wait':
        this.holdBall();
        this.handleServeInput(intents);
        break;
      case 'toss':
        this.stepBallPhysics(dt, false);
        this.handleTossAndSwings(intents, dt);
        break;
      case 'rally':
        this.stepBallPhysics(dt, true);
        this.sinceHit += dt;
        this.handleSwings(intents, dt);
        this.checkDead(dt);
        break;
      case 'point_end':
        this.stepBallPhysics(dt, true);
        this.handleSwings(intents, dt, true);
        this.timer -= dt;
        if (this.timer <= 0) {
          if (this.faultReplay) this.resumeServe();
          else if (this.matchOverPending) {
            this.phase = 'match_end';
            this.emit({ type: 'match', winner: this.score.winner ?? 0 });
          } else this.setupPoint(false);
        }
        break;
      case 'match_end':
        this.stepBallPhysics(dt, true);
        break;
    }
  }

  private stepBallPhysics(dt: number, net: boolean): void {
    stepBall(this.ball, dt, { net, walls: true }, this.evBall);
  }

  // ------------------------------------------------------------ preparació
  private placePlayers(): void {
    const s = this.server;
    const r = (1 - s) as Side;
    const ps = this.players[s];
    const pr = this.players[r];
    const deuce = this.score.deuceCourt;
    const physRight = ps.dirY > 0 ? -1 : 1;
    ps.x = (deuce ? 1 : -1) * physRight * 1.3;
    ps.y = ps.side * (COURT.halfL + 0.55);
    // El receptor es col·loca a la diagonal de la caixa de servei
    pr.x = -Math.sign(ps.x) * 1.9;
    pr.y = pr.side * (COURT.halfL + 0.9 + (pr.def.style.baselineOffset > 1 ? 0.5 : 0));
    for (const p of this.players) {
      p.vx = 0;
      p.vy = 0;
      p.swing = null;
      p.tossing = false;
    }
  }

  private setupPoint(first: boolean): void {
    this.placePlayers();
    for (const p of this.players) p.recover(0.05);
    const ps = this.players[this.server];
    this.serveStage = 1;
    this.serveCtx = { second: false, boxSign: -Math.sign(ps.x) };
    this.resetRally();
    this.phase = 'serve_wait';
    this.ballVisible = true;
    this.holdBall();
    this.emit({ type: 'pointStart' });
    if (first) {
      this.emit({ type: 'announce', text: `${this.cfg.p0.name} contra ${this.cfg.p1.name}`, speak: true });
    }
  }

  /** Torna a servir després d'una falta o un let (sense canviar el marcador). */
  private resumeServe(): void {
    this.placePlayers();
    this.resetRally();
    this.faultReplay = false;
    this.phase = 'serve_wait';
    this.holdBall();
  }

  private resetRally(): void {
    this.lastHitter = -1;
    this.bounced = false;
    this.bounceCount = 0;
    this.netTouched = false;
    this.serveAwait = false;
    this.rallyHits = 0;
    this.sinceHit = 0;
    this.rollTime = 0;
  }

  private holdBall(): void {
    const ps = this.players[this.server];
    const physRight = ps.dirY > 0 ? -1 : 1;
    const b = this.ball;
    b.x = ps.x + physRight * 0.3;
    b.y = ps.y + ps.dirY * 0.25;
    b.z = 0.95;
    b.vx = b.vy = b.vz = 0;
    b.wx = b.wy = b.wz = 0;
  }

  // -------------------------------------------------------------- servei
  private handleServeInput(intents: [Intent, Intent]): void {
    const s = this.server;
    const it = intents[s];
    const ps = this.players[s];
    if (it.hit && !ps.swing) {
      const b = this.ball;
      b.vz = 6.25 + this.rng.range(-0.15, 0.15);
      b.vy = ps.dirY * 0.4;
      b.vx = 0;
      ps.tossing = true;
      this.phase = 'toss';
      this.emit({ type: 'toss', player: s });
    }
  }

  private handleTossAndSwings(intents: [Intent, Intent], _dt: number): void {
    const s = this.server;
    const ps = this.players[s];
    const it = intents[s];
    if (it.hit && !ps.swing && this.ball.z > 1.3) {
      const variant: HitKey = it.hit === 'lob' ? 'flat' : it.hit;
      ps.beginSwing('serve', variant, it.aimX, it.aimY);
    }
    const sw = ps.swing;
    if (sw) {
      // Actualitza la direcció amb el que manté el jugador fins al contacte
      if (!sw.done) {
        sw.aimX = it.aimX;
        sw.aimY = it.aimY;
      }
      if (!sw.done && sw.t >= sw.contactAt) {
        const q = contactQuality(ps, this.ball, 'serve');
        if (q.q > 0.0) {
          sw.done = true;
          sw.hitBall = true;
          this.executeHit(ps, q.q);
          return;
        }
        if (sw.t >= sw.windowEnd) {
          sw.done = true;
          this.emit({ type: 'whiff', player: s });
        }
      }
    }
    // La pilota llançada cau sense colpejar: es "recull" i es torna a començar
    if (!ps.swinging && this.ball.vz < 0 && this.ball.z < 1.05) {
      ps.tossing = false;
      this.phase = 'serve_wait';
      this.holdBall();
    }
  }

  // --------------------------------------------------------------- cops
  private handleSwings(intents: [Intent, Intent], _dt: number, frozen = false): void {
    for (const p of this.players) {
      const it = intents[p.idx];
      // Inici d'un cop
      if (!frozen && it.hit && !p.swing && p.swingCool <= 0 && this.phase === 'rally') {
        const stroke = chooseStroke(p, this.ball, this.bounced, it.hit);
        p.beginSwing(stroke, it.hit, it.aimX, it.aimY);
      }
      const sw = p.swing;
      if (!sw || sw.done) continue;
      if (!sw.done) {
        sw.aimX = it.aimX;
        sw.aimY = it.aimY;
      }
      if (this.phase !== 'rally') {
        if (sw.t >= sw.windowEnd) sw.done = true;
        continue;
      }
      if (sw.t >= sw.contactAt) {
        if (this.canHit(p)) {
          const q = contactQuality(p, this.ball, sw.stroke);
          // Contacte quan és prou bo o al final de la finestra
          if (q.q > 0 && (q.q >= 0.5 || sw.t >= sw.windowEnd - 0.02)) {
            sw.done = true;
            sw.hitBall = true;
            this.executeHit(p, q.q);
            continue;
          }
        }
        if (sw.t >= sw.windowEnd) {
          sw.done = true;
          this.emit({ type: 'whiff', player: p.idx });
        }
      }
    }
  }

  private canHit(p: Player): boolean {
    if (this.lastHitter === p.idx) return false;
    if (this.serveAwait) return false; // no es pot respondre al servei abans del bot
    return this.ball.y * p.side > -0.5;
  }

  private executeHit(p: Player, quality: number): void {
    const sw = p.swing!;
    const b = this.ball;
    const isServe = sw.stroke === 'serve';
    const serve = isServe ? this.serveCtx : null;
    const res = buildHit(p, b, sw, quality, this.rng, serve);
    b.vx = res.vx;
    b.vy = res.vy;
    b.vz = res.vz;
    b.wx = res.wx;
    b.wy = res.wy;
    b.wz = res.wz;
    this.lastHitter = p.idx;
    this.bounced = false;
    this.bounceCount = 0;
    this.netTouched = false;
    this.sinceHit = 0;
    this.rollTime = 0;
    this.rallyHits++;
    this.hitSeq++;
    p.tossing = false;
    this.lastHit = { player: p.idx, x: b.x, y: b.y, z: b.z, stroke: sw.stroke, variant: sw.variant, quality };
    if (isServe) {
      this.phase = 'rally';
      this.serveAwait = true;
      const st = this.stats.p[p.idx];
      if (!this.serveCtx.second) st.firstServeTotal++;
      st.maxServeKmh = Math.max(st.maxServeKmh, res.kmh);
    }
    this.emit({
      type: 'hit',
      player: p.idx,
      stroke: sw.stroke,
      variant: sw.variant,
      power: res.power,
      quality,
      x: b.x,
      y: b.y,
      z: b.z,
    });
    if (this.rallyHits >= 8 && this.rallyHits % 4 === 0) {
      this.emit({ type: 'crowd', kind: 'murmur', intensity: clamp(this.rallyHits / 20, 0.2, 1) });
    }
  }

  // --------------------------------------------------------------- regles
  private inCourt(x: number, y: number): boolean {
    const r = BALL.r;
    return Math.abs(x) <= COURT.halfWs + r && Math.abs(y) <= COURT.halfL + r;
  }

  private onBounce(x: number, y: number, vz: number, speed: number): void {
    const inB = this.inCourt(x, y);
    this.emit({ type: 'bounce', x, y, vz, speed, inBounds: inB });
    if (this.phase !== 'rally') return;
    const hitter = this.lastHitter;
    if (hitter < 0) return;
    const hp = this.players[hitter];
    const oppSide = -hp.side;

    if (this.serveAwait) {
      const receiverSide = oppSide;
      const good = inServiceBox(x, y, this.serveCtx.boxSign, receiverSide, BALL.r);
      if (good) {
        if (this.netTouched) {
          this.doLet();
          return;
        }
        this.serveAwait = false;
        this.bounceCount = 1;
        this.bounced = true;
        if (!this.serveCtx.second) this.stats.p[hitter].firstServeIn++;
        return;
      }
      this.doFault(hitter, x, y);
      return;
    }

    if (this.bounceCount === 0) {
      const sideOk = Math.sign(y) === oppSide && Math.abs(y) > 0.001;
      if (!inB || !sideOk) {
        const reason: PointReason = this.netTouched || !sideOk ? 'net' : 'out';
        if (reason === 'out') this.callOut(x, y);
        this.pointTo((1 - hitter) as Side, reason);
        return;
      }
      this.bounceCount = 1;
      this.bounced = true;
    } else {
      // Segon bot abans que el rival hi arribi
      const reason: PointReason = this.rallyHits <= 1 ? 'ace' : 'winner';
      this.pointTo(hitter as Side, reason);
    }
  }

  private callOut(x: number, y: number): void {
    const dx = Math.abs(x) - COURT.halfWs;
    const dy = Math.abs(y) - COURT.halfL;
    const out = Math.max(dx, dy);
    this.emit({ type: 'out', near: out < 0.25 });
    if (out < 0.25) this.emit({ type: 'crowd', kind: 'gasp', intensity: 0.7 });
  }

  private onNet(speed: number, cord: boolean): void {
    this.netTouched = true;
    this.emit({ type: 'net', speed, cord });
    if (this.phase === 'rally') this.emit({ type: 'crowd', kind: 'ooh', intensity: cord ? 0.7 : 0.4 });
  }

  private onWall(): void {
    if (this.phase !== 'rally' || this.lastHitter < 0) return;
    if (this.bounceCount === 0 && !this.serveAwait) this.pointTo((1 - this.lastHitter) as Side, 'out');
    else if (this.serveAwait) this.doFault(this.lastHitter, 0, 0);
  }

  private doLet(): void {
    this.emit({ type: 'let' });
    this.emit({ type: 'announce', text: 'Let', speak: true });
    this.afterFaultReset(false);
  }

  private doFault(server: number, x: number, y: number): void {
    const second = this.serveCtx.second;
    if (!second) this.callOut(x, y);
    this.emit({ type: 'fault', player: server, double: second });
    if (second) {
      this.pointTo((1 - server) as Side, 'doublefault');
    } else {
      this.serveCtx = { ...this.serveCtx, second: true };
      this.serveStage = 2;
      this.emit({ type: 'announce', text: 'Falta', speak: true });
      this.afterFaultReset(true);
    }
  }

  private afterFaultReset(_fault: boolean): void {
    // Torna a servir des del mateix lloc (sense canviar el marcador)
    this.resetRally();
    this.phase = 'point_end';
    this.timer = this.cfg.fast ? 0.01 : 1.2;
    this.matchOverPending = false;
    this.faultReplay = true;
  }

  faultReplay = false;

  private pointTo(winner: Side, reason: PointReason): void {
    if (this.phase !== 'rally') return;
    const loser = (1 - winner) as Side;
    const server = this.server;
    this.lastRallyLen = this.rallyHits;
    this.stats.p[winner].pointsWon++;
    this.stats.totalPoints++;
    this.stats.longestRally = Math.max(this.stats.longestRally, this.rallyHits);
    switch (reason) {
      case 'ace':
        this.stats.p[winner].aces++;
        break;
      case 'winner':
        this.stats.p[winner].winners++;
        break;
      case 'doublefault':
        this.stats.p[server].doubleFaults++;
        break;
      case 'out':
      case 'net':
        this.stats.p[loser].errors++;
        break;
      default:
        break;
    }
    if (Math.abs(this.players[winner].y) < 5.5 && (reason === 'winner' || reason === 'ace')) this.stats.p[winner].netPointsWon++;

    const out = this.score.pointWon(winner);
    this.lastPoint = { winner, reason };
    this.emit({ type: 'point', winner, reason, rally: this.rallyHits });

    const names = this.names;
    let text: string;
    let tmo = this.cfg.fast ? 0.01 : 2.3;
    if (out.matchWon) {
      text = `Joc, set i partit, ${names[winner]}`;
      this.emit({ type: 'game', winner });
      this.emit({ type: 'set', winner });
      tmo = 3.2;
    } else if (out.setWon) {
      const last = this.score.sets[this.score.sets.length - 1].games;
      text = `Joc i set, ${names[winner]}, ${last[winner]} a ${last[loser]}`;
      this.emit({ type: 'game', winner });
      this.emit({ type: 'set', winner });
      tmo = 3.4;
    } else if (out.gameWon) {
      text = `Joc, ${names[winner]}. ${this.score.games[0]} a ${this.score.games[1]}`;
      this.emit({ type: 'game', winner });
      tmo = 3.0;
    } else {
      text = this.score.callText(names);
    }
    this.emit({ type: 'announce', text, speak: true });
    const long = this.rallyHits >= 9;
    const intensity = out.gameWon ? 0.9 : long ? 0.8 : reason === 'ace' ? 0.7 : 0.45;
    this.emit({ type: 'crowd', kind: out.gameWon || long ? 'applause' : 'cheer', intensity });
    if (this.cfg.fast) tmo = 0.01;
    this.timer = tmo;
    this.phase = 'point_end';
    this.matchOverPending = out.matchWon;
    this.faultReplay = false;
    for (const p of this.players) p.recover(0.02);
  }

  private checkDead(dt: number): void {
    const b = this.ball;
    const slow = Math.hypot(b.vx, b.vy) < 0.45 && b.z < 0.06;
    this.rollTime = slow ? this.rollTime + dt : 0;
    if (this.rollTime > 0.25 || this.sinceHit > 14) {
      if (this.lastHitter >= 0) {
        if (this.bounceCount === 0) this.pointTo((1 - this.lastHitter) as Side, 'net');
        else this.pointTo(this.lastHitter as Side, 'winner');
      }
    }
  }

  /** Per a la IA/UI: quin serveix i en quina fase estem. */
  get lastPointInfo(): { winner: number; reason: PointReason } | null {
    return this.lastPoint;
  }
}
