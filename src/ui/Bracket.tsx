import { getPlayerDef } from '../players/roster';
import { BracketMatch, Tournament, formatSets } from '../tournament/tournament';
import { PixelText } from './PixelText';

interface Props {
  tour: Tournament;
  scale?: number;
  highlightId?: string | null;
}

const POS: Record<string, { x: number; y: number }> = {
  QF1: { x: 0, y: 24 },
  QF2: { x: 0, y: 196 },
  SF1: { x: 250, y: 0 },
  SF2: { x: 250, y: 220 },
  F: { x: 500, y: 110 },
};
const CW = 210;
const CH = 64;

function Card({ m, tour, active }: { m: BracketMatch; tour: Tournament; active: boolean }) {
  const lines = [m.a, m.b];
  const flip = false;
  return (
    <div className={`bcard ${active ? 'active' : ''}`} style={{ left: POS[m.id].x, top: POS[m.id].y, width: CW, height: CH }}>
      {lines.map((id, i) => {
        const def = id ? getPlayerDef(id) : null;
        const isWinner = !!m.winner && m.winner === id;
        const isHuman = id === tour.humanId;
        const sets = m.sets;
        return (
          <div className={`brow ${isWinner ? 'win' : m.winner && id ? 'lose' : ''}`} key={i}>
            <PixelText text={id ? String(tour.seedOf(id)) : '-'} scale={1} color="#6f86bd" />
            <PixelText text={def ? def.shortName : 'POR DECIDIR'} scale={2} color={isWinner ? '#ffe066' : isHuman ? '#8cf0ff' : def ? '#ffffff' : '#5f73a6'} />
            {isHuman ? <PixelText text="*" scale={2} color="#ffe066" /> : null}
            <span className="grow" />
            {sets
              ? sets.map((s, k) => (
                  <PixelText key={k} text={String(s.games[i])} scale={2} color={s.games[i] > s.games[1 - i] ? '#ffffff' : '#6f86bd'} />
                ))
              : null}
          </div>
        );
      })}
      {m.sets ? (
        <span className="bscore">
          <PixelText text={formatSets(m.sets, flip)} scale={1} color="#8fa6d8" />
        </span>
      ) : null}
    </div>
  );
}

/** Quadre visual del torneig (actualitzat després de cada partit). */
export function Bracket({ tour, scale = 1, highlightId }: Props) {
  const next = tour.nextMatch();
  const mid = (id: string, side: 'r' | 'l'): [number, number] => {
    const p = POS[id];
    return side === 'r' ? [p.x + CW, p.y + CH / 2] : [p.x, p.y + CH / 2];
  };
  const link = (from: string, to: string): string => {
    const [x1, y1] = mid(from, 'r');
    const [x2, y2] = mid(to, 'l');
    const mx = (x1 + x2) / 2;
    return `M${x1},${y1} H${mx} V${y2} H${x2}`;
  };
  const done = (id: string): boolean => !!tour.get(id as 'F').winner;
  const lineCol = (id: string): string => (done(id) ? '#ffe066' : '#3f5aa0');
  return (
    <div className="bracket-wrap" style={{ width: 740 * scale, height: 340 * scale }}>
      <div className="bracket" style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        <svg width="740" height="340" className="blines" shapeRendering="crispEdges">
          <path d={link('QF1', 'SF1')} stroke={lineCol('QF1')} fill="none" strokeWidth="3" />
          <path d={link('QF2', 'SF2')} stroke={lineCol('QF2')} fill="none" strokeWidth="3" />
          <path d={link('SF1', 'F')} stroke={lineCol('SF1')} fill="none" strokeWidth="3" />
          <path d={link('SF2', 'F')} stroke={lineCol('SF2')} fill="none" strokeWidth="3" />
        </svg>
        <div className="bcol-title" style={{ left: 0, top: -2 }}>
          <PixelText text="QUARTS" scale={1} color="#6f86bd" />
        </div>
        <div className="bcol-title" style={{ left: 250, top: -2 }}>
          <PixelText text="" scale={1} />
        </div>
        {tour.matches.map((m) => (
          <Card key={m.id} m={m} tour={tour} active={(next?.id === m.id) || highlightId === m.id} />
        ))}
        {tour.champion ? (
          <div className="bchamp" style={{ left: 500, top: 200, width: CW }}>
            <PixelText text="CAMPIÓ" scale={2} color="#ffe066" />
            <PixelText text={getPlayerDef(tour.champion).name.toUpperCase()} scale={2} color="#ffffff" />
          </div>
        ) : null}
        <div className="bnote" style={{ left: 0, top: 120 }}>
          <PixelText text="CAPS DE SÈRIE 1 I 2: DIRECTES A SEMIS" scale={1} color="#6f86bd" />
        </div>
      </div>
    </div>
  );
}
