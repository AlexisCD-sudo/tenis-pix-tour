import { clamp } from '../engine/math';
import { HitKey, Player, Stroke } from '../players/player';
import { PlayerLook, PlayerStyle } from '../players/roster';
import { Ctx, disc, line, px, rect, shade } from './pixel';

/**
 * Personatges pixel art generats amb un esquelet: cada fotograma es dibuixa
 * amb primitives de píxel a partir d'una pose interpolada (claus d'animació),
 * de manera que els moviments són fluids i cada jugador té el seu aspecte.
 * Coordenades de pose: metres, x cap a la dreta de la pantalla, y cap amunt,
 * per a un destre vist d'esesquena (es mirallen segons vista i lateralitat).
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
}

export interface Pose {
  hx: number;
  hy: number;
  ang: number;
  ox: number;
  oy: number;
  twist: number;
  lean: number;
  crouch: number;
  lift: number;
  twoHand: boolean;
  /** Peus (offsets respecte al centre, metres). */
  footL: [number, number];
  footR: [number, number];
  bodyDx: number;
  bob: number;
}

const K = (t: number, hx: number, hy: number, ang: number, ox: number, oy: number, twist = 0, lean = 0, crouch = 0, lift = 0): Key => ({
  t, hx, hy, ang, ox, oy, twist, lean, crouch, lift,
});

const READY = K(0, 0.3, 1.0, 0.8, 0.12, 1.0, 0, 0, 0.07, 0);

function lerpKey(a: Key, b: Key, f: number): Key {
  const l = (x: number, y: number) => x + (y - x) * f;
  return {
    t: l(a.t, b.t), hx: l(a.hx, b.hx), hy: l(a.hy, b.hy), ang: l(a.ang, b.ang), ox: l(a.ox, b.ox), oy: l(a.oy, b.oy),
    twist: l(a.twist, b.twist), lean: l(a.lean, b.lean), crouch: l(a.crouch, b.crouch), lift: l(a.lift, b.lift),
  };
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

function strokeKeys(stroke: Stroke, variant: HitKey, c: number, st: PlayerStyle): { keys: Key[]; twoHand: boolean } {
  const T = (f: number) => f;
  const tb = T(c * 0.5);
  const tf = T(c + (1 - c) * 0.4);
  let twoHand = true;
  let keys: Key[];
  switch (stroke) {
    case 'fh': {
      keys = [
        K(0, 0.3, 1.0, 0.8, 0.12, 1.0, 0, 0, 0.07),
        K(tb, 0.76, 1.1, 1.55, -0.05, 1.3, 0.7, -0.02, 0.12),
        K(c, 0.58, 1.0, 0.25, 0.1, 1.05, -0.1, 0.04, 0.09),
        K(tf, 0.05, 1.45, -1.0, 0.2, 1.15, -0.6, 0.05, 0.04),
        K(1, -0.3, 1.62, -1.9, 0.15, 1.1, -0.8, 0.04, 0.03),
      ];
      twoHand = false;
      if (variant === 'top') {
        keys[2].hy -= 0.16;
        keys[3].hy += 0.18;
        keys[4].hy += 0.12;
      } else if (variant === 'slice') {
        keys[1].hy += 0.22;
        keys[3].hx = 0.4;
        keys[3].hy = 1.05;
        keys[4].hx = 0.5;
        keys[4].hy = 0.8;
        keys[4].ang = 0.3;
      } else if (variant === 'lob') {
        keys[2].hy -= 0.3;
        keys[2].crouch = 0.2;
        keys[3].hy += 0.4;
        keys[4].hx = 0.15;
        keys[4].hy = 1.95;
        keys[4].ang = -0.6;
      }
      if (st.lasso && variant !== 'slice') {
        keys[3].hx = 0.15;
        keys[3].hy = 1.75;
        keys[4].hx = -0.2;
        keys[4].hy = 1.95;
        keys[4].ang = -2.6;
      }
      break;
    }
    case 'bh': {
      twoHand = !st.oneHandBackhand;
      const one = st.oneHandBackhand;
      keys = [
        K(0, 0.3, 1.0, 0.8, 0.12, 1.0, 0, 0, 0.07),
        K(tb, -0.55, 1.12, -1.5, one ? 0.45 : -0.45, one ? 1.4 : 1.12, -0.7, -0.02, 0.12),
        K(c, -0.5, 1.0, -0.2, one ? 0.6 : -0.35, one ? 1.3 : 1.0, 0.1, 0.04, 0.09),
        K(tf, 0.15, 1.45, 1.0, one ? 0.65 : 0.1, one ? 1.4 : 1.4, 0.55, 0.05, 0.04),
        K(1, 0.4, 1.68, 1.9, one ? 0.7 : 0.3, one ? 1.5 : 1.6, 0.8, 0.04, 0.03),
      ];
      if (variant === 'top') {
        keys[2].hy -= 0.15;
        keys[3].hy += 0.18;
        keys[4].hy += 0.1;
      } else if (variant === 'slice') {
        keys[1].hy += 0.25;
        keys[3].hx = -0.2;
        keys[3].hy = 1.05;
        keys[4].hx = -0.5;
        keys[4].hy = 0.85;
        keys[4].ang = -0.3;
      } else if (variant === 'lob') {
        keys[2].hy -= 0.3;
        keys[2].crouch = 0.2;
        keys[4].hy = 1.9;
      }
      break;
    }
    case 'serve':
      keys = [
        K(0, 0.3, 1.75, 2.7, -0.15, 2.2, 0.5, -0.1, 0.18, 0),
        K(c, 0.14, 2.5, 0.1, -0.3, 1.5, -0.1, 0.08, 0, 0.18),
        K(c + (1 - c) * 0.35, -0.1, 1.8, -1.4, -0.2, 1.25, -0.5, 0.06, 0.03, 0.1),
        K(1, -0.3, 1.15, -2.0, 0, 1.05, -0.7, 0.04, 0.05, 0),
      ];
      twoHand = false;
      break;
    case 'smash':
      keys = [
        K(0, 0.3, 1.85, 2.5, -0.1, 2.1, 0.4, -0.1, 0.1),
        K(c, 0.12, 2.45, 0.1, -0.2, 1.6, -0.1, 0.08, 0, 0.12),
        K(c + (1 - c) * 0.4, -0.15, 1.6, -1.5, -0.1, 1.3, -0.5, 0.05, 0.03, 0.05),
        K(1, -0.3, 1.2, -2.0, 0, 1.05, -0.7, 0.03, 0.05, 0),
      ];
      twoHand = false;
      break;
    default:
      keys = [
        K(0, 0.3, 1.0, 0.8, 0.12, 1.0, 0, 0, 0.07),
        K(tb, 0.55, 1.2, 1.0, 0.05, 1.2, 0.3, 0, 0.1),
        K(c, 0.55, 1.22, 0.5, 0.1, 1.15, 0, 0.03, 0.1),
        K(tf, 0.4, 1.15, 0.3, 0.12, 1.1, -0.1, 0.03, 0.08),
        K(1, 0.3, 1.05, 0.7, 0.12, 1.0, 0, 0, 0.07),
      ];
      twoHand = false;
  }
  return { keys, twoHand };
}

/** Pose d'un jugador en l'instant actual. */
export function poseFor(p: Player, time: number, tossBallZ: number | null): Pose {
  const st = p.def.style;
  const vr = clamp(p.speed / 7, 0, 1.4);
  const mv = p.speed > 0.5;
  const sw = p.swing;
  const phase = p.runPhase;

  let key: Key = READY;
  let twoHand = true;

  if (sw && sw.t < sw.dur) {
    const { keys, twoHand: th } = strokeKeys(sw.stroke, sw.variant, sw.contactAt / sw.dur, st);
    key = sampleKeys(keys, sw.t / sw.dur);
    twoHand = th;
  } else if (p.tossing && tossBallZ !== null) {
    key = K(0, 0.34, 1.35, 2.3, -0.12, clamp(tossBallZ + 0.1, 1.3, 2.4), 0.2, -0.04, 0.1);
    twoHand = false;
  } else {
    // Recuperació suau després del cop
    const since = p.sinceHit;
    const lastDur = 0.45;
    if (since < lastDur + 0.3 && p.lastStroke !== 'serve') {
      const f = clamp((since - lastDur) / 0.3, 0, 1);
      const { keys } = strokeKeys(p.lastStroke, p.lastVariant, 0.3, st);
      key = lerpKey(keys[keys.length - 1], READY, smoothstep(f));
      twoHand = false;
    }
    if (mv && since > lastDur + 0.3) {
      // Bracejament en córrer
      const s = Math.sin(phase);
      key = { ...READY, hy: 1.0 + 0.05 * s, hx: 0.3 + 0.05 * Math.cos(phase), oy: 1.0 - 0.06 * s, ox: 0.12 - 0.04 * s, lean: 0.06 * vr, crouch: 0.07 + 0.06 * vr };
    } else if (!mv && since > lastDur + 0.3) {
      key = { ...READY, hy: 1.0 + 0.012 * Math.sin(time * 3.1 + p.idx), oy: 1.0 + 0.012 * Math.sin(time * 3.1 + p.idx) };
    }
  }

  // Cames
  const lat = p.speed > 0.3 ? p.vx / p.speed : 0;
  const dep = p.speed > 0.3 ? p.vy / p.speed : 0;
  let footL: [number, number] = [-0.14, 0];
  let footR: [number, number] = [0.14, 0];
  let crouch = key.crouch;
  let bob = 0;
  if (mv) {
    const a = Math.sin(phase);
    const b = Math.sin(phase + Math.PI);
    const liftA = Math.max(0, a) * 0.2 * vr * st.stride;
    const liftB = Math.max(0, b) * 0.2 * vr * st.stride;
    footL = [-0.14 + lat * 0.3 * Math.cos(phase), liftA + dep * 0.07 * Math.cos(phase)];
    footR = [0.14 + lat * 0.3 * Math.cos(phase + Math.PI), liftB + dep * 0.07 * Math.cos(phase + Math.PI)];
    bob = Math.abs(Math.sin(phase)) * 0.035 * vr;
  } else {
    bob = 0.01 * Math.sin(time * 3.1 + p.idx);
  }
  if (p.slide > 0.1) {
    const s = p.slide;
    footL[0] -= 0.34 * s * (lat >= 0 ? 1 : 1);
    footR[0] += 0.34 * s;
    crouch += 0.2 * s;
  }
  if (sw && sw.t < sw.dur && sw.stroke !== 'serve' && sw.stroke !== 'smash') {
    // base d'obertura segons el cop
    const open = sw.stroke === 'bh' ? -1 : 1;
    footL[0] += -0.05 + open * 0.02;
    footR[0] += 0.05 + open * 0.02;
  }
  return {
    hx: key.hx,
    hy: key.hy,
    ang: key.ang,
    ox: key.ox,
    oy: key.oy,
    twist: key.twist,
    lean: key.lean,
    crouch,
    lift: key.lift,
    twoHand,
    footL,
    footR,
    bodyDx: lat * 0.06 * vr,
    bob,
  };
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
export function drawPlayerSprite(ctx: Ctx, d: DrawSpec): void {
  const { look, style, view, s, pose } = d;
  const mir = (view === 'back' ? 1 : -1) * (style.lefty ? -1 : 1); // costat dominant
  const back = view === 'back';
  const hScale = look.height / 1.85;
  const b = look.build;

  // Transformacions
  const X = (lx: number) => d.x + lx * s;
  const Y = (ly: number) => d.y - ly * s;
  const lift = pose.lift + pose.bob;
  const crouch = pose.crouch;
  const hipY = (0.95 - crouch * 0.55) * hScale + lift;
  const shoulderY = (1.5 - crouch * 0.9 - pose.lean * 0.35) * hScale + lift;
  const sw = (0.44 * b * (1 - 0.35 * Math.abs(pose.twist))) * (0.9 + 0.1 * hScale);
  const bodyDx = pose.bodyDx + pose.twist * 0.02 + pose.lean * 0.05;
  const tkW = (m: number) => Math.max(1, Math.round(m * s));

  const skin = look.skin;
  const skinSh = look.skinShade;
  const shirt = look.shirt;
  const shirtDark = shade(shirt, 0.82);
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
    const thick = tkW(0.13 * b * hScale);
    const thin = tkW(0.1 * b * hScale);
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
    const sw2 = tkW(0.2 * b);
    rect(ctx, X(feet[i][0]) - sw2 / 2, Y(feet[i][1] + 0.09), sw2, Math.max(2, tkW(0.1)), look.shoes);
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
  const armT = tkW(0.095 * b * hScale);

  // posició de mans
  let dhx = mir * pose.hx + 0;
  const dhy = pose.hy * hScale + lift;
  let ohx = mir * pose.ox;
  let ohy = pose.oy * hScale + lift;
  if (pose.twoHand) {
    ohx = dhx - mir * 0.04;
    ohy = dhy - 0.04;
  }
  dhx += 0;

  const drawArm = (sh: [number, number], hx: number, hy: number, dir: number): void => {
    const el = ik(sh[0], sh[1], hx, hy, L1, L2, dir);
    const sleeve = look.sleeveless ? skin : shirt;
    // braç superior
    line(ctx, X(sh[0]), Y(sh[1]), X(el[0]), Y(el[1]), armT, sleeve);
    if (!look.sleeveless) {
      // mànega curta: només 55% del braç és samarreta
      const mx = sh[0] + (el[0] - sh[0]) * 0.58;
      const my = sh[1] + (el[1] - sh[1]) * 0.58;
      line(ctx, X(mx), Y(my), X(el[0]), Y(el[1]), armT, skin);
      line(ctx, X(sh[0]), Y(sh[1]), X(mx), Y(my), armT, sleeve);
    }
    line(ctx, X(el[0]), Y(el[1]), X(hx), Y(hy), Math.max(1, armT - (s < 16 ? 0 : 1)), skin);
    px(ctx, X(hx), Y(hy), skinSh, Math.max(1, tkW(0.07)));
  };

  // El braç no dominant va per darrere del cos si és d'esquena
  if (!pose.twoHand || !back) drawArm(shoulderOff, ohx, ohy, mir * (back ? 1 : -1));

  // --- Tors ---
  const torsoBottom = hipY + 0.05;
  const rows = Math.max(3, Math.round((shoulderY - torsoBottom + 0.08) * s));
  for (let i = 0; i < rows; i++) {
    const f = i / (rows - 1);
    const y = shoulderY + 0.06 - (f * (shoulderY - torsoBottom + 0.08));
    const w = (0.3 * b + (sw - 0.3 * b) * (1 - f) * 1.05) * 1;
    const cx = bodyDx * (1 - f * 0.5);
    const col = f > 0.8 ? look.shirtTrim : f > 0.45 ? shirt : shirt;
    rect(ctx, X(cx - w / 2), Y(y), Math.max(2, Math.round(w * s)), 1, col);
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
  const headR = 0.105 * Math.pow(b, 0.3) * hScale;
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

  // --- Braç dominant i raqueta ---
  if (pose.twoHand && back) drawArm(shoulderOff, ohx, ohy, mir * 1);
  drawArm(shoulderDom, dhx, dhy, -mir * (back ? 1 : -1));
  drawRacket(ctx, X(dhx), Y(dhy), pose.ang * mir, s, look.racketFrame, hScale);
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

function drawRacket(ctx: Ctx, hx: number, hy: number, ang: number, s: number, frame: string, hScale: number): void {
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
