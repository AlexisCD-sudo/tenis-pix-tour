import { BALL, DT, netHeightAt } from '../engine/constants';
import { BallState, BallEvents, stepBall } from './ball';

/**
 * Càlcul de la sortida d'un cop. Representa la "intenció motora" del jugador:
 * dóna una velocitat i un gir, i el solucionador busca l'angle d'elevació que,
 * simulant la MATEIXA física que la pilota, la fa caure prop del punt desitjat.
 * Després, la pilota vola amb la física real (errors de precisió inclosos).
 */
export interface ShotSpec {
  speed: number;
  /** Gir al voltant de l'eix lateral: >0 topspin, <0 backspin (slice). rad/s */
  spinTop: number;
  /** Gir vertical (efecte lateral). rad/s */
  spinSide: number;
  thetaLo: number;
  thetaHi: number;
  /** Marge mínim per sobre de la xarxa (m). */
  minClear: number;
  /** Si està definit, l'angle és fix i es resol la velocitat (globus). */
  fixedTheta?: number;
}

export interface ShotPlan {
  vx: number;
  vy: number;
  vz: number;
  wx: number;
  wy: number;
  wz: number;
  theta: number;
  speed: number;
  /** Punt on cauria si no hi hagués errors afegits. */
  landX: number;
  landY: number;
  clearance: number;
  /** false si no s'ha pogut arribar al punt o passar la xarxa. */
  ok: boolean;
}

const R = BALL.r;

function launch(
  ox: number,
  oy: number,
  oz: number,
  hx: number,
  hy: number,
  theta: number,
  v: number,
  spinTop: number,
  spinSide: number,
): BallState {
  const c = Math.cos(theta);
  return {
    x: ox,
    y: oy,
    z: oz,
    vx: v * c * hx,
    vy: v * c * hy,
    vz: v * Math.sin(theta),
    // eix del topspin = z × h = (-hy, hx, 0)
    wx: -hy * spinTop,
    wy: hx * spinTop,
    wz: spinSide,
  };
}

interface Landing {
  x: number;
  y: number;
  clearance: number;
  crossed: boolean;
  t: number;
}

const evBounce: BallEvents = {};

/** Simula fins al primer bot, sense xarxa, mesurant el marge sobre la xarxa. */
export function simulateToBounce(init: BallState, maxT = 4): Landing {
  const b: BallState = { ...init };
  let landed = false;
  const res: Landing = { x: b.x, y: b.y, clearance: -Infinity, crossed: false, t: 0 };
  evBounce.bounce = (x, y) => {
    if (!landed) {
      landed = true;
      res.x = x;
      res.y = y;
    }
  };
  const side0 = b.y > 0;
  let t = 0;
  while (!landed && t < maxT) {
    const px = b.x;
    const py = b.y;
    const pz = b.z;
    stepBall(b, DT, { net: false, walls: false }, evBounce);
    t += DT;
    if (!res.crossed && !landed && (py > 0) !== (b.y > 0) && py !== b.y) {
      const f = py / (py - b.y);
      const xn = px + (b.x - px) * f;
      const zn = pz + (b.z - pz) * f;
      res.crossed = true;
      res.clearance = zn - R - netHeightAt(xn);
    }
  }
  res.t = t;
  // Si cau abans de passar la xarxa
  if (!res.crossed && (res.y > 0) === side0) res.clearance = -Infinity;
  return res;
}

export function planShot(
  ox: number,
  oy: number,
  oz: number,
  tx: number,
  ty: number,
  spec: ShotSpec,
): ShotPlan {
  const dx = tx - ox;
  const dy = ty - oy;
  const D = Math.max(1, Math.hypot(dx, dy));
  const hx = dx / D;
  const hy = dy / D;

  const dist = (theta: number, v: number): Landing & { d: number } => {
    const l = simulateToBounce(launch(ox, oy, oz, hx, hy, theta, v, spec.spinTop, spec.spinSide));
    return { ...l, d: (l.x - ox) * hx + (l.y - oy) * hy };
  };

  const build = (theta: number, v: number, l: Landing, ok: boolean): ShotPlan => {
    const s = launch(ox, oy, oz, hx, hy, theta, v, spec.spinTop, spec.spinSide);
    return {
      vx: s.vx,
      vy: s.vy,
      vz: s.vz,
      wx: s.wx,
      wy: s.wy,
      wz: s.wz,
      theta,
      speed: v,
      landX: l.x,
      landY: l.y,
      clearance: l.clearance,
      ok,
    };
  };

  // Globus: angle fix, es resol la velocitat
  if (spec.fixedTheta !== undefined) {
    const th = spec.fixedTheta;
    let lo = 5;
    let hi = 40;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      if (dist(th, mid).d < D) lo = mid;
      else hi = mid;
    }
    const v = (lo + hi) / 2;
    const l = dist(th, v);
    return build(th, v, l, l.clearance > spec.minClear);
  }

  let v = spec.speed;
  let best: ShotPlan | null = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    const lo0 = dist(spec.thetaLo, v);
    if (lo0.d > D && attempt < 11) {
      v *= 0.93;
      continue;
    }
    const hi0 = dist(spec.thetaHi, v);
    if (hi0.d < D) {
      // No arriba ni amb el màxim angle: queda curt (poca potència)
      return build(spec.thetaHi, v, hi0, false);
    }
    let lo = spec.thetaLo;
    let hi = spec.thetaHi;
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2;
      if (dist(mid, v).d < D) lo = mid;
      else hi = mid;
    }
    const th = (lo + hi) / 2;
    const l = dist(th, v);
    const plan = build(th, v, l, l.clearance >= spec.minClear);
    if (plan.ok) return plan;
    best = plan;
    v *= 0.93; // més arc => més marge sobre la xarxa
  }
  return best ?? build(spec.thetaHi, v, { x: tx, y: ty, clearance: -Infinity, crossed: false, t: 0 }, false);
}
