import { clamp } from '../engine/math';
import { HitKey, Player, Stroke, EmoteKind } from '../players/player';
import { PlayerLook, PlayerStyle } from '../players/roster';
import { Ctx, disc, line, px, rect, shade } from './pixel';

/**
 * Personatges pixel art generats amb un esquelet: cada fotograma es dibuixa
 * amb primitives de píxel a partir d'una pose interpolada (claus d'animació),
 * de manera que els moviments són fluids i cada jugador té el seu aspecte.
 * Coordenades de pose: metres, x cap a la dreta de la pantalla, y cap amunt,
 * per a un destre vist d'esquena (es mirallen segons vista i lateralitat).
 *
 * Profunditat dels braços: `fd`/`ofd` indiquen si la mà dominant / lliure és
 * davant del cos (+, cap a on mira el jugador) o darrere (−). Això decideix si
 * el braç es dibuixa darrere o davant del tors i evita braços "transparents".
 */
interface Key {
  t: number;
  hx: number;
  hy: number;
  ang: number;
  ox: number;
  oy: number;
  twist: number;
  lean: number;
  crouch: number;
  lift: number;
  /** Desplaçament lateral del cos (pes) cap al costat dominant. */
  shift: number;
  fd: number;
  ofd: number;
  /** 0 = mà lliure pròpia, 1 = agafa la raqueta amb dues mans. */
  grip: number;
}

type Fields = Omit<Key, 't'>;

export interface Pose extends Fields {
  /** Peus (offsets respecte al centre, metres). */
  footL: [number, number];
  footR: [number, number];
  bodyDx: number;
  bob: number;
}

const BASE: Fields = {
  hx: 0.3, hy: 1.0, ang: 0.8, ox: 0.12, oy: 1.0, twist: 0, lean: 0, crouch: 0.07, lift: 0, shift: 0, fd: 1, ofd: 1, grip: 1,
};
const K = (t: number, o: Partial<Fields> = {}): Key => ({ ...BASE, t, ...o });

function lerpKey(a: Key, b: Key, f: number): Key {
  const o = {} as Record<string, number>;
  for (const k of Object.keys(a) as (keyof Key)[]) o[k] = a[k] + (b[k] - a[k]) * f;
  return o as unknown as Key;
}

const smoothstep = (f: number): number => f * f * (3 - 2 * f);

function sampleKeys(keys: Key[], t: number): Key {
  if (t <= keys[0].t) return keys[0];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i].t) {
      const a = keys[i - 1];
      const b = keys[i];
      const f = (t - a.t) / Math.max(1e-6, b.t - a.t);
      return lerpKey(a, b, smoothstep(clamp(f, 0, 1)));
    }
  }
  return keys[keys.length - 1];
}

/** Claus d'un cop: preparació, caiguda de raqueta, contacte, acompanyament i final. */
function strokeKeys(stroke: Stroke, variant: HitKey, c: number, st: PlayerStyle, side: 1 | -1): Key[] {
  const tb = c * 0.5;
  const dr = c * 0.82;
  const tf = c + (1 - c) * 0.4;
  let keys: Key[];
  switch (stroke) {
    case 'fh': {
      keys = [
        K(0),
        K(tb, { hx: 0.78, hy: 1.12, ang: 1.55, ox: -0.1, oy: 1.32, twist: 0.7, lean: -0.02, crouch: 0.12, shift: -0.05, fd: -0.5, ofd: 0.6, grip: 0.15 }),
        K(dr, { hx: 0.64, hy: 0.86, ang: 2.15, ox: -0.05, oy: 1.3, twist: 0.45, crouch: 0.15, fd: -0.35, ofd: 0.7, grip: 0 }),
        K(c, { hx: 0.58, hy: 1.0, ang: 0.25, ox: -0.12, oy: 1.22, twist: -0.1, lean: 0.04, crouch: 0.09, shift: 0.09, fd: 0.7, ofd: 0.8, grip: 0 }),
        K(tf, { hx: 0.05, hy: 1.45, ang: -1.0, ox: 0.1, oy: 1.18, twist: -0.6, lean: 0.05, crouch: 0.04, shift: 0.1, fd: 0.5, ofd: 0.5, grip: 0 }),
        K(1, { hx: -0.3, hy: 1.62, ang: -1.9, ox: 0.18, oy: 1.1, twist: -0.8, lean: 0.04, crouch: 0.03, shift: 0.08, fd: 0.3, ofd: 0.4, grip: 0.5 }),
      ];
      if (variant === 'top') {
        keys[2].hy -= 0.2;
        keys[3].hy -= 0.1;
        keys[4].hy += 0.18;
        keys[5].hy += 0.12;
      } else if (variant === 'slice') {
        keys[1].hy += 0.25;
        keys[2].hy = 1.15;
        keys[2].ang = 1.2;
        keys[4].hx = 0.4;
        keys[4].hy = 1.05;
        keys[5].hx = 0.5;
        keys[5].hy = 0.8;
        keys[5].ang = 0.3;
      } else if (variant === 'lob') {
        keys[2].hy -= 0.3;
        keys[2].crouch = 0.2;
        keys[3].crouch = 0.17;
        keys[4].hy += 0.4;
        keys[5].hx = 0.15;
        keys[5].hy = 1.95;
        keys[5].ang = -0.6;
      }
      if (st.lasso && variant !== 'slice') {
        keys[4].hx = 0.15;
        keys[4].hy = 1.75;
        keys[5].hx = -0.2;
        keys[5].hy = 1.95;
        keys[5].ang = -2.6;
      }
      return keys;
    }
    case 'bh': {
      const one = st.oneHandBackhand;
      const g = one ? 0 : 1;
      keys = [
        K(0),
        K(tb, { hx: -0.55, hy: 1.12, ang: -1.5, ox: one ? 0.45 : -0.45, oy: one ? 1.4 : 1.12, twist: -0.7, lean: -0.02, crouch: 0.12, shift: 0.05, fd: -0.4, ofd: one ? 0.4 : -0.4, grip: g }),
        K(dr, { hx: -0.5, hy: 0.9, ang: -2.1, ox: one ? 0.5 : -0.4, oy: one ? 1.38 : 0.9, twist: -0.5, crouch: 0.15, fd: -0.3, ofd: one ? 0.4 : -0.3, grip: g }),
        K(c, { hx: -0.5, hy: 1.0, ang: -0.2, ox: one ? 0.6 : -0.35, oy: one ? 1.3 : 1.0, twist: 0.1, lean: 0.04, crouch: 0.09, shift: -0.08, fd: 0.7, ofd: one ? 0.5 : 0.7, grip: g }),
        K(tf, { hx: 0.15, hy: 1.45, ang: 1.0, ox: one ? 0.65 : 0.1, oy: 1.4, twist: 0.55, lean: 0.05, crouch: 0.04, shift: -0.1, fd: 0.5, ofd: one ? 0.3 : 0.5, grip: g }),
        K(1, { hx: 0.4, hy: 1.68, ang: 1.9, ox: one ? 0.7 : 0.3, oy: one ? 1.5 : 1.6, twist: 0.8, lean: 0.04, crouch: 0.03, shift: -0.1, fd: 0.3, ofd: one ? 0.2 : 0.3, grip: g }),
      ];
      if (variant === 'top') {
        keys[2].hy -= 0.18;
        keys[3].hy -= 0.1;
        keys[4].hy += 0.18;
        keys[5].hy += 0.1;
      } else if (variant === 'slice') {
        keys[1].hy += 0.25;
        keys[2].hy = 1.15;
        keys[2].ang = -1.2;
        keys[4].hx = -0.2;
        keys[4].hy = 1.05;
        keys[5].hx = -0.5;
        keys[5].hy = 0.85;
        keys[5].ang = -0.3;
      } else if (variant === 'lob') {
        keys[2].hy -= 0.3;
        keys[2].crouch = 0.2;
        keys[3].crouch = 0.17;
        keys[5].hy = 1.9;
      }
      return keys;
    }
    case 'serve':
      return [
        K(0, { hx: 0.4, hy: 1.72, ang: 2.6, ox: -0.12, oy: 2.15, twist: 0.5, lean: -0.1, crouch: 0.2, shift: -0.04, fd: -0.45, ofd: 0.9, grip: 0 }),
        K(c * 0.5, { hx: 0.3, hy: 1.38, ang: 3.0, ox: -0.2, oy: 1.9, twist: 0.6, lean: -0.12, crouch: 0.24, fd: -0.7, ofd: 0.8, grip: 0 }),
        K(c, { hx: 0.14, hy: 2.5, ang: 0.1, ox: -0.3, oy: 1.5, twist: -0.1, lean: 0.08, crouch: 0, lift: 0.2, shift: 0.06, fd: 0.3, ofd: 0.5, grip: 0 }),
        K(c + (1 - c) * 0.3, { hx: -0.1, hy: 1.8, ang: -1.4, ox: -0.2, oy: 1.25, twist: -0.5, lean: 0.08, crouch: 0.03, lift: 0.12, fd: 0.4, ofd: 0.6, grip: 0 }),
        K(1, { hx: -0.3, hy: 1.15, ang: -2.0, ox: 0, oy: 1.05, twist: -0.7, lean: 0.04, crouch: 0.06, lift: 0, fd: 0.3, ofd: 0.8, grip: 0.4 }),
      ];
    case 'smash':
      return [
        K(0, { hx: 0.3, hy: 1.85, ang: 2.5, ox: -0.1, oy: 2.1, twist: 0.4, lean: -0.1, crouch: 0.1, fd: -0.4, ofd: 0.8, grip: 0 }),
        K(c * 0.5, { hx: 0.35, hy: 1.5, ang: 2.9, ox: -0.15, oy: 2.0, twist: 0.55, lean: -0.1, crouch: 0.14, fd: -0.6, ofd: 0.8, grip: 0 }),
        K(c, { hx: 0.12, hy: 2.45, ang: 0.1, ox: -0.2, oy: 1.6, twist: -0.1, lean: 0.08, crouch: 0, lift: 0.12, fd: 0.3, ofd: 0.5, grip: 0 }),
        K(c + (1 - c) * 0.4, { hx: -0.15, hy: 1.6, ang: -1.5, ox: -0.1, oy: 1.3, twist: -0.5, lean: 0.05, crouch: 0.03, lift: 0.05, fd: 0.4, ofd: 0.5, grip: 0 }),
        K(1, { hx: -0.3, hy: 1.2, ang: -2.0, ox: 0, oy: 1.05, twist: -0.7, lean: 0.03, crouch: 0.05, fd: 0.3, ofd: 0.8, grip: 0.4 }),
      ];
    default: {
      // Volea compacta, de dreta o de revés segons el costat de la pilota
      const sg = side;
      const off = sg > 0 ? -0.25 : 0.4;
      return [
        K(0),
        K(tb, { hx: 0.5 * sg, hy: 1.22, ang: 1.05 * sg, ox: off, oy: 1.3, twist: 0.3 * sg, crouch: 0.1, fd: -0.1, ofd: 0.7, grip: 0.2 }),
        K(c, { hx: 0.55 * sg, hy: 1.2, ang: 0.5 * sg, ox: off, oy: 1.28, twist: -0.05 * sg, lean: 0.06, crouch: 0.12, shift: 0.06 * sg, fd: 0.8, ofd: 0.7, grip: 0.2 }),
        K(tf, { hx: 0.42 * sg, hy: 1.15, ang: 0.3 * sg, ox: off, oy: 1.2, twist: -0.1 * sg, lean: 0.05, crouch: 0.1, fd: 0.8, ofd: 0.7, grip: 0.4 }),
        K(1),
      ];
    }
  }
}

/** Poses d'emoció (celebracions i decepcions). */
function emoteKey(kind: EmoteKind, t: number): Key {
  const s = Math.sin;
  switch (kind) {
    case 'fist': {
      const hop = t < 0.7 ? Math.abs(s(t * 7)) * 0.05 : 0;
      return K(0, { hx: 0.34, hy: 0.78, ang: 0.7, ox: -0.28, oy: 1.9 + 0.1 * s(t * 13), twist: -0.2, lean: -0.06, crouch: 0.05, lift: hop, fd: 0.8, ofd: 0.2, grip: 0 });
    }
    case 'arms': {
      const j = t < 1.1 ? Math.abs(s(t * 5.2)) : 0;
      const w = s(t * 9) * 0.05;
      return K(0, { hx: 0.5 + w, hy: 2.05, ang: -0.2, ox: -0.5 - w, oy: 2.1, lean: -0.08, crouch: 0.03, lift: 0.16 * j, fd: 0.5, ofd: 0.5, grip: 0 });
    }
    case 'win': {
      const j = t < 1.2 ? Math.abs(s(t * 5.2)) : 0;
      const w = s(t * 6);
      return K(0, { hx: 0.52, hy: 2.0 + 0.05 * w, ang: -0.4 + 0.2 * w, ox: -0.5, oy: 2.0 - 0.05 * w, lean: -0.1, crouch: 0.03, lift: 0.2 * j + 0.012 * Math.abs(s(t * 4)), fd: 0.5, ofd: 0.5, grip: 0 });
    }
    case 'slump':
      return K(0, { hx: 0.3, hy: 0.62, ang: 2.75, ox: -0.22, oy: 0.7, twist: 0.1, lean: 0.13 + 0.015 * s(t * 3), crouch: 0.03, fd: 0.6, ofd: 0.6, grip: 0 });
    case 'shake':
      return K(0, { hx: 0.52, hy: 0.95, ang: 0.95 + 0.15 * s(t * 15), ox: -0.34, oy: 1.02, twist: 0.25 * s(t * 9), lean: 0.04, crouch: 0.06, fd: 0.4, ofd: -0.4, grip: 0 });
    default:
      return K(0, { hx: 0.28, hy: 0.58, ang: 2.9, ox: -0.12, oy: 0.62, lean: 0.2, crouch: 0.1, fd: 0.6, ofd: 0.6, grip: 0 });
  }
}

const RECOV = 0.42;
const SPLIT_DUR = 0.22;

/** Pose d'un jugador en l'instant actual. */
export function poseFor(p: Player, time: number, tossBallZ: number | null): Pose {
  const st = p.def.style;
  const mir = p.rightX; // costat dominant (±1) en x de pantalla
  const vr = clamp(p.speed / 7, 0, 1.4);
  const mv = p.speed > 0.5;
  const sw = p.swing && p.swing.t < p.swing.dur ? p.swing : null;
  const phase = p.runPhase;

  // Pose base: cursa amb bracejament o repòs amb respiració
  let base: Key;
  if (mv) {
    const s = Math.sin(phase);
    const run = clamp(vr * 1.3, 0, 1);
    // En córrer, de cara els braços es veuen davant del tors; d'esquena queden darrere (només
    // es veu l'avantbraç i la mà als costats), com en realitat: mai superposats al tors.
    const vis = 0.3;
    base = K(0, {
      hx: 0.46 + 0.04 * Math.cos(phase),
      hy: 0.98 - 0.05 * s * run,
      ang: 0.9 - 0.15 * s * run,
      ox: -0.5 - 0.05 * s * run,
      oy: 0.95 + 0.2 * s * run,
      lean: 0.09 * vr,
      crouch: 0.07 + 0.07 * vr,
      fd: vis,
      ofd: vis,
      grip: clamp(1 - run * 1.6, 0, 1),
    });
  } else {
    const b = Math.sin(time * 3.1 + p.idx);
    base = K(0, { hy: 1.0 + 0.012 * b, shift: 0.015 * Math.sin(time * 1.7 + p.idx * 2), crouch: 0.07 + 0.006 * b });
  }

  let key: Key = base;
  if (sw) {
    const keys = strokeKeys(sw.stroke, sw.variant, sw.contactAt / sw.dur, st, sw.side);
    key = sampleKeys(keys, sw.t / sw.dur);
    if (sw.stroke !== 'serve' && sw.stroke !== 'smash' && sw.t < 0.06) key = lerpKey(base, key, smoothstep(sw.t / 0.06));
  } else if (p.tossing && tossBallZ !== null) {
    // Llançament: el braç lliure segueix la pilota i el de la raqueta puja a "trofeu"
    const g = clamp((tossBallZ - 1) / 1.4, 0, 1);
    key = K(0, {
      hx: 0.34 + 0.06 * g, hy: 1.3 + 0.42 * g, ang: 2.3 + 0.3 * g,
      ox: -0.12, oy: clamp(tossBallZ + 0.1, 1.3, 2.4),
      twist: 0.2 + 0.3 * g, lean: -0.04 - 0.06 * g, crouch: 0.1 + 0.1 * g,
      fd: -0.2 - 0.25 * g, ofd: 0.9, grip: 0,
    });
  } else if (p.serveStance && tossBallZ !== null) {
    // Preparat per servir: bota la pilota amb la mà lliure
    key = K(0, {
      hx: 0.2, hy: 0.95, ang: 0.6, ox: -0.05, oy: clamp(tossBallZ + 0.1, 0.7, 1.1),
      twist: 0.15, crouch: 0.08 + (0.95 - tossBallZ) * 0.15, fd: 1, ofd: 1, grip: 0,
    });
  } else {
    if (p.idleT < RECOV) {
      const ks = strokeKeys(p.lastStroke, p.lastVariant, 0.3, st, p.lastSide);
      key = lerpKey(ks[ks.length - 1], base, smoothstep(clamp(p.idleT / RECOV, 0, 1)));
    }
    if (p.splitT > 0) {
      const u = 1 - p.splitT / SPLIT_DUR;
      key = { ...key, lift: key.lift + 0.1 * Math.sin(Math.PI * u), crouch: key.crouch + 0.08 * Math.max(0, u - 0.7) / 0.3 };
    }
    if (p.emote) {
      const ek = emoteKey(p.emote, p.emoteT);
      const fin = smoothstep(clamp(p.emoteT / 0.16, 0, 1));
      const fout = p.emoteDur < 50 ? smoothstep(clamp((p.emoteDur - p.emoteT) / 0.3, 0, 1)) : 1;
      key = lerpKey(key, ek, fin * fout);
    }
  }

  // Cames
  const lat = p.speed > 0.3 ? p.vx / p.speed : 0;
  const dep = p.speed > 0.3 ? p.vy / p.speed : 0;
  const footL: [number, number] = [-0.14, 0];
  const footR: [number, number] = [0.14, 0];
  let crouch = key.crouch;
  let bob = 0;
  if (mv) {
    const a = Math.sin(phase);
    const b = Math.sin(phase + Math.PI);
    const liftA = Math.max(0, a) * 0.2 * vr * st.stride;
    const liftB = Math.max(0, b) * 0.2 * vr * st.stride;
    footL[0] = -0.14 + lat * 0.3 * Math.cos(phase);
    footL[1] = liftA + dep * 0.07 * Math.cos(phase);
    footR[0] = 0.14 + lat * 0.3 * Math.cos(phase + Math.PI);
    footR[1] = liftB + dep * 0.07 * Math.cos(phase + Math.PI);
    bob = Math.abs(Math.sin(phase)) * 0.035 * vr;
  } else {
    bob = 0.01 * Math.sin(time * 3.1 + p.idx);
  }
  if (p.slide > 0.1) {
    const s = p.slide;
    footL[0] -= 0.34 * s;
    footR[0] += 0.34 * s;
    crouch += 0.2 * s;
  }
  if (sw && sw.stroke !== 'serve' && sw.stroke !== 'smash') {
    const open = sw.stroke === 'bh' ? -1 : 1;
    footL[0] += -0.05 + open * 0.02;
    footR[0] += 0.05 + open * 0.02;
    if (sw.stroke === 'fh' || sw.stroke === 'bh') {
      // El peu de darrere s'aixeca (peu a la punta) quan el pes passa endavant
      const u = sw.t / sw.dur;
      const c = sw.contactAt / sw.dur;
      const k = smoothstep(clamp(((u - c) / (1 - c)) * 1.6, 0, 1)) * (1 - smoothstep(clamp((u - 0.85) / 0.15, 0, 1)));
      const rearRight = sw.stroke === 'fh' ? mir > 0 : mir < 0;
      const rear = rearRight ? footR : footL;
      rear[1] += 0.09 * k;
    }
  }
  const { t: _t, ...rest } = key;
  void _t;
  return { ...rest, crouch, footL, footR, bodyDx: lat * 0.06 * vr, bob };
}

/** Cinemàtica inversa de dos ossos; retorna el colze. */
function ik(sx: number, sy: number, hx: number, hy: number, l1: number, l2: number, bend: number): [number, number] {
  const dx = hx - sx;
  const dy = hy - sy;
  let d = Math.hypot(dx, dy);
  const maxD = l1 + l2 - 0.001;
  if (d > maxD) d = maxD;
  if (d < 0.05) d = 0.05;
  const a = Math.atan2(dy, dx);
  const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const ang = a + bend * Math.acos(cosA);
  return [sx + Math.cos(ang) * l1, sy + Math.sin(ang) * l1];
}

export interface DrawSpec {
  look: PlayerLook;
  style: PlayerStyle;
  view: 'back' | 'front';
  /** Escala en píxels per metre. */
  s: number;
  /** Peu del personatge a pantalla. */
  x: number;
  y: number;
  pose: Pose;
}

/** Dibuixa un tennista. */
export function drawPlayerSprite(ctx: Ctx, d: DrawSpec): { x: number; y: number } {
  const { look, style, view, s, pose } = d;
  const mir = (view === 'back' ? 1 : -1) * (style.lefty ? -1 : 1); // costat dominant
  const back = view === 'back';
  // Cos una mica més gran (estil arcade); les mans i la raqueta mantenen l'alçada física
  const hScale0 = look.height / 1.85;
  const hScale = hScale0 * 1.16;
  const b = look.build;

  // Transformacions
  const X = (lx: number) => d.x + lx * s;
  const Y = (ly: number) => d.y - ly * s;
  const lift = pose.lift + pose.bob;
  const crouch = pose.crouch;
  const hipY = (0.95 - crouch * 0.55) * hScale + lift;
  const shoulderY = (1.5 - crouch * 0.9 - pose.lean * 0.35) * hScale + lift;
  const sw = (0.5 * b * (1 - 0.3 * Math.abs(pose.twist))) * (0.9 + 0.1 * hScale);
  const bodyDx = pose.bodyDx + pose.twist * 0.02 + pose.lean * 0.05 + mir * pose.shift;
  const tkW = (m: number) => Math.max(1, Math.round(m * s));

  const skin = look.skin;
  const skinSh = look.skinShade;
  const shirt = look.shirt;
  const shirtDark = shade(shirt, 0.82);
  const shirtEdge = shade(shirt, 0.55);
  const shortsC = look.shorts;

  // --- Cames ---
  const hipW = 0.1 * b;
  const hips: [number, number][] = [
    [-hipW + bodyDx * 0.5, hipY],
    [hipW + bodyDx * 0.5, hipY],
  ];
  const feet: [number, number][] = [
    [pose.footL[0], pose.footL[1] + lift * 0.4],
    [pose.footR[0], pose.footR[1] + lift * 0.4],
  ];
  const order = pose.footL[1] > pose.footR[1] ? [1, 0] : [0, 1];
  for (const i of order) {
    const h = hips[i];
    const f: [number, number] = [feet[i][0], feet[i][1] + 0.07];
    const kneeBend = 0.05 + crouch * 0.4;
    const kx = (h[0] + f[0]) / 2 + (i === 0 ? -1 : 1) * kneeBend;
    const ky = (h[1] + f[1]) / 2 + 0.03;
    const thick = Math.max(2, tkW(0.165 * b * hScale));
    const thin = Math.max(2, tkW(0.125 * b * hScale));
    // espinella: pell + mitjó + sabata
    line(ctx, X(kx), Y(ky), X(f[0]), Y(f[1]), thin, skin);
    const sockT = look.socks;
    const sx0 = f[0] + (kx - f[0]) * 0.3;
    const sy0 = f[1] + (ky - f[1]) * 0.3;
    line(ctx, X(sx0), Y(sy0), X(f[0]), Y(f[1]), thin, sockT);
    if (look.capri) {
      const cx0 = kx + (f[0] - kx) * 0.35;
      const cy0 = ky + (f[1] - ky) * 0.35;
      line(ctx, X(h[0]), Y(h[1]), X(cx0), Y(cy0), thick, shortsC);
    } else {
      const tx = h[0] + (kx - h[0]) * 0.62;
      const ty = h[1] + (ky - h[1]) * 0.62;
      line(ctx, X(tx), Y(ty), X(kx), Y(ky), thick, skin);
      line(ctx, X(h[0]), Y(h[1]), X(tx), Y(ty), thick, shortsC);
    }
    // sabata
    const sw2 = tkW(0.25 * b);
    rect(ctx, X(feet[i][0]) - sw2 / 2, Y(feet[i][1] + 0.11), sw2, Math.max(2, tkW(0.12)), look.shoes);
    rect(ctx, X(feet[i][0]) - sw2 / 2, Y(feet[i][1] + 0.02), sw2, 1, shade(look.shoes, 0.6));
  }

  // --- Short (cintura) ---
  const waistW = 0.32 * b;
  rect(ctx, X(bodyDx * 0.5 - waistW / 2), Y(hipY + 0.06), tkW(waistW), tkW(0.14), shortsC);
  rect(ctx, X(bodyDx * 0.5 - waistW / 2), Y(hipY + 0.06), tkW(waistW), 1, look.shortsTrim);

  // Braç no dominant (a darrere en vista d'esquena)
  const shoulderOff: [number, number] = [-mir * sw * 0.5 + bodyDx, shoulderY - 0.03];
  const shoulderDom: [number, number] = [mir * sw * 0.5 + bodyDx, shoulderY - 0.03];
  const L1 = 0.3 * hScale;
  const L2 = 0.3 * hScale;
  const armT = Math.max(2, tkW(0.125 * b * hScale));

  // posició de mans (la mà lliure s'acosta a la raqueta segons `grip`)
  const dhx = mir * pose.hx;
  const dhy = pose.hy * hScale0 + lift;
  const fox = mir * pose.ox;
  const foy = pose.oy * hScale0 + lift;
  const ohx = fox + (dhx - mir * 0.04 - fox) * pose.grip;
  const ohy = foy + (dhy - 0.04 - foy) * pose.grip;
  // Profunditat: davant del cos és cap on mira el jugador (lluny de la càmera en vista d'esquena)
  const offFd = pose.ofd + (pose.fd - pose.ofd) * pose.grip;
  const domBehind = back ? pose.fd > 0 : pose.fd < 0;
  const offBehind = back ? offFd > 0 : offFd < 0;

  const drawArm = (sh: [number, number], hx: number, hy: number, dir: number): void => {
    const el = ik(sh[0], sh[1], hx, hy, L1, L2, dir);
    const sleeve = look.sleeveless ? skin : shirt;
    const foreT = Math.max(1, armT - (s < 16 ? 0 : 1));
    const x0 = X(sh[0]), y0 = Y(sh[1]), x1 = X(el[0]), y1 = Y(el[1]), x2 = X(hx), y2 = Y(hy);
    // contorn fosc: separa el braç del tors i el fa opac
    line(ctx, x0, y0, x1, y1, armT + 2, shade(sleeve, 0.55));
    line(ctx, x1, y1, x2, y2, foreT + 2, shade(skin, 0.6));
    line(ctx, x0, y0, x1, y1, armT, sleeve);
    if (!look.sleeveless) {
      // mànega curta: només 58% del braç és samarreta
      const mx = sh[0] + (el[0] - sh[0]) * 0.58;
      const my = sh[1] + (el[1] - sh[1]) * 0.58;
      line(ctx, X(mx), Y(my), x1, y1, armT, skin);
      line(ctx, x0, y0, X(mx), Y(my), armT, sleeve);
    }
    line(ctx, x1, y1, x2, y2, foreT, skin);
    px(ctx, x2, y2, skinSh, Math.max(1, tkW(0.07)));
  };
  const offDir = mir * (back ? 1 : -1);
  const domDir = -offDir;

  // Braços per darrere del tors (mà cap endavant) abans de dibuixar-lo
  if (offBehind) drawArm(shoulderOff, ohx, ohy, offDir);
  if (domBehind) drawArm(shoulderDom, dhx, dhy, domDir);

  // --- Tors ---
  const torsoBottom = hipY + 0.05;
  const rows = Math.max(3, Math.round((shoulderY - torsoBottom + 0.08) * s));
  for (let i = 0; i < rows; i++) {
    const f = i / (rows - 1);
    const y = shoulderY + 0.06 - (f * (shoulderY - torsoBottom + 0.08));
    const w = (0.3 * b + (sw - 0.3 * b) * (1 - f) * 1.05) * 1;
    const cx = bodyDx * (1 - f * 0.5);
    const col = f > 0.8 ? look.shirtTrim : f > 0.45 ? shirt : shirt;
    const rw = Math.max(2, Math.round(w * s));
    const rx = X(cx - w / 2);
    rect(ctx, rx, Y(y), rw, 1, col);
    rect(ctx, Math.round(rx) - 1, Y(y), 1, 1, shirtEdge);
    rect(ctx, Math.round(rx) + rw, Y(y), 1, 1, shirtEdge);
  }
  // detalls del tors
  if (back) {
    // franja vertical a l'esquena
    rect(ctx, X(bodyDx - 0.012), Y(shoulderY), Math.max(1, tkW(0.03)), Math.max(2, rows - 3), shirtDark);
  } else {
    rect(ctx, X(bodyDx - 0.05), Y(shoulderY + 0.06), Math.max(2, tkW(0.1)), Math.max(1, tkW(0.04)), look.shirtTrim);
  }
  if (look.sleeveless) {
    // pell als costats de l'espatlla
    rect(ctx, X(bodyDx - sw / 2), Y(shoulderY + 0.04), 1, 1, skin);
    rect(ctx, X(bodyDx + sw / 2) - 1, Y(shoulderY + 0.04), 1, 1, skin);
  }

  // --- Cap ---
  const headR = 0.125 * Math.pow(b, 0.3) * hScale;
  const hx0 = bodyDx + pose.twist * 0.03 + pose.lean * 0.04;
  const hy0 = shoulderY + 0.14 + headR * 0.55 + pose.lean * 0.02;
  const cxp = X(hx0);
  const cyp = Y(hy0);
  const rp = Math.max(1.6, headR * s);
  // coll
  rect(ctx, X(hx0 - 0.04), Y(shoulderY + 0.1), Math.max(1, tkW(0.08)), Math.max(1, tkW(0.06)), skinSh);
  if (back) {
    disc(ctx, cxp, cyp, rp, look.hair);
    // orelles
    px(ctx, cxp - rp, cyp + rp * 0.1, skin);
    px(ctx, cxp + rp - 1, cyp + rp * 0.1, skin);
    // clatell: una mica més fosc
    rect(ctx, cxp - rp * 0.5, cyp + rp * 0.45, Math.max(1, rp), 1, shade(look.hair, 0.7));
  } else {
    disc(ctx, cxp, cyp, rp, skin);
    // ombra de la cara
    rect(ctx, cxp - rp * 0.6, cyp + rp * 0.55, rp * 1.2, 1, skinSh);
    // ulls
    const eyeY = cyp - rp * 0.05;
    px(ctx, cxp - rp * 0.45, eyeY, '#1a1a1a');
    px(ctx, cxp + rp * 0.4, eyeY, '#1a1a1a');
    if (look.beard === 'stubble') {
      for (let i = -2; i <= 2; i++) if (i % 2 === 0) px(ctx, cxp + i * rp * 0.3, cyp + rp * 0.55, shade(look.hair, 1.1));
      rect(ctx, cxp - rp * 0.55, cyp + rp * 0.65, rp * 1.1, 1, shade(skinSh, 0.85));
    }
  }
  drawHair(ctx, look, cxp, cyp, rp, back, s);
  // accessoris
  if (look.accessory === 'headband') {
    const hbY = cyp - rp * 0.38;
    rect(ctx, cxp - rp, hbY, rp * 2 + 1, Math.max(1, Math.round(rp * 0.28)), look.accColor);
  } else if (look.accessory === 'cap') {
    const capC = look.accColor;
    // corona
    for (let y = -Math.round(rp); y <= -Math.round(rp * 0.2); y++) {
      const half = Math.round(Math.sqrt(Math.max(0, rp * rp - y * y)));
      rect(ctx, cxp - half, cyp + y, half * 2 + 1, 1, capC);
    }
    if (!back) {
      // visera cap a l'espectador
      rect(ctx, cxp - rp * 0.95, cyp - rp * 0.2, rp * 1.9 + 1, 1, shade(capC, 0.65));
      rect(ctx, cxp - rp * 0.8, cyp - rp * 0.2 + 1, rp * 1.6 + 1, 1, shade(capC, 0.5));
    } else {
      rect(ctx, cxp - 1, cyp - rp * 0.15, 2, 1, shade(capC, 0.6));
    }
  }

  // --- Braços davant del tors i raqueta ---
  if (!offBehind) drawArm(shoulderOff, ohx, ohy, offDir);
  if (!domBehind) drawArm(shoulderDom, dhx, dhy, domDir);
  return drawRacket(ctx, X(dhx), Y(dhy), pose.ang * mir, s, look.racketFrame, hScale0);
}

function drawHair(ctx: Ctx, look: PlayerLook, cx: number, cy: number, rp: number, back: boolean, s: number): void {
  const c = look.hair;
  const hi = shade(c, 1.35);
  const r = Math.max(2, Math.round(rp));
  switch (look.hairStyle) {
    case 'crop':
    case 'short':
      if (!back) rect(ctx, cx - r, cy - r, r * 2 + 1, Math.max(1, Math.round(r * 0.75)), c);
      if (look.hairStyle === 'crop') px(ctx, cx - 1, cy - r - 1, c, 3);
      break;
    case 'quiff':
      if (!back) rect(ctx, cx - r, cy - r, r * 2 + 1, Math.max(1, Math.round(r * 0.8)), c);
      rect(ctx, cx - r + 1, cy - r - 2, r * 2 - 1, 2, c);
      px(ctx, cx + 1, cy - r - 3, hi, 2);
      break;
    case 'swept':
      if (!back) rect(ctx, cx - r, cy - r, r * 2 + 1, Math.max(1, Math.round(r * 0.7)), c);
      rect(ctx, cx - r, cy - r - 1, r * 2 + 1, 1, c);
      px(ctx, cx - r - 1, cy - r + 1, c, 1);
      break;
    case 'slick':
      if (!back) rect(ctx, cx - r, cy - r, r * 2 + 1, Math.max(1, Math.round(r * 0.6)), c);
      rect(ctx, cx - r + 1, cy - r - 1, r * 2 - 1, 1, hi);
      break;
    case 'long':
      if (!back) rect(ctx, cx - r, cy - r, r * 2 + 1, Math.max(1, Math.round(r * 0.8)), c);
      // cabells als costats i darrere fins a les espatlles
      rect(ctx, cx - r - 1, cy - r * 0.2, 2, Math.round(r * 1.3), c);
      rect(ctx, cx + r, cy - r * 0.2, 2, Math.round(r * 1.3), c);
      if (back) rect(ctx, cx - r, cy + r * 0.3, r * 2 + 1, Math.max(2, Math.round(r * 0.9)), c);
      break;
  }
  void s;
}

function drawRacket(ctx: Ctx, hx: number, hy: number, ang: number, s: number, frame: string, hScale: number): { x: number; y: number } {
  const k = hScale * s;
  const dx = Math.sin(ang);
  const dy = -Math.cos(ang); // pantalla: y cap avall
  // mànec i coll
  const gripEnd = 0.2 * k;
  const throatEnd = 0.36 * k;
  line(ctx, hx, hy, hx + dx * gripEnd, hy + dy * gripEnd, 1, '#222222');
  line(ctx, hx + dx * gripEnd, hy + dy * gripEnd, hx + dx * throatEnd, hy + dy * throatEnd, 1, frame);
  // cap
  const a = 0.2 * k; // semieix llarg
  const bb = 0.145 * k; // semieix curt
  const cx = hx + dx * (throatEnd + a * 0.85);
  const cy = hy + dy * (throatEnd + a * 0.85);
  const rad = Math.ceil(Math.max(a, bb)) + 1;
  for (let y = -rad; y <= rad; y++) {
    for (let x = -rad; x <= rad; x++) {
      // coordenades al sistema de la raqueta
      const u = x * dx + y * dy; // al llarg
      const v = -x * dy + y * dx; // perpendicular
      const e = (u * u) / (a * a) + (v * v) / (bb * bb);
      if (e <= 1.0) {
        if (e >= 0.55 || a < 3) px(ctx, cx + x, cy + y, frame);
        else if (((x + y) & 1) === 0) px(ctx, cx + x, cy + y, '#e8eef2');
      }
    }
  }
  return { x: cx, y: cy };
}

/** Sprite petit de jutge de línia / ajudant (assegut). */
export function drawSittingOfficial(ctx: Ctx, x: number, y: number, s: number, shirt: string, arm: number, front: boolean): void {
  const h = Math.max(6, Math.round(1.1 * s));
  // cadira
  rect(ctx, x - 0.2 * s, y - 0.45 * s, 0.4 * s, 0.45 * s, '#2a2f3a');
  // cos
  rect(ctx, x - 0.17 * s, y - 0.95 * s, 0.34 * s, 0.5 * s, shirt);
  rect(ctx, x - 0.17 * s, y - 0.55 * s, 0.34 * s, 0.14 * s, '#1b2236');
  // cap
  disc(ctx, x, y - 1.1 * s, Math.max(1.5, 0.1 * s), '#e0b090');
  rect(ctx, x - 0.1 * s, y - 1.2 * s, 0.2 * s, Math.max(1, 0.06 * s), '#2a1a12');
  void h;
  void front;
  // braços: aixecats si arm > 0
  if (arm > 0) {
    line(ctx, x - 0.17 * s, y - 0.9 * s, x - 0.4 * s, y - 1.35 * s, 1, '#e0b090');
    line(ctx, x + 0.17 * s, y - 0.9 * s, x + 0.4 * s, y - 1.35 * s, 1, '#e0b090');
  } else {
    line(ctx, x - 0.17 * s, y - 0.88 * s, x - 0.2 * s, y - 0.62 * s, 1, '#e0b090');
    line(ctx, x + 0.17 * s, y - 0.88 * s, x + 0.2 * s, y - 0.62 * s, 1, '#e0b090');
  }
}
