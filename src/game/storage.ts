import { Difficulty } from '../ai/difficulty';
import { AudioSettings, DEFAULT_AUDIO } from '../audio/audio';
import { ROSTER } from '../players/roster';

export interface Settings {
  playerId: string;
  difficulty: Difficulty;
  audio: AudioSettings;
  /** Ajuda de punteria al terra. */
  assist: boolean;
  /** Controls tàctils: automàtic, sempre o mai. */
  touch: 'auto' | 'on' | 'off';
}

export interface RankingEntry {
  titles: number;
  played: number;
  won: number;
  lost: number;
  /** Jocs guanyats / perduts (desempat). */
  tournaments: number;
}

export type Ranking = Record<string, RankingEntry>;

const KEY_SETTINGS = 'ptt.settings.v1';
const KEY_RANKING = 'ptt.ranking.v1';

export const defaultSettings = (): Settings => ({
  playerId: 'alcaramba',
  difficulty: 'normal',
  audio: { ...DEFAULT_AUDIO },
  assist: true,
  touch: 'auto',
});

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY_SETTINGS);
    if (raw) {
      const s = JSON.parse(raw) as Partial<Settings>;
      const d = defaultSettings();
      return { ...d, ...s, audio: { ...d.audio, ...(s.audio ?? {}) } };
    }
  } catch {
    /* ignora */
  }
  return defaultSettings();
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY_SETTINGS, JSON.stringify(s));
  } catch {
    /* ignora */
  }
}

const emptyEntry = (): RankingEntry => ({ titles: 0, played: 0, won: 0, lost: 0, tournaments: 0 });

export function loadRanking(): Ranking {
  const r: Ranking = {};
  for (const p of ROSTER) r[p.id] = emptyEntry();
  try {
    const raw = localStorage.getItem(KEY_RANKING);
    if (raw) {
      const s = JSON.parse(raw) as Ranking;
      for (const id of Object.keys(r)) if (s[id]) r[id] = { ...r[id], ...s[id] };
    }
  } catch {
    /* ignora */
  }
  return r;
}

export function saveRanking(r: Ranking): void {
  try {
    localStorage.setItem(KEY_RANKING, JSON.stringify(r));
  } catch {
    /* ignora */
  }
}

/** Anota un partit jugat al rànquing persistent. */
export function recordMatch(winnerId: string, loserId: string): void {
  const r = loadRanking();
  r[winnerId].played++;
  r[winnerId].won++;
  r[loserId].played++;
  r[loserId].lost++;
  saveRanking(r);
}

export function recordTournament(championId: string, participants: string[]): void {
  const r = loadRanking();
  r[championId].titles++;
  for (const id of participants) r[id].tournaments++;
  saveRanking(r);
}
