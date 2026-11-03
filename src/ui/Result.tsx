import { Match } from '../game/match';
import { formatSets } from '../tournament/tournament';
import { PixelButton, PixelText } from './PixelText';
import { useViewport } from './hooks';

interface Props {
  match: Match;
  roundLabel: string;
  eliminated: boolean;
  isFinal: boolean;
  onContinue: () => void;
}

const pct = (a: number, b: number): string => (b > 0 ? `${Math.round((100 * a) / b)}%` : '-');

/** Resultat i estadístiques després d'un partit. */
export function Result({ match, roundLabel, eliminated, isFinal, onContinue }: Props) {
  const vp = useViewport();
  const s = vp.ps;
  const w = match.score.winner ?? 0;
  const st = match.stats;
  const a = st.p[0];
  const b = st.p[1];
  const humanWon = match.cfg.humanIdx !== null && w === match.cfg.humanIdx;
  const rows: [string, string, string][] = [
    ['ACES', String(a.aces), String(b.aces)],
    ['DOBLES FALTES', String(a.doubleFaults), String(b.doubleFaults)],
    ['COPS GUANYADORS', String(a.winners), String(b.winners)],
    ['ERRORS', String(a.errors), String(b.errors)],
    ['1R SERVEI', pct(a.firstServeIn, a.firstServeTotal), pct(b.firstServeIn, b.firstServeTotal)],
    ['PUNTS GUANYATS', String(a.pointsWon), String(b.pointsWon)],
    ['SERVEI MÀXIM KM/H', String(a.maxServeKmh), String(b.maxServeKmh)],
    ['PUNT MÉS LLARG', `${st.longestRally} COPS`, `${st.longestRally} COPS`],
  ];
  const mins = Math.max(1, Math.round(st.duration / 60));
  return (
    <div className="panel-screen result">
      <PixelText text={roundLabel} scale={Math.max(1, s - 1)} color="#9fb4e8" />
      <PixelText text={humanWon ? 'VICTÒRIA!' : match.cfg.humanIdx !== null ? 'DERROTA' : 'FI DEL PARTIT'} scale={s + 2} color={humanWon ? '#6cff6c' : '#ff8a7a'} />
      <div className="resline">
        <PixelText text={match.cfg.p0.shortName} scale={s + 1} color={w === 0 ? '#ffe066' : '#ffffff'} />
        <PixelText text={formatSets(match.score.sets)} scale={s + 1} color="#ffffff" />
        <PixelText text={match.cfg.p1.shortName} scale={s + 1} color={w === 1 ? '#ffe066' : '#ffffff'} />
      </div>
      <PixelText text={`GUANYADOR: ${(w === 0 ? match.cfg.p0 : match.cfg.p1).name.toUpperCase()}`} scale={s} color="#ffe066" />
      <div className="table stats">
        {rows.map(([label, x, y]) => (
          <div className="srow2" key={label}>
            <PixelText text={x} scale={s} color="#ffffff" />
            <PixelText text={label} scale={Math.max(1, s - 1)} color="#9fb4e8" />
            <PixelText text={label === 'PUNT MÉS LLARG' ? '' : y} scale={s} color="#ffffff" />
          </div>
        ))}
      </div>
      <PixelText text={`DURADA: ${mins} MIN DE JOC`} scale={1} color="#6f86bd" />
      <PixelButton
        label={eliminated ? 'VEURE QUADRE' : isFinal && humanWon ? 'RECOLLIR EL TROFEU' : 'CONTINUAR'}
        scale={3}
        variant="primary"
        onClick={onContinue}
      />
    </div>
  );
}
