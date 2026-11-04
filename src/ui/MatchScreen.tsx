import { useEffect, useRef, useState } from 'react';
import { AIController } from '../ai/ai';
import { Difficulty } from '../ai/difficulty';
import { audio } from '../audio/audio';
import { HumanController, InputManager } from '../controls/input';
import { Match } from '../game/match';
import { GameRunner, HudState } from '../game/runner';
import { Settings } from '../game/storage';
import { PlayerDef } from '../players/roster';
import { Hud } from './Hud';
import { PauseMenu } from './PauseMenu';
import { useViewport } from './hooks';
import { PixelButton, PixelText } from './PixelText';
import { TouchControls } from './TouchControls';
import { VsIntro } from './VsIntro';

export interface MatchSetup {
  p0: PlayerDef;
  p1: PlayerDef;
  humanIdx: 0 | null;
  seed: number;
  firstServer?: 0 | 1;
}

interface Props {
  setup: MatchSetup;
  difficulty: Difficulty;
  settings: Settings;
  roundLabel: string;
  attract?: boolean;
  onFinish: (m: Match) => void;
  onQuit: () => void;
  /** Canvis d'opcions fets des del menú de pausa. */
  onSettings?: (s: Settings) => void;
}

export function MatchScreen({ setup, difficulty, settings, roundLabel, attract = false, onFinish, onQuit, onSettings }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runnerRef = useRef<GameRunner | null>(null);
  const inputRef = useRef<InputManager>(new InputManager());
  const vp = useViewport();
  const [hud, setHud] = useState<HudState | null>(null);
  const [paused, setPaused] = useState(false);
  const [hint, setHint] = useState(false);
  // Presentació VS abans del partit (no en mode demostració)
  const [vs, setVs] = useState(!attract);
  const vsRef = useRef(!attract);
  const touch = !attract && (settings.touch === 'on' || (settings.touch === 'auto' && vp.coarse));

  useEffect(() => {
    const input = inputRef.current;
    const human = setup.humanIdx === 0 ? new HumanController(input) : null;
    const controllers = [human ?? new AIController(setup.seed + 1), new AIController(setup.seed + 2)] as [HumanController | AIController, AIController];
    const match = new Match(
      { p0: setup.p0, p1: setup.p1, humanIdx: setup.humanIdx, difficulty, seed: setup.seed, firstServer: setup.firstServer },
      controllers,
    );
    const runner = new GameRunner(canvasRef.current!, match, human ? input : null, human, {
      assist: settings.assist,
      attract,
      onHud: setHud,
      onEnd: onFinish,
    });
    runnerRef.current = runner;
    // Dades de depuració per als tests de navegador (?debug)
    if (/[?&]debug/.test(window.location.search)) (window as unknown as { __match: Match }).__match = match;
    input.onPause = () => {
      if (vsRef.current) return;
      const p = !runner.paused;
      runner.setPaused(p);
      setPaused(p);
    };
    runner.start();
    if (vsRef.current) runner.setPaused(true);
    return () => {
      runner.stop();
      input.onPause = null;
      runnerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup, difficulty, attract]);

  useEffect(() => {
    if (vsRef.current) return;
    runnerRef.current?.setPaused(paused);
  }, [paused]);

  const endVs = (): void => {
    vsRef.current = false;
    setVs(false);
    runnerRef.current?.setPaused(false);
    audio.unlock();
    setHint(true);
    window.setTimeout(() => setHint(false), 6500);
  };

  // La guia de punteria es pot canviar en directe des del menú de pausa
  useEffect(() => {
    runnerRef.current?.setAssist(settings.assist);
  }, [settings.assist]);

  const togglePause = (): void => {
    const r = runnerRef.current;
    if (!r) return;
    const p = !r.paused;
    r.setPaused(p);
    setPaused(p);
    if (!p) audio.unlock();
  };

  return (
    <div className={`stage ${vp.portrait ? 'portrait' : 'landscape'} ${touch ? 'with-touch' : ''} ${paused ? 'is-paused' : ''}`}>
      <div className="view">
        <canvas ref={canvasRef} className="game-canvas" />
        {!attract && hud ? <Hud hud={hud} ps={vp.portrait ? Math.min(vp.ps, 1) : vp.ps === 3 ? 2 : vp.ps} onPause={togglePause} /> : null}
        {!attract ? (
          <div className="round-tag">
            <PixelText text={roundLabel} scale={1} color="#9fb4e8" />
          </div>
        ) : null}
        {vs ? (
          <VsIntro a={setup.p0} b={setup.p1} roundLabel={roundLabel} size={vp.portrait || vp.h < 520 ? 1 : vp.h < 760 ? 2 : 3} onDone={endVs} />
        ) : null}
        {hint && !attract && !paused && !vs ? (
          <div className="hint">
            {touch ? (
              <>
                <PixelText text="JOYSTICK: MOURE I APUNTAR" scale={1} color="#ffffff" />
                <PixelText text="COP: PREM AL MOMENT EXACTE · EFECTE: SLICE" scale={1} color="#ffe066" />
              </>
            ) : (
              <>
                <PixelText text="WASD / FLETXES: MOURE I APUNTAR" scale={1} color="#ffffff" />
                <PixelText text="ESPAI COP/SERVEI  J EFECTE (J + AVALL = LOB)  SHIFT CÓRRER" scale={1} color="#ffe066" />
              </>
            )}
          </div>
        ) : null}
        {paused && !attract ? (
          <PauseMenu
            settings={settings}
            onSettings={(n) => onSettings?.(n)}
            touch={touch}
            ps={vp.portrait || vp.h < 520 ? 1 : 2}
            compact={vp.h < 520}
            onResume={togglePause}
            onQuit={() => {
              runnerRef.current?.stop();
              onQuit();
            }}
          />
        ) : null}
      </div>
      {touch ? <TouchControls input={inputRef.current} serving={!!hud && hud.humanServing && (hud.phase === 'serve_wait' || hud.phase === 'toss')} ps={vp.ps >= 2 ? 2 : 1} /> : null}
    </div>
  );
}
