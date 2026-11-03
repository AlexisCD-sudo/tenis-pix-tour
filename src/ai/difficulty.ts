export type Difficulty = 'easy' | 'normal' | 'hard';

export interface DifficultyParams {
  label: string;
  /** Temps de reacció abans que la IA comenci a moure's (s). */
  reaction: number;
  /** Error de percepció inicial de la trajectòria (m). */
  perceptionNoise: number;
  /** Multiplicador de velocitat de desplaçament. */
  speedMult: number;
  /** Multiplicador d'error en els cops. */
  errorMult: number;
  /** Multiplicador de potència. */
  powerMult: number;
  /** Probabilitat de triar bé el cop/zona (intel·ligència tàctica). */
  tactics: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultyParams> = {
  easy: { label: 'FÀCIL', reaction: 0.3, perceptionNoise: 1.6, speedMult: 0.86, errorMult: 1.7, powerMult: 0.9, tactics: 0.35 },
  normal: { label: 'NORMAL', reaction: 0.2, perceptionNoise: 0.85, speedMult: 0.96, errorMult: 1.05, powerMult: 0.98, tactics: 0.65 },
  hard: { label: 'DIFÍCIL', reaction: 0.12, perceptionNoise: 0.35, speedMult: 1.04, errorMult: 0.7, powerMult: 1.04, tactics: 0.9 },
};

export const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];
