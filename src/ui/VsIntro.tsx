import { useEffect, useRef, useState } from 'react';
import { PlayerDef } from '../players/roster';
import { PixelText } from './PixelText';
import { SpritePreview } from './SpritePreview';

interface Props {
  a: PlayerDef;
  b: PlayerDef;
  roundLabel: string;
  /** Mida visual: 1 = mòbil / pantalla baixa, 2 = mitjana, 3 = gran. */
  size: 1 | 2 | 3;
  onDone: () => void;
}

const STATS: [string, 'speed' | 'power' | 'precision' | 'stamina'][] = [
  ['VELOCITAT', 'speed'],
  ['POTENCIA', 'power'],
  ['PRECISIO', 'precision'],
  ['RESISTENCIA', 'stamina'],
];

function Card({ def, side, size }: { def: PlayerDef; side: 'l' | 'r'; size: 1 | 2 | 3 }) {
  const color = side === 'l' ? '#8cc0ff' : '#ff9a8c';
  return (
    <div className={`vs-card vs-${side}`}>
      <div className="vs-portrait">
        <SpritePreview def={def} s={46} width={84} height={112} scale={size === 3 ? 4 : size === 2 ? 3 : 2} />
      </div>
      <PixelText text={def.name.toUpperCase()} scale={size === 1 ? 2 : 3} color="#ffffff" />
      <PixelText text={def.style.label.toUpperCase()} scale={1} color={color} />
      <div className="vs-stats">
        {STATS.map(([label, k]) => (
          <div className="vs-stat" key={k}>
            <PixelText text={label} scale={1} color="#dfe8ff" />
            <div className="vs-bar">
              <div className="vs-fill" style={{ width: `${def.stats[k]}%`, background: color }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Pantalla de presentació del partit, estil joc de lluita: retrats grans, estil de joc i "VS". */
export function VsIntro({ a, b, roundLabel, size, onDone }: Props) {
  const [leaving, setLeaving] = useState(false);
  const doneRef = useRef(false);
  const born = useRef(performance.now());

  useEffect(() => {
    const finish = (): void => {
      if (doneRef.current) return;
      doneRef.current = true;
      setLeaving(true);
      window.setTimeout(onDone, 260);
    };
    const t = window.setTimeout(finish, 3600);
    const skip = (): void => {
      if (performance.now() - born.current > 700) finish();
    };
    window.addEventListener('keydown', skip);
    window.addEventListener('pointerdown', skip);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`vs ${leaving ? 'vs-out' : ''}`}>
      <div className="vs-bg" />
      <div className="vs-round">
        <PixelText text={roundLabel} scale={size === 1 ? 1 : 2} color="#ffe066" />
      </div>
      <div className="vs-row">
        <Card def={a} side="l" size={size} />
        <div className="vs-mid">
          <PixelText text="VS" scale={size === 3 ? 14 : size === 2 ? 10 : 6} color="#ffe066" outline="#7a1010" />
        </div>
        <Card def={b} side="r" size={size} />
      </div>
      <div className="vs-skip">
        <PixelText text="PREM QUALSEVOL TECLA" scale={1} color="#cfe0ff" />
      </div>
    </div>
  );
}
