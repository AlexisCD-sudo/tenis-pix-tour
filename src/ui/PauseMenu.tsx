import { useState } from 'react';
import { audio } from '../audio/audio';
import { Settings } from '../game/storage';
import { PixelButton, PixelText } from './PixelText';
import { CONTROL_ROWS, Slider } from './Screens';

type Page = 'main' | 'options' | 'controls';

interface Props {
  settings: Settings;
  onSettings: (s: Settings) => void;
  onResume: () => void;
  onQuit: () => void;
  /** Mostra la secció de controls tàctils (només en mode tàctil). */
  touch: boolean;
  /** Escala del text (1 en pantalles baixes). */
  ps: number;
  /** Disseny compacte per a pantalles molt baixes (mòbil en horitzontal). */
  compact?: boolean;
}

/** Menú de pausa: continuar, opcions de so i joc, controls i abandonar (amb confirmació). */
export function PauseMenu({ settings, onSettings, onResume, onQuit, touch, ps, compact = false }: Props) {
  const [page, setPage] = useState<Page>('main');
  const [confirmQuit, setConfirmQuit] = useState(false);
  const a = settings.audio;
  const sc = Math.max(1, ps);
  const setA = (p: Partial<Settings['audio']>): void => {
    const next = { ...settings, audio: { ...a, ...p } };
    audio.setSettings(next.audio);
    onSettings(next);
  };

  return (
    <div className="overlay pause" role="dialog" aria-label="Pausa">
      <div className={`pause-col ${compact ? 'compact' : ''}`}>
        {page === 'main' ? (
          <>
            <PixelText text="PAUSA" scale={sc + 3} color="#ffe066" />
            <PixelButton label="CONTINUAR" variant="primary" scale={sc + 1} onClick={onResume} />
            <PixelButton label="OPCIONS" scale={sc + 1} onClick={() => setPage('options')} />
            <PixelButton label="CONTROLS" scale={sc + 1} onClick={() => setPage('controls')} />
            {confirmQuit ? (
              <div className="optrow">
                <PixelText text="SEGUR? ES PERD EL PARTIT" scale={1} color="#ff8a7a" />
                <PixelButton label="SÍ, ABANDONAR" variant="danger" scale={sc} onClick={onQuit} />
                <PixelButton label="NO" scale={sc} onClick={() => setConfirmQuit(false)} />
              </div>
            ) : (
              <PixelButton label="ABANDONAR PARTIT" variant="danger" scale={sc} onClick={() => setConfirmQuit(true)} />
            )}
          </>
        ) : null}

        {page === 'options' ? (
          <>
            {compact ? null : <PixelText text="OPCIONS" scale={sc + 2} color="#ffe066" />}
            <div className="options">
              <Slider label="VOLUM GENERAL" value={a.master} onChange={(v) => setA({ master: v })} />
              <Slider label="EFECTES" value={a.sfx} onChange={(v) => setA({ sfx: v })} />
              <Slider label="PÚBLIC" value={a.crowd} onChange={(v) => setA({ crowd: v })} />
              <div className="optrow">
                <PixelButton label={`VEU DEL JUTGE: ${a.voice ? 'SÍ' : 'NO'}`} scale={sc} onClick={() => setA({ voice: !a.voice })} />
                <PixelButton label={`GUIA DE PUNTERIA: ${settings.assist ? 'SÍ' : 'NO'}`} scale={sc} onClick={() => onSettings({ ...settings, assist: !settings.assist })} />
              </div>
            </div>
            <PixelButton label="ENRERE" scale={sc} onClick={() => setPage('main')} />
          </>
        ) : null}

        {page === 'controls' ? (
          <>
            {compact ? null : <PixelText text="CONTROLS" scale={sc + 2} color="#ffe066" />}
            <div className="table">
              {touch ? (
                <div className="crow">
                  <PixelText text="JOYSTICK" scale={1} color="#8cf0ff" />
                  <PixelText text="MOURE I APUNTAR" scale={1} color="#ffffff" />
                </div>
              ) : null}
              {(touch ? [] : CONTROL_ROWS).map(([k, v]) => (
                <div className="crow" key={k}>
                  <PixelText text={k} scale={1} color="#8cf0ff" />
                  <PixelText text={v} scale={1} color="#ffffff" />
                </div>
              ))}
              {touch ? (
                <div className="crow">
                  <PixelText text="BOTONS" scale={1} color="#8cf0ff" />
                  <PixelText text="COP/SERVEI · EFECTE (SLICE / GLOBUS) · CÓRRER" scale={1} color="#ffffff" />
                </div>
              ) : null}
            </div>
            <PixelButton label="ENRERE" scale={sc} onClick={() => setPage('main')} />
          </>
        ) : null}
      </div>
    </div>
  );
}
