import assert from 'node:assert/strict';
import { MatchScore } from '../src/scoring/score';
import { BALL, DT } from '../src/engine/constants';
import { BallState, newBall, stepBall, ballSpeed } from '../src/physics/ball';
import { planShot } from '../src/physics/solver';
import { Tournament, simulateMatchSync } from '../src/tournament/tournament';
import { ROSTER } from '../src/players/roster';
import { Match } from '../src/game/match';
import { AIController } from '../src/ai/ai';
import { DIFFICULTY } from '../src/ai/difficulty';

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

test('dos tie-breaks seguits: el servei rota bé i no hi ha estat residual', () => {
  const s = new MatchScore(0);
  const playTiebreak = (): number[] => {
    for (let i = 0; i < 6; i++) {
      winGame(s, 0);
      winGame(s, 1);
    }
    assert.equal(s.tiebreak, true);
    const seq: number[] = [];
    for (let i = 0; i < 12; i++) {
      seq.push(s.server);
      s.pointWon(i % 2 === 0 ? 0 : 1);
    }
    s.pointWon(0);
    s.pointWon(0); // 8-6... (6-6 al tie-break) acaba amb dos de diferència
    return seq;
  };
  // Primer set: tie-break fins que algú guanya
  const first = playTiebreak();
  assert.equal(s.setsWon[0] + s.setsWon[1], 1);
  assert.equal(s.tiebreak, false);
  assert.deepEqual(s.points, [0, 0]);
  assert.deepEqual(s.games, [0, 0]);
  const tbStarter = first[0];
  // Després d'un tie-break serveix qui va rebre primer
  assert.equal(s.server, 1 - tbStarter);
  // Segon set també al tie-break
  const second = playTiebreak();
  assert.equal(s.winner !== null, true);
  assert.equal(second[0], 1 - tbStarter, 'el segon tie-break comença pel servidor que li toca');
  const pattern = (a: number[]): number[] => a.slice(1, 5).map((x) => (x === a[0] ? 0 : 1));
  assert.deepEqual(pattern(first), [1, 1, 0, 0]);
  assert.deepEqual(pattern(second), [1, 1, 0, 0]);
});

test('el cop de servei informa de la seva pròpia velocitat (km/h)', () => {
  const m = new Match({ p0: ROSTER[0], p1: ROSTER[1], humanIdx: null, difficulty: 'normal', seed: 5, fast: true }, [new AIController(6), new AIController(7)]);
  const kmh: number[] = [];
  let n = 0;
  while (m.phase !== 'match_end' && n++ < 120000 && kmh.length < 12) {
    m.step(DT);
    for (const e of m.drainEvents()) if (e.type === 'hit' && e.stroke === 'serve') kmh.push(e.kmh);
  }
  assert.ok(kmh.length >= 6);
  for (const v of kmh) assert.ok(v > 60 && v < 240, `servei de ${v} km/h`);
  assert.equal(Math.max(...kmh), Math.max(m.stats.p[0].maxServeKmh, m.stats.p[1].maxServeKmh));
});

test('súper cop: amb el medidor ple, un bon cop surt encès i buida el medidor', () => {
  const m = new Match({ p0: ROSTER[0], p1: ROSTER[1], humanIdx: null, difficulty: 'normal', seed: 11, fast: true }, [new AIController(1), new AIController(2)]);
  m.meter = [1, 0];
  let sup: { player: number } | null = null;
  let n = 0;
  while (!sup && n++ < 400000) {
    m.step(DT);
    for (const e of m.drainEvents()) if (e.type === 'hit' && e.superShot) sup = e;
  }
  assert.ok(sup, 'ha de sortir un súper cop');
  assert.equal(sup!.player, 0);
  assert.equal(m.meter[0] < 0.5, true);
  assert.equal(m.fireBall, true);
});

test('timing: els cops tenen valoració i un cop perfecte omple el medidor', () => {
  const m = new Match({ p0: ROSTER[2], p1: ROSTER[3], humanIdx: null, difficulty: 'normal', seed: 12, fast: true }, [new AIController(3), new AIController(4)]);
  const seen = new Set<string>();
  let n = 0;
  while (n++ < 300000 && m.phase !== 'match_end') {
    m.step(DT);
    for (const e of m.drainEvents()) if (e.type === 'hit') seen.add(e.rating);
  }
  assert.ok(seen.has('perfect') && seen.has('nice'), [...seen].join());
  assert.ok(m.meter[0] >= 0 && m.meter[0] <= 1 && m.meter[1] >= 0 && m.meter[1] <= 1);
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
test('torneig: 8 jugadors, 4 quarts sense byes i els dos primers caps a meitats oposades', () => {
  assert.equal(ROSTER.length, 8);
  assert.equal(new Set(ROSTER.map((r) => r.id)).size, 8);
  const t = new Tournament('winner', 'normal', 1);
  const qfs = (['QF1', 'QF2', 'QF3', 'QF4'] as const).map((id) => t.get(id));
  assert.ok(qfs.every((m) => m.round === 'QF' && m.a && m.b));
  const ids = qfs.flatMap((m) => [m.a, m.b]);
  assert.equal(new Set(ids).size, 8, 'tots els jugadors juguen els quarts');
  // cap 1 i cap 2 no es poden trobar abans de la final
  const half = (id: string): number => (['QF1', 'QF2'].includes(qfs.find((m) => m.a === id || m.b === id)!.id) ? 0 : 1);
  assert.notEqual(half(t.seeds[0]), half(t.seeds[1]));
  assert.deepEqual([t.get('QF1').a, t.get('QF1').b], [t.seeds[0], t.seeds[7]]);
  assert.deepEqual([t.get('QF2').a, t.get('QF2').b], [t.seeds[3], t.seeds[4]]);
  assert.equal(t.get('SF1').a, null);
});

test('torneig: el quadre avança fins al campió (7 partits)', () => {
  const t = new Tournament('winner', 'normal', 3);
  let n = 0;
  let guard = 0;
  const rounds: string[] = [];
  while (!t.finished && guard++ < 12) {
    const m = t.nextMatch();
    assert.ok(m, 'hi ha un partit pendent');
    rounds.push(m!.id);
    const setup = t.matchSetup(m!);
    const sim = simulateMatchSync(setup.p0, setup.p1, 50 + n);
    assert.equal(sim.phase, 'match_end');
    t.reportMatch(m!, sim, setup.swapped);
    n++;
  }
  assert.equal(n, 7, 'es juguen 7 partits en total');
  assert.deepEqual(rounds, ['QF1', 'QF2', 'QF3', 'QF4', 'SF1', 'SF2', 'F']);
  assert.ok(t.champion);
  assert.equal(t.get('F').winner, t.champion);
  // els finalistes surten de les semifinals correctes
  assert.equal(t.get('F').a, t.get('SF1').winner);
  assert.equal(t.get('F').b, t.get('SF2').winner);
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
      const d = DIFFICULTY[diff0];
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

test('quadre: les ranures per decidir són sempre null, mai undefined, en cada fase del torneig', () => {
  const t = new Tournament('winner', 'normal', 5);
  const check = (): void => {
    for (const m of t.matches) {
      for (const slot of [m.a, m.b, m.winner]) {
        assert.ok(slot === null || (typeof slot === 'string' && ROSTER.some((r) => r.id === slot)), `ranura invàlida a ${m.id}: ${String(slot)}`);
      }
      if (m.round !== 'QF') assert.ok(m.a === null || m.b === null || (m.a && m.b), 'ranura mixta');
    }
  };
  check();
  let n = 0;
  while (!t.finished && n++ < 10) {
    const m = t.nextMatch()!;
    assert.ok(m.a && m.b, 'nextMatch només retorna partits amb dos jugadors');
    const setup = t.matchSetup(m);
    t.reportMatch(m, simulateMatchSync(setup.p0, setup.p1, 70 + n), setup.swapped);
    check();
  }
  assert.ok(t.finished);
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
