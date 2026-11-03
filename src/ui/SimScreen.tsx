import { useEffect, useRef, useState } from 'react';
import { Match } from '../game/match';
import { getPlayerDef } from '../players/roster';
import { BracketMatch, simulateMatch } from '../tournament/tournament';
import { PixelText } from './PixelText';
import { useViewport } from './hooks';

interface Props {
  m: BracketMatch;
  seed: number;
  onDone: (match: Match) => void;
}

/** Simula un partit IA contra IA amb el mateix motor i en mostra el marcador en directe. */
export function SimScreen({ m, seed, onDone }: Props) {
  const vp = useViewport();
  const [line, setLine] = useState('0-0');
  const started = useRef(false);
  const a = getPlayerDef(m.a!);
  const b = getPlayerDef(m.b!);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void simulateMatch(a, b, seed, (mm) => {
      const sc = mm.score;
      const sets = sc.sets.map((s) => `${s.games[0]}-${s.games[1]}`).join('  ');
      setLine(`${sets}${sets ? '  ' : ''}${sc.games[0]}-${sc.games[1]}`);
    }).then(onDone);
  }, [a, b, seed, onDone]);
  const s = vp.ps + 1;
  return (
    <div className="panel-screen">
      <PixelText text="SIMULANT PARTIT" scale={s} color="#ffe066" />
      <PixelText text={a.name.toUpperCase()} scale={s} />
      <PixelText text="CONTRA" scale={Math.max(1, s - 2)} color="#9fb4e8" />
      <PixelText text={b.name.toUpperCase()} scale={s} />
      <PixelText text={line} scale={s + 1} color="#8cf0ff" />
      <div className="spinner" />
    </div>
  );
}
