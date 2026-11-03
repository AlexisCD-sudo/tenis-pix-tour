import { Match, MatchConfig } from '../src/game/match';
import { AIController } from '../src/ai/ai';
import { ROSTER } from '../src/players/roster';
import { DT } from '../src/engine/constants';
import { Difficulty } from '../src/ai/difficulty';

function run(p0: number, p1: number, seed: number, diff: Difficulty = 'normal') {
  const cfg: MatchConfig = { p0: ROSTER[p0], p1: ROSTER[p1], humanIdx: null, difficulty: diff, seed, fast: true };
  const m = new Match(cfg, [new AIController(seed + 1), new AIController(seed + 2)]);
  m.recordEvents = false;
  while (m.phase !== 'match_end' && m.time < 20000) m.step(DT);
  return m;
}
const pairs: [number, number][] = [[0, 1], [2, 3], [4, 5], [1, 4], [3, 5], [0, 2]];
let tot = { pts: 0, err: 0, win: 0, ace: 0, df: 0, fsi: 0, fst: 0, rally: 0, time: 0, games: 0, matches: 0 };
let stamina: number[] = [];
for (let i = 0; i < pairs.length; i++) {
  const m = run(pairs[i][0], pairs[i][1], 100 + i * 17);
  const s = m.stats;
  tot.pts += s.totalPoints; tot.err += s.p[0].errors + s.p[1].errors; tot.win += s.p[0].winners + s.p[1].winners;
  tot.ace += s.p[0].aces + s.p[1].aces; tot.df += s.p[0].doubleFaults + s.p[1].doubleFaults;
  tot.fsi += s.p[0].firstServeIn + s.p[1].firstServeIn; tot.fst += s.p[0].firstServeTotal + s.p[1].firstServeTotal;
  tot.time += s.duration; tot.matches++;
  tot.games += m.score.sets.reduce((a, x) => a + x.games[0] + x.games[1], 0);
  stamina.push(+m.players[0].stamina.toFixed(2), +m.players[1].stamina.toFixed(2));
  console.log(ROSTER[pairs[i][0]].shortName, 'vs', ROSTER[pairs[i][1]].shortName, JSON.stringify(m.score.sets.map(x => x.games.join('-') + (x.tiebreak ? `(${x.tiebreak.join('-')})` : ''))), 'pts', s.totalPoints, 'long', s.longestRally, 'min', (s.duration / 60).toFixed(0));
}
console.log('per match: pts', (tot.pts / tot.matches).toFixed(0), 'err/pt', (tot.err / tot.pts).toFixed(2), 'win/pt', (tot.win / tot.pts).toFixed(2), 'ace/pt', (tot.ace / tot.pts).toFixed(3), 'df', tot.df, '1st%', (100 * tot.fsi / tot.fst).toFixed(0), 'avg min', (tot.time / tot.matches / 60).toFixed(0));
console.log('stamina end', stamina.join(' '));
