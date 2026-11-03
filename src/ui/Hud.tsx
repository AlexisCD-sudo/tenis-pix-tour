import { HudState } from '../game/runner';
import { PixelText } from './PixelText';

interface Props {
  hud: HudState;
  ps: number;
  onPause: () => void;
}

/** Marcador superior: noms, sets, jocs, punts, indicador de servei i resistència. */
export function Hud({ hud, ps, onPause }: Props) {
  const rows = [0, 1] as const;
  const serving = hud.phase !== 'match_end';
  return (
    <div className="hud" style={{ ['--ps' as string]: ps }}>
      <div className="scorebox">
        {rows.map((i) => {
          const won = hud.lastWinner === i;
          return (
            <div className="srow" key={i}>
              <span className={`serve-dot ${serving && hud.server === i ? 'on' : ''}`} />
              <div className="sname">
                <PixelText text={hud.names[i].toUpperCase()} scale={ps} color={hud.humanIdx === i ? '#ffe066' : '#ffffff'} />
                <div className="stam">
                  <div className="stam-fill" style={{ width: `${Math.round(hud.stamina[i] * 100)}%`, background: hud.stamina[i] > 0.5 ? '#6cff6c' : hud.stamina[i] > 0.25 ? '#ffd24a' : '#ff6b4a' }} />
                </div>
              </div>
              {hud.sets.map((s, k) => (
                <div className="cell cell-set" key={k}>
                  <PixelText text={String(s[i])} scale={ps} color={s[i] > s[1 - i] ? '#ffffff' : '#8fa6d8'} />
                </div>
              ))}
              <div className="cell cell-game">
                <PixelText text={String(hud.games[i])} scale={ps} color="#ffffff" />
              </div>
              <div className={`cell cell-point ${won ? 'pop' : ''}`} key={`${hud.pointId}-${i}`}>
                <PixelText text={hud.points[i]} scale={ps} color="#0b1230" outline="" />
              </div>
            </div>
          );
        })}
      </div>
      <div className="hud-right">
        <button className="iconbtn" onClick={onPause} aria-label="Pausa">
          <PixelText text="II" scale={Math.max(2, ps)} />
        </button>
        {hud.rally >= 6 && hud.phase === 'rally' ? <PixelText text={`${hud.rally} COPS`} scale={Math.max(1, ps - 1)} color="#ffe066" /> : null}
      </div>
      {hud.banner ? (
        <div className="banner" key={hud.bannerId}>
          <PixelText text={hud.banner.toUpperCase()} scale={ps} color="#ffffff" />
        </div>
      ) : null}
      {hud.phase === 'serve_wait' && hud.humanServing ? (
        <div className="serve-hint">
          <PixelText text={hud.serveStage === 2 ? '2N SERVEI · TECLA DE COP' : '1R SERVEI · TECLA DE COP'} scale={Math.max(1, ps - 1)} color="#ffe066" />
        </div>
      ) : null}
    </div>
  );
}
