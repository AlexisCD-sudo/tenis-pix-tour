import { COURT, DT } from '../engine/constants';
import { clamp } from '../engine/math';
import { Rng } from '../engine/rng';
import { BallState, cloneBall, stepBall } from '../physics/ball';
import { Controller, Match } from '../game/match';
import { HitKey, Intent, Player } from '../players/player';
import { idealContact, reachOf } from '../players/shots';
import { DIFFICULTY, DifficultyParams } from './difficulty';

interface Sample {
  t: number;
  x: number;
  y: number;
  z: number;
  bounced: boolean;
}

interface Prediction {
  samples: Sample[];
  /** Primer bot previst. */
  bx: number;
  by: number;
  /** Si la pilota anirà a la xarxa. */
  net: boolean;
}

interface Target {
  x: number;
  y: number;
  t: number;
  z: number;
  sample: Sample;
  reachable: boolean;
  volley: boolean;
}

/**
 * IA del tennista:
 *  - només comença a reaccionar DESPRÉS que el rival colpegi (no coneix el cop abans)
 *  - prediu la trajectòria amb la mateixa física, amb un error de percepció
 *    que decreix quan la pilota s'apropa
 *  - tria el cop, la direcció i la profunditat segons la personalitat, la
 *    pressió i la dificultat, i comet errors a través de la mateixa precisió
 *    i qualitat de contacte que el jugador humà
 */
export class AIController implements Controller {
  private rng: Rng;
  private seenHit = 0;
  private react = 0;
  private noiseX = 0;
  private noiseY = 0;
  private replan = 0;
  private planAt = 0;
  private target: Target | null = null;
  private pred: Prediction | null = null;
  private leave = false;
  private netMode = false;
  private waitT = 0;
  private serveKey: HitKey = 'flat';
  private serveAimX = 0;
  private serveAimY = 0;
  private pressed = false;
  private tossedAt = -1;
  private shotKey: HitKey = 'flat';
  private shotAimX = 0;
  private shotAimY = 0;
  private decided = false;

  constructor(
    seed: number,
    private readonly diffOverride?: DifficultyParams,
  ) {
    this.rng = new Rng(seed * 2654435761 + 12345);
  }

  private dp(m: Match, p: Player): DifficultyParams {
    return this.diffOverride ?? p.diff ?? DIFFICULTY.normal;
  }

  update(m: Match, idx: 0 | 1, dt: number): Intent {
    const p = m.players[idx];
    const intent: Intent = { mx: 0, my: 0, sprint: false, hit: null, aimX: 0, aimY: 0 };
    const opp = m.players[1 - idx];

    switch (m.phase) {
      case 'serve_wait':
        this.pressed = false;
        if (m.server === idx) this.serveWait(m, p, intent, dt);
        else {
          this.netMode = false;
          this.waitT = 0;
          this.idle(m, p, opp, intent, 0);
        }
        this.seenHit = m.hitSeq;
        break;
      case 'toss':
        if (m.server === idx) this.serveStrike(m, p, intent);
        else this.idle(m, p, opp, intent, 0);
        this.seenHit = m.hitSeq;
        break;
      case 'rally':
        this.rally(m, p, opp, intent, dt);
        break;
      case 'point_end':
        this.target = null;
        this.pred = null;
        break;
      default:
        break;
    }
    return intent;
  }

  // ------------------------------------------------------------------ servei
  private serveWait(m: Match, p: Player, intent: Intent, dt: number): void {
    const dp = this.dp(m, p);
    this.waitT += dt;
    this.decided = false;
    const fast = m.cfg.fast;
    const delay = fast ? 0.02 : 0.9 + this.rng.range(0, 0.5);
    this.moveTo(m, p, p.x, p.y, intent, 0.5);
    if (this.waitT < delay) return;
    const second = m.serveCtx.second;
    const st = p.def.style;
    // Variant de servei
    const r = this.rng.next();
    if (second) this.serveKey = r < 0.7 ? 'top' : 'slice';
    else this.serveKey = r < 0.5 ? 'flat' : r < 0.85 ? 'slice' : 'top';
    // Direcció: ample, T o cos
    const box = m.serveCtx.boxSign;
    const rr = this.rng.next();
    if (this.rng.chance(dp.tactics)) {
      this.serveAimX = rr < 0.45 ? box * 0.95 : rr < 0.85 ? -box * 0.95 : 0;
    } else this.serveAimX = this.rng.range(-0.6, 0.6);
    this.serveAimY = second ? this.rng.range(-0.1, 0.25) : this.rng.range(0.1, 0.35 + 0.5 * st.aggression);
    intent.hit = 'flat'; // inicia el llançament
    intent.aimX = this.serveAimX;
    intent.aimY = this.serveAimY;
    this.waitT = 0;
    this.pressed = false;
    this.tossedAt = m.time;
    // La IA decideix si pujarà a la xarxa després del servei
    this.netMode = this.rng.chance(st.netTendency * 0.7) && !second;
  }

  private serveStrike(m: Match, p: Player, intent: Intent): void {
    const b = m.ball;
    intent.aimX = this.serveAimX;
    intent.aimY = this.serveAimY;
    if (this.pressed || p.swing) return;
    const dp = this.dp(m, p);
    // Es colpeja una mica abans de l'àpex perquè el contacte sigui a l'àpex
    const jitter = (this.rng.gauss() * 0.4 * dp.errorMult) / 1;
    if (b.vz < 0.9 + jitter && b.z > 2.3) {
      intent.hit = this.serveKey;
      this.pressed = true;
    }
  }

  // ------------------------------------------------------------------- joc
  private rally(m: Match, p: Player, opp: Player, intent: Intent, dt: number): void {
    const dp = this.dp(m, p);
    // Nou cop del rival: comença la percepció
    if (m.hitSeq !== this.seenHit) {
      this.seenHit = m.hitSeq;
      if (m.lastHitter !== p.idx) this.onOpponentHit(m, p, opp, dp);
    }
    if (m.lastHitter === p.idx || m.lastHitter < 0) {
      this.target = null;
      this.idle(m, p, opp, intent, 0);
      return;
    }
    // Reacció
    if (this.react > 0) {
      this.react -= dt;
      this.idle(m, p, opp, intent, 0);
      return;
    }
    this.replan -= dt;
    if (this.replan <= 0 || !this.target) {
      this.replan = 0.05;
      this.planAt = m.time;
      this.pred = this.predict(m, p);
      this.target = this.pickTarget(m, p, this.pred, dp);
      if (this.target && !this.leave) this.updateDecision(m, p, opp, this.target, dp);
    }
    const t = this.target;
    if (!t || this.leave) {
      this.idle(m, p, opp, intent, 0);
      return;
    }
    // Posició de contacte desitjada
    const side = this.strokeFor(p, t.sample.x) === 'fh' ? 0.85 : -0.75;
    const ox = t.sample.x - p.rightX * side;
    const oy = t.sample.y - p.dirY * 0.35;
    this.moveTo(m, p, ox, oy, intent, 1);

    // Moment d'iniciar el cop
    const lead = this.contactDelay(p, t);
    if (!p.swing && p.swingCool <= 0) {
      const c = idealContact(p, this.strokeFor(p, t.sample.x));
      const err = Math.hypot(t.sample.x - c.x, t.sample.y - c.y);
      const ok = err < reachOf(p) * 0.95;
      const remain = t.t - (m.time - this.planAt);
      if (remain <= lead && (ok || remain <= lead * 0.5)) {
        intent.hit = this.shotKey;
        intent.aimX = this.shotAimX;
        intent.aimY = this.shotAimY;
        // Després del cop pot decidir pujar a la xarxa
        const st = p.def.style;
        if (Math.abs(p.y) < 10 && this.shotAimY > 0.2 && !t.volley) {
          if (this.rng.chance(st.netTendency * 0.6 * (dp.tactics + 0.2))) this.netMode = true;
        }
        if (Math.abs(p.y) > 11) this.netMode = false;
        return;
      }
    }
    intent.aimX = this.shotAimX;
    intent.aimY = this.shotAimY;
  }

  private contactDelay(p: Player, t: Target): number {
    const ss = p.def.style.swingSpeed;
    let base = 0.14;
    if (t.volley) base = 0.08;
    else if (this.shotKey === 'lob' || this.shotKey === 'slice') base = 0.15;
    return base / ss;
  }

  private strokeFor(p: Player, bx: number): 'fh' | 'bh' {
    return (bx - p.x) * p.rightX >= -0.15 ? 'fh' : 'bh';
  }

  private onOpponentHit(m: Match, p: Player, opp: Player, dp: DifficultyParams): void {
    const react = dp.reaction * (0.8 + 0.4 * this.rng.next());
    this.react = m.cfg.fast ? 0.02 : react;
    const prec = 1.15 - 0.3 * p.precStat;
    this.noiseX = this.rng.gauss() * dp.perceptionNoise * prec;
    this.noiseY = this.rng.gauss() * dp.perceptionNoise * 0.7;
    this.target = null;
    this.pred = null;
    this.leave = false;
    this.replan = 0;
    this.decided = false;
    // Si el rival fa un globus, tornem enrere
    if (m.lastHit && m.lastHit.variant === 'lob') this.netMode = false;
    // Recupera la resistència mentalment: res
    void opp;
  }

  /** Simula la trajectòria real de la pilota a partir de l'estat actual. */
  private predict(m: Match, p: Player): Prediction {
    const b: BallState = cloneBall(m.ball);
    const samples: Sample[] = [];
    let bounced = m.bounced;
    let bx = b.x;
    let by = b.y;
    let first = !m.bounced;
    let net = false;
    let t = 0;
    let bounces = m.bounced ? 1 : 0;
    const ev = {
      bounce: (x: number, y: number) => {
        bounced = true;
        bounces++;
        if (first) {
          bx = x;
          by = y;
          first = false;
        }
      },
      net: () => {
        net = true;
      },
    };
    let k = 0;
    while (t < 3.2 && bounces < 2 && !net) {
      stepBall(b, DT, { net: true, walls: false }, ev);
      t += DT;
      k++;
      if (k % 4 === 0) {
        if (b.y * p.side > 0 || Math.abs(b.y) < 1) samples.push({ t, x: b.x, y: b.y, z: b.z, bounced });
        if (Math.abs(b.y) > 17 || Math.abs(b.x) > 12) break;
      }
    }
    return { samples, bx, by, net };
  }

  private pickTarget(m: Match, p: Player, pred: Prediction, dp: DifficultyParams): Target | null {
    this.leave = false;
    // La IA deixa passar les pilotes que van fora o a la xarxa (segons el que percep)
    const w = clamp(this.timeToBounce(pred) / 1.1, 0, 1);
    const px = pred.bx + this.noiseX * w;
    const py = pred.by + this.noiseY * w;
    if (!m.bounced) {
      if (pred.net) {
        this.leave = true;
        return null;
      }
      if (m.serveAwait) {
        const bs = m.serveCtx.boxSign;
        const inBox = Math.abs(py) < COURT.serviceY + 0.2 && Math.sign(py) === p.side && px * bs > -0.2 && Math.abs(px) < COURT.halfWs + 0.2;
        if (!inBox) {
          this.leave = true;
          return null;
        }
      } else if (Math.abs(px) > COURT.halfWs + 0.5 || Math.abs(py) > COURT.halfL + 0.6) {
        // Només la deixa passar si no pot colpejar-la abans (volea) o és clarament fora
        if (!(this.netMode && Math.abs(py) > COURT.halfL + 1.2)) {
          this.leave = true;
          return null;
        }
      }
    }
    const vmax = p.maxSpeed(true);
    const react = Math.max(0, this.react);
    const lead = 0.14 / p.def.style.swingSpeed;
    let best: Target | null = null;
    let closest: Target | null = null;
    let closestD = Infinity;
    const volleyOk = this.netMode || (!m.bounced && Math.abs(p.y) < 7.5);
    const nw = (s: Sample): number => clamp(s.t / 1.2, 0, 1);
    for (const s of pred.samples) {
      if (s.y * p.side < 0.4) continue;
      const sx = s.x + this.noiseX * nw(s) * 0.5;
      const sy = s.y + this.noiseY * nw(s) * 0.4;
      const pre = !s.bounced;
      const zOk = pre ? s.z > 0.7 && s.z < 2.3 && volleyOk && Math.abs(sy) < 8.5 : s.z > 0.35 && s.z < 1.65;
      // Les pilotes molt altes (globus) permeten smash si no han botat
      const smash = pre && s.z >= 2.3 && s.z < 3.0 && Math.abs(sy) < 9 && !m.serveAwait;
      if (!zOk && !smash) continue;
      const c = idealContact(p, this.strokeFor(p, sx));
      const dist = Math.hypot(sx - p.x - (c.x - p.x), sy - p.y - (c.y - p.y));
      const need = Math.max(0, dist - 0.6) / vmax + lead;
      const avail = s.t - react;
      const tgt: Target = { x: sx, y: sy, t: s.t, z: s.z, sample: { ...s, x: sx, y: sy }, reachable: avail >= need, volley: pre };
      if (tgt.reachable) {
        best = tgt;
        break;
      }
      const slack = need - avail;
      if (slack < closestD) {
        closestD = slack;
        closest = tgt;
      }
    }
    void dp;
    return best ?? closest;
  }

  private timeToBounce(pred: Prediction): number {
    for (const s of pred.samples) if (s.bounced) return s.t;
    return pred.samples.length ? pred.samples[pred.samples.length - 1].t : 0;
  }

  /** Tria el cop i la direcció quan ja se sap on és el contacte. */
  private updateDecision(m: Match, p: Player, opp: Player, t: Target, dp: DifficultyParams): void {
    if (this.decided && this.rng.next() > 0.08) return; // manté la decisió amb petites revisions
    this.decided = true;
    const st = p.def.style;
    const tactics = dp.tactics;
    const c = idealContact(p, this.strokeFor(p, t.sample.x));
    const stretch = clamp((Math.hypot(t.sample.x - p.x, t.sample.y - p.y) - 1.2) / 3.5, 0, 1);
    const tight = clamp(1 - (t.t - 0.18) / 0.5, 0, 1); // poc temps
    const pressure = Math.max(stretch, tight * 0.8);
    const oppNet = Math.abs(opp.y) < 6.5;
    const oppDeep = Math.abs(opp.y) > 11.5;
    const shortBall = Math.abs(t.sample.y) < 7.4;
    void c;

    // Tipus de cop
    let wf = 0.5;
    let wt = st.topspinPref;
    let ws = st.slicePref + pressure * 0.45;
    let wl = st.lobPref + (oppNet ? 0.5 : 0) + pressure * 0.15;
    if (t.volley) {
      wt = 0;
      wl = oppNet ? 0.25 : 0.03;
      ws *= 0.4;
    }
    if (pressure < 0.35 && shortBall) wf += 0.4; // pilota curta: atac
    if (oppNet) wf += 0.4;
    if (!this.rng.chance(0.4 + 0.6 * tactics)) {
      // decisió poc encertada
      wf = 1;
      wt = 1;
      ws = 1;
      wl = 0.4;
    }
    const sum = wf + wt + ws + wl;
    let r = this.rng.next() * sum;
    let key: HitKey = 'flat';
    if ((r -= wf) < 0) key = 'flat';
    else if ((r -= wt) < 0) key = 'top';
    else if ((r -= ws) < 0) key = 'slice';
    else key = 'lob';
    // Dropshot: cop curt i suau
    let aimY = 0.15 + 0.5 * st.aggression - pressure * 0.55;
    if (shortBall && pressure < 0.4 && oppDeep) aimY += 0.35;
    if (!t.volley && pressure < 0.3 && oppDeep && this.rng.chance(st.dropPref * tactics)) {
      key = 'slice';
      aimY = -0.95;
    }
    if (key === 'lob') aimY = pressure > 0.5 ? 0.3 : 0.1;
    aimY = clamp(aimY + this.rng.gauss() * 0.1, -1, 1);

    // Direcció lateral: allunyada del rival
    let ax: number;
    const side = Math.sign(opp.x) || (this.rng.chance(0.5) ? 1 : -1);
    if (oppNet && key !== 'lob') {
      // passada: cap a un costat obert
      ax = -side * this.rng.range(0.6, 0.92);
    } else if (this.rng.chance(0.35 + 0.6 * tactics)) {
      ax = -side * this.rng.range(0.35, 0.9);
      if (Math.abs(opp.x) < 1.2) ax = (this.rng.chance(0.5) ? 1 : -1) * this.rng.range(0.45, 0.9);
    } else ax = this.rng.range(-0.7, 0.7);
    ax *= 1 - 0.55 * pressure;
    ax += this.rng.gauss() * 0.1;
    this.shotKey = key;
    this.shotAimX = clamp(ax, -1.1, 1.1);
    this.shotAimY = aimY;
  }

  // ------------------------------------------------------------ moviment
  private idle(m: Match, p: Player, opp: Player, intent: Intent, _s: number): void {
    const home = this.homePosition(m, p, opp);
    this.moveTo(m, p, home.x, home.y, intent, 0.7);
  }

  private homePosition(m: Match, p: Player, opp: Player): { x: number; y: number } {
    const st = p.def.style;
    const atNet = this.netMode;
    let hy = p.side * (COURT.halfL + st.baselineOffset + 0.35);
    if (atNet) hy = p.side * 3.4;
    if (m.phase === 'serve_wait' && m.server !== p.idx) {
      // Restador: espera a la diagonal
      return { x: p.x, y: p.y };
    }
    const dy = Math.abs(hy) / (Math.abs(hy) + Math.abs(opp.y) + 0.001);
    let hx = clamp(opp.x * dy * 0.85, -2.6, 2.6);
    if (m.phase === 'rally' && m.lastHit && m.lastHit.player === p.idx) {
      // Segueix l'angle del seu darrer cop
      hx = clamp(opp.x * dy * 0.85, -2.2, 2.2);
    }
    return { x: hx, y: hy };
  }

  private moveTo(_m: Match, p: Player, tx: number, ty: number, intent: Intent, urgency: number): void {
    const dx = tx - p.x;
    const dy = ty - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.08) {
      intent.mx = 0;
      intent.my = 0;
      return;
    }
    const vmax = p.maxSpeed(false);
    // Velocitat desitjada: frena en acostar-se
    const want = Math.min(vmax * 1.25, (d / 0.2) * urgency);
    const k = want / (d * vmax);
    intent.mx = clamp(dx * k, -1, 1) * (d > 0 ? 1 : 0);
    intent.my = clamp(dy * k, -1, 1);
    intent.sprint = urgency >= 1 && d > 2.0 && p.stamina > 0.12;
  }
}
