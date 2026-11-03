import { Match, MatchConfig } from '../src/game/match';
import { AIController } from '../src/ai/ai';
import { ROSTER } from '../src/players/roster';
import { DT } from '../src/engine/constants';

function simulate(p0: number, p1: number, seed: number, maxSeconds = 4000) {
  const cfg: MatchConfig = { p0: ROSTER[p0], p1: ROSTER[p1], humanIdx: null, difficulty: 'normal', seed, fast: true };
  const m = new Match(cfg, [new AIController(seed + 1), new AIController(seed + 2)]);
  m.recordEvents = false;
  let steps = 0;
  const t0 = Date.now();
  while (m.phase !== 'match_end' && m.time < maxSeconds) {
    m.step(DT);
    steps++;
  }
  return { m, steps, ms: Date.now() - t0 };
}

const r = simulate(0, 1, 7);
const m = r.m;
console.log('fase', m.phase, 'temps joc', m.time.toFixed(0), 's', 'steps', r.steps, 'ms', r.ms);
console.log('sets', JSON.stringify(m.score.sets), 'guanyador', m.score.winner);
console.log('stats', JSON.stringify(m.stats));
