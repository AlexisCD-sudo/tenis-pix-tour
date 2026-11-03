import { AIController } from '../ai/ai';
import { Difficulty } from '../ai/difficulty';
import { DT } from '../engine/constants';
import { Match, MatchStats } from '../game/match';
import { PlayerDef, ROSTER, getPlayerDef } from '../players/roster';
import { SetScore } from '../scoring/score';

export type Round = 'QF' | 'SF' | 'F';
export type MatchId = 'QF1' | 'QF2' | 'SF1' | 'SF2' | 'F';

export interface BracketMatch {
  id: MatchId;
  round: Round;
  /** Ids de jugador (null = encara per decidir). */
  a: string | null;
  b: string | null;
  winner: string | null;
  sets: SetScore[] | null;
  /** Estadístiques (si s'ha jugat). */
  stats?: MatchStats;
}

export interface MatchOutcome {
  winnerIdx: 0 | 1;
  sets: SetScore[];
  stats: MatchStats;
}

export const ROUND_LABEL: Record<Round, string> = { QF: 'QUARTS DE FINAL', SF: 'SEMIFINALS', F: 'FINAL' };

export function formatSets(sets: SetScore[], flip = false): string {
  return sets
    .map((s) => {
      const [a, b] = flip ? [s.games[1], s.games[0]] : s.games;
      const tb = s.tiebreak ? `(${Math.min(s.tiebreak[0], s.tiebreak[1])})` : '';
      return `${a}-${b}${tb}`;
    })
    .join(' ');
}

/**
 * Quadre de 6 jugadors: els dos primers caps de sèrie passen directament
 * a semifinals; la resta juguen quarts de final.
 *   QF1: cap 4 - cap 5   -> SF1 contra el cap 1
 *   QF2: cap 3 - cap 6   -> SF2 contra el cap 2
 */
export class Tournament {
  readonly matches: BracketMatch[];
  /** Ids ordenats per cap de sèrie (0 = cap 1). */
  readonly seeds: string[];
  champion: string | null = null;

  constructor(
    readonly humanId: string,
    readonly difficulty: Difficulty,
    readonly seed: number,
  ) {
    const ranked = [...ROSTER].sort((a, b) => b.rating - a.rating || a.id.localeCompare(b.id)).map((p) => p.id);
    this.seeds = ranked;
    const s = ranked;
    this.matches = [
      { id: 'QF1', round: 'QF', a: s[3], b: s[4], winner: null, sets: null },
      { id: 'QF2', round: 'QF', a: s[2], b: s[5], winner: null, sets: null },
      { id: 'SF1', round: 'SF', a: s[0], b: null, winner: null, sets: null },
      { id: 'SF2', round: 'SF', a: s[1], b: null, winner: null, sets: null },
      { id: 'F', round: 'F', a: null, b: null, winner: null, sets: null },
    ];
  }

  get(id: MatchId): BracketMatch {
    return this.matches.find((m) => m.id === id)!;
  }

  seedOf(id: string): number {
    return this.seeds.indexOf(id) + 1;
  }

  /** Següent partit llest per jugar (en ordre), o null si s'ha acabat. */
  nextMatch(): BracketMatch | null {
    for (const m of this.matches) if (m.a && m.b && !m.winner) return m;
    return null;
  }

  involvesHuman(m: BracketMatch): boolean {
    return m.a === this.humanId || m.b === this.humanId;
  }

  get humanEliminated(): boolean {
    return this.matches.some((m) => m.winner && this.involvesHuman(m) && m.winner !== this.humanId);
  }

  get finished(): boolean {
    return this.champion !== null;
  }

  /** Registra el resultat d'un partit i fa avançar el quadre. */
  report(id: MatchId, winnerId: string, sets: SetScore[], stats?: MatchStats): void {
    const m = this.get(id);
    m.winner = winnerId;
    m.sets = sets;
    m.stats = stats;
    if (id === 'QF1') this.get('SF1').b = winnerId;
    if (id === 'QF2') this.get('SF2').b = winnerId;
    if (id === 'SF1') this.get('F').a = winnerId;
    if (id === 'SF2') this.get('F').b = winnerId;
    if (id === 'F') this.champion = winnerId;
  }

  /** Posa el jugador humà a la banda propera (índex 0) i en retorna la config. */
  matchSetup(m: BracketMatch): { p0: PlayerDef; p1: PlayerDef; humanIdx: 0 | null; swapped: boolean } {
    const a = getPlayerDef(m.a!);
    const b = getPlayerDef(m.b!);
    if (m.b === this.humanId) return { p0: b, p1: a, humanIdx: 0, swapped: true };
    return { p0: a, p1: b, humanIdx: m.a === this.humanId ? 0 : null, swapped: false };
  }

  /** Aplica el resultat d'un Match acabat (tenint en compte l'ordre dels jugadors). */
  reportMatch(m: BracketMatch, match: Match, swapped: boolean): void {
    const winnerIdx = match.score.winner ?? 0;
    const p = swapped ? ([match.cfg.p1, match.cfg.p0] as const) : ([match.cfg.p0, match.cfg.p1] as const);
    const winnerId = (winnerIdx === 0 ? match.cfg.p0 : match.cfg.p1).id;
    // Conserva l'ordre a/b del quadre en els sets
    const sets = swapped ? match.score.sets.map((s) => ({ games: [s.games[1], s.games[0]] as [number, number], tiebreak: s.tiebreak ? ([s.tiebreak[1], s.tiebreak[0]] as [number, number]) : undefined })) : match.score.sets;
    void p;
    this.report(m.id, winnerId, sets, match.stats);
  }
}

/** Simula un partit complet IA contra IA en blocs per no bloquejar la pàgina. */
export function simulateMatch(
  p0: PlayerDef,
  p1: PlayerDef,
  seed: number,
  onProgress?: (m: Match) => void,
): Promise<Match> {
  const m = new Match(
    { p0, p1, humanIdx: null, difficulty: 'normal', seed, fast: true },
    [new AIController(seed + 11), new AIController(seed + 23)],
  );
  m.recordEvents = false;
  return new Promise((resolve) => {
    const chunk = (): void => {
      let n = 0;
      while (m.phase !== 'match_end' && n < 6000 && m.time < 20000) {
        m.step(DT);
        n++;
      }
      onProgress?.(m);
      if (m.phase === 'match_end' || m.time >= 20000) resolve(m);
      else setTimeout(chunk, 0);
    };
    chunk();
  });
}

/** Simulació síncrona (tests). */
export function simulateMatchSync(p0: PlayerDef, p1: PlayerDef, seed: number): Match {
  const m = new Match(
    { p0, p1, humanIdx: null, difficulty: 'normal', seed, fast: true },
    [new AIController(seed + 11), new AIController(seed + 23)],
  );
  m.recordEvents = false;
  while (m.phase !== 'match_end' && m.time < 20000) m.step(DT);
  return m;
}
