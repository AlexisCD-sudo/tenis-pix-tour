import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PlayerDef } from '../players/roster';
import { PixelText } from './PixelText';
import { SpritePreview } from './SpritePreview';

interface Props {
  a: PlayerDef;
  b: PlayerDef;
  roundLabel: string;
  onDone: () => void;
}

const STATS: [string, 'speed' | 'power' | 'precision' | 'stamina'][] = [
  ['VELOCITAT', 'speed'],
  ['POTENCIA', 'power'],
  ['PRECISIO', 'precision'],
  ['RESISTENCIA', 'stamina'],
];

function Card({ def, side, scale, stats }: { def: PlayerDef; side: 'l' | 'r'; scale: number; stats: boolean }) {
  const color = side === 'l' ? '#8cc0ff' : '#ff9a8c';
  return (
    <div className={`vs-card vs-${side}`}>
      <div className="vs-portrait">
        <SpritePreview key={def.id} def={def} s={46} width={84} height={112} scale={scale} />
      </div>
      <PixelText text={def.name.toUpperCase()} scale={scale >= 3 ? 3 : scale === 2 ? 2 : 1} color="#ffffff" />
      <PixelText text={def.style.label.toUpperCase()} scale={1} color={color} />
      {stats ? <div className="vs-stats">
        {STATS.map(([label, k]) => (
          <div className="vs-stat" key={k}>
            <PixelText text={label} scale={1} color="#dfe8ff" />
            <div className="vs-bar">
              <div className="vs-fill" style={{ width: `${def.stats[k]}%`, background: color }} />
            </div>
          </div>
        ))}
      </div> : null}
    </div>
  );
}

/** Pantalla de presentació del partit, estil joc de lluita: retrats grans, estil de joc i "VS". */
export function VsIntro({ a, b, roundLabel, onDone }: Props) {
  const root = useRef<HTMLDivElement>(null);
  // Mida dels retrats segons l'espai real disponible: mai es retalla el cap ni els peus
  const [fit, setFit] = useState({ scale: 2, stats: false });
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const calc = (): void => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      for (const stats of [true, false]) {
        const reserved = stats ? 200 : 96; // nom, estil, barres, rètol de ronda i avís
        const sc = Math.min(4, Math.floor((h - reserved) / 112), Math.floor((w / 2 - 70) / 84));
        if (sc >= 2 || !stats) {
          setFit({ scale: Math.max(1, sc), stats: stats && sc >= 2 && w >= 560 });
          return;
        }
      }
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
    <div ref={root} className={`vs ${leaving ? 'vs-out' : ''}`}>
      <div className="vs-bg" />
      <div className="vs-round">
        <PixelText text={roundLabel} scale={fit.scale >= 3 ? 2 : 1} color="#ffe066" />
      </div>
      <div className="vs-row">
        <Card def={a} side="l" scale={fit.scale} stats={fit.stats} />
        <div className="vs-mid">
          <PixelText text="VS" scale={fit.scale >= 4 ? 14 : fit.scale === 3 ? 10 : fit.scale === 2 ? 6 : 4} color="#ffe066" outline="#7a1010" />
        </div>
        <Card def={b} side="r" scale={fit.scale} stats={fit.stats} />
      </div>
      <div className="vs-skip">
        <PixelText text="PREM QUALSEVOL TECLA" scale={1} color="#cfe0ff" />
      </div>
    </div>
  );
}
