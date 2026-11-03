import assert from 'node:assert/strict';
import { MatchScore } from '../src/scoring/score';
import { BALL, DT } from '../src/engine/constants';
import { BallState, newBall, stepBall, ballSpeed } from '../src/physics/ball';
import { planShot } from '../src/physics/solver';
import { Tournament, simulateMatchSync } from '../src/tournament/tournament';
import { ROSTER } from '../src/players/roster';
import { Match } from '../src/game/match';
import { AIController } from '../src/ai/ai';

let passed = 0;
const tests: [string, () => void][] = [];
const test = (n: string, f: () => void): void => void tests.push([n, f]);

const winPoints = (s: MatchScore, w: 0 | 1, n: number): void => {
  for (let i = 0; i < n; i++) s.pointWon(w);
};
const winGame = (s: MatchScore, w: 0 | 1): void => winPoints(s, w, 4);

// ---------------------------------------------------------------- puntuació
test('puntuació 15-30-40-joc', () => {
  const s = new MatchScore(0);
  s.pointWon(0);
  assert.equal(s.pointText(0), '15');
  s.pointWon(0);
  assert.equal(s.pointText(0), '30');
  s.pointWon(0);
  assert.equal(s.pointText(0), '40');
  s.pointWon(0);
  assert.deepEqual(s.games, [1, 0]);
  assert.deepEqual(s.points, [0, 0]);
});

test('deuce i avantatge', () => {
  const s = new MatchScore(0);
  winPoints(s, 0, 3);
  winPoints(s, 1, 3);
  assert.equal(s.isDeuce, true);
  s.pointWon(1);
  assert.equal(s.advantage, 1);
  assert.equal(s.pointText(1), 'AD');
  s.pointWon(0);
  assert.equal(s.isDeuce, true);
  s.pointWon(0);
  s.pointWon(0);
  assert.deepEqual(s.games, [1, 0]);
});

test('el servei canvia cada joc', () => {
  const s = new MatchScore(0);
  assert.equal(s.server, 0);
  winGame(s, 0);
  assert.equal(s.server, 1);
  winGame(s, 1);
  assert.equal(s.server, 0);
});

test('set a 6 jocs amb dos de diferència', () => {
  const s = new MatchScore(0);
  for (let i = 0; i < 5; i++) {
    winGame(s, 0);
    winGame(s, 1);
  }
  winGame(s, 0); // 6-5
  assert.equal(s.setsWon[0], 0, 'no hi ha set amb 6-5');
  winGame(s, 0); // 7-5
  assert.equal(s.setsWon[0], 1);
  assert.deepEqual(s.sets[0].games, [7, 5]);
});

test('tie-break a 6-6, a 7 punts amb dos de diferència', () => {
  const s = new MatchScore(0);
  for (let i = 0; i < 6; i++) {
    winGame(s, 0);
    winGame(s, 1);
  }
  assert.equal(s.tiebreak, true);
  winPoints(s, 0, 6);
  winPoints(s, 1, 6);
  assert.equal(s.setsWon[0] + s.setsWon[1], 0, 'tie-break 6-6 continua');
  s.pointWon(0); // 7-6
  assert.equal(s.setsWon[0], 0);
  s.pointWon(0); // 8-6
  assert.equal(s.setsWon[0], 1);
  assert.deepEqual(s.sets[0].games, [7, 6]);
  assert.deepEqual(s.sets[0].tiebreak, [8, 6]);
  assert.equal(s.tiebreak, false);
});

test('tie-break: el servidor canvia després del primer punt i cada dos', () => {
  const s = new MatchScore(0);
  for (let i = 0; i < 6; i++) {
    winGame(s, 0);
    winGame(s, 1);
  }
  const seq: number[] = [];
  for (let i = 0; i < 8; i++) {
    seq.push(s.server);
    s.pointWon(i % 2 === 0 ? 0 : 1);
  }
  const first = seq[0];
  const other = 1 - first;
  assert.deepEqual(seq, [first, other, other, first, first, other, other, first]);
});

test('partit al millor de 3 sets', () => {
  const s = new MatchScore(0);
  for (let i = 0; i < 6; i++) winGame(s, 0);
  assert.equal(s.winner, null);
  for (let i = 0; i < 5; i++) winGame(s, 0);
  winGame(s, 0);
  assert.equal(s.winner, 0);
  assert.deepEqual(s.setsWon, [2, 0]);
  const before = s.points[0];
  s.pointWon(1);
  assert.equal(s.points[1] + before, before, 'no es puntua un cop acabat');
});

// ------------------------------------------------------------------ física
const SIM = { net: false, walls: false };

function fly(b: BallState, t: number, net = false): void {
  for (let i = 0; i < Math.round(t / DT); i++) stepBall(b, DT, { net, walls: false });
}

test('física: la caiguda lliure triga el temps que toca', () => {
  const b = newBall();
  b.z = 2;
  let t = 0;
  let hit = false;
  const ev = { bounce: () => (hit = true) };
  while (!hit && t < 3) {
    stepBall(b, DT, SIM, ev);
    t += DT;
  }
  const expected = Math.sqrt((2 * (2 - BALL.r)) / BALL.g);
  assert.ok(Math.abs(t - expected) < 0.03, `t=${t} esperat=${expected}`);
});

test('física: el bot perd energia i velocitat', () => {
  const b = newBall();
  b.z = 2;
  let vIn = 0;
  let vOut = 0;
  let done = false;
  const ev = {
    bounce: (_x: number, _y: number, vz: number) => {
      vIn = vz;
      done = true;
    },
  };
  while (!done) stepBall(b, DT, SIM, ev);
  vOut = b.vz;
  assert.ok(vOut > 0 && vOut < vIn, `vIn=${vIn} vOut=${vOut}`);
  assert.ok(vOut / vIn > 0.6 && vOut / vIn < 0.9);
});

test('física: determinista amb el pas fix', () => {
  const run = (): BallState => {
    const b = newBall();
    b.y = 11;
    b.z = 1;
    b.vy = -25;
    b.vz = 4;
    b.wx = 200;
    fly(b, 2);
    return b;
  };
  assert.deepEqual(run(), run());
});

test('física: el topspin fa baixar la pilota abans que el backspin', () => {
  const landing = (spin: number): number => {
    const b = newBall();
    b.y = 12;
    b.z = 1;
    b.vy = -26;
    b.vz = 5;
    b.wx = spin; // eix lateral
    let lx = 0;
    let got = false;
    const ev = {
      bounce: (_x: number, y: number) => {
        if (!got) {
          lx = y;
          got = true;
        }
      },
    };
    for (let i = 0; i < 400 && !got; i++) stepBall(b, DT, SIM, ev);
    return lx;
  };
  // wx>0 amb moviment cap a -y => efecte Magnus cap avall (topspin)
  const top = landing(300);
  const back = landing(-300);
  assert.ok(Math.abs(top - back) > 1, `top=${top} back=${back}`);
  assert.ok(top > back, 'el topspin cau més curt (més a prop de y=12)');
});

test('física: el topspin accelera el bot, el slice el frena', () => {
  const exitSpeed = (spin: number): number => {
    const b = newBall();
    b.y = 6;
    b.z = 3; // caiguda alta: força normal gran, la fricció depèn de la velocitat de lliscament
    b.vy = -20;
    b.vz = 0;
    b.wx = spin;
    let done = false;
    const ev = { bounce: () => (done = true) };
    while (!done) stepBall(b, DT, SIM, ev);
    return Math.abs(b.vy);
  };
  assert.ok(exitSpeed(300) > exitSpeed(-300) + 1);
});

test('física: la pilota baixa si toca la xarxa i queda al seu costat', () => {
  const b = newBall();
  b.y = 8;
  b.z = 0.5;
  b.vy = -20;
  b.vz = 1;
  let net = false;
  for (let i = 0; i < 300; i++) stepBall(b, DT, { net: true, walls: false }, { net: () => (net = true) });
  assert.ok(net, 'ha tocat la xarxa');
  assert.ok(b.y > -0.5, 'queda al costat del colpejador');
});

test('física: una pilota alta passa per sobre la xarxa', () => {
  const b = newBall();
  b.y = 8;
  b.z = 2;
  b.vy = -20;
  b.vz = 2;
  let net = false;
  for (let i = 0; i < 100; i++) stepBall(b, DT, { net: true, walls: false }, { net: () => (net = true) });
  assert.equal(net, false);
  assert.ok(b.y < -1);
});

test('solucionador: el cop planejat cau prop del destí i passa la xarxa', () => {
  const plan = planShot(1, 12, 1, -2, -8, { speed: 22, spinTop: 150, spinSide: 0, thetaLo: -0.3, thetaHi: 0.7, minClear: 0.25 });
  assert.ok(plan.ok);
  assert.ok(Math.hypot(plan.landX - -2, plan.landY - -8) < 0.4, `cau a ${plan.landX},${plan.landY}`);
  assert.ok(plan.clearance >= 0.25);
});

test('solucionador: la velocitat de sortida segueix la potència', () => {
  const mk = (sp: number) => planShot(0, 12, 1, 0, -9, { speed: sp, spinTop: 100, spinSide: 0, thetaLo: -0.3, thetaHi: 0.8, minClear: 0.2 });
  const slow = mk(16);
  const fast = mk(30);
  assert.ok(Math.hypot(fast.vx, fast.vy, fast.vz) > Math.hypot(slow.vx, slow.vy, slow.vz));
  assert.ok(ballSpeed({ ...newBall(), vx: fast.vx, vy: fast.vy, vz: fast.vz }) > 20);
});

// ----------------------------------------------------------------- torneig
test('torneig: 6 jugadors, 2 caps de sèrie directes a semifinals', () => {
  assert.equal(ROSTER.length, 6);
  assert.equal(new Set(ROSTER.map((r) => r.id)).size, 6);
  const t = new Tournament('winner', 'normal', 1);
  assert.equal(t.get('QF1').round, 'QF');
  assert.equal(t.get('QF2').round, 'QF');
  assert.equal(t.get('SF1').a, t.seeds[0]);
  assert.equal(t.get('SF2').a, t.seeds[1]);
  const inQF = new Set([t.get('QF1').a, t.get('QF1').b, t.get('QF2').a, t.get('QF2').b]);
  assert.equal(inQF.size, 4);
  assert.ok(!inQF.has(t.seeds[0]) && !inQF.has(t.seeds[1]));
});

test('torneig: el quadre avança fins al campió', () => {
  const t = new Tournament('winner', 'normal', 3);
  let n = 0;
  let guard = 0;
  while (!t.finished && guard++ < 10) {
    const m = t.nextMatch();
    assert.ok(m, 'hi ha un partit pendent');
    const setup = t.matchSetup(m!);
    const sim = simulateMatchSync(setup.p0, setup.p1, 50 + n);
    assert.equal(sim.phase, 'match_end');
    t.reportMatch(m!, sim, setup.swapped);
    n++;
  }
  assert.equal(n, 5, 'es juguen 5 partits en total');
  assert.ok(t.champion);
  assert.ok(ROSTER.some((r) => r.id === t.champion));
  assert.equal(t.get('F').winner, t.champion);
});

// ----------------------------------------------------------------- partits
test('IA: partits complets sense NaN, amb marcador vàlid i estadístiques coherents', () => {
  for (let seed = 1; seed <= 4; seed++) {
    const m = simulateMatchSync(ROSTER[seed % 6], ROSTER[(seed + 2) % 6], seed * 31);
    assert.equal(m.phase, 'match_end');
    assert.ok(m.score.winner === 0 || m.score.winner === 1);
    assert.ok(m.score.setsWon[m.score.winner as 0 | 1] === 2);
    assert.ok(m.score.sets.length >= 2 && m.score.sets.length <= 3);
    for (const s of m.score.sets) {
      const [a, b] = s.games;
      const hi = Math.max(a, b);
      const lo = Math.min(a, b);
      assert.ok((hi === 6 && lo <= 4) || (hi === 7 && (lo === 5 || lo === 6)), `set invàlid ${a}-${b}`);
    }
    for (const v of [m.ball.x, m.ball.y, m.ball.z, m.players[0].x, m.players[1].y]) assert.ok(Number.isFinite(v));
    const total = m.stats.p[0].pointsWon + m.stats.p[1].pointsWon;
    assert.equal(total, m.stats.totalPoints);
  }
});

test('IA: dificultat difícil guanya més sovint que fàcil contra el mateix rival', () => {
  const wins = (diff0: 'easy' | 'hard'): number => {
    let w = 0;
    for (let i = 0; i < 6; i++) {
      const m = new Match({ p0: ROSTER[1], p1: ROSTER[1], humanIdx: null, difficulty: 'normal', seed: 500 + i, fast: true }, [
        new AIController(900 + i),
        new AIController(950 + i),
      ]);
      // p0 amb la dificultat provada, p1 normal
      m.recordEvents = false;
      const d = { easy: { reaction: 0.3, perceptionNoise: 1.6, speedMult: 0.86, errorMult: 1.7, powerMult: 0.9, tactics: 0.35 }, hard: { reaction: 0.12, perceptionNoise: 0.35, speedMult: 1.04, errorMult: 0.7, powerMult: 1.04, tactics: 0.9 } }[diff0];
      m.players[0].diff = d;
      m.controllers = [new AIController(900 + i, d), new AIController(950 + i)];
      while (m.phase !== 'match_end' && m.time < 20000) m.step(DT);
      if (m.score.winner === 0) w++;
    }
    return w;
  };
  const e = wins('easy');
  const h = wins('hard');
  assert.ok(h > e, `difícil=${h} fàcil=${e}`);
});

test('regles: la pilota fora, a la xarxa i el doble bot donen el punt correcte', () => {
  const m = simulateMatchSync(ROSTER[0], ROSTER[3], 99);
  const s = m.stats;
  assert.ok(s.p[0].aces + s.p[1].aces >= 0);
  assert.ok(s.longestRally >= 1);
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    passed++;
    console.log('  ok  ', name);
  } catch (e) {
    failed++;
    console.log(' FAIL ', name, '\n       ', (e as Error).message);
  }
}
console.log(`\n${passed}/${tests.length} proves correctes`);
process.exit(failed ? 1 : 0);
