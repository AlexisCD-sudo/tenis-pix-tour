import { useEffect, useState } from 'react';
import { DIFFICULTIES, DIFFICULTY, Difficulty } from '../ai/difficulty';
import { audio } from '../audio/audio';
import { Ranking, Settings } from '../game/storage';
import { PlayerDef, ROSTER } from '../players/roster';
import { PixelButton, PixelPara, PixelText } from './PixelText';
import { SpritePreview } from './SpritePreview';
import { useViewport } from './hooks';

export function Title({
  onPlay,
  onSelect,
  onDifficulty,
  onRanking,
  onOptions,
  onControls,
  settings,
}: {
  onPlay: () => void;
  onSelect: () => void;
  onDifficulty: () => void;
  onRanking: () => void;
  onOptions: () => void;
  onControls: () => void;
  settings: Settings;
}) {
  const vp = useViewport();
  const s = vp.w < 520 ? 2 : vp.w < 900 ? 3 : 4;
  const p = ROSTER.find((r) => r.id === settings.playerId) ?? ROSTER[0];
  return (
    <div className="menu-layer">
      <div className="title-block">
        <PixelText text="PIXEL TENNIS" scale={s + 3} color="#d4ff2a" outline="#0b1230" />
        <PixelText text="TOURNAMENT" scale={s + 3} color="#ffffff" outline="#0b1230" />
        <PixelText text="TORNEIG DE 16 BITS · 8 JUGADORS" scale={Math.max(1, s - 2)} color="#9fb4e8" />
      </div>
      <div className="menu-col">
        <PixelButton label="JUGAR TORNEIG" scale={s} variant="primary" onClick={onPlay} sub={`${p.shortName} · ${DIFFICULTY[settings.difficulty].label}`} />
        <PixelButton label="SELECCIONAR JUGADOR" scale={s - 1} onClick={onSelect} />
        <PixelButton label="SELECCIONAR DIFICULTAT" scale={s - 1} onClick={onDifficulty} />
        <PixelButton label="VEURE CLASSIFICACIÓ" scale={s - 1} onClick={onRanking} />
        <PixelButton label="OPCIONS DE SO" scale={s - 1} onClick={onOptions} />
        <PixelButton label="CONTROLS" scale={s - 1} onClick={onControls} />
      </div>
    </div>
  );
}

function Bar({ label, v }: { label: string; v: number }) {
  return (
    <div className="statbar">
      <PixelText text={label} scale={1} color="#9fb4e8" />
      <div className="bar">
        <div className="bar-fill" style={{ width: `${v}%` }} />
      </div>
      <PixelText text={String(v)} scale={1} color="#ffffff" />
    </div>
  );
}

export function PlayerCard({ def, selected, onClick, compact = false }: { def: PlayerDef; selected?: boolean; onClick?: () => void; compact?: boolean }) {
  return (
    <button className={`pcard ${selected ? 'sel' : ''} ${compact ? 'compact' : ''}`} onClick={onClick}>
      <SpritePreview def={def} scale={compact ? 1 : 2} />
      <PixelText text={def.shortName} scale={2} color={selected ? '#ffe066' : '#ffffff'} />
      <Bar label="VEL" v={def.stats.speed} />
      <Bar label="POT" v={def.stats.power} />
      <Bar label="PRE" v={def.stats.precision} />
      <Bar label="RES" v={def.stats.stamina} />
    </button>
  );
}

export function PlayerSelect({ settings, onPick, onBack }: { settings: Settings; onPick: (id: string) => void; onBack: () => void }) {
  const [cur, setCur] = useState(settings.playerId);
  const vp = useViewport();
  // Amb 8 targetes, en pantalles baixes es fan més compactes perquè hi càpiga tot
  const compact = vp.h < 860;
  const def = ROSTER.find((r) => r.id === cur)!;
  return (
    <div className="panel-screen">
      <PixelText text="TRIA EL TEU JUGADOR" scale={compact ? 2 : 3} color="#ffe066" />
      <div className="pgrid">
        {ROSTER.map((r) => (
          <PlayerCard key={r.id} def={r} selected={r.id === cur} compact={compact} onClick={() => setCur(r.id)} />
        ))}
      </div>
      <div className="pinfo">
        <PixelText text={def.name.toUpperCase()} scale={3} color="#ffffff" />
        <PixelText text={def.tagline.toUpperCase()} scale={1} color="#9fb4e8" />
        <PixelText text={`ESTIL: ${def.style.label.toUpperCase()}`} scale={1} color="#cfe0ff" />
        <PixelText text={`${def.style.lefty ? 'ESQUERRÀ' : 'DESTRE'} · ${def.style.oneHandBackhand ? 'REVÉS A UNA MÀ' : 'REVÉS A DUES MANS'}`} scale={1} color="#cfe0ff" />
      </div>
      <div className="row sticky-actions">
        <PixelButton label="ENRERE" onClick={onBack} />
        <PixelButton label="CONFIRMAR" variant="primary" onClick={() => onPick(cur)} />
      </div>
    </div>
  );
}

export function DifficultySelect({ settings, onPick, onBack }: { settings: Settings; onPick: (d: Difficulty) => void; onBack: () => void }) {
  const desc: Record<Difficulty, string> = {
    easy: 'Reacciona tard, falla més i corre menys.',
    normal: 'Equilibrat: erra de tant en tant.',
    hard: 'Prediu bé, es mou ràpid i erra poc.',
  };
  return (
    <div className="panel-screen">
      <PixelText text="DIFICULTAT" scale={4} color="#ffe066" />
      <div className="menu-col">
        {DIFFICULTIES.map((d) => (
          <PixelButton
            key={d}
            label={DIFFICULTY[d].label}
            scale={4}
            variant={settings.difficulty === d ? 'primary' : 'secondary'}
            sub={desc[d].toUpperCase()}
            onClick={() => onPick(d)}
          />
        ))}
      </div>
      <PixelButton label="ENRERE" onClick={onBack} />
    </div>
  );
}

export function RankingScreen({ ranking, onBack }: { ranking: Ranking; onBack: () => void }) {
  const rows = [...ROSTER].sort((a, b) => {
    const ra = ranking[a.id];
    const rb = ranking[b.id];
    return rb.titles - ra.titles || rb.won - ra.won || b.rating - a.rating;
  });
  return (
    <div className="panel-screen">
      <PixelText text="CLASSIFICACIÓ" scale={4} color="#ffe066" />
      <div className="table">
        <div className="trow thead">
          {['#', 'JUGADOR', 'TÍTOLS', 'PJ', 'G', 'P', 'NIVELL'].map((h) => (
            <PixelText key={h} text={h} scale={1} color="#9fb4e8" />
          ))}
        </div>
        {rows.map((r, i) => {
          const e = ranking[r.id];
          return (
            <div className="trow" key={r.id}>
              <PixelText text={String(i + 1)} scale={2} color="#ffe066" />
              <PixelText text={r.shortName} scale={2} />
              <PixelText text={String(e.titles)} scale={2} color="#ffe066" />
              <PixelText text={String(e.played)} scale={2} />
              <PixelText text={String(e.won)} scale={2} color="#6cff6c" />
              <PixelText text={String(e.lost)} scale={2} color="#ff8a7a" />
              <PixelText text={String(r.rating)} scale={2} color="#8cf0ff" />
            </div>
          );
        })}
      </div>
      <PixelPara text="EL RÀNQUING ES GUARDA AL NAVEGADOR. ELS TÍTOLS ES GUANYEN GUANYANT LA FINAL." maxChars={46} scale={1} color="#6f86bd" align="center" />
      <PixelButton label="ENRERE" onClick={onBack} />
    </div>
  );
}

export function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="slider">
      <PixelText text={label} scale={2} />
      <input type="range" min={0} max={100} value={Math.round(value * 100)} onChange={(e) => onChange(Number(e.target.value) / 100)} aria-label={label} />
      <PixelText text={`${Math.round(value * 100)}`} scale={2} color="#ffe066" />
    </div>
  );
}

export function OptionsScreen({ settings, onChange, onBack }: { settings: Settings; onChange: (s: Settings) => void; onBack: () => void }) {
  const a = settings.audio;
  const setA = (p: Partial<Settings['audio']>): void => {
    const next = { ...settings, audio: { ...a, ...p } };
    audio.setSettings(next.audio);
    onChange(next);
  };
  useEffect(() => {
    audio.unlock();
  }, []);
  return (
    <div className="panel-screen">
      <PixelText text="OPCIONS DE SO" scale={4} color="#ffe066" />
      <div className="options">
        <Slider label="VOLUM GENERAL" value={a.master} onChange={(v) => setA({ master: v })} />
        <Slider label="EFECTES" value={a.sfx} onChange={(v) => setA({ sfx: v })} />
        <Slider label="PÚBLIC" value={a.crowd} onChange={(v) => setA({ crowd: v })} />
        <Slider label="MÚSICA" value={a.music} onChange={(v) => setA({ music: v })} />
        <div className="optrow">
          <PixelButton label={`VEU DEL JUTGE: ${a.voice ? 'SÍ' : 'NO'}`} scale={2} onClick={() => setA({ voice: !a.voice })} />
          <PixelButton label={`GUIA DE PUNTERIA: ${settings.assist ? 'SÍ' : 'NO'}`} scale={2} onClick={() => onChange({ ...settings, assist: !settings.assist })} />
          <PixelButton
            label={`CONTROLS TÀCTILS: ${settings.touch === 'auto' ? 'AUTO' : settings.touch === 'on' ? 'SEMPRE' : 'MAI'}`}
            scale={2}
            onClick={() => onChange({ ...settings, touch: settings.touch === 'auto' ? 'on' : settings.touch === 'on' ? 'off' : 'auto' })}
          />
        </div>
        <PixelButton
          label="PROVAR SO"
          scale={2}
          onClick={() => {
            audio.unlock();
            audio.hit('fh', 'flat', 0.8);
            window.setTimeout(() => audio.bounce(8, 20), 250);
            window.setTimeout(() => audio.applause(0.6), 500);
            window.setTimeout(() => audio.announce('Quinze a zero'), 900);
          }}
        />
      </div>
      <PixelButton label="ENRERE" onClick={onBack} />
    </div>
  );
}

export const CONTROL_ROWS: [string, string][] = [
  ['WASD / FLETXES', 'MOURE I APUNTAR EL COP'],
  ['ESPAI', 'COP PLA · SERVEI (DUES PULSACIONS)'],
  ['J', 'SLICE (CAP I BAIX, BOT BAIX)'],
  ['K', 'TOPSPIN (ARC ALT I BOT FORT)'],
  ['L', 'LOB (PER SOBRE DEL RIVAL)'],
  ['SHIFT', 'CÓRRER (GASTA RESISTÈNCIA)'],
  ['P / ESC', 'PAUSA'],
  ['RATOLÍ', 'MENÚS'],
];

export function ControlsScreen({ onBack }: { onBack: () => void }) {
  const rows = CONTROL_ROWS;
  return (
    <div className="panel-screen">
      <PixelText text="CONTROLS" scale={4} color="#ffe066" />
      <div className="table">
        {rows.map(([k, v]) => (
          <div className="crow" key={k}>
            <PixelText text={k} scale={2} color="#8cf0ff" />
            <PixelText text={v} scale={1} color="#ffffff" />
          </div>
        ))}
      </div>
      <PixelPara
        text="SERVEI: PRÉMER UNA VEGADA PER LLANÇAR LA PILOTA I UNA ALTRA PERQUÈ SIGUI EN EL PUNT MÉS ALT. AMB EL PAD APUNTES: ESQUERRA/DRETA = DIRECCIÓ, AMUNT = MÉS FORT I PROFUND, AVALL = SUAU I CURT. EN MÒBIL: JOYSTICK A L'ESQUERRA I BOTONS A LA DRETA."
        maxChars={52}
        scale={1}
        color="#cfe0ff"
        align="center"
      />
      <PixelButton label="ENRERE" onClick={onBack} />
    </div>
  );
}

export function Loading() {
  const vp = useViewport();
  return (
    <div className="panel-screen">
      <PixelText text="CARREGANT..." scale={vp.ps + 1} />
    </div>
  );
}
