import { COURT } from '../engine/constants';
import { approach, clamp } from '../engine/math';
import { PlayerDef } from './roster';
import { DifficultyParams } from '../ai/difficulty';

export type HitKey = 'flat' | 'slice' | 'top' | 'lob';
export type Stroke = 'fh' | 'bh' | 'vol' | 'smash' | 'serve';
/** Emocions després d'un punt: puny, braços amunt, victòria, decepció i derrota. */
export type EmoteKind = 'fist' | 'arms' | 'win' | 'slump' | 'shake' | 'lose';

/** Ordre que un controlador (humà o IA) dóna a un jugador en cada pas. */
export interface Intent {
  /** Moviment desitjat [-1,1] en coordenades de món (x dreta, y cap a la càmera). */
  mx: number;
  my: number;
  sprint: boolean;
  /** Cop iniciat aquest pas (flanc de pujada) o null. */
  hit: HitKey | null;
  /** Direcció del cop: lateral [-1,1] (món) i profunditat/força [-1,1]. */
  aimX: number;
  aimY: number;
}

export const NO_INTENT: Intent = { mx: 0, my: 0, sprint: false, hit: null, aimX: 0, aimY: 0 };

export interface SwingState {
  stroke: Stroke;
  variant: HitKey;
  t: number;
  contactAt: number;
  windowEnd: number;
  dur: number;
  done: boolean; // s'ha executat el contacte (cop o fallada)
  hitBall: boolean;
  /** Costat de la pilota respecte a la mà dominant: +1 dreta, -1 revés (per a les voleas). */
  side: 1 | -1;
  /** Millor qualitat de contacte vista durant la finestra (per colpejar al punt òptim). */
  bestQ: number;
  /** Multiplicador de potència (timing perfecte, súper cop). */
  boost: number;
  aimX: number;
  aimY: number;
}

/** Jugador: posició, moviment, resistència i estat d'animació. */
export class Player {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  /** +1 si mira cap a y positives (jugador llunyà), -1 si mira cap a la càmera... (és al revés: humà mira cap a -y). */
  readonly dirY: number;
  /** Costat de la pista: +1 (y>0, proper a la càmera) o -1. */
  readonly side: number;
  stamina = 1;
  swing: SwingState | null = null;
  swingCool = 0;
  runPhase = 0;
  /** Temps des de l'últim cop (per animacions de recuperació). */
  sinceHit = 10;
  lastStroke: Stroke = 'fh';
  lastVariant: HitKey = 'flat';
  /** Estat de servei. */
  tossing = false;
  /** Temps des que va acabar l'últim cop (per a la recuperació). */
  idleT = 10;
  lastSide: 1 | -1 = 1;
  /** Petit salt de preparació quan el rival colpeja (split step). */
  splitT = 0;
  /** És el servidor esperant (bota la pilota abans de llançar-la). */
  serveStance = false;
  /** Emoció activa (celebració o decepció). */
  emote: EmoteKind | null = null;
  emoteT = 0;
  emoteDur = 0;
  /** Slide: factor 0..1 si llisca. */
  slide = 0;
  stepAcc = 0;
  /** Multiplicadors de dificultat (només IA). */
  diff: DifficultyParams | null = null;

  constructor(
    readonly idx: 0 | 1,
    readonly def: PlayerDef,
  ) {
    this.side = idx === 0 ? 1 : -1;
    this.dirY = -this.side;
    this.y = this.side * (COURT.halfL + 1.2);
  }

  /** x del costat de la mà dominant en coordenades de món. */
  get rightX(): number {
    return (this.dirY > 0 ? -1 : 1) * (this.def.style.lefty ? -1 : 1);
  }

  get speedStat(): number {
    return this.def.stats.speed / 100;
  }
  get powerStat(): number {
    return this.def.stats.power / 100;
  }
  get precStat(): number {
    return this.def.stats.precision / 100;
  }
  get staminaStat(): number {
    return this.def.stats.stamina / 100;
  }

  /** Velocitat màxima de desplaçament (m/s). */
  maxSpeed(sprint: boolean): number {
    let v = 4.9 + 2.5 * this.speedStat; // 80 -> 6.9 m/s
    const fat = 0.8 + 0.2 * Math.sqrt(clamp(this.stamina, 0, 1));
    v *= fat;
    if (sprint && this.stamina > 0.04) v *= 1.22;
    if (this.diff) v *= this.diff.speedMult;
    return v;
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vy);
  }

  get swinging(): boolean {
    return this.swing !== null && this.swing.t < this.swing.dur;
  }

  startEmote(kind: EmoteKind, dur: number): void {
    this.emote = kind;
    this.emoteT = 0;
    this.emoteDur = dur;
  }

  beginSwing(stroke: Stroke, variant: HitKey, aimX: number, aimY: number, side: 1 | -1 = 1): void {
    const s = this.def.style.swingSpeed;
    let contactAt = 0.14;
    let windowEnd = 0.28;
    let dur = 0.46;
    switch (stroke) {
      case 'vol':
        contactAt = 0.07;
        windowEnd = 0.2;
        dur = 0.32;
        break;
      case 'smash':
        contactAt = 0.15;
        windowEnd = 0.3;
        dur = 0.55;
        break;
      case 'serve':
        contactAt = 0.09;
        windowEnd = 0.22;
        dur = 0.6;
        break;
      default:
        if (variant === 'lob') {
          contactAt = 0.15;
          windowEnd = 0.3;
        }
        if (variant === 'slice') contactAt = 0.15;
    }
    contactAt /= s;
    windowEnd /= s;
    dur /= s;
    this.swing = { stroke, variant, t: 0, contactAt, windowEnd, dur, done: false, hitBall: false, side, bestQ: 0, boost: 1, aimX, aimY };
    this.lastStroke = stroke;
    this.lastVariant = variant;
    this.lastSide = side;
    this.emote = null;
    this.splitT = 0;
    this.sinceHit = 0;
    this.stamina = Math.max(0, this.stamina - 0.0012 / (0.5 + this.staminaStat));
  }

  /** Moviment i recursos. Retorna true si ha fet un pas (per al so). */
  update(dt: number, intent: Intent, canSprint = true): boolean {
    this.sinceHit += dt;
    if (this.swing) {
      this.swing.t += dt;
      if (this.swing.t >= this.swing.dur) {
        this.swing = null;
        this.swingCool = 0.05;
        this.idleT = 0;
      }
    } else {
      this.idleT += dt;
    }
    if (this.splitT > 0) this.splitT = Math.max(0, this.splitT - dt);
    if (this.emote) {
      this.emoteT += dt;
      if (this.emoteT >= this.emoteDur) this.emote = null;
    }
    if (this.swingCool > 0) this.swingCool -= dt;

    let mx = intent.mx;
    let my = intent.my;
    const m = Math.hypot(mx, my);
    if (m > 1) {
      mx /= m;
      my /= m;
    }
    const sprint = intent.sprint && canSprint && m > 0.5;
    let maxV = this.maxSpeed(sprint);
    if (this.swinging) maxV *= this.swing && this.swing.stroke === 'serve' ? 0.2 : 0.45;
    if (this.tossing) maxV *= 0.3;
    const tvx = mx * maxV;
    const tvy = my * maxV;
    const accel = 30 * (0.8 + 0.4 * this.speedStat);
    const decel = 22;
    const moving = m > 0.05;
    const a = (moving ? accel : decel) * dt;
    this.vx = approach(this.vx, tvx, a);
    this.vy = approach(this.vy, tvy, a);

    const prevX = this.x;
    const prevY = this.y;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    // Límits: no es pot creuar la xarxa i hi ha marge darrere/costats
    const maxX = COURT.halfWd + 3.4;
    this.x = clamp(this.x, -maxX, maxX);
    if (this.side > 0) this.y = clamp(this.y, 0.7, COURT.halfL + 5.4);
    else this.y = clamp(this.y, -(COURT.halfL + 5.4), -0.7);
    if (this.x !== prevX + this.vx * dt) this.vx = 0;
    if (this.y !== prevY + this.vy * dt) this.vy = 0;

    const spd = this.speed;
    // Resistència
    const norm = spd / 7;
    const drain = (0.0016 * norm * norm * (sprint ? 2.6 : 1)) / (0.5 + this.staminaStat);
    if (spd > 0.4) this.stamina = Math.max(0, this.stamina - drain * dt * 8);
    else this.stamina = Math.min(1, this.stamina + 0.03 * dt * (0.6 + this.staminaStat));

    // Fase de cursa i passos
    let stepped = false;
    if (spd > 0.6) {
      const stride = 1.15 * this.def.style.stride;
      this.runPhase += (spd / stride) * dt * Math.PI;
      this.stepAcc += (spd / (1.4 * this.def.style.stride)) * dt;
      if (this.stepAcc >= 1) {
        this.stepAcc -= 1;
        stepped = true;
      }
    } else {
      this.runPhase *= 0.9;
      this.stepAcc = 0;
    }
    // Llisca (només per estil) si es mou ràpid lateralment
    const wantSlide = this.def.style.slide && Math.abs(this.vx) > 4.2 && !this.swinging ? 1 : 0;
    this.slide = approach(this.slide, wantSlide, dt * 6);
    return stepped;
  }

  /** Recuperació entre punts. */
  recover(amount: number): void {
    this.stamina = Math.min(1, this.stamina + amount * (0.6 + this.staminaStat));
  }
}
