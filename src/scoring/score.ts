/**
 * Sistema de puntuació oficial de tennis:
 *  - 0/15/30/40/joc amb deuce i avantatge
 *  - set a 6 jocs amb diferència de 2
 *  - tie-break a 6-6 (a 7 punts amb diferència de 2)
 *  - partit al millor de 3 sets
 */
export type Side = 0 | 1;

export interface SetScore {
  games: [number, number];
  /** Punts del tie-break (només si n'hi va haver). */
  tiebreak?: [number, number];
}

export interface PointOutcome {
  gameWon: boolean;
  setWon: boolean;
  matchWon: boolean;
}

export class MatchScore {
  sets: SetScore[] = [];
  games: [number, number] = [0, 0];
  points: [number, number] = [0, 0];
  setsWon: [number, number] = [0, 0];
  tiebreak = false;
  /** Servidor del joc actual (fora de tie-break). */
  private gameServer: Side;
  private tbFirst: Side = 0;
  winner: Side | null = null;
  readonly bestOf: number;

  constructor(firstServer: Side, bestOf = 3) {
    this.gameServer = firstServer;
    this.bestOf = bestOf;
  }

  get setsToWin(): number {
    return Math.ceil(this.bestOf / 2);
  }

  /** Servidor del punt actual. */
  get server(): Side {
    if (!this.tiebreak) return this.gameServer;
    const n = this.points[0] + this.points[1];
    return (((n + 1) >> 1) % 2 === 0 ? this.tbFirst : ((1 - this.tbFirst) as Side)) as Side;
  }

  /** Costat de servei: true = pista de deuce (dreta), false = avantatge. */
  get deuceCourt(): boolean {
    return (this.points[0] + this.points[1]) % 2 === 0;
  }

  get totalPoints(): number {
    return this.points[0] + this.points[1];
  }

  /** Marca el punt per a `w`. */
  pointWon(w: Side): PointOutcome {
    const o = (1 - w) as Side;
    const out: PointOutcome = { gameWon: false, setWon: false, matchWon: false };
    if (this.winner !== null) return out;
    this.points[w]++;

    if (this.tiebreak) {
      if (this.points[w] >= 7 && this.points[w] - this.points[o] >= 2) {
        out.gameWon = true;
        this.games[w]++;
        this.finishSet(w, [this.points[0], this.points[1]]);
        out.setWon = true;
        out.matchWon = this.winner !== null;
        // Qui ha restat primer al tie-break, serveix primer al següent set
        this.gameServer = (1 - this.tbFirst) as Side;
        this.tiebreak = false;
        this.points = [0, 0];
      }
      return out;
    }

    if (this.points[w] >= 4 && this.points[w] - this.points[o] >= 2) {
      out.gameWon = true;
      this.games[w]++;
      this.points = [0, 0];
      this.gameServer = (1 - this.gameServer) as Side;
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

  private finishSet(w: Side, tb?: [number, number]): void {
    this.sets.push({ games: [this.games[0], this.games[1]], tiebreak: tb });
    this.setsWon[w]++;
    this.games = [0, 0];
    if (this.setsWon[w] >= this.setsToWin) this.winner = w;
  }

  /** Text d'un jugador per al marcador. */
  pointText(side: Side): string {
    const o = (1 - side) as Side;
    if (this.tiebreak) return String(this.points[side]);
    const p = this.points[side];
    const q = this.points[o];
    if (p >= 3 && q >= 3) {
      if (p === q) return '40';
      return p > q ? 'AD' : '40';
    }
    return ['0', '15', '30', '40'][Math.min(p, 3)];
  }

  /** És deuce (40-40)? */
  get isDeuce(): boolean {
    return !this.tiebreak && this.points[0] >= 3 && this.points[0] === this.points[1];
  }

  /** Jugador amb avantatge, si n'hi ha. */
  get advantage(): Side | null {
    if (this.tiebreak) return null;
    const [a, b] = this.points;
    if (a >= 3 && b >= 3 && a !== b) return a > b ? 0 : 1;
    return null;
  }

  /** Punt de break/set/partit? Retorna el jugador que té una pilota de joc. */
  get gamePointFor(): Side | null {
    const [a, b] = this.points;
    if (this.tiebreak) {
      if (a >= 6 && a > b) return 0;
      if (b >= 6 && b > a) return 1;
      return null;
    }
    if (a >= 3 && a > b) return 0;
    if (b >= 3 && b > a) return 1;
    return null;
  }

  /** Text del marcador cantat pel jutge (en català), servidor primer. */
  callText(names: [string, string]): string {
    const words = ['zero', 'quinze', 'trenta', 'quaranta'];
    const s = this.server;
    const r = (1 - s) as Side;
    if (this.tiebreak) {
      const a = this.points[s];
      const b = this.points[r];
      return a === b ? `${a} iguals` : `${a} a ${b}`;
    }
    const adv = this.advantage;
    if (adv !== null) return `Avantatge ${names[adv]}`;
    const a = Math.min(this.points[s], 3);
    const b = Math.min(this.points[r], 3);
    if (this.points[s] >= 3 && this.points[r] >= 3) return 'Iguals';
    if (a === b) return `${words[a]} iguals`;
    return `${words[a]} a ${words[b]}`;
  }
}
