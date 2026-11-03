/**
 * Constants del món de joc. Totes les unitats són SI (metres, segons, rad/s).
 * Sistema de coordenades del món:
 *   x  -> lateral (positiu = dreta de la pantalla)
 *   y  -> profunditat de la pista. La xarxa és a y = 0.
 *         El jugador humà és sempre al costat y > 0 (a prop de la càmera).
 *   z  -> altura sobre el terra.
 */

/** Pas fix de simulació (determinista i independent dels FPS). */
export const DT = 1 / 120;

/** Velocitat del joc respecte al temps real (<1 = una mica més lent i jugable). */
export const TIME_SCALE = 0.85;

export const COURT = {
  halfL: 11.885, // mitja longitud (línia de fons)
  halfWs: 4.115, // mitja amplada individuals
  halfWd: 5.485, // mitja amplada dobles (només decorativa)
  serviceY: 6.401, // línia de servei
  netCenterH: 0.914,
  netPostH: 1.07,
  netHalf: 6.4, // posició dels pals
} as const;

export const BALL = {
  r: 0.033,
  g: 9.81,
  /** Arrossegament aerodinàmic (a = -kD·|v|·v). */
  kD: 0.0205,
  /** Coeficient Magnus (a = kM · ω × v). */
  kM: 0.00085,
  /** Decaïment del gir a l'aire (1/s). */
  spinDecay: 0.1,
} as const;

export const SURFACE = {
  /** Pista dura. */
  restitution: 0.76,
  friction: 0.62,
  rollDamp: 1.3,
} as const;

/** Tanques publicitàries darrere la pista. */
export const WALL = {
  backY: 18.3,
  sideX: 9.6,
} as const;

/** Altura del cinturó de la xarxa en una posició x. */
export function netHeightAt(x: number): number {
  const k = Math.min(1, Math.abs(x) / COURT.netHalf);
  return COURT.netCenterH + (COURT.netPostH - COURT.netCenterH) * k * k;
}
