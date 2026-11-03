// Equilibri del quadre de 8: cada tennista contra tots els altres (IA normal vs IA normal).
import { ROSTER } from '../src/players/roster';
import { simulateMatchSync } from '../src/tournament/tournament';
const w: Record<string, number> = {};
const n = 2;
for (let i = 0; i < ROSTER.length; i++)
  for (let j = i + 1; j < ROSTER.length; j++)
    for (let k = 0; k < n; k++) {
      const a = k % 2 ? j : i;
      const b = k % 2 ? i : j;
      const m = simulateMatchSync(ROSTER[a], ROSTER[b], 1000 + i * 100 + j * 10 + k);
      const win = (m.score.winner === 0 ? ROSTER[a] : ROSTER[b]).shortName;
      w[win] = (w[win] ?? 0) + 1;
    }
const games = ((ROSTER.length * (ROSTER.length - 1)) / 2) * n;
console.log(`${games} partits`);
for (const [k, v] of Object.entries(w).sort((a, b) => b[1] - a[1])) console.log(k.padEnd(12), v, '/', (ROSTER.length - 1) * n);
