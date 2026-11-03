import { COURT } from '../engine/constants';
import { clamp, lerp } from '../engine/math';
import { Rng } from '../engine/rng';
import { BallState, ballSpeed } from '../physics/ball';
import { ShotSpec, planShot } from '../physics/solver';
import { HitKey, Player, Stroke, SwingState } from './player';

/** Context d'un servei en curs. */
export interface ServeCtx {
  second: boolean;
  /** x del servidor: determina la caixa de destí (diagonal). */
  boxSign: number;
}

export interface HitResult {
  vx: number;
  vy: number;
  vz: number;
  wx: number;
  wy: number;
  wz: number;
  quality: number;
  /** 0..1, per als efectes (so, partícules). */
  power: number;
  speed: number;
  stroke: Stroke;
  variant: HitKey;
  /** Velocitat inicial en km/h (per a estadístiques). */
  kmh: number;
}

/** Radi d'abast efectiu de la raqueta (m). */
export function reachOf(p: Player): number {
  const base = p.diff ? 1.55 : 1.75;
  return base + 0.25 * p.speedStat + (p.def.look.height - 1.85) * 0.6;
}

/** Punt ideal de contacte segons el cop. */
export function idealContact(p: Player, stroke: Stroke): { x: number; y: number } {
  const off = stroke === 'fh' ? 0.85 : stroke === 'bh' ? -0.75 : stroke === 'smash' ? 0.2 : stroke === 'serve' ? 0.15 : 0.45;
  return { x: p.x + p.rightX * off, y: p.y + p.dirY * 0.35 };
}

/** Decideix quin tipus de cop s'executa segons la pilota i la posició. */
export function chooseStroke(p: Player, ball: BallState, bounced: boolean, key: HitKey): Stroke {
  const tc = 0.15;
  const g = 9.81;
  const px = ball.x + ball.vx * tc;
  const pz = ball.z + ball.vz * tc - 0.5 * g * tc * tc;
  const nearNet = Math.abs(p.y) < 6.2;
  if (!bounced && pz > 2.05 && key !== 'lob' && Math.abs(ball.y) < 10.5) return 'smash';
  if (!bounced && nearNet && key !== 'lob') return 'vol';
  const lat = (px - p.x) * p.rightX;
  return lat >= -0.15 ? 'fh' : 'bh';
}

export interface Quality {
  q: number;
  err: number;
  reach: number;
}

/** Qualitat del contacte 0..1 (0 = fora d'abast). */
export function contactQuality(p: Player, ball: BallState, stroke: Stroke): Quality {
  const reach = reachOf(p);
  if (stroke === 'serve') {
    const z = ball.z;
    if (z < 1.9 || z > 3.35) return { q: 0, err: 9, reach };
    const q = clamp(1 - Math.abs(z - 2.95) / 0.95, 0.05, 1);
    return { q, err: 0, reach };
  }
  const c = idealContact(p, stroke);
  const err = Math.hypot(ball.x - c.x, ball.y - c.y);
  const maxZ = stroke === 'smash' ? 3.25 : 2.5;
  if (ball.z > maxZ || ball.z < 0.06) return { q: 0, err, reach };
  if (err > reach) return { q: 0, err, reach };
  let q = 1 - (err / reach) * 0.85;
  // Altura còmoda (0.5 - 1.3 m): millor qualitat
  const zc = stroke === 'smash' ? 2.7 : 0.85;
  const dz = Math.abs(ball.z - zc);
  q *= 1 - clamp(dz / (stroke === 'smash' ? 1.2 : 2.2), 0, 0.4);
  return { q: clamp(q, 0.05, 1), err, reach };
}

interface Built {
  spec: ShotSpec;
  tx: number;
  ty: number;
  sigma: number;
  elevSigma: number;
}

/**
 * Calcula el cop resultant: velocitat, gir i trajectòria, aplicant errors
 * segons precisió, qualitat del contacte, cansament i dificultat.
 */
export function buildHit(
  p: Player,
  ball: BallState,
  swing: SwingState,
  quality: number,
  rng: Rng,
  serve: ServeCtx | null,
): HitResult {
  const stroke = swing.stroke;
  const variant = swing.variant;
  const u = (clamp(swing.aimY, -1, 1) + 1) / 2; // 0 curt/suau .. 1 llarg/fort
  const aimX = clamp(swing.aimX, -1.15, 1.15);
  const power = p.powerStat * (p.diff ? p.diff.powerMult : 1);
  const prec = p.precStat;
  const stam = clamp(p.stamina, 0, 1);
  const vin = ballSpeed(ball);
  const errD = p.diff ? p.diff.errorMult : 1;
  const stress = clamp(p.speed / 7, 0, 1) * 0.6;
  const sideOpp = -p.side;

  const baseSigma =
    1.45 * (0.22 + 1.05 * (1 - prec)) * (1 + 1.5 * (1 - quality)) * errD * (1 + 0.45 * (1 - stam)) * (1 + 0.35 * stress);
  const baseElev = 1.3 * (0.005 + 0.02 * (1 - prec)) * (1 + 1.6 * (1 - quality)) * errD * (1 + 0.4 * (1 - stam));

  const built = serve && stroke === 'serve' ? buildServe(p, ball, swing, quality, rng, serve, u, aimX, power, baseSigma, baseElev) : buildStroke(p, ball, swing, quality, rng, u, aimX, power, vin, baseSigma, baseElev, sideOpp);

  const plan = planShot(ball.x, ball.y, ball.z, built.tx, built.ty, built.spec);

  // Error d'elevació (angle de la raqueta): negatiu -> xarxa, positiu -> llarg
  const dTheta = rng.gauss() * built.elevSigma;
  const th = plan.theta + dTheta;
  const vh0 = Math.hypot(plan.vx, plan.vy);
  const vh1 = plan.speed * Math.cos(th);
  const k = vh0 > 1e-6 ? vh1 / vh0 : 0;
  const vx = plan.vx * k;
  const vy = plan.vy * k;
  const vz = plan.speed * Math.sin(th);

  const topSign = built.spec.spinTop;
  return {
    vx,
    vy,
    vz,
    wx: plan.wx,
    wy: plan.wy,
    wz: plan.wz,
    quality,
    power: clamp(plan.speed / 46, 0.2, 1),
    speed: plan.speed,
    stroke,
    variant,
    kmh: Math.round(Math.hypot(vx, vy, vz) * 3.6 + (topSign === 0 ? 0 : 0)),
  };
}

function buildStroke(
  p: Player,
  ball: BallState,
  swing: SwingState,
  q: number,
  rng: Rng,
  u: number,
  aimX: number,
  power: number,
  vin: number,
  baseSigma: number,
  baseElev: number,
  sideOpp: number,
): Built {
  const st = p.def.style;
  const stroke = swing.stroke;
  const variant = swing.variant;
  let speed = 22.5;
  let spinTop = 70;
  let spinSide = 0;
  let thetaLo = -0.3;
  let thetaHi = 0.7;
  let minClear = 0.25;
  let depth = 5.5 + 5.8 * u;
  let fixedTheta: number | undefined;
  let errMult = 1;

  if (stroke === 'smash') {
    speed = 31 + 6 * power;
    spinTop = 25;
    thetaLo = -0.85;
    thetaHi = 0.1;
    minClear = 0.1;
    depth = 5.5 + 5.2 * u;
    errMult = 1.05;
  } else if (stroke === 'vol') {
    speed = 15.5 + 6 * power;
    spinTop = -60;
    thetaLo = -0.6;
    thetaHi = 0.5;
    minClear = 0.08;
    depth = 3.6 + 7 * u;
    errMult = 1.15;
    if (variant === 'lob') {
      fixedTheta = 0.8;
      depth = 9 + 2.2 * u;
      minClear = 1.5;
    }
  } else {
    switch (variant) {
      case 'flat':
        speed = 22.5;
        spinTop = 70;
        thetaLo = -0.3;
        thetaHi = 0.7;
        minClear = 0.25;
        depth = 5.5 + 5.8 * u;
        break;
      case 'top':
        speed = 20;
        spinTop = 270;
        thetaLo = -0.2;
        thetaHi = 0.85;
        minClear = 0.6;
        depth = 6.5 + 4.7 * u;
        errMult = 0.95;
        break;
      case 'slice':
        speed = 16.5;
        spinTop = -190;
        spinSide = (stroke === 'bh' ? -1 : 1) * p.rightX * 55;
        thetaLo = -0.3;
        thetaHi = 0.75;
        minClear = 0.22;
        depth = 4.8 + 5.7 * u;
        break;
      case 'lob':
        fixedTheta = 0.78;
        spinTop = 120;
        minClear = 1.8;
        depth = 8.3 + 2.8 * u;
        errMult = 1.1;
        break;
    }
  }
  if (!fixedTheta) {
    speed *= 0.82 + 0.36 * power;
    speed *= 0.8 + 0.4 * u;
    speed *= 0.9 + 0.1 * clamp(vin / 22, 0, 1.5);
    speed *= 0.65 + 0.35 * q;
    speed *= 0.93 + 0.07 * clamp(p.stamina, 0, 1);
  }
  spinTop *= st.spinBonus * (0.85 + 0.3 * q);
  if (ball.z < 0.45) {
    minClear += 0.4;
    speed *= 0.88;
  } else if (ball.z > 1.65 && stroke !== 'smash') {
    speed *= 0.92;
  }
  // Variació d'estil: ocasionalment un cop més curt (dropshot) si ho demana el jugador amb u baix
  const sigma = baseSigma * errMult;
  const tx = aimX * 3.75 + rng.gauss() * sigma;
  const dy = depth + rng.gauss() * sigma * 1.15;
  const ty = sideOpp * Math.max(1.4, dy);
  return {
    spec: { speed, spinTop, spinSide, thetaLo, thetaHi, minClear, fixedTheta },
    tx,
    ty,
    sigma,
    elevSigma: baseElev * errMult,
  };
}

function buildServe(
  p: Player,
  ball: BallState,
  swing: SwingState,
  q: number,
  rng: Rng,
  serve: ServeCtx,
  u: number,
  aimX: number,
  power: number,
  baseSigma: number,
  baseElev: number,
): Built {
  const st = p.def.style;
  const variant = swing.variant;
  const second = serve.second;
  let speed: number;
  let spinTop: number;
  let spinSide = 0;
  switch (variant) {
    case 'slice':
      speed = 38.5;
      spinTop = -20;
      spinSide = (p.rightX >= 0 ? 1 : -1) * 150;
      break;
    case 'top':
      speed = 33;
      spinTop = 330;
      spinSide = (p.rightX >= 0 ? 1 : -1) * 40;
      break;
    default:
      speed = 43.5;
      spinTop = 60;
  }
  speed *= (0.84 + 0.3 * power) * st.serveBonus;
  speed *= 0.86 + 0.14 * q;
  let minClear = 0.12;
  let depth = lerp(3.6, 6.0, u);
  let errMult = 1;
  if (second) {
    speed *= variant === 'flat' ? 0.78 : 0.86;
    spinTop = Math.max(spinTop, 200);
    minClear = 0.55;
    depth = lerp(3.4, 5.4, u);
    errMult = 0.85;
  }
  // Caixa de destí
  const [minX, maxX] = serve.boxSign < 0 ? [-3.8, -0.5] : [0.5, 3.8];
  const sigma = baseSigma * errMult * (1 + 0.8 * (1 - q));
  const tx = lerp(minX, maxX, (clamp(aimX, -1, 1) + 1) / 2) + rng.gauss() * sigma;
  const ty = -p.side * (depth + rng.gauss() * sigma * 0.9);
  return {
    spec: { speed, spinTop, spinSide, thetaLo: -0.4, thetaHi: 0.12, minClear },
    tx,
    ty,
    sigma,
    elevSigma: baseElev * errMult,
  };
}

/** Radi de la línia de servei / caixes per decidir si un servei és bo. */
export function inServiceBox(x: number, y: number, boxSign: number, receiverSide: number, r: number): boolean {
  if (Math.sign(y) !== receiverSide && Math.abs(y) > r) return false;
  if (Math.abs(y) > COURT.serviceY + r) return false;
  if (boxSign < 0) return x <= r && x >= -(COURT.halfWs + r);
  return x >= -r && x <= COURT.halfWs + r;
}
