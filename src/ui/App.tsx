import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { audio } from '../audio/audio';
import { Match } from '../game/match';
import { Settings, loadRanking, loadSettings, recordMatch, recordTournament, saveSettings } from '../game/storage';
import { ROSTER, getPlayerDef } from '../players/roster';
import { BracketMatch, ROUND_LABEL, Tournament } from '../tournament/tournament';
import { Bracket } from './Bracket';
import { Champion } from './Champion';
import { MatchScreen, MatchSetup } from './MatchScreen';
import { PixelButton, PixelText } from './PixelText';
import { Result } from './Result';
import { ControlsScreen, DifficultySelect, OptionsScreen, PlayerSelect, RankingScreen, Title } from './Screens';
import { SimScreen } from './SimScreen';
import { useViewport } from './hooks';

type Screen = 'title' | 'select' | 'difficulty' | 'ranking' | 'options' | 'controls' | 'bracket' | 'match' | 'result' | 'sim' | 'champion';

/** Paràmetre de prova: ?autosim simula també els partits del jugador (per comprovar el torneig sencer). */
const AUTOSIM = typeof location !== 'undefined' && new URLSearchParams(location.search).has('autosim');

export function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [screen, setScreen] = useState<Screen>('title');
  const tourRef = useRef<Tournament | null>(null);
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [current, setCurrent] = useState<{ m: BracketMatch; setup: MatchSetup; swapped: boolean } | null>(null);
  const [finished, setFinished] = useState<Match | null>(null);
  const [ranking, setRanking] = useState(loadRanking);
  const [attractSeed, setAttractSeed] = useState(11);
  const [unlocked, setUnlocked] = useState(false);
  const vp = useViewport();

  const tour = tourRef.current;

  // El so es desbloqueja amb el primer gest
  useEffect(() => {
    const f = (): void => {
      audio.unlock();
      audio.setSettings(settings.audio);
      setUnlocked(true);
    };
    window.addEventListener('pointerdown', f, { once: true });
    window.addEventListener('keydown', f, { once: true });
    return () => {
      window.removeEventListener('pointerdown', f);
      window.removeEventListener('keydown', f);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    saveSettings(settings);
    audio.setSettings(settings.audio);
  }, [settings]);

  // Música de menú mentre no hi ha partit/cerimònia
  const menuScreens: Screen[] = ['title', 'select', 'difficulty', 'ranking', 'options', 'controls', 'bracket', 'sim', 'result'];
  useEffect(() => {
    if (!unlocked) return;
    if (menuScreens.includes(screen)) audio.playMusic('menu');
    else if (screen === 'match') audio.stopMusic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, unlocked]);

  const attractSetup = useMemo<MatchSetup>(() => {
    const a = ROSTER[attractSeed % ROSTER.length];
    const b = ROSTER[(attractSeed * 3 + 1) % ROSTER.length === attractSeed % ROSTER.length ? (attractSeed + 2) % ROSTER.length : (attractSeed * 3 + 1) % ROSTER.length];
    return { p0: a, p1: b, humanIdx: null, seed: attractSeed };
  }, [attractSeed]);

  const startTournament = useCallback(() => {
    audio.unlock();
    tourRef.current = new Tournament(settings.playerId, settings.difficulty, (Date.now() & 0xffff) + 1);
    setScreen('bracket');
    bump();
  }, [settings.playerId, settings.difficulty]);

  const matchSeed = (t: Tournament, m: BracketMatch): number => t.seed * 101 + t.matches.indexOf(m) * 977 + 7;

  const playMatch = (m: BracketMatch): void => {
    const t = tourRef.current!;
    const s = t.matchSetup(m);
    const seed = matchSeed(t, m);
    setCurrent({ m, swapped: s.swapped, setup: { p0: s.p0, p1: s.p1, humanIdx: s.humanIdx as 0 | null, seed, firstServer: (seed % 2) as 0 | 1 } });
    setScreen('match');
  };

  const afterReport = (t: Tournament): void => {
    if (t.champion) {
      recordTournament(t.champion, ROSTER.map((r) => r.id));
      setRanking(loadRanking());
    }
    bump();
  };

  const onMatchFinish = useCallback(
    (match: Match) => {
      const t = tourRef.current;
      if (!t || !current) return;
      t.reportMatch(current.m, match, current.swapped);
      const w = match.score.winner ?? 0;
      const wId = (w === 0 ? match.cfg.p0 : match.cfg.p1).id;
      const lId = (w === 0 ? match.cfg.p1 : match.cfg.p0).id;
      recordMatch(wId, lId);
      setRanking(loadRanking());
      setFinished(match);
      afterReport(t);
      setScreen('result');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current],
  );

  const [simM, setSimM] = useState<BracketMatch | null>(null);
  const onSimDone = useCallback(
    (match: Match) => {
      const t = tourRef.current;
      if (!t || !simM) return;
      t.reportMatch(simM, match, false);
      const w = match.score.winner ?? 0;
      recordMatch((w === 0 ? match.cfg.p0 : match.cfg.p1).id, (w === 0 ? match.cfg.p1 : match.cfg.p0).id);
      setRanking(loadRanking());
      afterReport(t);
      setSimM(null);
      setScreen(t.champion ? 'champion' : 'bracket');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [simM],
  );

  const goMenu = (): void => {
    tourRef.current = null;
    setCurrent(null);
    setFinished(null);
    setScreen('title');
  };

  // ------------------------------------------------------------- pantalles
  let body: React.ReactNode = null;
  const showAttract = screen === 'title' || screen === 'select' || screen === 'difficulty' || screen === 'ranking' || screen === 'options' || screen === 'controls';

  switch (screen) {
    case 'title':
      body = (
        <Title
          settings={settings}
          onPlay={startTournament}
          onSelect={() => setScreen('select')}
          onDifficulty={() => setScreen('difficulty')}
          onRanking={() => setScreen('ranking')}
          onOptions={() => setScreen('options')}
          onControls={() => setScreen('controls')}
        />
      );
      break;
    case 'select':
      body = <PlayerSelect settings={settings} onBack={() => setScreen('title')} onPick={(id) => { setSettings({ ...settings, playerId: id }); setScreen('title'); }} />;
      break;
    case 'difficulty':
      body = <DifficultySelect settings={settings} onBack={() => setScreen('title')} onPick={(d) => { setSettings({ ...settings, difficulty: d }); setScreen('title'); }} />;
      break;
    case 'ranking':
      body = <RankingScreen ranking={ranking} onBack={() => setScreen('title')} />;
      break;
    case 'options':
      body = <OptionsScreen settings={settings} onChange={setSettings} onBack={() => setScreen('title')} />;
      break;
    case 'controls':
      body = <ControlsScreen onBack={() => setScreen('title')} />;
      break;
    case 'bracket':
      if (tour) {
        const next = tour.nextMatch();
        const human = next ? tour.involvesHuman(next) && !AUTOSIM : false;
        const humanOut = tour.humanEliminated;
        body = (
          <BracketScreen
            tour={tour}
            next={next}
            human={human}
            humanOut={humanOut}
            scale={Math.min(1, (vp.w - 24) / 740)}
            onPlay={() => next && playMatch(next)}
            onSim={() => {
              if (!next) return;
              setSimM(next);
              setScreen('sim');
            }}
            onChampion={() => setScreen('champion')}
            onMenu={goMenu}
          />
        );
      }
      break;
    case 'match':
      if (current && tour) {
        body = (
          <MatchScreen
            key={`${current.m.id}-${current.setup.seed}`}
            setup={current.setup}
            difficulty={tour.difficulty}
            settings={settings}
            roundLabel={`${ROUND_LABEL[current.m.round]}`}
            onFinish={onMatchFinish}
            onQuit={goMenu}
          />
        );
      }
      break;
    case 'result':
      if (finished && current && tour) {
        body = (
          <Result
            match={finished}
            roundLabel={ROUND_LABEL[current.m.round]}
            eliminated={tour.humanEliminated}
            isFinal={current.m.round === 'F'}
            onContinue={() => setScreen(tour.champion ? 'champion' : 'bracket')}
          />
        );
      }
      break;
    case 'sim':
      if (simM && tour) body = <SimScreen m={simM} seed={matchSeed(tour, simM)} onDone={onSimDone} />;
      break;
    case 'champion':
      if (tour?.champion) {
        body = (
          <Champion
            champion={getPlayerDef(tour.champion)}
            isHuman={tour.champion === tour.humanId}
            onBracket={() => setScreen('bracket')}
            onMenu={goMenu}
          />
        );
      }
      break;
  }

  return (
    <div className="app">
      {showAttract ? (
        <div className="attract" aria-hidden="true">
          <MatchScreen
            key={attractSeed}
            setup={attractSetup}
            difficulty="normal"
            settings={settings}
            roundLabel=""
            attract
            onFinish={() => setAttractSeed((s) => s + 1)}
            onQuit={() => undefined}
          />
          <div className="attract-dim" />
        </div>
      ) : null}
      <div className={`screen ${screen === 'match' ? 'screen-match' : ''}`}>{body}</div>
    </div>
  );
}

function BracketScreen({
  tour,
  next,
  human,
  humanOut,
  scale,
  onPlay,
  onSim,
  onChampion,
  onMenu,
}: {
  tour: Tournament;
  next: BracketMatch | null;
  human: boolean;
  humanOut: boolean;
  scale: number;
  onPlay: () => void;
  onSim: () => void;
  onChampion: () => void;
  onMenu: () => void;
}) {
  const [auto, setAuto] = useState(true);
  // Els partits sense el jugador es simulen automàticament després d'un instant
  useEffect(() => {
    if (!next || human || !auto) return;
    const t = window.setTimeout(onSim, 1600);
    return () => window.clearTimeout(t);
  }, [next, human, auto, onSim]);
  const nm = next ? `${getPlayerDef(next.a!).shortName} - ${getPlayerDef(next.b!).shortName}` : '';
  return (
    <div className="panel-screen">
      <PixelText text="QUADRE DEL TORNEIG" scale={3} color="#ffe066" />
      <Bracket tour={tour} scale={Math.max(0.45, scale)} />
      {next ? (
        <>
          <PixelText text={`${ROUND_LABEL[next.round]}: ${nm}`} scale={2} color="#ffffff" />
          <div className="row">
            {human ? (
              <PixelButton label="JUGAR PARTIT" variant="primary" scale={3} onClick={onPlay} />
            ) : (
              <>
                <PixelButton label="SIMULAR ARA" variant="primary" onClick={onSim} />
                <PixelButton label={auto ? 'PAUSAR AUTO' : 'AUTO ACTIVAT'} onClick={() => setAuto(!auto)} />
              </>
            )}
            <PixelButton label="SORTIR" variant="danger" onClick={onMenu} />
          </div>
          {humanOut ? <PixelText text="ELIMINAT: ES SIMULA EL FINAL DEL TORNEIG" scale={1} color="#ff8a7a" /> : null}
        </>
      ) : (
        <div className="row">
          <PixelButton label="VEURE EL CAMPIÓ" variant="primary" scale={3} onClick={onChampion} />
          <PixelButton label="MENÚ" onClick={onMenu} />
        </div>
      )}
    </div>
  );
}
