import { PlayerDef } from './roster';

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const dist = (a: string, b: string): number => {
  const x = rgb(a);
  const y = rgb(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};
const dark = (hex: string, f: number): string => {
  const [r, g, b] = rgb(hex);
  return `#${((1 << 24) | (Math.round(r * f) << 16) | (Math.round(g * f) << 8) | Math.round(b * f)).toString(16).slice(1)}`;
};

/** Dos equipacions són massa semblants si les samarretes (o els pantalons) gairebé es confonen. */
export function kitsClash(a: PlayerDef, b: PlayerDef): boolean {
  return dist(a.look.shirt, b.look.shirt) < 120;
}

/**
 * Equipació de visitant: si els dos jugadors vesteixen igual (per exemple tots dos de blanc),
 * el segon es posa una segona equipació amb els colors de les vores, perquè es distingeixin.
 * Conserva l'`id`, així que no afecta als resultats ni al quadre.
 */
export function resolveKits(home: PlayerDef, away: PlayerDef): [PlayerDef, PlayerDef] {
  if (!kitsClash(home, away)) return [home, away];
  const l = away.look;
  // Si el color de la vora tampoc es distingeix, es fosqueja
  const shirt = dist(l.shirtTrim, home.look.shirt) >= 120 ? l.shirtTrim : dark(l.shirt, 0.3);
  const alt: PlayerDef = {
    ...away,
    look: {
      ...l,
      shirt,
      shirtTrim: l.shirt,
      shorts: dist(shirt, l.shorts) < 60 ? dark(shirt, 0.55) : l.shorts,
      shortsTrim: l.shirt,
    },
  };
  return [home, alt];
}
