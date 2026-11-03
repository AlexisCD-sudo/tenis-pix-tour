import { BALL, COURT, SURFACE, WALL, netHeightAt } from '../engine/constants';

/**
 * Física de la pilota en 3D amb gir (vector ω).
 *  - gravetat, arrossegament quadràtic i efecte Magnus (a = kM · ω × v)
 *  - rebot amb restitució i fricció (el topspin/slice canvia el bot de debò)
 *  - xarxa (amb possibilitat de "cinta"), tanques del fons
 * Tot funciona amb un pas fix i no depèn del renderitzat.
 */
export interface BallState {
  x: number;
  y: number;
  z: number; // altura del centre
  vx: number;
  vy: number;
  vz: number;
  wx: number;
  wy: number;
  wz: number;
}

export interface BallEvents {
  bounce?: (x: number, y: number, vzIn: number, speed: number) => void;
  net?: (speed: number, cord: boolean) => void;
  wall?: () => void;
}

export interface StepOpts {
  net: boolean;
  walls: boolean;
}

export const newBall = (): BallState => ({
  x: 0,
  y: 0,
  z: BALL.r,
  vx: 0,
  vy: 0,
  vz: 0,
  wx: 0,
  wy: 0,
  wz: 0,
});

export const cloneBall = (b: BallState): BallState => ({ ...b });

export function ballSpeed(b: BallState): number {
  return Math.hypot(b.vx, b.vy, b.vz);
}

const R = BALL.r;
const KD = BALL.kD;
const KM = BALL.kM;
const G = BALL.g;

function bounce(b: BallState, ev?: BallEvents): void {
  const vzIn = -b.vz;
  const speedIn = ballSpeed(b);
  const e = SURFACE.restitution;
  b.z = R;
  b.vz = vzIn * e;

  // Velocitat de lliscament del punt de contacte
  const ux = b.vx - R * b.wy;
  const uy = b.vy + R * b.wx;
  const us = Math.hypot(ux, uy);
  if (us > 1e-6) {
    // Pilota de tennis ~ closca prima: I = 2/3 m r²
    const jMax = SURFACE.friction * (1 + e) * vzIn;
    const jStick = 0.4 * us;
    const j = Math.min(jMax, jStick);
    const jx = (-j * ux) / us;
    const jy = (-j * uy) / us;
    b.vx += jx;
    b.vy += jy;
    b.wx += (1.5 / R) * jy;
    b.wy += (-1.5 / R) * jx;
  }
  if (ev?.bounce) ev.bounce(b.x, b.y, vzIn, speedIn);
}

/** Avança la pilota dt segons. */
export function stepBall(b: BallState, dt: number, opts: StepOpts, ev?: BallEvents): void {
  // Rodolament
  if (b.z <= R + 1e-6 && Math.abs(b.vz) < 1e-3) {
    b.z = R;
    b.vz = 0;
    const d = Math.exp(-SURFACE.rollDamp * dt);
    b.vx *= d;
    b.vy *= d;
    b.wx *= d;
    b.wy *= d;
    b.wz *= d;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (opts.walls) walls(b, ev);
    return;
  }

  const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
  const ax = -KD * sp * b.vx + KM * (b.wy * b.vz - b.wz * b.vy);
  const ay = -KD * sp * b.vy + KM * (b.wz * b.vx - b.wx * b.vz);
  const az = -G - KD * sp * b.vz + KM * (b.wx * b.vy - b.wy * b.vx);

  const px = b.x;
  const py = b.y;
  const pz = b.z;

  b.vx += ax * dt;
  b.vy += ay * dt;
  b.vz += az * dt;
  const sd = Math.exp(-BALL.spinDecay * dt);
  b.wx *= sd;
  b.wy *= sd;
  b.wz *= sd;

  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;

  // Xarxa: el segment de trajectòria creua el pla y = 0
  if (opts.net && (py > 0) !== (b.y > 0) && py !== b.y) {
    const f = py / (py - b.y);
    const xn = px + (b.x - px) * f;
    const zn = pz + (b.z - pz) * f;
    if (Math.abs(xn) < COURT.netHalf) {
      const h = netHeightAt(xn);
      const clearance = zn - R - h;
      if (clearance < 0) {
        const spd = sp;
        const fromPos = py > 0;
        const tape = clearance > -0.06 && b.vz < 3; // cinta: la pilota hi rebota i pot caure al darrere
        b.x = xn;
        b.z = Math.max(R, zn);
        if (tape) {
          // La pilota frega la cinta, perd molta velocitat i cau a un costat o altre segons la direcció
          b.y = fromPos ? -0.03 : 0.03;
          b.vy *= 0.28;
          b.vx *= 0.7;
          b.vz = Math.max(b.vz, 0) * 0.3 + 0.8;
          ev?.net?.(spd, true);
        } else {
          b.y = fromPos ? 0.04 : -0.04;
          b.vy *= -0.12;
          b.vx *= 0.55;
          b.vz = Math.max(0, b.vz) * 0.3;
          ev?.net?.(spd, false);
        }
        return;
      }
    }
  }

  // Terra
  if (b.z < R && b.vz < 0) {
    const denom = pz - b.z;
    const f = denom > 1e-9 ? (pz - R) / denom : 0;
    const fx = px + (b.x - px) * f;
    const fy = py + (b.y - py) * f;
    const vzIn = -b.vz;
    b.x = fx;
    b.y = fy;
    b.z = R;
    if (vzIn < 0.9) {
      // Bot massa petit: la pilota roda
      b.vz = 0;
      if (ev?.bounce) ev.bounce(b.x, b.y, vzIn, sp);
    } else {
      bounce(b, ev);
      const rem = dt * (1 - f);
      b.x += b.vx * rem;
      b.y += b.vy * rem;
      b.z += b.vz * rem;
    }
  }

  if (opts.walls) walls(b, ev);
}

function walls(b: BallState, ev?: BallEvents): void {
  if (Math.abs(b.y) > WALL.backY && b.y * b.vy > 0) {
    b.y = Math.sign(b.y) * WALL.backY;
    b.vy *= -0.45;
    b.vx *= 0.8;
    ev?.wall?.();
  }
  if (Math.abs(b.x) > WALL.sideX && b.x * b.vx > 0) {
    b.x = Math.sign(b.x) * WALL.sideX;
    b.vx *= -0.45;
    b.vy *= 0.8;
    ev?.wall?.();
  }
}
