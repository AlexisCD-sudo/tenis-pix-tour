// src/engine/constants.ts
var DT = 1 / 120;
var COURT = {
  halfL: 11.885,
  halfWs: 4.115,
  halfWd: 5.485,
  serviceY: 6.401,
  netCenterH: 0.914,
  netPostH: 1.07,
  netHalf: 6.4
};
var BALL = {
  r: 0.033,
  g: 9.81,
  kD: 0.0205,
  kM: 0.00085,
  spinDecay: 0.1
};
var SURFACE = {
  restitution: 0.76,
  friction: 0.62,
  rollDamp: 1.3
};
var WALL = {
  backY: 18.3,
  sideX: 9.6
};
function netHeightAt(x) {
  const k = Math.min(1, Math.abs(x) / COURT.netHalf);
  return COURT.netCenterH + (COURT.netPostH - COURT.netCenterH) * k * k;
}

// src/engine/math.ts
var clamp = (v, a, b) => v < a ? a : v > b ? b : v;
var lerp = (a, b, t) => a + (b - a) * t;
var approach = (cur, target, maxDelta) => {
  if (cur < target)
    return Math.min(target, cur + maxDelta);
  return Math.max(target, cur - maxDelta);
};

// src/engine/rng.ts
class Rng {
  s;
  constructor(seed = 1) {
    this.s = seed >>> 0 || 1;
  }
  next() {
    this.s = this.s + 1831565813 >>> 0;
    let t = this.s;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  range(a, b) {
    return a + (b - a) * this.next();
  }
  chance(p) {
    return this.next() < p;
  }
  gauss() {
    return (this.next() + this.next() + this.next() - 1.5) * 2;
  }
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length) % arr.length];
  }
}

// src/physics/ball.ts
var newBall = () => ({
  x: 0,
  y: 0,
  z: BALL.r,
  vx: 0,
  vy: 0,
  vz: 0,
  wx: 0,
  wy: 0,
  wz: 0
});
var cloneBall = (b) => ({ ...b });
function ballSpeed(b) {
  return Math.hypot(b.vx, b.vy, b.vz);
}
var R = BALL.r;
var KD = BALL.kD;
var KM = BALL.kM;
var G = BALL.g;
function bounce(b, ev) {
  const vzIn = -b.vz;
  const speedIn = ballSpeed(b);
  const e = SURFACE.restitution;
  b.z = R;
  b.vz = vzIn * e;
  const ux = b.vx - R * b.wy;
  const uy = b.vy + R * b.wx;
  const us = Math.hypot(ux, uy);
  if (us > 0.000001) {
    const jMax = SURFACE.friction * (1 + e) * vzIn;
    const jStick = 0.4 * us;
    const j = Math.min(jMax, jStick);
    const jx = -j * ux / us;
    const jy = -j * uy / us;
    b.vx += jx;
    b.vy += jy;
    b.wx += 1.5 / R * jy;
    b.wy += -1.5 / R * jx;
  }
  if (ev?.bounce)
    ev.bounce(b.x, b.y, vzIn, speedIn);
}
function stepBall(b, dt, opts, ev) {
  if (b.z <= R + 0.000001 && Math.abs(b.vz) < 0.001) {
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
    if (opts.walls)
      walls(b, ev);
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
  if (opts.net && py > 0 !== b.y > 0 && py !== b.y) {
    const f = py / (py - b.y);
    const xn = px + (b.x - px) * f;
    const zn = pz + (b.z - pz) * f;
    if (Math.abs(xn) < COURT.netHalf) {
      const h = netHeightAt(xn);
      const clearance = zn - R - h;
      if (clearance < 0) {
        const spd = sp;
        const fromPos = py > 0;
        const tape = clearance > -0.06 && b.vz < 3;
        b.x = xn;
        b.z = Math.max(R, zn);
        if (tape) {
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
  if (b.z < R && b.vz < 0) {
    const denom = pz - b.z;
    const f = denom > 0.000000001 ? (pz - R) / denom : 0;
    const fx = px + (b.x - px) * f;
    const fy = py + (b.y - py) * f;
    const vzIn = -b.vz;
    b.x = fx;
    b.y = fy;
    b.z = R;
    if (vzIn < 0.9) {
      b.vz = 0;
      if (ev?.bounce)
        ev.bounce(b.x, b.y, vzIn, sp);
    } else {
      bounce(b, ev);
      const rem = dt * (1 - f);
      b.x += b.vx * rem;
      b.y += b.vy * rem;
      b.z += b.vz * rem;
    }
  }
  if (opts.walls)
    walls(b, ev);
}
function walls(b, ev) {
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

// src/ai/difficulty.ts
var DIFFICULTY = {
  easy: { label: "FÀCIL", reaction: 0.3, perceptionNoise: 1.6, speedMult: 0.86, errorMult: 1.7, powerMult: 0.9, tactics: 0.35 },
  normal: { label: "NORMAL", reaction: 0.2, perceptionNoise: 0.85, speedMult: 0.96, errorMult: 1.05, powerMult: 0.98, tactics: 0.65 },
  hard: { label: "DIFÍCIL", reaction: 0.12, perceptionNoise: 0.35, speedMult: 1.04, errorMult: 0.7, powerMult: 1.04, tactics: 0.9 }
};

// src/players/player.ts
var NO_INTENT = { mx: 0, my: 0, sprint: false, hit: null, aimX: 0, aimY: 0 };

class Player {
  idx;
  def;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  dirY;
  side;
  stamina = 1;
  swing = null;
  swingCool = 0;
  runPhase = 0;
  sinceHit = 10;
  lastStroke = "fh";
  lastVariant = "flat";
  tossing = false;
  slide = 0;
  stepAcc = 0;
  diff = null;
  constructor(idx, def) {
    this.idx = idx;
    this.def = def;
    this.side = idx === 0 ? 1 : -1;
    this.dirY = -this.side;
    this.y = this.side * (COURT.halfL + 1.2);
  }
  get rightX() {
    return (this.dirY > 0 ? -1 : 1) * (this.def.style.lefty ? -1 : 1);
  }
  get speedStat() {
    return this.def.stats.speed / 100;
  }
  get powerStat() {
    return this.def.stats.power / 100;
  }
  get precStat() {
    return this.def.stats.precision / 100;
  }
  get staminaStat() {
    return this.def.stats.stamina / 100;
  }
  maxSpeed(sprint) {
    let v = 4.9 + 2.5 * this.speedStat;
    const fat = 0.8 + 0.2 * Math.sqrt(clamp(this.stamina, 0, 1));
    v *= fat;
    if (sprint && this.stamina > 0.04)
      v *= 1.22;
    if (this.diff)
      v *= this.diff.speedMult;
    return v;
  }
  get speed() {
    return Math.hypot(this.vx, this.vy);
  }
  get swinging() {
    return this.swing !== null && this.swing.t < this.swing.dur;
  }
  beginSwing(stroke, variant, aimX, aimY) {
    const s = this.def.style.swingSpeed;
    let contactAt = 0.14;
    let windowEnd = 0.28;
    let dur = 0.46;
    switch (stroke) {
      case "vol":
        contactAt = 0.07;
        windowEnd = 0.2;
        dur = 0.32;
        break;
      case "smash":
        contactAt = 0.15;
        windowEnd = 0.3;
        dur = 0.55;
        break;
      case "serve":
        contactAt = 0.09;
        windowEnd = 0.22;
        dur = 0.6;
        break;
      default:
        if (variant === "lob") {
          contactAt = 0.15;
          windowEnd = 0.3;
        }
        if (variant === "slice")
          contactAt = 0.15;
    }
    contactAt /= s;
    windowEnd /= s;
    dur /= s;
    this.swing = { stroke, variant, t: 0, contactAt, windowEnd, dur, done: false, hitBall: false, aimX, aimY };
    this.lastStroke = stroke;
    this.lastVariant = variant;
    this.sinceHit = 0;
    this.stamina = Math.max(0, this.stamina - 0.0012 / (0.5 + this.staminaStat));
  }
  update(dt, intent, canSprint = true) {
    this.sinceHit += dt;
    if (this.swing) {
      this.swing.t += dt;
      if (this.swing.t >= this.swing.dur) {
        this.swing = null;
        this.swingCool = 0.05;
      }
    }
    if (this.swingCool > 0)
      this.swingCool -= dt;
    let mx = intent.mx;
    let my = intent.my;
    const m = Math.hypot(mx, my);
    if (m > 1) {
      mx /= m;
      my /= m;
    }
    const sprint = intent.sprint && canSprint && m > 0.5;
    let maxV = this.maxSpeed(sprint);
    if (this.swinging)
      maxV *= this.swing && this.swing.stroke === "serve" ? 0.2 : 0.45;
    if (this.tossing)
      maxV *= 0.3;
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
    const maxX = COURT.halfWd + 3.4;
    this.x = clamp(this.x, -maxX, maxX);
    if (this.side > 0)
      this.y = clamp(this.y, 0.7, COURT.halfL + 5.4);
    else
      this.y = clamp(this.y, -(COURT.halfL + 5.4), -0.7);
    if (this.x !== prevX + this.vx * dt)
      this.vx = 0;
    if (this.y !== prevY + this.vy * dt)
      this.vy = 0;
    const spd = this.speed;
    const norm = spd / 7;
    const drain = 0.0016 * norm * norm * (sprint ? 2.6 : 1) / (0.5 + this.staminaStat);
    if (spd > 0.4)
      this.stamina = Math.max(0, this.stamina - drain * dt * 8);
    else
      this.stamina = Math.min(1, this.stamina + 0.03 * dt * (0.6 + this.staminaStat));
    let stepped = false;
    if (spd > 0.6) {
      const stride = 1.15 * this.def.style.stride;
      this.runPhase += spd / stride * dt * Math.PI;
      this.stepAcc += spd / (1.4 * this.def.style.stride) * dt;
      if (this.stepAcc >= 1) {
        this.stepAcc -= 1;
        stepped = true;
      }
    } else {
      this.runPhase *= 0.9;
      this.stepAcc = 0;
    }
    const wantSlide = this.def.style.slide && Math.abs(this.vx) > 4.2 && !this.swinging ? 1 : 0;
    this.slide = approach(this.slide, wantSlide, dt * 6);
    return stepped;
  }
  recover(amount) {
    this.stamina = Math.min(1, this.stamina + amount * (0.6 + this.staminaStat));
  }
}

// src/physics/solver.ts
var R2 = BALL.r;
function launch(ox, oy, oz, hx, hy, theta, v, spinTop, spinSide) {
  const c = Math.cos(theta);
  return {
    x: ox,
    y: oy,
    z: oz,
    vx: v * c * hx,
    vy: v * c * hy,
    vz: v * Math.sin(theta),
    wx: -hy * spinTop,
    wy: hx * spinTop,
    wz: spinSide
  };
}
var evBounce = {};
function simulateToBounce(init, maxT = 4) {
  const b = { ...init };
  let landed = false;
  const res = { x: b.x, y: b.y, clearance: -Infinity, crossed: false, t: 0 };
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
    if (!res.crossed && !landed && py > 0 !== b.y > 0 && py !== b.y) {
      const f = py / (py - b.y);
      const xn = px + (b.x - px) * f;
      const zn = pz + (b.z - pz) * f;
      res.crossed = true;
      res.clearance = zn - R2 - netHeightAt(xn);
    }
  }
  res.t = t;
  if (!res.crossed && res.y > 0 === side0)
    res.clearance = -Infinity;
  return res;
}
function planShot(ox, oy, oz, tx, ty, spec) {
  const dx = tx - ox;
  const dy = ty - oy;
  const D = Math.max(1, Math.hypot(dx, dy));
  const hx = dx / D;
  const hy = dy / D;
  const dist = (theta, v) => {
    const l = simulateToBounce(launch(ox, oy, oz, hx, hy, theta, v, spec.spinTop, spec.spinSide));
    return { ...l, d: (l.x - ox) * hx + (l.y - oy) * hy };
  };
  const build = (theta, v, l, ok) => {
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
      ok
    };
  };
  if (spec.fixedTheta !== undefined) {
    const th = spec.fixedTheta;
    let lo = 5;
    let hi = 40;
    for (let i = 0;i < 18; i++) {
      const mid = (lo + hi) / 2;
      if (dist(th, mid).d < D)
        lo = mid;
      else
        hi = mid;
    }
    const v = (lo + hi) / 2;
    const l = dist(th, v);
    return build(th, v, l, l.clearance > spec.minClear);
  }
  let v = spec.speed;
  let best = null;
  for (let attempt = 0;attempt < 12; attempt++) {
    const lo0 = dist(spec.thetaLo, v);
    if (lo0.d > D && attempt < 11) {
      v *= 0.93;
      continue;
    }
    const hi0 = dist(spec.thetaHi, v);
    if (hi0.d < D) {
      return build(spec.thetaHi, v, hi0, false);
    }
    let lo = spec.thetaLo;
    let hi = spec.thetaHi;
    for (let i = 0;i < 16; i++) {
      const mid = (lo + hi) / 2;
      if (dist(mid, v).d < D)
        lo = mid;
      else
        hi = mid;
    }
    const th = (lo + hi) / 2;
    const l = dist(th, v);
    const plan = build(th, v, l, l.clearance >= spec.minClear);
    if (plan.ok)
      return plan;
    best = plan;
    v *= 0.93;
  }
  return best ?? build(spec.thetaHi, v, { x: tx, y: ty, clearance: -Infinity, crossed: false, t: 0 }, false);
}

// src/players/shots.ts
function reachOf(p) {
  const base = p.diff ? 1.55 : 1.75;
  return base + 0.25 * p.speedStat + (p.def.look.height - 1.85) * 0.6;
}
function idealContact(p, stroke) {
  const off = stroke === "fh" ? 0.85 : stroke === "bh" ? -0.75 : stroke === "smash" ? 0.2 : stroke === "serve" ? 0.15 : 0.45;
  return { x: p.x + p.rightX * off, y: p.y + p.dirY * 0.35 };
}
function chooseStroke(p, ball, bounced, key) {
  const tc = 0.15;
  const g = 9.81;
  const px = ball.x + ball.vx * tc;
  const pz = ball.z + ball.vz * tc - 0.5 * g * tc * tc;
  const nearNet = Math.abs(p.y) < 6.2;
  if (!bounced && pz > 2.05 && key !== "lob" && Math.abs(ball.y) < 10.5)
    return "smash";
  if (!bounced && nearNet && key !== "lob")
    return "vol";
  const lat = (px - p.x) * p.rightX;
  return lat >= -0.15 ? "fh" : "bh";
}
function contactQuality(p, ball, stroke) {
  const reach = reachOf(p);
  if (stroke === "serve") {
    const z = ball.z;
    if (z < 1.9 || z > 3.35)
      return { q: 0, err: 9, reach };
    const q = clamp(1 - Math.abs(z - 2.95) / 0.95, 0.05, 1);
    return { q, err: 0, reach };
  }
  const c = idealContact(p, stroke);
  const err = Math.hypot(ball.x - c.x, ball.y - c.y);
  const maxZ = stroke === "smash" ? 3.25 : 2.5;
  if (ball.z > maxZ || ball.z < 0.06)
    return { q: 0, err, reach };
  if (err > reach)
    return { q: 0, err, reach };
  let q = 1 - err / reach * 0.85;
  const zc = stroke === "smash" ? 2.7 : 0.85;
  const dz = Math.abs(ball.z - zc);
  q *= 1 - clamp(dz / (stroke === "smash" ? 1.2 : 2.2), 0, 0.4);
  return { q: clamp(q, 0.05, 1), err, reach };
}
function buildHit(p, ball, swing, quality, rng, serve) {
  const stroke = swing.stroke;
  const variant = swing.variant;
  const u = (clamp(swing.aimY, -1, 1) + 1) / 2;
  const aimX = clamp(swing.aimX, -1.15, 1.15);
  const power = p.powerStat * (p.diff ? p.diff.powerMult : 1);
  const prec = p.precStat;
  const stam = clamp(p.stamina, 0, 1);
  const vin = ballSpeed(ball);
  const errD = p.diff ? p.diff.errorMult : 1;
  const stress = clamp(p.speed / 7, 0, 1) * 0.6;
  const sideOpp = -p.side;
  const baseSigma = 1.45 * (0.22 + 1.05 * (1 - prec)) * (1 + 1.5 * (1 - quality)) * errD * (1 + 0.45 * (1 - stam)) * (1 + 0.35 * stress);
  const baseElev = 1.3 * (0.005 + 0.02 * (1 - prec)) * (1 + 1.6 * (1 - quality)) * errD * (1 + 0.4 * (1 - stam));
  const built = serve && stroke === "serve" ? buildServe(p, ball, swing, quality, rng, serve, u, aimX, power, baseSigma, baseElev) : buildStroke(p, ball, swing, quality, rng, u, aimX, power, vin, baseSigma, baseElev, sideOpp);
  const plan = planShot(ball.x, ball.y, ball.z, built.tx, built.ty, built.spec);
  const dTheta = rng.gauss() * built.elevSigma;
  const th = plan.theta + dTheta;
  const vh0 = Math.hypot(plan.vx, plan.vy);
  const vh1 = plan.speed * Math.cos(th);
  const k = vh0 > 0.000001 ? vh1 / vh0 : 0;
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
    kmh: Math.round(Math.hypot(vx, vy, vz) * 3.6 + (topSign === 0 ? 0 : 0))
  };
}
function buildStroke(p, ball, swing, q, rng, u, aimX, power, vin, baseSigma, baseElev, sideOpp) {
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
  let fixedTheta;
  let errMult = 1;
  if (stroke === "smash") {
    speed = 31 + 6 * power;
    spinTop = 25;
    thetaLo = -0.85;
    thetaHi = 0.1;
    minClear = 0.1;
    depth = 5.5 + 5.2 * u;
    errMult = 1.05;
  } else if (stroke === "vol") {
    speed = 15.5 + 6 * power;
    spinTop = -60;
    thetaLo = -0.6;
    thetaHi = 0.5;
    minClear = 0.08;
    depth = 3.6 + 7 * u;
    errMult = 1.15;
    if (variant === "lob") {
      fixedTheta = 0.8;
      depth = 9 + 2.2 * u;
      minClear = 1.5;
    }
  } else {
    switch (variant) {
      case "flat":
        speed = 22.5;
        spinTop = 70;
        thetaLo = -0.3;
        thetaHi = 0.7;
        minClear = 0.25;
        depth = 5.5 + 5.8 * u;
        break;
      case "top":
        speed = 20;
        spinTop = 270;
        thetaLo = -0.2;
        thetaHi = 0.85;
        minClear = 0.6;
        depth = 6.5 + 4.7 * u;
        errMult = 0.95;
        break;
      case "slice":
        speed = 16.5;
        spinTop = -190;
        spinSide = (stroke === "bh" ? -1 : 1) * p.rightX * 55;
        thetaLo = -0.3;
        thetaHi = 0.75;
        minClear = 0.22;
        depth = 4.8 + 5.7 * u;
        break;
      case "lob":
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
  } else if (ball.z > 1.65 && stroke !== "smash") {
    speed *= 0.92;
  }
  const sigma = baseSigma * errMult;
  const tx = aimX * 3.75 + rng.gauss() * sigma;
  const dy = depth + rng.gauss() * sigma * 1.15;
  const ty = sideOpp * Math.max(1.4, dy);
  return {
    spec: { speed, spinTop, spinSide, thetaLo, thetaHi, minClear, fixedTheta },
    tx,
    ty,
    sigma,
    elevSigma: baseElev * errMult
  };
}
function buildServe(p, ball, swing, q, rng, serve, u, aimX, power, baseSigma, baseElev) {
  const st = p.def.style;
  const variant = swing.variant;
  const second = serve.second;
  let speed;
  let spinTop;
  let spinSide = 0;
  switch (variant) {
    case "slice":
      speed = 38.5;
      spinTop = -20;
      spinSide = (p.rightX >= 0 ? 1 : -1) * 150;
      break;
    case "top":
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
  let depth = lerp(3.6, 6, u);
  let errMult = 1;
  if (second) {
    speed *= variant === "flat" ? 0.78 : 0.86;
    spinTop = Math.max(spinTop, 200);
    minClear = 0.55;
    depth = lerp(3.4, 5.4, u);
    errMult = 0.85;
  }
  const [minX, maxX] = serve.boxSign < 0 ? [-3.8, -0.5] : [0.5, 3.8];
  const sigma = baseSigma * errMult * (1 + 0.8 * (1 - q));
  const tx = lerp(minX, maxX, (clamp(aimX, -1, 1) + 1) / 2) + rng.gauss() * sigma;
  const ty = -p.side * (depth + rng.gauss() * sigma * 0.9);
  return {
    spec: { speed, spinTop, spinSide, thetaLo: -0.4, thetaHi: 0.12, minClear },
    tx,
    ty,
    sigma,
    elevSigma: baseElev * errMult
  };
}
function inServiceBox(x, y, boxSign, receiverSide, r) {
  if (Math.sign(y) !== receiverSide && Math.abs(y) > r)
    return false;
  if (Math.abs(y) > COURT.serviceY + r)
    return false;
  if (boxSign < 0)
    return x <= r && x >= -(COURT.halfWs + r);
  return x >= -r && x <= COURT.halfWs + r;
}

// src/scoring/score.ts
class MatchScore {
  sets = [];
  games = [0, 0];
  points = [0, 0];
  setsWon = [0, 0];
  tiebreak = false;
  gameServer;
  tbFirst = 0;
  winner = null;
  bestOf;
  constructor(firstServer, bestOf = 3) {
    this.gameServer = firstServer;
    this.bestOf = bestOf;
  }
  get setsToWin() {
    return Math.ceil(this.bestOf / 2);
  }
  get server() {
    if (!this.tiebreak)
      return this.gameServer;
    const n = this.points[0] + this.points[1];
    return (n + 1 >> 1) % 2 === 0 ? this.tbFirst : 1 - this.tbFirst;
  }
  get deuceCourt() {
    return (this.points[0] + this.points[1]) % 2 === 0;
  }
  get totalPoints() {
    return this.points[0] + this.points[1];
  }
  pointWon(w) {
    const o = 1 - w;
    const out = { gameWon: false, setWon: false, matchWon: false };
    if (this.winner !== null)
      return out;
    this.points[w]++;
    if (this.tiebreak) {
      if (this.points[w] >= 7 && this.points[w] - this.points[o] >= 2) {
        out.gameWon = true;
        this.games[w]++;
        this.finishSet(w, [this.points[0], this.points[1]]);
        out.setWon = true;
        out.matchWon = this.winner !== null;
        this.gameServer = 1 - this.tbFirst;
        this.tiebreak = false;
        this.points = [0, 0];
      }
      return out;
    }
    if (this.points[w] >= 4 && this.points[w] - this.points[o] >= 2) {
      out.gameWon = true;
      this.games[w]++;
      this.points = [0, 0];
      this.gameServer = 1 - this.gameServer;
      if (this.games[w] >= 6 && this.games[w] - this.games[o] >= 2) {
        this.finishSet(w);
        out.setWon = true;
        out.matchWon = this.winner !== null;
      } else if (this.games[0] === 6 && this.games[1] === 6) {
        this.tiebreak = true;
        this.tbFirst = this.gameServer;
      }
    }
    return out;
  }
  finishSet(w, tb) {
    this.sets.push({ games: [this.games[0], this.games[1]], tiebreak: tb });
    this.setsWon[w]++;
    this.games = [0, 0];
    if (this.setsWon[w] >= this.setsToWin)
      this.winner = w;
  }
  pointText(side) {
    const o = 1 - side;
    if (this.tiebreak)
      return String(this.points[side]);
    const p = this.points[side];
    const q = this.points[o];
    if (p >= 3 && q >= 3) {
      if (p === q)
        return "40";
      return p > q ? "AD" : "40";
    }
    return ["0", "15", "30", "40"][Math.min(p, 3)];
  }
  get isDeuce() {
    return !this.tiebreak && this.points[0] >= 3 && this.points[0] === this.points[1];
  }
  get advantage() {
    if (this.tiebreak)
      return null;
    const [a, b] = this.points;
    if (a >= 3 && b >= 3 && a !== b)
      return a > b ? 0 : 1;
    return null;
  }
  get gamePointFor() {
    const [a, b] = this.points;
    if (this.tiebreak) {
      if (a >= 6 && a > b)
        return 0;
      if (b >= 6 && b > a)
        return 1;
      return null;
    }
    if (a >= 3 && a > b)
      return 0;
    if (b >= 3 && b > a)
      return 1;
    return null;
  }
  callText(names) {
    const words = ["zero", "quinze", "trenta", "quaranta"];
    const s = this.server;
    const r = 1 - s;
    if (this.tiebreak) {
      const a = this.points[s];
      const b = this.points[r];
      return a === b ? `${a} iguals` : `${a} a ${b}`;
    }
    const adv = this.advantage;
    if (adv !== null)
      return `Avantatge ${names[adv]}`;
    const a = Math.min(this.points[s], 3);
    const b = Math.min(this.points[r], 3);
    if (this.points[s] >= 3 && this.points[r] >= 3)
      return "Iguals";
    if (a === b)
      return `${words[a]} iguals`;
    return `${words[a]} a ${words[b]}`;
  }
}

// src/game/match.ts
var emptyStats = () => ({
  aces: 0,
  doubleFaults: 0,
  winners: 0,
  errors: 0,
  firstServeIn: 0,
  firstServeTotal: 0,
  pointsWon: 0,
  maxServeKmh: 0,
  netPointsWon: 0
});

class Match {
  players;
  ball = newBall();
  score;
  stats = { p: [emptyStats(), emptyStats()], longestRally: 0, totalPoints: 0, duration: 0 };
  rng;
  cfg;
  controllers;
  phase = "intro";
  time = 0;
  events = [];
  recordEvents = true;
  ballVisible = false;
  lastHitter = -1;
  bounced = false;
  bounceCount = 0;
  netTouched = false;
  serveAwait = false;
  serveStage = 1;
  rallyHits = 0;
  hitSeq = 0;
  lastHit = null;
  serveCtx = { second: false, boxSign: -1 };
  pointDelay = 0;
  timer = 0;
  rollTime = 0;
  sinceHit = 0;
  lastPoint = null;
  matchOverPending = false;
  evBall;
  lastRallyLen = 0;
  constructor(cfg, controllers) {
    this.cfg = cfg;
    this.rng = new Rng(cfg.seed);
    this.players = [new Player(0, cfg.p0), new Player(1, cfg.p1)];
    const first = cfg.firstServer ?? (this.rng.chance(0.5) ? 0 : 1);
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
      wall: () => this.onWall()
    };
    this.timer = cfg.fast ? 0.01 : 1.8;
    this.ball.z = 5;
  }
  get server() {
    return this.score.server;
  }
  emit(e) {
    if (this.recordEvents)
      this.events.push(e);
  }
  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
  get names() {
    return [this.cfg.p0.name, this.cfg.p1.name];
  }
  step(dt) {
    this.time += dt;
    if (this.phase !== "match_end")
      this.stats.duration += dt;
    const intents = [NO_INTENT, NO_INTENT];
    for (const i of [0, 1]) {
      intents[i] = this.controllers[i].update(this, i, dt);
    }
    for (const p of this.players) {
      const it = intents[p.idx];
      const frozen = this.phase === "intro" || this.phase === "match_end";
      const stepped = p.update(dt, frozen ? NO_INTENT : it, true);
      if (stepped)
        this.emit({ type: "step", player: p.idx, slide: p.slide > 0.5 });
    }
    switch (this.phase) {
      case "intro":
        this.timer -= dt;
        if (this.timer <= 0)
          this.setupPoint(true);
        break;
      case "serve_wait":
        this.holdBall();
        this.handleServeInput(intents);
        break;
      case "toss":
        this.stepBallPhysics(dt, false);
        this.handleTossAndSwings(intents, dt);
        break;
      case "rally":
        this.stepBallPhysics(dt, true);
        this.sinceHit += dt;
        this.handleSwings(intents, dt);
        this.checkDead(dt);
        break;
      case "point_end":
        this.stepBallPhysics(dt, true);
        this.handleSwings(intents, dt, true);
        this.timer -= dt;
        if (this.timer <= 0) {
          if (this.faultReplay)
            this.resumeServe();
          else if (this.matchOverPending) {
            this.phase = "match_end";
            this.emit({ type: "match", winner: this.score.winner ?? 0 });
          } else
            this.setupPoint(false);
        }
        break;
      case "match_end":
        this.stepBallPhysics(dt, true);
        break;
    }
  }
  stepBallPhysics(dt, net) {
    stepBall(this.ball, dt, { net, walls: true }, this.evBall);
  }
  placePlayers() {
    const s = this.server;
    const r = 1 - s;
    const ps = this.players[s];
    const pr = this.players[r];
    const deuce = this.score.deuceCourt;
    const physRight = ps.dirY > 0 ? -1 : 1;
    ps.x = (deuce ? 1 : -1) * physRight * 1.3;
    ps.y = ps.side * (COURT.halfL + 0.55);
    pr.x = -Math.sign(ps.x) * 1.9;
    pr.y = pr.side * (COURT.halfL + 0.9 + (pr.def.style.baselineOffset > 1 ? 0.5 : 0));
    for (const p of this.players) {
      p.vx = 0;
      p.vy = 0;
      p.swing = null;
      p.tossing = false;
    }
  }
  setupPoint(first) {
    this.placePlayers();
    for (const p of this.players)
      p.recover(0.05);
    const ps = this.players[this.server];
    this.serveStage = 1;
    this.serveCtx = { second: false, boxSign: -Math.sign(ps.x) };
    this.resetRally();
    this.phase = "serve_wait";
    this.ballVisible = true;
    this.holdBall();
    this.emit({ type: "pointStart" });
    if (first) {
      this.emit({ type: "announce", text: `${this.cfg.p0.name} contra ${this.cfg.p1.name}`, speak: true });
    }
  }
  resumeServe() {
    this.placePlayers();
    this.resetRally();
    this.faultReplay = false;
    this.phase = "serve_wait";
    this.holdBall();
  }
  resetRally() {
    this.lastHitter = -1;
    this.bounced = false;
    this.bounceCount = 0;
    this.netTouched = false;
    this.serveAwait = false;
    this.rallyHits = 0;
    this.sinceHit = 0;
    this.rollTime = 0;
  }
  holdBall() {
    const ps = this.players[this.server];
    const physRight = ps.dirY > 0 ? -1 : 1;
    const b = this.ball;
    b.x = ps.x + physRight * 0.3;
    b.y = ps.y + ps.dirY * 0.25;
    b.z = 0.95;
    b.vx = b.vy = b.vz = 0;
    b.wx = b.wy = b.wz = 0;
  }
  handleServeInput(intents) {
    const s = this.server;
    const it = intents[s];
    const ps = this.players[s];
    if (it.hit && !ps.swing) {
      const b = this.ball;
      b.vz = 6.25 + this.rng.range(-0.15, 0.15);
      b.vy = ps.dirY * 0.4;
      b.vx = 0;
      ps.tossing = true;
      this.phase = "toss";
      this.emit({ type: "toss", player: s });
    }
  }
  handleTossAndSwings(intents, _dt) {
    const s = this.server;
    const ps = this.players[s];
    const it = intents[s];
    if (it.hit && !ps.swing && this.ball.z > 1.3) {
      const variant = it.hit === "lob" ? "flat" : it.hit;
      ps.beginSwing("serve", variant, it.aimX, it.aimY);
    }
    const sw = ps.swing;
    if (sw) {
      if (!sw.done) {
        sw.aimX = it.aimX;
        sw.aimY = it.aimY;
      }
      if (!sw.done && sw.t >= sw.contactAt) {
        const q = contactQuality(ps, this.ball, "serve");
        if (q.q > 0) {
          sw.done = true;
          sw.hitBall = true;
          this.executeHit(ps, q.q);
          return;
        }
        if (sw.t >= sw.windowEnd) {
          sw.done = true;
          this.emit({ type: "whiff", player: s });
        }
      }
    }
    if (!ps.swinging && this.ball.vz < 0 && this.ball.z < 1.05) {
      ps.tossing = false;
      this.phase = "serve_wait";
      this.holdBall();
    }
  }
  handleSwings(intents, _dt, frozen = false) {
    for (const p of this.players) {
      const it = intents[p.idx];
      if (!frozen && it.hit && !p.swing && p.swingCool <= 0 && this.phase === "rally") {
        const stroke = chooseStroke(p, this.ball, this.bounced, it.hit);
        p.beginSwing(stroke, it.hit, it.aimX, it.aimY);
      }
      const sw = p.swing;
      if (!sw || sw.done)
        continue;
      if (!sw.done) {
        sw.aimX = it.aimX;
        sw.aimY = it.aimY;
      }
      if (this.phase !== "rally") {
        if (sw.t >= sw.windowEnd)
          sw.done = true;
        continue;
      }
      if (sw.t >= sw.contactAt) {
        if (this.canHit(p)) {
          const q = contactQuality(p, this.ball, sw.stroke);
          if (q.q > 0 && (q.q >= 0.5 || sw.t >= sw.windowEnd - 0.02)) {
            sw.done = true;
            sw.hitBall = true;
            this.executeHit(p, q.q);
            continue;
          }
        }
        if (sw.t >= sw.windowEnd) {
          sw.done = true;
          this.emit({ type: "whiff", player: p.idx });
        }
      }
    }
  }
  canHit(p) {
    if (this.lastHitter === p.idx)
      return false;
    if (this.serveAwait)
      return false;
    return this.ball.y * p.side > -0.5;
  }
  executeHit(p, quality) {
    const sw = p.swing;
    const b = this.ball;
    const isServe = sw.stroke === "serve";
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
      this.phase = "rally";
      this.serveAwait = true;
      const st = this.stats.p[p.idx];
      if (!this.serveCtx.second)
        st.firstServeTotal++;
      st.maxServeKmh = Math.max(st.maxServeKmh, res.kmh);
    }
    this.emit({
      type: "hit",
      player: p.idx,
      stroke: sw.stroke,
      variant: sw.variant,
      power: res.power,
      quality,
      x: b.x,
      y: b.y,
      z: b.z
    });
    if (this.rallyHits >= 8 && this.rallyHits % 4 === 0) {
      this.emit({ type: "crowd", kind: "murmur", intensity: clamp(this.rallyHits / 20, 0.2, 1) });
    }
  }
  inCourt(x, y) {
    const r = BALL.r;
    return Math.abs(x) <= COURT.halfWs + r && Math.abs(y) <= COURT.halfL + r;
  }
  onBounce(x, y, vz, speed) {
    const inB = this.inCourt(x, y);
    this.emit({ type: "bounce", x, y, vz, speed, inBounds: inB });
    if (this.phase !== "rally")
      return;
    const hitter = this.lastHitter;
    if (hitter < 0)
      return;
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
        if (!this.serveCtx.second)
          this.stats.p[hitter].firstServeIn++;
        return;
      }
      this.doFault(hitter, x, y);
      return;
    }
    if (this.bounceCount === 0) {
      const sideOk = Math.sign(y) === oppSide && Math.abs(y) > 0.001;
      if (!inB || !sideOk) {
        const reason = this.netTouched || !sideOk ? "net" : "out";
        if (reason === "out")
          this.callOut(x, y);
        this.pointTo(1 - hitter, reason);
        return;
      }
      this.bounceCount = 1;
      this.bounced = true;
    } else {
      const reason = this.rallyHits <= 1 ? "ace" : "winner";
      this.pointTo(hitter, reason);
    }
  }
  callOut(x, y) {
    const dx = Math.abs(x) - COURT.halfWs;
    const dy = Math.abs(y) - COURT.halfL;
    const out = Math.max(dx, dy);
    this.emit({ type: "out", near: out < 0.25 });
    if (out < 0.25)
      this.emit({ type: "crowd", kind: "gasp", intensity: 0.7 });
  }
  onNet(speed, cord) {
    this.netTouched = true;
    this.emit({ type: "net", speed, cord });
    if (this.phase === "rally")
      this.emit({ type: "crowd", kind: "ooh", intensity: cord ? 0.7 : 0.4 });
  }
  onWall() {
    if (this.phase !== "rally" || this.lastHitter < 0)
      return;
    if (this.bounceCount === 0 && !this.serveAwait)
      this.pointTo(1 - this.lastHitter, "out");
    else if (this.serveAwait)
      this.doFault(this.lastHitter, 0, 0);
  }
  doLet() {
    this.emit({ type: "let" });
    this.emit({ type: "announce", text: "Let", speak: true });
    this.afterFaultReset(false);
  }
  doFault(server, x, y) {
    const second = this.serveCtx.second;
    if (!second)
      this.callOut(x, y);
    this.emit({ type: "fault", player: server, double: second });
    if (second) {
      this.pointTo(1 - server, "doublefault");
    } else {
      this.serveCtx = { ...this.serveCtx, second: true };
      this.serveStage = 2;
      this.emit({ type: "announce", text: "Falta", speak: true });
      this.afterFaultReset(true);
    }
  }
  afterFaultReset(_fault) {
    this.resetRally();
    this.phase = "point_end";
    this.timer = this.cfg.fast ? 0.01 : 1.2;
    this.matchOverPending = false;
    this.faultReplay = true;
  }
  faultReplay = false;
  pointTo(winner, reason) {
    if (this.phase !== "rally")
      return;
    const loser = 1 - winner;
    const server = this.server;
    this.lastRallyLen = this.rallyHits;
    this.stats.p[winner].pointsWon++;
    this.stats.totalPoints++;
    this.stats.longestRally = Math.max(this.stats.longestRally, this.rallyHits);
    switch (reason) {
      case "ace":
        this.stats.p[winner].aces++;
        break;
      case "winner":
        this.stats.p[winner].winners++;
        break;
      case "doublefault":
        this.stats.p[server].doubleFaults++;
        break;
      case "out":
      case "net":
        this.stats.p[loser].errors++;
        break;
      default:
        break;
    }
    if (Math.abs(this.players[winner].y) < 5.5 && (reason === "winner" || reason === "ace"))
      this.stats.p[winner].netPointsWon++;
    const out = this.score.pointWon(winner);
    this.lastPoint = { winner, reason };
    this.emit({ type: "point", winner, reason, rally: this.rallyHits });
    const names = this.names;
    let text;
    let tmo = this.cfg.fast ? 0.01 : 2.3;
    if (out.matchWon) {
      text = `Joc, set i partit, ${names[winner]}`;
      this.emit({ type: "game", winner });
      this.emit({ type: "set", winner });
      tmo = 3.2;
    } else if (out.setWon) {
      const last = this.score.sets[this.score.sets.length - 1].games;
      text = `Joc i set, ${names[winner]}, ${last[winner]} a ${last[loser]}`;
      this.emit({ type: "game", winner });
      this.emit({ type: "set", winner });
      tmo = 3.4;
    } else if (out.gameWon) {
      text = `Joc, ${names[winner]}. ${this.score.games[0]} a ${this.score.games[1]}`;
      this.emit({ type: "game", winner });
      tmo = 3;
    } else {
      text = this.score.callText(names);
    }
    this.emit({ type: "announce", text, speak: true });
    const long = this.rallyHits >= 9;
    const intensity = out.gameWon ? 0.9 : long ? 0.8 : reason === "ace" ? 0.7 : 0.45;
    this.emit({ type: "crowd", kind: out.gameWon || long ? "applause" : "cheer", intensity });
    if (this.cfg.fast)
      tmo = 0.01;
    this.timer = tmo;
    this.phase = "point_end";
    this.matchOverPending = out.matchWon;
    this.faultReplay = false;
    for (const p of this.players)
      p.recover(0.02);
  }
  checkDead(dt) {
    const b = this.ball;
    const slow = Math.hypot(b.vx, b.vy) < 0.45 && b.z < 0.06;
    this.rollTime = slow ? this.rollTime + dt : 0;
    if (this.rollTime > 0.25 || this.sinceHit > 14) {
      if (this.lastHitter >= 0) {
        if (this.bounceCount === 0)
          this.pointTo(1 - this.lastHitter, "net");
        else
          this.pointTo(this.lastHitter, "winner");
      }
    }
  }
  get lastPointInfo() {
    return this.lastPoint;
  }
}

// src/ai/ai.ts
class AIController {
  diffOverride;
  rng;
  seenHit = 0;
  react = 0;
  noiseX = 0;
  noiseY = 0;
  replan = 0;
  planAt = 0;
  target = null;
  pred = null;
  leave = false;
  netMode = false;
  waitT = 0;
  serveKey = "flat";
  serveAimX = 0;
  serveAimY = 0;
  pressed = false;
  tossedAt = -1;
  shotKey = "flat";
  shotAimX = 0;
  shotAimY = 0;
  decided = false;
  constructor(seed, diffOverride) {
    this.diffOverride = diffOverride;
    this.rng = new Rng(seed * 2654435761 + 12345);
  }
  dp(m, p) {
    return this.diffOverride ?? p.diff ?? DIFFICULTY.normal;
  }
  update(m, idx, dt) {
    const p = m.players[idx];
    const intent = { mx: 0, my: 0, sprint: false, hit: null, aimX: 0, aimY: 0 };
    const opp = m.players[1 - idx];
    switch (m.phase) {
      case "serve_wait":
        this.pressed = false;
        if (m.server === idx)
          this.serveWait(m, p, intent, dt);
        else {
          this.netMode = false;
          this.waitT = 0;
          this.idle(m, p, opp, intent, 0);
        }
        this.seenHit = m.hitSeq;
        break;
      case "toss":
        if (m.server === idx)
          this.serveStrike(m, p, intent);
        else
          this.idle(m, p, opp, intent, 0);
        this.seenHit = m.hitSeq;
        break;
      case "rally":
        this.rally(m, p, opp, intent, dt);
        break;
      case "point_end":
        this.target = null;
        this.pred = null;
        break;
      default:
        break;
    }
    return intent;
  }
  serveWait(m, p, intent, dt) {
    const dp = this.dp(m, p);
    this.waitT += dt;
    this.decided = false;
    const fast = m.cfg.fast;
    const delay = fast ? 0.02 : 0.9 + this.rng.range(0, 0.5);
    this.moveTo(m, p, p.x, p.y, intent, 0.5);
    if (this.waitT < delay)
      return;
    const second = m.serveCtx.second;
    const st = p.def.style;
    const r = this.rng.next();
    if (second)
      this.serveKey = r < 0.7 ? "top" : "slice";
    else
      this.serveKey = r < 0.5 ? "flat" : r < 0.85 ? "slice" : "top";
    const box = m.serveCtx.boxSign;
    const rr = this.rng.next();
    if (this.rng.chance(dp.tactics)) {
      this.serveAimX = rr < 0.45 ? box * 0.95 : rr < 0.85 ? -box * 0.95 : 0;
    } else
      this.serveAimX = this.rng.range(-0.6, 0.6);
    this.serveAimY = second ? this.rng.range(-0.1, 0.25) : this.rng.range(0.1, 0.35 + 0.5 * st.aggression);
    intent.hit = "flat";
    intent.aimX = this.serveAimX;
    intent.aimY = this.serveAimY;
    this.waitT = 0;
    this.pressed = false;
    this.tossedAt = m.time;
    this.netMode = this.rng.chance(st.netTendency * 0.7) && !second;
  }
  serveStrike(m, p, intent) {
    const b = m.ball;
    intent.aimX = this.serveAimX;
    intent.aimY = this.serveAimY;
    if (this.pressed || p.swing)
      return;
    const dp = this.dp(m, p);
    const jitter = this.rng.gauss() * 0.4 * dp.errorMult / 1;
    if (b.vz < 0.9 + jitter && b.z > 2.3) {
      intent.hit = this.serveKey;
      this.pressed = true;
    }
  }
  rally(m, p, opp, intent, dt) {
    const dp = this.dp(m, p);
    if (m.hitSeq !== this.seenHit) {
      this.seenHit = m.hitSeq;
      if (m.lastHitter !== p.idx)
        this.onOpponentHit(m, p, opp, dp);
    }
    if (m.lastHitter === p.idx || m.lastHitter < 0) {
      this.target = null;
      this.idle(m, p, opp, intent, 0);
      return;
    }
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
      if (this.target && !this.leave)
        this.updateDecision(m, p, opp, this.target, dp);
    }
    const t = this.target;
    if (!t || this.leave) {
      this.idle(m, p, opp, intent, 0);
      return;
    }
    const side = this.strokeFor(p, t.sample.x) === "fh" ? 0.85 : -0.75;
    const ox = t.sample.x - p.rightX * side;
    const oy = t.sample.y - p.dirY * 0.35;
    this.moveTo(m, p, ox, oy, intent, 1);
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
        const st = p.def.style;
        if (Math.abs(p.y) < 10 && this.shotAimY > 0.2 && !t.volley) {
          if (this.rng.chance(st.netTendency * 0.6 * (dp.tactics + 0.2)))
            this.netMode = true;
        }
        if (Math.abs(p.y) > 11)
          this.netMode = false;
        return;
      }
    }
    intent.aimX = this.shotAimX;
    intent.aimY = this.shotAimY;
  }
  contactDelay(p, t) {
    const ss = p.def.style.swingSpeed;
    let base = 0.14;
    if (t.volley)
      base = 0.08;
    else if (this.shotKey === "lob" || this.shotKey === "slice")
      base = 0.15;
    return base / ss;
  }
  strokeFor(p, bx) {
    return (bx - p.x) * p.rightX >= -0.15 ? "fh" : "bh";
  }
  onOpponentHit(m, p, opp, dp) {
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
    if (m.lastHit && m.lastHit.variant === "lob")
      this.netMode = false;
  }
  predict(m, p) {
    const b = cloneBall(m.ball);
    const samples = [];
    let bounced = m.bounced;
    let bx = b.x;
    let by = b.y;
    let first = !m.bounced;
    let net = false;
    let t = 0;
    let bounces = m.bounced ? 1 : 0;
    const ev = {
      bounce: (x, y) => {
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
      }
    };
    let k = 0;
    while (t < 3.2 && bounces < 2 && !net) {
      stepBall(b, DT, { net: true, walls: false }, ev);
      t += DT;
      k++;
      if (k % 4 === 0) {
        if (b.y * p.side > 0 || Math.abs(b.y) < 1)
          samples.push({ t, x: b.x, y: b.y, z: b.z, bounced });
        if (Math.abs(b.y) > 17 || Math.abs(b.x) > 12)
          break;
      }
    }
    return { samples, bx, by, net };
  }
  pickTarget(m, p, pred, dp) {
    this.leave = false;
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
        if (!(this.netMode && Math.abs(py) > COURT.halfL + 1.2)) {
          this.leave = true;
          return null;
        }
      }
    }
    const vmax = p.maxSpeed(true);
    const react = Math.max(0, this.react);
    const lead = 0.14 / p.def.style.swingSpeed;
    let best = null;
    let closest = null;
    let closestD = Infinity;
    const volleyOk = this.netMode || !m.bounced && Math.abs(p.y) < 7.5;
    const nw = (s) => clamp(s.t / 1.2, 0, 1);
    for (const s of pred.samples) {
      if (s.y * p.side < 0.4)
        continue;
      const sx = s.x + this.noiseX * nw(s) * 0.5;
      const sy = s.y + this.noiseY * nw(s) * 0.4;
      const pre = !s.bounced;
      const zOk = pre ? s.z > 0.7 && s.z < 2.3 && volleyOk && Math.abs(sy) < 8.5 : s.z > 0.35 && s.z < 1.65;
      const smash = pre && s.z >= 2.3 && s.z < 3 && Math.abs(sy) < 9 && !m.serveAwait;
      if (!zOk && !smash)
        continue;
      const c = idealContact(p, this.strokeFor(p, sx));
      const dist = Math.hypot(sx - p.x - (c.x - p.x), sy - p.y - (c.y - p.y));
      const need = Math.max(0, dist - 0.6) / vmax + lead;
      const avail = s.t - react;
      const tgt = { x: sx, y: sy, t: s.t, z: s.z, sample: { ...s, x: sx, y: sy }, reachable: avail >= need, volley: pre };
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
    return best ?? closest;
  }
  timeToBounce(pred) {
    for (const s of pred.samples)
      if (s.bounced)
        return s.t;
    return pred.samples.length ? pred.samples[pred.samples.length - 1].t : 0;
  }
  updateDecision(m, p, opp, t, dp) {
    if (this.decided && this.rng.next() > 0.08)
      return;
    this.decided = true;
    const st = p.def.style;
    const tactics = dp.tactics;
    const c = idealContact(p, this.strokeFor(p, t.sample.x));
    const stretch = clamp((Math.hypot(t.sample.x - p.x, t.sample.y - p.y) - 1.2) / 3.5, 0, 1);
    const tight = clamp(1 - (t.t - 0.18) / 0.5, 0, 1);
    const pressure = Math.max(stretch, tight * 0.8);
    const oppNet = Math.abs(opp.y) < 6.5;
    const oppDeep = Math.abs(opp.y) > 11.5;
    const shortBall = Math.abs(t.sample.y) < 7.4;
    let wf = 0.5;
    let wt = st.topspinPref;
    let ws = st.slicePref + pressure * 0.45;
    let wl = st.lobPref + (oppNet ? 0.5 : 0) + pressure * 0.15;
    if (t.volley) {
      wt = 0;
      wl = oppNet ? 0.25 : 0.03;
      ws *= 0.4;
    }
    if (pressure < 0.35 && shortBall)
      wf += 0.4;
    if (oppNet)
      wf += 0.4;
    if (!this.rng.chance(0.4 + 0.6 * tactics)) {
      wf = 1;
      wt = 1;
      ws = 1;
      wl = 0.4;
    }
    const sum = wf + wt + ws + wl;
    let r = this.rng.next() * sum;
    let key = "flat";
    if ((r -= wf) < 0)
      key = "flat";
    else if ((r -= wt) < 0)
      key = "top";
    else if ((r -= ws) < 0)
      key = "slice";
    else
      key = "lob";
    let aimY = 0.15 + 0.5 * st.aggression - pressure * 0.55;
    if (shortBall && pressure < 0.4 && oppDeep)
      aimY += 0.35;
    if (!t.volley && pressure < 0.3 && oppDeep && this.rng.chance(st.dropPref * tactics)) {
      key = "slice";
      aimY = -0.95;
    }
    if (key === "lob")
      aimY = pressure > 0.5 ? 0.3 : 0.1;
    aimY = clamp(aimY + this.rng.gauss() * 0.1, -1, 1);
    let ax;
    const side = Math.sign(opp.x) || (this.rng.chance(0.5) ? 1 : -1);
    if (oppNet && key !== "lob") {
      ax = -side * this.rng.range(0.6, 0.92);
    } else if (this.rng.chance(0.35 + 0.6 * tactics)) {
      ax = -side * this.rng.range(0.35, 0.9);
      if (Math.abs(opp.x) < 1.2)
        ax = (this.rng.chance(0.5) ? 1 : -1) * this.rng.range(0.45, 0.9);
    } else
      ax = this.rng.range(-0.7, 0.7);
    ax *= 1 - 0.55 * pressure;
    ax += this.rng.gauss() * 0.1;
    this.shotKey = key;
    this.shotAimX = clamp(ax, -1.1, 1.1);
    this.shotAimY = aimY;
  }
  idle(m, p, opp, intent, _s) {
    const home = this.homePosition(m, p, opp);
    this.moveTo(m, p, home.x, home.y, intent, 0.7);
  }
  homePosition(m, p, opp) {
    const st = p.def.style;
    const atNet = this.netMode;
    let hy = p.side * (COURT.halfL + st.baselineOffset + 0.35);
    if (atNet)
      hy = p.side * 3.4;
    if (m.phase === "serve_wait" && m.server !== p.idx) {
      return { x: p.x, y: p.y };
    }
    const dy = Math.abs(hy) / (Math.abs(hy) + Math.abs(opp.y) + 0.001);
    let hx = clamp(opp.x * dy * 0.85, -2.6, 2.6);
    if (m.phase === "rally" && m.lastHit && m.lastHit.player === p.idx) {
      hx = clamp(opp.x * dy * 0.85, -2.2, 2.2);
    }
    return { x: hx, y: hy };
  }
  moveTo(_m, p, tx, ty, intent, urgency) {
    const dx = tx - p.x;
    const dy = ty - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.08) {
      intent.mx = 0;
      intent.my = 0;
      return;
    }
    const vmax = p.maxSpeed(false);
    const want = Math.min(vmax * 1.25, d / 0.2 * urgency + (urgency >= 1 ? 0 : 0));
    const k = want / (d * vmax);
    intent.mx = clamp(dx * k, -1, 1) * (d > 0 ? 1 : 0);
    intent.my = clamp(dy * k, -1, 1);
    intent.sprint = urgency >= 1 && d > 2 && p.stamina > 0.12;
  }
}

// src/players/roster.ts
var mk = (d) => ({
  ...d,
  rating: Math.round((d.stats.speed + d.stats.power + d.stats.precision + d.stats.stamina) / 4)
});
var ROSTER = [
  mk({
    id: "winner",
    name: "Janick Winner",
    shortName: "WINNER",
    tagline: "Agressiu de fons de pista",
    look: {
      skin: "#f2c9a5",
      skinShade: "#d9a883",
      hair: "#d9541e",
      hairStyle: "crop",
      beard: "none",
      accessory: "none",
      accColor: "#ffffff",
      shirt: "#f2f2f2",
      shirtTrim: "#e8641c",
      sleeveless: false,
      shorts: "#1d2a5a",
      shortsTrim: "#e8641c",
      capri: false,
      shoes: "#ffffff",
      socks: "#ffffff",
      racketFrame: "#c43a2a",
      height: 1.91,
      build: 0.88
    },
    stats: { speed: 80, power: 88, precision: 90, stamina: 82 },
    style: {
      label: "Cops plans i profunds des del fons",
      netTendency: 0.15,
      aggression: 0.8,
      topspinPref: 0.3,
      slicePref: 0.1,
      lobPref: 0.05,
      dropPref: 0.03,
      spinBonus: 0.9,
      serveBonus: 1.02,
      baselineOffset: 0.6,
      lefty: false,
      oneHandBackhand: false,
      swingSpeed: 1.05,
      stride: 1,
      slide: false,
      lasso: false
    }
  }),
  mk({
    id: "alcaramba",
    name: "Carlos Alcaramba",
    shortName: "ALCARAMBA",
    tagline: "Tot terreny, dropshots i explosivitat",
    look: {
      skin: "#e0a878",
      skinShade: "#c68a5c",
      hair: "#2a1a12",
      hairStyle: "quiff",
      beard: "none",
      accessory: "none",
      accColor: "#ffffff",
      shirt: "#c6f21a",
      shirtTrim: "#1b1b1b",
      sleeveless: true,
      shorts: "#25272e",
      shortsTrim: "#c6f21a",
      capri: false,
      shoes: "#e8ff4a",
      socks: "#ffffff",
      racketFrame: "#1b1b1b",
      height: 1.83,
      build: 1.08
    },
    stats: { speed: 94, power: 90, precision: 78, stamina: 88 },
    style: {
      label: "Imprevisible, velocitat i dropshots",
      netTendency: 0.4,
      aggression: 0.75,
      topspinPref: 0.35,
      slicePref: 0.12,
      lobPref: 0.1,
      dropPref: 0.14,
      spinBonus: 1.1,
      serveBonus: 1,
      baselineOffset: 0.3,
      lefty: false,
      oneHandBackhand: false,
      swingSpeed: 1.2,
      stride: 1.1,
      slide: true,
      lasso: false
    }
  }),
  mk({
    id: "djokobits",
    name: "Novac Djokobits",
    shortName: "DJOKOBITS",
    tagline: "Defensa elàstica i restador mestre",
    look: {
      skin: "#eac09b",
      skinShade: "#cf9d77",
      hair: "#1c1612",
      hairStyle: "swept",
      beard: "stubble",
      accessory: "none",
      accColor: "#ffffff",
      shirt: "#f4f6fa",
      shirtTrim: "#2a6cd0",
      sleeveless: false,
      shorts: "#f4f6fa",
      shortsTrim: "#2a6cd0",
      capri: false,
      shoes: "#e9eef7",
      socks: "#ffffff",
      racketFrame: "#2b2b30",
      height: 1.88,
      build: 0.95
    },
    stats: { speed: 88, power: 78, precision: 92, stamina: 97 },
    style: {
      label: "Contraatac i devolucions perfectes",
      netTendency: 0.12,
      aggression: 0.5,
      topspinPref: 0.25,
      slicePref: 0.22,
      lobPref: 0.12,
      dropPref: 0.03,
      spinBonus: 0.95,
      serveBonus: 0.97,
      baselineOffset: 0.9,
      lefty: false,
      oneHandBackhand: false,
      swingSpeed: 1,
      stride: 1.05,
      slide: true,
      lasso: false
    }
  }),
  mk({
    id: "nadol",
    name: "Rafa Nadol",
    shortName: "NADOL",
    tagline: "Esquerrà, topspin brutal i garra",
    look: {
      skin: "#d49866",
      skinShade: "#b87b4c",
      hair: "#1b130e",
      hairStyle: "long",
      beard: "none",
      accessory: "headband",
      accColor: "#f2f2f2",
      shirt: "#ffe23a",
      shirtTrim: "#1a1a1a",
      sleeveless: true,
      shorts: "#1f6fd0",
      shortsTrim: "#ffe23a",
      capri: true,
      shoes: "#ffe23a",
      socks: "#ffffff",
      racketFrame: "#d02b2b",
      height: 1.85,
      build: 1.16
    },
    stats: { speed: 90, power: 84, precision: 80, stamina: 99 },
    style: {
      label: "Topspin pesat i resistència infinita",
      netTendency: 0.08,
      aggression: 0.6,
      topspinPref: 0.55,
      slicePref: 0.08,
      lobPref: 0.08,
      dropPref: 0.05,
      spinBonus: 1.3,
      serveBonus: 0.98,
      baselineOffset: 1.3,
      lefty: true,
      oneHandBackhand: false,
      swingSpeed: 1.1,
      stride: 1,
      slide: false,
      lasso: true
    }
  }),
  mk({
    id: "fedepixel",
    name: "Rogelio Fedepixel",
    shortName: "FEDEPIXEL",
    tagline: "Elegància, servei i volea",
    look: {
      skin: "#f0c8a6",
      skinShade: "#d6a780",
      hair: "#6b4a2b",
      hairStyle: "slick",
      beard: "none",
      accessory: "headband",
      accColor: "#ffffff",
      shirt: "#ffffff",
      shirtTrim: "#14305f",
      sleeveless: false,
      shorts: "#ffffff",
      shortsTrim: "#14305f",
      capri: false,
      shoes: "#ffffff",
      socks: "#ffffff",
      racketFrame: "#1d1d1d",
      height: 1.85,
      build: 0.93
    },
    stats: { speed: 78, power: 80, precision: 96, stamina: 80 },
    style: {
      label: "Revés a una mà, servei-volea",
      netTendency: 0.6,
      aggression: 0.7,
      topspinPref: 0.15,
      slicePref: 0.3,
      lobPref: 0.05,
      dropPref: 0.08,
      spinBonus: 0.85,
      serveBonus: 1.04,
      baselineOffset: 0,
      lefty: false,
      oneHandBackhand: true,
      swingSpeed: 0.95,
      stride: 0.95,
      slide: false,
      lasso: false
    }
  }),
  mk({
    id: "medvedit",
    name: "Daniil Medvedit",
    shortName: "MEDVEDIT",
    tagline: "Gegant, servei potent i defensa de fons",
    look: {
      skin: "#f0cfb4",
      skinShade: "#d8ad8e",
      hair: "#3a2a20",
      hairStyle: "short",
      beard: "none",
      accessory: "cap",
      accColor: "#1fb5b0",
      shirt: "#1fb5b0",
      shirtTrim: "#0d4d63",
      sleeveless: false,
      shorts: "#0d4d63",
      shortsTrim: "#1fb5b0",
      capri: false,
      shoes: "#e8f6f6",
      socks: "#ffffff",
      racketFrame: "#2a7de0",
      height: 1.98,
      build: 0.86
    },
    stats: { speed: 70, power: 92, precision: 82, stamina: 85 },
    style: {
      label: "Servei enorme i defensa elàstica",
      netTendency: 0.12,
      aggression: 0.45,
      topspinPref: 0.15,
      slicePref: 0.25,
      lobPref: 0.1,
      dropPref: 0.02,
      spinBonus: 0.85,
      serveBonus: 1.08,
      baselineOffset: 2,
      lefty: false,
      oneHandBackhand: false,
      swingSpeed: 0.9,
      stride: 1.25,
      slide: false,
      lasso: false
    }
  })
];

// src/render/pixel.ts
function px(ctx, x, y, color, s = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), s, s);
}
function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  ctx.fillRect(x0, y0, Math.max(1, Math.round(x + w) - x0), Math.max(1, Math.round(y + h) - y0));
}
function line(ctx, x0, y0, x1, y1, w, color) {
  ctx.fillStyle = color;
  let ax = Math.round(x0);
  let ay = Math.round(y0);
  const bx = Math.round(x1);
  const by = Math.round(y1);
  const dx = Math.abs(bx - ax);
  const dy = -Math.abs(by - ay);
  const sx = ax < bx ? 1 : -1;
  const sy = ay < by ? 1 : -1;
  let err = dx + dy;
  const off = Math.floor((w - 1) / 2);
  for (let i = 0;i < 400; i++) {
    ctx.fillRect(ax - off, ay - off, w, w);
    if (ax === bx && ay === by)
      break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      ax += sx;
    }
    if (e2 <= dx) {
      err += dx;
      ay += sy;
    }
  }
}
function disc(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  const x0 = Math.round(cx);
  const y0 = Math.round(cy);
  const ri = Math.max(1, Math.round(r));
  for (let y = -ri;y <= ri; y++) {
    const half = Math.round(Math.sqrt(Math.max(0, r * r + 0.25 - y * y)));
    if (half <= 0 && Math.abs(y) > 0)
      continue;
    ctx.fillRect(x0 - half, y0 + y, half * 2 + 1, 1);
  }
}
function ellipse(ctx, cx, cy, rx, ry, color, dither = false) {
  ctx.fillStyle = color;
  const x0 = Math.round(cx);
  const y0 = Math.round(cy);
  const ryi = Math.max(1, Math.round(ry));
  for (let y = -ryi;y <= ryi; y++) {
    const t = y / ryi;
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - t * t)));
    if (dither) {
      for (let x = -half;x <= half; x++)
        if ((x0 + x + y0 + y & 1) === 0)
          ctx.fillRect(x0 + x, y0 + y, 1, 1);
    } else
      ctx.fillRect(x0 - half, y0 + y, half * 2 + 1, 1);
  }
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, Math.round((n >> 16 & 255) * f)));
  const g = Math.max(0, Math.min(255, Math.round((n >> 8 & 255) * f)));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * f)));
  return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)}`;
}
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
}
var BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// src/render/projection.ts
var W = 480;
var H = 270;
var CAM = {
  y: 42,
  z: 22,
  pitch: 0.52,
  f: 722,
  cx: 240,
  cy: 164
};
var S = Math.sin(CAM.pitch);
var C = Math.cos(CAM.pitch);
function project(x, y, z, out) {
  const ry = y - CAM.y;
  const rz = z - CAM.z;
  const fwd = -ry * C - rz * S;
  const up = -ry * S + rz * C;
  const k = CAM.f / fwd;
  out.sx = CAM.cx + x * k;
  out.sy = CAM.cy - up * k;
  out.ppm = k;
  out.depth = fwd;
  return out;
}
var newProj = () => ({ sx: 0, sy: 0, ppm: 1, depth: 1 });
function rayDir(sx, sy) {
  const r = (sx - CAM.cx) / CAM.f;
  const u = -(sy - CAM.cy) / CAM.f;
  return { dx: r, dy: -C - u * S, dz: -S + u * C };
}
function groundAt(sx, sy) {
  const d = rayDir(sx, sy);
  if (d.dz >= -0.000001)
    return null;
  const t = -CAM.z / d.dz;
  return { x: t * d.dx, y: CAM.y + t * d.dy };
}

// src/render/court.ts
var BOARD_Y = -18.3;
var STAND_START = 18.8;
var STAND_SLOPE = 0.6;
var STAND_BASE_Z = 1.1;
var SIDE_START = 10.2;
var INNER = ["#3d74c6", "#3870c0"];
var OUTER = ["#2f8c66", "#2b8461"];
function hash(a, b) {
  let h = Math.imul(a * 374761393 + b * 668265263, 1274126177);
  h = (h ^ h >>> 13) >>> 0;
  return h % 1000 / 1000;
}
function shadeRgb(c, f) {
  return [Math.min(255, c[0] * f), Math.min(255, c[1] * f), Math.min(255, c[2] * f)];
}
function lineHit(x, y, hwx, hwy) {
  const { halfL, halfWs, halfWd, serviceY } = COURT;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  if (Math.abs(ay - halfL) <= hwy && ax <= halfWd + hwx)
    return true;
  if (ay <= halfL + hwy) {
    if (Math.abs(ax - halfWd) <= hwx)
      return true;
    if (Math.abs(ax - halfWs) <= hwx)
      return true;
  }
  if (Math.abs(ay - serviceY) <= hwy && ax <= halfWs + hwx)
    return true;
  if (ax <= hwx && ay <= serviceY + hwy)
    return true;
  if (ax <= hwx && ay >= halfL - 0.3 && ay <= halfL + hwy)
    return true;
  return false;
}
function buildBackground() {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(W, H);
  const data = img.data;
  const innerRgb = INNER.map(hexToRgb);
  const outerRgb = OUTER.map(hexToRgb);
  const boardCols = ["#0b2a6e", "#b3122b", "#0b6e4f", "#e0a800", "#4b1f8f"].map(hexToRgb);
  const seatCols = ["#3b2d6e", "#4c3b86", "#2f3f7a", "#5a2f6e"].map(hexToRgb);
  for (let sy = 0;sy < H; sy++) {
    const below = groundAt(CAM.cx, sy + 1);
    const here = groundAt(CAM.cx, sy);
    const dyw = here && below ? Math.abs(below.y - here.y) : 1;
    for (let sx = 0;sx < W; sx++) {
      const d = rayDir(sx, sy);
      let bestT = Infinity;
      let kind = "sky";
      if (d.dz < -0.000001) {
        const t = -CAM.z / d.dz;
        bestT = t;
        kind = "ground";
      }
      if (d.dy < -0.000001) {
        const t = (BOARD_Y - CAM.y) / d.dy;
        const z = CAM.z + t * d.dz;
        if (t > 0 && t < bestT && z >= 0 && z <= 1.1) {
          bestT = t;
          kind = "board";
        }
        const den = d.dz + STAND_SLOPE * d.dy;
        if (Math.abs(den) > 0.000001) {
          const ts = (STAND_BASE_Z + STAND_SLOPE * STAND_START - CAM.z - STAND_SLOPE * CAM.y) / den;
          const ts2 = (STAND_BASE_Z - STAND_SLOPE * STAND_START - CAM.z - STAND_SLOPE * CAM.y) / den;
          const y = CAM.y + ts2 * d.dy;
          if (ts2 > 0 && ts2 < bestT && -y >= STAND_START && -y <= STAND_START + 17) {
            bestT = ts2;
            kind = "far";
          }
        }
      }
      for (const sg of [-1, 1]) {
        const den = d.dz - STAND_SLOPE * sg * d.dx;
        if (Math.abs(den) > 0.000001) {
          const t = (STAND_BASE_Z - STAND_SLOPE * SIDE_START - CAM.z) / den;
          const x = t * d.dx;
          const y = CAM.y + t * d.dy;
          if (t > 0 && t < bestT && sg * x >= SIDE_START && sg * x <= SIDE_START + 17 && y > -STAND_START && y < 22) {
            bestT = t;
            kind = sg < 0 ? "sideL" : "sideR";
          }
        }
      }
      let rgb;
      const wx = bestT === Infinity ? 0 : bestT * d.dx;
      const wy = bestT === Infinity ? 0 : CAM.y + bestT * d.dy;
      const wz = bestT === Infinity ? 0 : CAM.z + bestT * d.dz;
      const bayer = BAYER4[(sy & 3) * 4 + (sx & 3)] / 16;
      switch (kind) {
        case "ground": {
          const ax = Math.abs(wx);
          const ay = Math.abs(wy);
          const dxw = 1 / CAM.f * bestT * 1;
          const hwx = Math.max(0.055, 0.6 * dxw);
          const hwy = Math.max(0.055, 0.6 * dyw);
          const inside = ax <= COURT.halfWd && ay <= COURT.halfL;
          const light = 1 - 0.28 * Math.min(1, (wx / 16) ** 2 + (wy / 24) ** 2);
          if (lineHit(wx, wy, hwx, hwy)) {
            rgb = [240, 244, 248];
            rgb = shadeRgb(rgb, 0.92 + 0.08 * light);
          } else {
            const cols = inside ? innerRgb : outerRgb;
            const n = hash(Math.floor(wx * 3), Math.floor(wy * 3));
            const base = cols[n > 0.55 ? 1 : 0];
            const q = light + (bayer - 0.5) * 0.1;
            rgb = shadeRgb(base, q > 0.88 ? 1.04 : q > 0.78 ? 0.95 : q > 0.68 ? 0.86 : 0.76);
          }
          break;
        }
        case "board": {
          const seg = Math.floor((wx + 40) / 2.6);
          let c = boardCols[seg % boardCols.length];
          const zi = wz / 1.1;
          if (zi > 0.9)
            c = [20, 24, 40];
          else {
            const lx = (wx + 40) / 2.6 - seg;
            const bar = zi > 0.3 && zi < 0.62 && lx > 0.12 && lx < 0.88 && Math.floor(lx * 18) % 3 !== 2 && hash(seg, Math.floor(lx * 18)) > 0.25;
            if (bar)
              c = [245, 245, 250];
          }
          rgb = shadeRgb(c, 0.9 + (bayer - 0.5) * 0.08);
          break;
        }
        case "far": {
          const depth = -wy - STAND_START;
          const row = Math.floor(depth / 1.05);
          const frac = depth / 1.05 - row;
          const col = Math.floor((wx + 60) / 0.75);
          let c = seatCols[(row + Math.floor((wx + 60) / 6)) % seatCols.length];
          if (frac < 0.12)
            c = [150, 150, 165];
          else if (frac < 0.3)
            c = shadeRgb(c, 0.7);
          if (Math.floor((wx + 60) / 3) % 5 === 0 && Math.abs((wx + 60) % 3 - 0) < 0.12)
            c = [110, 110, 125];
          const dim = 1 - Math.min(0.55, row * 0.045);
          rgb = shadeRgb(c, dim * (0.92 + (bayer - 0.5) * 0.1));
          break;
        }
        case "sideL":
        case "sideR": {
          const sg = kind === "sideL" ? -1 : 1;
          const depth = sg * wx - SIDE_START;
          const row = Math.floor(depth / 1.05);
          const frac = depth / 1.05 - row;
          let c = seatCols[(row + Math.floor((wy + 60) / 6)) % seatCols.length];
          if (frac < 0.12)
            c = [150, 150, 165];
          else if (frac < 0.3)
            c = shadeRgb(c, 0.7);
          const dim = 1 - Math.min(0.55, row * 0.045);
          rgb = shadeRgb(c, dim * 0.85 * (0.92 + (bayer - 0.5) * 0.1));
          break;
        }
        default: {
          const g = 1 - sy / 90;
          rgb = shadeRgb([14, 20, 52], 0.7 + 0.6 * Math.max(0, g) + (bayer - 0.5) * 0.12);
        }
      }
      const i = (sy * W + sx) * 4;
      data[i] = rgb[0];
      data[i + 1] = rgb[1];
      data[i + 2] = rgb[2];
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
function buildSeats() {
  const seats = [];
  let k = 0;
  for (let r = 1;r < 15; r++) {
    const d = STAND_START + r * 1.05 + 0.5;
    const z = STAND_BASE_Z + (d - STAND_START) * STAND_SLOPE + 0.1;
    for (let xx = -22;xx <= 22; xx += 0.78) {
      const h = hash(k++, r);
      seats.push({ x: xx + (h - 0.5) * 0.3, y: -d, z, row: r, hue: Math.floor(h * 997) % 12, phase: h * 6.28, zone: "far" });
    }
  }
  for (const sg of [-1, 1]) {
    for (let r = 1;r < 14; r++) {
      const d = SIDE_START + r * 1.05 + 0.5;
      const z = STAND_BASE_Z + (d - SIDE_START) * STAND_SLOPE + 0.1;
      for (let yy = -17;yy <= 20; yy += 0.9) {
        const h = hash(k++, r + 50);
        seats.push({ x: sg * d, y: yy + (h - 0.5) * 0.3, z, row: r, hue: Math.floor(h * 997) % 12, phase: h * 6.28, zone: sg < 0 ? "left" : "right" });
      }
    }
  }
  return seats;
}

// src/render/crowd.ts
var SKINS = ["#f0c8a6", "#e0a878", "#c68a5c", "#8d5a3a", "#f4d7bd", "#b97a50"];
var HAIRS = ["#1b130e", "#3a2a20", "#6b4a2b", "#d9b36a", "#8a8a8a", "#c0392b", "#111111"];
var SHIRTS = ["#e63946", "#f1c40f", "#2ecc71", "#3498db", "#ecf0f1", "#9b59b6", "#e67e22", "#1abc9c", "#ff6fa5", "#2c3e50", "#f5f5f5", "#c0392b"];

class Crowd {
  spots = [];
  excitement = 0.1;
  flash = 0;
  wave = -1;
  constructor() {
    const seats = buildSeats();
    const p = newProj();
    for (const seat of seats) {
      project(seat.x, seat.y, seat.z, p);
      const w = Math.max(3, Math.round(0.46 * p.ppm));
      const h = Math.max(3, Math.round(0.5 * p.ppm));
      if (p.sx < -8 || p.sx > W + 8 || p.sy < -8 || p.sy > H)
        continue;
      this.spots.push({
        sx: Math.round(p.sx),
        sy: Math.round(p.sy),
        w,
        h,
        seat,
        skin: SKINS[(seat.hue * 7 + Math.floor(seat.phase * 10)) % SKINS.length],
        hair: HAIRS[(seat.hue * 3 + Math.floor(seat.phase * 7)) % HAIRS.length],
        shirt: SHIRTS[seat.hue % SHIRTS.length],
        depth: p.depth
      });
    }
    this.spots.sort((a, b) => b.depth - a.depth);
  }
  cheer(level) {
    this.excitement = Math.min(1, Math.max(this.excitement, level));
    this.flash = Math.min(1, this.flash + level * 0.6);
    if (level > 0.8)
      this.wave = 0;
  }
  update(dt) {
    this.excitement = Math.max(0.12, this.excitement - dt * 0.28);
    this.flash = Math.max(0, this.flash - dt * 1.5);
    if (this.wave >= 0) {
      this.wave += dt * 14;
      if (this.wave > 60)
        this.wave = -1;
    }
  }
  draw(ctx, time) {
    const e = this.excitement;
    for (const s of this.spots) {
      const seat = s.seat;
      const ph = seat.phase;
      let bob = Math.sin(time * (2 + e * 7) + ph) * (0.3 + e * 1.1);
      let arms = e > 0.55 && Math.sin(ph * 5 + time * 6) > 0.1;
      if (this.wave >= 0) {
        const wx = seat.zone === "far" ? seat.x + 22 : seat.zone === "left" ? 44 + (20 - seat.y) : 44 + 22 + 44 + seat.y;
        const d = this.wave - wx * 0.5;
        if (d > -2 && d < 4) {
          arms = true;
          bob -= 1.2;
        }
      }
      const by = Math.round(s.sy + bob);
      const x = s.sx - Math.floor(s.w / 2);
      rect(ctx, x, by, s.w, s.h, s.shirt);
      const hw = Math.max(2, Math.round(s.w * 0.55));
      rect(ctx, s.sx - Math.floor(hw / 2), by - hw, hw, hw, s.skin);
      rect(ctx, s.sx - Math.floor(hw / 2), by - hw, hw, Math.max(1, Math.round(hw * 0.45)), s.hair);
      if (arms) {
        px(ctx, x - 1, by - 2, s.skin, 1);
        px(ctx, x + s.w, by - 2, s.skin, 1);
        px(ctx, x - 1, by - 1, s.skin, 1);
        px(ctx, x + s.w, by - 1, s.skin, 1);
      }
    }
    if (this.flash > 0.2) {
      const n = Math.floor(this.flash * 14);
      for (let i = 0;i < n; i++) {
        const s = this.spots[Math.floor((Math.sin(time * 91 + i * 17.3) + 1) / 2 * (this.spots.length - 1))];
        if (s)
          px(ctx, s.sx, s.sy - 4, "#ffffff", 2);
      }
    }
  }
}

// src/render/font.ts
var G2 = {
  A: "010101111101101",
  B: "110101110101110",
  C: "011100100100011",
  D: "110101101101110",
  E: "111100110100111",
  F: "111100110100100",
  G: "011100101101011",
  H: "101101111101101",
  I: "111010010010111",
  J: "001001001101010",
  K: "101101110101101",
  L: "100100100100111",
  M: "101111111101101",
  N: "110101101101101",
  O: "010101101101010",
  P: "110101110100100",
  Q: "010101101111011",
  R: "110101110101101",
  S: "011100010001110",
  T: "111010010010010",
  U: "101101101101111",
  V: "101101101101010",
  W: "101101111111101",
  X: "101101010101101",
  Y: "101101010010010",
  Z: "111001010100111",
  "0": "111101101101111",
  "1": "010110010010111",
  "2": "110001010100111",
  "3": "110001010001110",
  "4": "101101111001001",
  "5": "111100110001110",
  "6": "011100111101111",
  "7": "111001010010010",
  "8": "111101111101111",
  "9": "111101111001110",
  "-": "000000111000000",
  ":": "000010000010000",
  ".": "000000000000010",
  "!": "010010010000010",
  "?": "110001010000010",
  "/": "001001010100100",
  "%": "101001010100101",
  "+": "000010111010000",
  ",": "000000000010100",
  "'": "010010000000000",
  "(": "010100100100010",
  ")": "010001001001010",
  "·": "000000010000000",
  ">": "100010001010100",
  "<": "001010100010001",
  "=": "000111000111000",
  " ": "000000000000000"
};
var ACCENTS = {
  À: ["A", 1],
  Á: ["A", 2],
  È: ["E", 1],
  É: ["E", 2],
  Í: ["I", 2],
  Ï: ["I", 3],
  Ò: ["O", 1],
  Ó: ["O", 2],
  Ú: ["U", 2],
  Ü: ["U", 3],
  Ç: ["C", 4],
  Ñ: ["N", 5]
};
var FONT_W = 3;
function glyphBits(ch) {
  return G2[ch] ?? G2["?"];
}
function plotText(text, plot, spacing = 1) {
  let cx = 0;
  for (const raw of text.toUpperCase()) {
    let ch = raw;
    let acc = 0;
    const a = ACCENTS[raw];
    if (a) {
      ch = a[0];
      acc = a[1];
    }
    const bits = glyphBits(ch);
    for (let i = 0;i < 15; i++) {
      if (bits[i] === "1")
        plot(cx + i % 3, Math.floor(i / 3));
    }
    if (acc === 1)
      plot(cx, -1);
    else if (acc === 2)
      plot(cx + 2, -1);
    else if (acc === 3) {
      plot(cx, -1);
      plot(cx + 2, -1);
    } else if (acc === 4)
      plot(cx + 1, 5);
    else if (acc === 5)
      plot(cx + 1, -1);
    cx += FONT_W + spacing;
  }
}
function textWidth(text, scale = 1, spacing = 1) {
  return Math.max(0, text.length * (FONT_W + spacing) - spacing) * scale;
}
function drawText(ctx, text, x, y, color, scale = 1, outline, align = "left") {
  const w = textWidth(text, scale);
  let ox = Math.round(x);
  if (align === "center")
    ox = Math.round(x - w / 2);
  else if (align === "right")
    ox = Math.round(x - w);
  const oy = Math.round(y);
  if (outline) {
    ctx.fillStyle = outline;
    plotText(text, (px, py) => {
      for (let dx = -1;dx <= 1; dx++)
        for (let dy = -1;dy <= 1; dy++)
          ctx.fillRect(ox + px * scale + dx, oy + py * scale + dy, scale, scale);
    });
  }
  ctx.fillStyle = color;
  plotText(text, (px, py) => ctx.fillRect(ox + px * scale, oy + py * scale, scale, scale));
}

// src/render/sprites.ts
var K = (t, hx, hy, ang, ox, oy, twist = 0, lean = 0, crouch = 0, lift = 0) => ({
  t,
  hx,
  hy,
  ang,
  ox,
  oy,
  twist,
  lean,
  crouch,
  lift
});
var READY = K(0, 0.3, 1, 0.8, 0.12, 1, 0, 0, 0.07, 0);
function lerpKey(a, b, f) {
  const l = (x, y) => x + (y - x) * f;
  return {
    t: l(a.t, b.t),
    hx: l(a.hx, b.hx),
    hy: l(a.hy, b.hy),
    ang: l(a.ang, b.ang),
    ox: l(a.ox, b.ox),
    oy: l(a.oy, b.oy),
    twist: l(a.twist, b.twist),
    lean: l(a.lean, b.lean),
    crouch: l(a.crouch, b.crouch),
    lift: l(a.lift, b.lift)
  };
}
var smoothstep = (f) => f * f * (3 - 2 * f);
function sampleKeys(keys, t) {
  if (t <= keys[0].t)
    return keys[0];
  for (let i = 1;i < keys.length; i++) {
    if (t <= keys[i].t) {
      const a = keys[i - 1];
      const b = keys[i];
      const f = (t - a.t) / Math.max(0.000001, b.t - a.t);
      return lerpKey(a, b, smoothstep(clamp(f, 0, 1)));
    }
  }
  return keys[keys.length - 1];
}
function strokeKeys(stroke, variant, c, st) {
  const T = (f) => f;
  const tb = T(c * 0.5);
  const tf = T(c + (1 - c) * 0.4);
  let twoHand = true;
  let keys;
  switch (stroke) {
    case "fh": {
      keys = [
        K(0, 0.3, 1, 0.8, 0.12, 1, 0, 0, 0.07),
        K(tb, 0.76, 1.1, 1.55, -0.05, 1.3, 0.7, -0.02, 0.12),
        K(c, 0.58, 1, 0.25, 0.1, 1.05, -0.1, 0.04, 0.09),
        K(tf, 0.05, 1.45, -1, 0.2, 1.15, -0.6, 0.05, 0.04),
        K(1, -0.3, 1.62, -1.9, 0.15, 1.1, -0.8, 0.04, 0.03)
      ];
      twoHand = false;
      if (variant === "top") {
        keys[2].hy -= 0.16;
        keys[3].hy += 0.18;
        keys[4].hy += 0.12;
      } else if (variant === "slice") {
        keys[1].hy += 0.22;
        keys[3].hx = 0.4;
        keys[3].hy = 1.05;
        keys[4].hx = 0.5;
        keys[4].hy = 0.8;
        keys[4].ang = 0.3;
      } else if (variant === "lob") {
        keys[2].hy -= 0.3;
        keys[2].crouch = 0.2;
        keys[3].hy += 0.4;
        keys[4].hx = 0.15;
        keys[4].hy = 1.95;
        keys[4].ang = -0.6;
      }
      if (st.lasso && variant !== "slice") {
        keys[3].hx = 0.15;
        keys[3].hy = 1.75;
        keys[4].hx = -0.2;
        keys[4].hy = 1.95;
        keys[4].ang = -2.6;
      }
      break;
    }
    case "bh": {
      twoHand = !st.oneHandBackhand;
      const one = st.oneHandBackhand;
      keys = [
        K(0, 0.3, 1, 0.8, 0.12, 1, 0, 0, 0.07),
        K(tb, -0.55, 1.12, -1.5, one ? 0.45 : -0.45, one ? 1.4 : 1.12, -0.7, -0.02, 0.12),
        K(c, -0.5, 1, -0.2, one ? 0.6 : -0.35, one ? 1.3 : 1, 0.1, 0.04, 0.09),
        K(tf, 0.15, 1.45, 1, one ? 0.65 : 0.1, one ? 1.4 : 1.4, 0.55, 0.05, 0.04),
        K(1, 0.4, 1.68, 1.9, one ? 0.7 : 0.3, one ? 1.5 : 1.6, 0.8, 0.04, 0.03)
      ];
      if (variant === "top") {
        keys[2].hy -= 0.15;
        keys[3].hy += 0.18;
        keys[4].hy += 0.1;
      } else if (variant === "slice") {
        keys[1].hy += 0.25;
        keys[3].hx = -0.2;
        keys[3].hy = 1.05;
        keys[4].hx = -0.5;
        keys[4].hy = 0.85;
        keys[4].ang = -0.3;
      } else if (variant === "lob") {
        keys[2].hy -= 0.3;
        keys[2].crouch = 0.2;
        keys[4].hy = 1.9;
      }
      break;
    }
    case "serve":
      keys = [
        K(0, 0.3, 1.75, 2.7, -0.15, 2.2, 0.5, -0.1, 0.18, 0),
        K(c, 0.14, 2.5, 0.1, -0.3, 1.5, -0.1, 0.08, 0, 0.18),
        K(c + (1 - c) * 0.35, -0.1, 1.8, -1.4, -0.2, 1.25, -0.5, 0.06, 0.03, 0.1),
        K(1, -0.3, 1.15, -2, 0, 1.05, -0.7, 0.04, 0.05, 0)
      ];
      twoHand = false;
      break;
    case "smash":
      keys = [
        K(0, 0.3, 1.85, 2.5, -0.1, 2.1, 0.4, -0.1, 0.1),
        K(c, 0.12, 2.45, 0.1, -0.2, 1.6, -0.1, 0.08, 0, 0.12),
        K(c + (1 - c) * 0.4, -0.15, 1.6, -1.5, -0.1, 1.3, -0.5, 0.05, 0.03, 0.05),
        K(1, -0.3, 1.2, -2, 0, 1.05, -0.7, 0.03, 0.05, 0)
      ];
      twoHand = false;
      break;
    default:
      keys = [
        K(0, 0.3, 1, 0.8, 0.12, 1, 0, 0, 0.07),
        K(tb, 0.55, 1.2, 1, 0.05, 1.2, 0.3, 0, 0.1),
        K(c, 0.55, 1.22, 0.5, 0.1, 1.15, 0, 0.03, 0.1),
        K(tf, 0.4, 1.15, 0.3, 0.12, 1.1, -0.1, 0.03, 0.08),
        K(1, 0.3, 1.05, 0.7, 0.12, 1, 0, 0, 0.07)
      ];
      twoHand = false;
  }
  return { keys, twoHand };
}
function poseFor(p, time, tossBallZ) {
  const st = p.def.style;
  const vr = clamp(p.speed / 7, 0, 1.4);
  const mv = p.speed > 0.5;
  const sw = p.swing;
  const phase = p.runPhase;
  let key = READY;
  let twoHand = true;
  if (sw && sw.t < sw.dur) {
    const { keys, twoHand: th } = strokeKeys(sw.stroke, sw.variant, sw.contactAt / sw.dur, st);
    key = sampleKeys(keys, sw.t / sw.dur);
    twoHand = th;
  } else if (p.tossing && tossBallZ !== null) {
    key = K(0, 0.34, 1.35, 2.3, -0.12, clamp(tossBallZ + 0.1, 1.3, 2.4), 0.2, -0.04, 0.1);
    twoHand = false;
  } else {
    const since = p.sinceHit;
    const lastDur = 0.45;
    if (since < lastDur + 0.3 && p.lastStroke !== "serve") {
      const f = clamp((since - lastDur) / 0.3, 0, 1);
      const { keys } = strokeKeys(p.lastStroke, p.lastVariant, 0.3, st);
      key = lerpKey(keys[keys.length - 1], READY, smoothstep(f));
      twoHand = false;
    }
    if (mv && since > lastDur + 0.3) {
      const s = Math.sin(phase);
      key = { ...READY, hy: 1 + 0.05 * s, hx: 0.3 + 0.05 * Math.cos(phase), oy: 1 - 0.06 * s, ox: 0.12 - 0.04 * s, lean: 0.06 * vr, crouch: 0.07 + 0.06 * vr };
    } else if (!mv && since > lastDur + 0.3) {
      key = { ...READY, hy: 1 + 0.012 * Math.sin(time * 3.1 + p.idx), oy: 1 + 0.012 * Math.sin(time * 3.1 + p.idx) };
    }
  }
  const lat = p.speed > 0.3 ? p.vx / p.speed : 0;
  const dep = p.speed > 0.3 ? p.vy / p.speed : 0;
  let footL = [-0.14, 0];
  let footR = [0.14, 0];
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
  if (sw && sw.t < sw.dur && sw.stroke !== "serve" && sw.stroke !== "smash") {
    const open = sw.stroke === "bh" ? -1 : 1;
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
    bob
  };
}
function ik(sx, sy, hx, hy, l1, l2, bend) {
  const dx = hx - sx;
  const dy = hy - sy;
  let d = Math.hypot(dx, dy);
  const maxD = l1 + l2 - 0.001;
  if (d > maxD)
    d = maxD;
  if (d < 0.05)
    d = 0.05;
  const a = Math.atan2(dy, dx);
  const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const ang = a + bend * Math.acos(cosA);
  return [sx + Math.cos(ang) * l1, sy + Math.sin(ang) * l1];
}
function drawPlayerSprite(ctx, d) {
  const { look, style, view, s, pose } = d;
  const mir = (view === "back" ? 1 : -1) * (style.lefty ? -1 : 1);
  const back = view === "back";
  const hScale = look.height / 1.85;
  const b = look.build;
  const X = (lx) => d.x + lx * s;
  const Y = (ly) => d.y - ly * s;
  const lift = pose.lift + pose.bob;
  const crouch = pose.crouch;
  const hipY = (0.95 - crouch * 0.55) * hScale + lift;
  const shoulderY = (1.5 - crouch * 0.9 - pose.lean * 0.35) * hScale + lift;
  const sw = 0.44 * b * (1 - 0.35 * Math.abs(pose.twist)) * (0.9 + 0.1 * hScale);
  const bodyDx = pose.bodyDx + pose.twist * 0.02 + pose.lean * 0.05;
  const tkW = (m) => Math.max(1, Math.round(m * s));
  const skin = look.skin;
  const skinSh = look.skinShade;
  const shirt = look.shirt;
  const shirtDark = shade(shirt, 0.82);
  const shortsC = look.shorts;
  const hipW = 0.1 * b;
  const hips = [
    [-hipW + bodyDx * 0.5, hipY],
    [hipW + bodyDx * 0.5, hipY]
  ];
  const feet = [
    [pose.footL[0], pose.footL[1] + lift * 0.4],
    [pose.footR[0], pose.footR[1] + lift * 0.4]
  ];
  const order = pose.footL[1] > pose.footR[1] ? [1, 0] : [0, 1];
  for (const i of order) {
    const h = hips[i];
    const f = [feet[i][0], feet[i][1] + 0.07];
    const kneeBend = 0.05 + crouch * 0.4;
    const kx = (h[0] + f[0]) / 2 + (i === 0 ? -1 : 1) * kneeBend;
    const ky = (h[1] + f[1]) / 2 + 0.03;
    const thick = tkW(0.13 * b * hScale);
    const thin = tkW(0.1 * b * hScale);
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
    const sw2 = tkW(0.2 * b);
    rect(ctx, X(feet[i][0]) - sw2 / 2, Y(feet[i][1] + 0.09), sw2, Math.max(2, tkW(0.1)), look.shoes);
    rect(ctx, X(feet[i][0]) - sw2 / 2, Y(feet[i][1] + 0.02), sw2, 1, shade(look.shoes, 0.6));
  }
  const waistW = 0.32 * b;
  rect(ctx, X(bodyDx * 0.5 - waistW / 2), Y(hipY + 0.06), tkW(waistW), tkW(0.14), shortsC);
  rect(ctx, X(bodyDx * 0.5 - waistW / 2), Y(hipY + 0.06), tkW(waistW), 1, look.shortsTrim);
  const shoulderOff = [-mir * sw * 0.5 + bodyDx, shoulderY - 0.03];
  const shoulderDom = [mir * sw * 0.5 + bodyDx, shoulderY - 0.03];
  const L1 = 0.3 * hScale;
  const L2 = 0.3 * hScale;
  const armT = tkW(0.095 * b * hScale);
  let dhx = mir * pose.hx + 0;
  const dhy = pose.hy * hScale + lift;
  let ohx = mir * pose.ox;
  let ohy = pose.oy * hScale + lift;
  if (pose.twoHand) {
    ohx = dhx - mir * 0.04;
    ohy = dhy - 0.04;
  }
  dhx += 0;
  const drawArm = (sh, hx, hy, dir) => {
    const el = ik(sh[0], sh[1], hx, hy, L1, L2, dir);
    const sleeve = look.sleeveless ? skin : shirt;
    line(ctx, X(sh[0]), Y(sh[1]), X(el[0]), Y(el[1]), armT, sleeve);
    if (!look.sleeveless) {
      const mx = sh[0] + (el[0] - sh[0]) * 0.58;
      const my = sh[1] + (el[1] - sh[1]) * 0.58;
      line(ctx, X(mx), Y(my), X(el[0]), Y(el[1]), armT, skin);
      line(ctx, X(sh[0]), Y(sh[1]), X(mx), Y(my), armT, sleeve);
    }
    line(ctx, X(el[0]), Y(el[1]), X(hx), Y(hy), Math.max(1, armT - (s < 16 ? 0 : 1)), skin);
    px(ctx, X(hx), Y(hy), skinSh, Math.max(1, tkW(0.07)));
  };
  if (!pose.twoHand || !back)
    drawArm(shoulderOff, ohx, ohy, mir * (back ? 1 : -1));
  const torsoBottom = hipY + 0.05;
  const rows = Math.max(3, Math.round((shoulderY - torsoBottom + 0.08) * s));
  for (let i = 0;i < rows; i++) {
    const f = i / (rows - 1);
    const y = shoulderY + 0.06 - f * (shoulderY - torsoBottom + 0.08);
    const w = (0.3 * b + (sw - 0.3 * b) * (1 - f) * 1.05) * 1;
    const cx = bodyDx * (1 - f * 0.5);
    const col = f > 0.8 ? look.shirtTrim : f > 0.45 ? shirt : shirt;
    rect(ctx, X(cx - w / 2), Y(y), Math.max(2, Math.round(w * s)), 1, col);
  }
  if (back) {
    rect(ctx, X(bodyDx - 0.012), Y(shoulderY), Math.max(1, tkW(0.03)), Math.max(2, rows - 3), shirtDark);
  } else {
    rect(ctx, X(bodyDx - 0.05), Y(shoulderY + 0.06), Math.max(2, tkW(0.1)), Math.max(1, tkW(0.04)), look.shirtTrim);
  }
  if (look.sleeveless) {
    rect(ctx, X(bodyDx - sw / 2), Y(shoulderY + 0.04), 1, 1, skin);
    rect(ctx, X(bodyDx + sw / 2) - 1, Y(shoulderY + 0.04), 1, 1, skin);
  }
  const headR = 0.105 * Math.pow(b, 0.3) * hScale;
  const hx0 = bodyDx + pose.twist * 0.03 + pose.lean * 0.04;
  const hy0 = shoulderY + 0.14 + headR * 0.55 + pose.lean * 0.02;
  const cxp = X(hx0);
  const cyp = Y(hy0);
  const rp = Math.max(1.6, headR * s);
  rect(ctx, X(hx0 - 0.04), Y(shoulderY + 0.1), Math.max(1, tkW(0.08)), Math.max(1, tkW(0.06)), skinSh);
  if (back) {
    disc(ctx, cxp, cyp, rp, look.hair);
    px(ctx, cxp - rp, cyp + rp * 0.1, skin);
    px(ctx, cxp + rp - 1, cyp + rp * 0.1, skin);
    rect(ctx, cxp - rp * 0.5, cyp + rp * 0.45, Math.max(1, rp), 1, shade(look.hair, 0.7));
  } else {
    disc(ctx, cxp, cyp, rp, skin);
    rect(ctx, cxp - rp * 0.6, cyp + rp * 0.55, rp * 1.2, 1, skinSh);
    const eyeY = cyp - rp * 0.05;
    px(ctx, cxp - rp * 0.45, eyeY, "#1a1a1a");
    px(ctx, cxp + rp * 0.4, eyeY, "#1a1a1a");
    if (look.beard === "stubble") {
      for (let i = -2;i <= 2; i++)
        if (i % 2 === 0)
          px(ctx, cxp + i * rp * 0.3, cyp + rp * 0.55, shade(look.hair, 1.1));
      rect(ctx, cxp - rp * 0.55, cyp + rp * 0.65, rp * 1.1, 1, shade(skinSh, 0.85));
    }
  }
  drawHair(ctx, look, cxp, cyp, rp, back, s);
  if (look.accessory === "headband") {
    const hbY = cyp - rp * 0.38;
    rect(ctx, cxp - rp, hbY, rp * 2 + 1, Math.max(1, Math.round(rp * 0.28)), look.accColor);
  } else if (look.accessory === "cap") {
    const capC = look.accColor;
    for (let y = -Math.round(rp);y <= -Math.round(rp * 0.2); y++) {
      const half = Math.round(Math.sqrt(Math.max(0, rp * rp - y * y)));
      rect(ctx, cxp - half, cyp + y, half * 2 + 1, 1, capC);
    }
    if (!back) {
      rect(ctx, cxp - rp * 0.95, cyp - rp * 0.2, rp * 1.9 + 1, 1, shade(capC, 0.65));
      rect(ctx, cxp - rp * 0.8, cyp - rp * 0.2 + 1, rp * 1.6 + 1, 1, shade(capC, 0.5));
    } else {
      rect(ctx, cxp - 1, cyp - rp * 0.15, 2, 1, shade(capC, 0.6));
    }
  }
  if (pose.twoHand && back)
    drawArm(shoulderOff, ohx, ohy, mir * 1);
  drawArm(shoulderDom, dhx, dhy, -mir * (back ? 1 : -1));
  drawRacket(ctx, X(dhx), Y(dhy), pose.ang * mir, s, look.racketFrame, hScale);
}
function drawHair(ctx, look, cx, cy, rp, back, s) {
  const c = look.hair;
  const hi = shade(c, 1.35);
  const r = Math.max(2, Math.round(rp));
  switch (look.hairStyle) {
    case "crop":
    case "short":
      if (!back)
        rect(ctx, cx - r, cy - r, r * 2 + 1, Math.max(1, Math.round(r * 0.75)), c);
      if (look.hairStyle === "crop")
        px(ctx, cx - 1, cy - r - 1, c, 3);
      break;
    case "quiff":
      if (!back)
        rect(ctx, cx - r, cy - r, r * 2 + 1, Math.max(1, Math.round(r * 0.8)), c);
      rect(ctx, cx - r + 1, cy - r - 2, r * 2 - 1, 2, c);
      px(ctx, cx + 1, cy - r - 3, hi, 2);
      break;
    case "swept":
      if (!back)
        rect(ctx, cx - r, cy - r, r * 2 + 1, Math.max(1, Math.round(r * 0.7)), c);
      rect(ctx, cx - r, cy - r - 1, r * 2 + 1, 1, c);
      px(ctx, cx - r - 1, cy - r + 1, c, 1);
      break;
    case "slick":
      if (!back)
        rect(ctx, cx - r, cy - r, r * 2 + 1, Math.max(1, Math.round(r * 0.6)), c);
      rect(ctx, cx - r + 1, cy - r - 1, r * 2 - 1, 1, hi);
      break;
    case "long":
      if (!back)
        rect(ctx, cx - r, cy - r, r * 2 + 1, Math.max(1, Math.round(r * 0.8)), c);
      rect(ctx, cx - r - 1, cy - r * 0.2, 2, Math.round(r * 1.3), c);
      rect(ctx, cx + r, cy - r * 0.2, 2, Math.round(r * 1.3), c);
      if (back)
        rect(ctx, cx - r, cy + r * 0.3, r * 2 + 1, Math.max(2, Math.round(r * 0.9)), c);
      break;
  }
}
function drawRacket(ctx, hx, hy, ang, s, frame, hScale) {
  const k = hScale * s;
  const dx = Math.sin(ang);
  const dy = -Math.cos(ang);
  const gripEnd = 0.2 * k;
  const throatEnd = 0.36 * k;
  line(ctx, hx, hy, hx + dx * gripEnd, hy + dy * gripEnd, 1, "#222222");
  line(ctx, hx + dx * gripEnd, hy + dy * gripEnd, hx + dx * throatEnd, hy + dy * throatEnd, 1, frame);
  const a = 0.2 * k;
  const bb = 0.145 * k;
  const cx = hx + dx * (throatEnd + a * 0.85);
  const cy = hy + dy * (throatEnd + a * 0.85);
  const rad = Math.ceil(Math.max(a, bb)) + 1;
  for (let y = -rad;y <= rad; y++) {
    for (let x = -rad;x <= rad; x++) {
      const u = x * dx + y * dy;
      const v = -x * dy + y * dx;
      const e = u * u / (a * a) + v * v / (bb * bb);
      if (e <= 1) {
        if (e >= 0.55 || a < 3)
          px(ctx, cx + x, cy + y, frame);
        else if ((x + y & 1) === 0)
          px(ctx, cx + x, cy + y, "#e8eef2");
      }
    }
  }
}
function drawSittingOfficial(ctx, x, y, s, shirt, arm, front) {
  const h = Math.max(6, Math.round(1.1 * s));
  rect(ctx, x - 0.2 * s, y - 0.45 * s, 0.4 * s, 0.45 * s, "#2a2f3a");
  rect(ctx, x - 0.17 * s, y - 0.95 * s, 0.34 * s, 0.5 * s, shirt);
  rect(ctx, x - 0.17 * s, y - 0.55 * s, 0.34 * s, 0.14 * s, "#1b2236");
  disc(ctx, x, y - 1.1 * s, Math.max(1.5, 0.1 * s), "#e0b090");
  rect(ctx, x - 0.1 * s, y - 1.2 * s, 0.2 * s, Math.max(1, 0.06 * s), "#2a1a12");
  if (arm > 0) {
    line(ctx, x - 0.17 * s, y - 0.9 * s, x - 0.4 * s, y - 1.35 * s, 1, "#e0b090");
    line(ctx, x + 0.17 * s, y - 0.9 * s, x + 0.4 * s, y - 1.35 * s, 1, "#e0b090");
  } else {
    line(ctx, x - 0.17 * s, y - 0.88 * s, x - 0.2 * s, y - 0.62 * s, 1, "#e0b090");
    line(ctx, x + 0.17 * s, y - 0.88 * s, x + 0.2 * s, y - 0.62 * s, 1, "#e0b090");
  }
}

// src/render/renderer.ts
class Renderer {
  canvas;
  ctx;
  bg;
  crowd = new Crowd;
  vignette;
  particles = [];
  marks = [];
  popups = [];
  trail = [];
  judges = [
    { x: -7.6, y: -11.9, signal: 0 },
    { x: 7.6, y: -6.4, signal: 0 },
    { x: -7.6, y: 6.4, signal: 0 },
    { x: 7.6, y: 11.9, signal: 0 },
    { x: 0, y: -15.2, signal: 0 }
  ];
  shake = 0;
  time = 0;
  proj = newProj();
  proj2 = newProj();
  assist = true;
  aimX = 0;
  aimY = 0;
  humanIdx = 0;
  umpireArm = 0;
  flashWhite = 0;
  constructor(canvas) {
    this.canvas = canvas;
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.ctx.imageSmoothingEnabled = false;
    this.bg = buildBackground();
    this.vignette = this.buildVignette();
  }
  buildVignette() {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d");
    g.fillStyle = "rgba(4,8,24,0.42)";
    for (let y = 0;y < H; y++) {
      for (let x = 0;x < W; x++) {
        const d = ((x - W / 2) / 300) ** 2 + ((y - H / 2) / 190) ** 2;
        const th = 0.55 + BAYER4[(y & 3) * 4 + (x & 3)] / 16 * 0.5;
        if (d > th)
          g.fillRect(x, y, 1, 1);
      }
    }
    return c;
  }
  handleEvents(events) {
    for (const e of events) {
      switch (e.type) {
        case "bounce": {
          const big = e.vz > 2.5;
          if (big) {
            for (let i = 0;i < 5; i++) {
              this.particles.push({
                x: e.x,
                y: e.y,
                z: 0.02,
                vx: (Math.random() - 0.5) * 1.6,
                vy: (Math.random() - 0.5) * 1.6,
                vz: 0.8 + Math.random() * 1.4,
                life: 0,
                max: 0.35 + Math.random() * 0.2,
                color: "#dfe9f5"
              });
            }
          }
          this.marks.push({ x: e.x, y: e.y, age: 0, out: !e.inBounds });
          if (this.marks.length > 14)
            this.marks.shift();
          break;
        }
        case "hit": {
          const n = 3 + Math.floor(e.power * 4);
          for (let i = 0;i < n; i++) {
            this.particles.push({
              x: e.x,
              y: e.y,
              z: e.z,
              vx: (Math.random() - 0.5) * 3,
              vy: (Math.random() - 0.5) * 3,
              vz: (Math.random() - 0.3) * 2.5,
              life: 0,
              max: 0.15,
              color: "#ffffff"
            });
          }
          if (e.stroke === "smash" || e.stroke === "serve" && e.power > 0.9)
            this.shake = 0.12;
          break;
        }
        case "fault":
          this.popup(e.double ? "DOBLE FALTA" : "FALTA!", "#ff6b4a");
          break;
        case "let":
          this.popup("LET", "#ffe066");
          break;
        case "out": {
          this.popup("FORA!", "#ff6b4a");
          this.umpireArm = 1.2;
          const m = this.marks[this.marks.length - 1];
          if (m) {
            let best = this.judges[0];
            let bd = Infinity;
            for (const j of this.judges) {
              const d = Math.hypot(j.x - m.x, j.y - m.y);
              if (d < bd) {
                bd = d;
                best = j;
              }
            }
            best.signal = 1.3;
          }
          break;
        }
        case "net":
          this.popup(e.cord ? "CINTA!" : "XARXA", "#a8d8ff");
          break;
        case "point":
          if (e.reason === "ace")
            this.popup("ACE!", "#ffe066");
          this.crowd.cheer(e.reason === "ace" ? 0.85 : 0.5);
          break;
        case "game":
          this.popup("JOC", "#ffffff");
          this.crowd.cheer(0.9);
          break;
        case "set":
          this.popup("SET!", "#ffe066");
          this.crowd.cheer(1);
          break;
        case "crowd":
          this.crowd.cheer(e.intensity * (e.kind === "gasp" ? 0.6 : 1));
          break;
        default:
          break;
      }
    }
  }
  popup(text, color) {
    this.popups.push({ text, color, t: 0, dur: 1.3, y: 112 });
    if (this.popups.length > 3)
      this.popups.shift();
  }
  draw(m, dt) {
    const ctx = this.ctx;
    this.time += dt;
    this.crowd.update(dt);
    this.umpireArm = Math.max(0, this.umpireArm - dt);
    for (const j of this.judges)
      j.signal = Math.max(0, j.signal - dt);
    this.shake = Math.max(0, this.shake - dt);
    ctx.save();
    if (this.shake > 0)
      ctx.translate(Math.round((Math.random() - 0.5) * 3), Math.round((Math.random() - 0.5) * 3));
    ctx.drawImage(this.bg, 0, 0);
    this.crowd.draw(ctx, this.time);
    this.drawScoreboard(ctx, m);
    this.drawMarks(ctx, dt);
    this.drawShadows(ctx, m);
    this.drawAim(ctx, m);
    const list = [];
    list.push({ key: 0, draw: () => this.drawNet(ctx) });
    list.push({ key: 0.01, draw: () => this.drawUmpire(ctx) });
    for (const j of this.judges)
      list.push({ key: j.y, draw: () => this.drawJudge(ctx, j) });
    for (const p of m.players)
      list.push({ key: p.y, draw: () => this.drawPlayer(ctx, m, p) });
    if (m.ballVisible)
      list.push({ key: m.ball.y, draw: () => this.drawBall(ctx, m) });
    list.sort((a, b) => a.key - b.key);
    for (const d of list)
      d.draw();
    this.drawParticles(ctx, dt);
    this.drawPopups(ctx, dt);
    ctx.restore();
    ctx.drawImage(this.vignette, 0, 0);
    if (this.flashWhite > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flashWhite})`;
      ctx.fillRect(0, 0, W, H);
      this.flashWhite = Math.max(0, this.flashWhite - dt * 2);
    }
  }
  drawShadows(ctx, m) {
    const p = this.proj;
    for (const pl of m.players) {
      project(pl.x, pl.y, 0, p);
      const lift = pl.swing && pl.swing.stroke === "serve" ? 0.3 : 0;
      ellipse(ctx, p.sx + 1 + lift, p.sy, 0.5 * p.ppm, 0.17 * p.ppm, "#0a1a38", true);
      ellipse(ctx, p.sx + 1 + lift, p.sy, 0.3 * p.ppm, 0.1 * p.ppm, "#0a1a38", false);
    }
    if (m.ballVisible) {
      const b = m.ball;
      project(b.x, b.y, 0, p);
      const k = Math.max(1.5, 0.2 * p.ppm * (1 - Math.min(0.5, b.z * 0.06)));
      ellipse(ctx, p.sx, p.sy, k, k * 0.45, "#0a1a38", false);
    }
  }
  drawMarks(ctx, dt) {
    const p = this.proj;
    for (const mk of this.marks)
      mk.age += dt;
    this.marks = this.marks.filter((mk) => mk.age < 3);
    for (const mk of this.marks) {
      project(mk.x, mk.y, 0, p);
      const f = 1 - mk.age / 3;
      if (f < 0.35 && mk.age * 10 % 2 < 1)
        continue;
      ellipse(ctx, p.sx, p.sy, Math.max(1, 0.22 * p.ppm * 0.8), Math.max(1, 0.1 * p.ppm), mk.out ? "#c8d4e8" : "#24508f", true);
    }
  }
  drawAim(ctx, m) {
    if (!this.assist || m.cfg.humanIdx === null)
      return;
    const hp = m.players[m.cfg.humanIdx];
    const p = this.proj;
    let show = false;
    let tx = 0;
    let ty = 0;
    const u = (clamp(this.aimY, -1, 1) + 1) / 2;
    if ((m.phase === "serve_wait" || m.phase === "toss") && m.server === hp.idx) {
      const [lo, hi] = m.serveCtx.boxSign < 0 ? [-3.8, -0.5] : [0.5, 3.8];
      tx = lerp(lo, hi, (clamp(this.aimX, -1, 1) + 1) / 2);
      ty = -hp.side * (m.serveCtx.second ? lerp(3.4, 5.4, u) : lerp(3.6, 6, u));
      show = true;
    } else if (m.phase === "rally" && m.lastHitter === 1 - hp.idx && !m.serveAwait) {
      tx = clamp(this.aimX, -1.15, 1.15) * 3.75;
      ty = -hp.side * (5.5 + 5.8 * u);
      show = true;
    }
    if (!show)
      return;
    project(tx, ty, 0, p);
    const r = Math.max(2, Math.round(0.2 * p.ppm));
    const blink = Math.floor(this.time * 6) % 2 === 0;
    const col = blink ? "#ffffff" : "#ffe066";
    px(ctx, p.sx - r, p.sy, col);
    px(ctx, p.sx + r, p.sy, col);
    px(ctx, p.sx, p.sy - Math.ceil(r / 2), col);
    px(ctx, p.sx, p.sy + Math.ceil(r / 2), col);
  }
  drawNet(ctx) {
    const a = this.proj;
    const b = this.proj2;
    let lastSx = -999;
    for (let x = -COURT.netHalf;x <= COURT.netHalf + 0.001; x += 0.04) {
      const h = netHeightAt(x);
      project(x, 0, h, a);
      project(x, 0, 0, b);
      const sx = Math.round(a.sx);
      if (sx === lastSx)
        continue;
      lastSx = sx;
      const top = Math.round(a.sy);
      const bot = Math.round(b.sy);
      rect(ctx, sx, top, 1, 2, "#f4f6fa");
      for (let y = top + 2;y < bot; y++) {
        if ((sx + y & 1) === 0) {
          ctx.fillStyle = (sx & 3) === 0 && (y & 3) === 0 ? "#2a3a5c" : "#0d1424";
          ctx.fillRect(sx, y, 1, 1);
        }
      }
      rect(ctx, sx, bot - 1, 1, 1, "#dfe6ee");
    }
    for (const sg of [-1, 1]) {
      project(sg * COURT.netHalf, 0, COURT.netPostH + 0.05, a);
      project(sg * COURT.netHalf, 0, 0, b);
      rect(ctx, a.sx - 1, a.sy, 2, b.sy - a.sy, "#9aa4b4");
      rect(ctx, a.sx - 1, a.sy, 1, b.sy - a.sy, "#c9d1de");
    }
    project(0, 0, COURT.netCenterH, a);
    project(0, 0, 0, b);
    rect(ctx, a.sx, a.sy + 1, 1, b.sy - a.sy - 1, "#f4f6fa");
  }
  drawUmpire(ctx) {
    const a = this.proj;
    const g = this.proj2;
    const x0 = 7.5;
    project(x0 - 0.4, 0, 0, g);
    project(x0 - 0.4, 0, 1.9, a);
    rect(ctx, a.sx, a.sy, 2, g.sy - a.sy, "#c9d1de");
    const lx = a.sx;
    project(x0 + 0.4, 0, 0, g);
    project(x0 + 0.4, 0, 1.9, a);
    rect(ctx, a.sx, a.sy, 2, g.sy - a.sy, "#c9d1de");
    line(ctx, lx, a.sy + (g.sy - a.sy) * 0.4, a.sx, a.sy + (g.sy - a.sy) * 0.85, 1, "#9aa4b4");
    line(ctx, a.sx, a.sy + (g.sy - a.sy) * 0.4, lx, a.sy + (g.sy - a.sy) * 0.85, 1, "#9aa4b4");
    project(x0, 0, 1.9, a);
    rect(ctx, lx - 1, a.sy, a.sx - lx + 5, 2, "#1f2a44");
    drawSittingOfficial(ctx, a.sx, a.sy, a.ppm * 0.85, "#f4f6fa", this.umpireArm > 0 ? 1 : 0, true);
    px(ctx, a.sx + 2, a.sy - a.ppm * 0.7, "#222");
  }
  drawJudge(ctx, j) {
    const p = this.proj;
    project(j.x, j.y, 0, p);
    drawSittingOfficial(ctx, p.sx, p.sy, p.ppm * 0.8, "#22304e", j.signal > 0 ? 1 : 0, true);
  }
  drawPlayer(ctx, m, pl) {
    const p = this.proj;
    project(pl.x, pl.y, 0, p);
    const tossZ = pl.tossing ? m.ball.z : null;
    const pose = poseFor(pl, this.time, tossZ);
    drawPlayerSprite(ctx, {
      look: pl.def.look,
      style: pl.def.style,
      view: pl.side > 0 ? "back" : "front",
      s: p.ppm,
      x: p.sx,
      y: p.sy,
      pose
    });
  }
  drawBall(ctx, m) {
    const b = m.ball;
    const p = this.proj;
    project(b.x, b.y, b.z, p);
    const sp = Math.hypot(b.vx, b.vy, b.vz);
    this.trail.push({ sx: p.sx, sy: p.sy });
    if (this.trail.length > 7)
      this.trail.shift();
    if (sp > 14 && m.phase !== "serve_wait") {
      for (let i = 0;i < this.trail.length - 1; i++) {
        const t = this.trail[i];
        const c = i < 2 ? "#7a9a1a" : i < 4 ? "#a9d02a" : "#cdee3a";
        px(ctx, t.sx, t.sy, c, i > 3 ? 2 : 1);
      }
    } else if (sp < 14) {
      this.trail.length = 0;
    }
    const r = clamp(0.1 * p.ppm, 1.6, 2.8);
    disc(ctx, p.sx, p.sy, r + 0.6, "#1d3a10");
    disc(ctx, p.sx, p.sy, r, "#d4ff2a");
    px(ctx, p.sx - r * 0.4, p.sy - r * 0.45, "#fbffc8");
  }
  drawParticles(ctx, dt) {
    const p = this.proj;
    for (const q of this.particles) {
      q.life += dt;
      q.vz -= 9.8 * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.z = Math.max(0, q.z + q.vz * dt);
      project(q.x, q.y, q.z, p);
      if (q.life < q.max)
        px(ctx, p.sx, p.sy, q.color, q.life < q.max * 0.5 ? 2 : 1);
    }
    this.particles = this.particles.filter((q) => q.life < q.max);
  }
  drawPopups(ctx, dt) {
    for (const pp of this.popups)
      pp.t += dt;
    this.popups = this.popups.filter((pp) => pp.t < pp.dur);
    let i = 0;
    for (const pp of this.popups) {
      const f = pp.t / pp.dur;
      const y = pp.y - Math.round(f * 10) - i * 14;
      if (f > 0.75 && Math.floor(pp.t * 18) % 2 === 0)
        continue;
      drawText(ctx, pp.text, W / 2, y, pp.color, 2, "#0b1230", "center");
      i++;
    }
  }
  drawScoreboard(ctx, m) {
    const a = this.proj;
    const b = this.proj2;
    project(-3.9, BOARD_Y - 0.5, 3.3, a);
    project(3.9, BOARD_Y - 0.5, 1.5, b);
    const x = Math.round(a.sx);
    const y = Math.round(a.sy);
    const w = Math.round(b.sx - a.sx);
    const h = Math.round(b.sy - a.sy);
    rect(ctx, x - 2, y - 2, w + 4, h + 4, "#10131c");
    rect(ctx, x, y, w, h, "#05070d");
    const s = m.score;
    const rows = [0, 1];
    rows.forEach((i, r) => {
      const name = m.players[i].def.shortName.slice(0, 9);
      const ty = y + 3 + r * 8;
      drawText(ctx, name, x + 3, ty, "#ffd24a");
      if (m.server === i && m.phase !== "match_end")
        px(ctx, x + w - 4, ty + 2, "#6cff6c", 2);
      let cx = x + 44;
      for (const st of s.sets) {
        drawText(ctx, String(st.games[i]), cx, ty, "#8fb8ff");
        cx += 5;
      }
      const g = String(s.games[i]);
      drawText(ctx, g, cx, ty, "#ffffff");
      cx += textWidth(g) + 3;
      drawText(ctx, s.pointText(i), x + w - 18 - (s.pointText(i).length > 1 ? 0 : 2), ty, "#ffd24a");
    });
  }
  flash() {
    this.flashWhite = 0.5;
  }
  celebrate() {
    this.crowd.cheer(1);
  }
}

// tests/visual/main.ts
var canvas = document.getElementById("c");
var m = new Match({ p0: ROSTER[3], p1: ROSTER[4], humanIdx: null, difficulty: "normal", seed: 5, firstServer: 0 }, [new AIController(1), new AIController(2)]);
var r = new Renderer(canvas);
window.advance = (sec) => {
  const n = Math.round(sec / DT);
  for (let i = 0;i < n; i++) {
    m.step(DT);
  }
  r.handleEvents(m.drainEvents());
  r.draw(m, 1 / 60);
};
window.state = () => JSON.stringify({ phase: m.phase, t: m.time, score: m.score.points });
window.ready = true;
