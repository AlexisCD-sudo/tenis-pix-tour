/**
 * Els sis tennistes del torneig. Noms ficticis amb jocs de paraules;
 * l'aparença s'inspira en pentinat, equipació i complexió dels reals.
 */
export type HairStyle = 'crop' | 'quiff' | 'swept' | 'long' | 'slick' | 'short';
export type Accessory = 'none' | 'headband' | 'cap';
export type Beard = 'none' | 'stubble';

export interface PlayerLook {
  skin: string;
  skinShade: string;
  hair: string;
  hairStyle: HairStyle;
  beard: Beard;
  accessory: Accessory;
  accColor: string;
  shirt: string;
  shirtTrim: string;
  sleeveless: boolean;
  shorts: string;
  shortsTrim: string;
  capri: boolean;
  shoes: string;
  socks: string;
  racketFrame: string;
  /** Alçada en metres. */
  height: number;
  /** Corpulència (0.85 prim .. 1.2 fort). */
  build: number;
}

export interface PlayerStats {
  speed: number; // 1..100 velocitat de desplaçament
  power: number; // potència de cop
  precision: number; // precisió
  stamina: number; // resistència
}

export interface PlayerStyle {
  /** Descripció curta de l'estil de joc. */
  label: string;
  /** Tendència a pujar a la xarxa (0..1). */
  netTendency: number;
  /** Agressivitat: cops guanyadors i profunditat (0..1). */
  aggression: number;
  /** Preferència per cada tipus de cop (pesos relatius). */
  topspinPref: number;
  slicePref: number;
  lobPref: number;
  /** Probabilitat de fer dropshot/cop curt. */
  dropPref: number;
  /** Multiplicador de gir general. */
  spinBonus: number;
  /** Bonus de servei (multiplica la velocitat del servei). */
  serveBonus: number;
  /** Distància darrere la línia de fons on s'espera (m). */
  baselineOffset: number;
  lefty: boolean;
  oneHandBackhand: boolean;
  /** Velocitat de l'animació del cop (1 = normal). */
  swingSpeed: number;
  /** Llargada de la gambada en córrer. */
  stride: number;
  /** Llisca amb les cames obertes en pilotes obertes. */
  slide: boolean;
  /** Final de cop "llaç" per sobre l'espatlla. */
  lasso: boolean;
}

export interface PlayerDef {
  id: string;
  name: string;
  shortName: string;
  tagline: string;
  look: PlayerLook;
  stats: PlayerStats;
  style: PlayerStyle;
  /** Valoració global (mitjana d'estadístiques) per sembrar el quadre. */
  rating: number;
}

const mk = (d: Omit<PlayerDef, 'rating'>): PlayerDef => ({
  ...d,
  rating: Math.round((d.stats.speed + d.stats.power + d.stats.precision + d.stats.stamina) / 4),
});

export const ROSTER: PlayerDef[] = [
  mk({
    id: 'winner',
    name: 'Janick Winner',
    shortName: 'WINNER',
    tagline: 'Agressiu de fons de pista',
    look: {
      skin: '#f2c9a5',
      skinShade: '#d9a883',
      hair: '#d9541e',
      hairStyle: 'crop',
      beard: 'none',
      accessory: 'none',
      accColor: '#ffffff',
      shirt: '#f2f2f2',
      shirtTrim: '#e8641c',
      sleeveless: false,
      shorts: '#1d2a5a',
      shortsTrim: '#e8641c',
      capri: false,
      shoes: '#ffffff',
      socks: '#ffffff',
      racketFrame: '#c43a2a',
      height: 1.91,
      build: 0.88,
    },
    stats: { speed: 80, power: 88, precision: 90, stamina: 82 },
    style: {
      label: 'Cops plans i profunds des del fons',
      netTendency: 0.15,
      aggression: 0.8,
      topspinPref: 0.3,
      slicePref: 0.1,
      lobPref: 0.05,
      dropPref: 0.03,
      spinBonus: 0.9,
      serveBonus: 1.02,
      baselineOffset: 0.6,
      lefty: false,
      oneHandBackhand: false,
      swingSpeed: 1.05,
      stride: 1.0,
      slide: false,
      lasso: false,
    },
  }),
  mk({
    id: 'alcaramba',
    name: 'Carlos Alcaramba',
    shortName: 'ALCARAMBA',
    tagline: 'Tot terreny, dropshots i explosivitat',
    look: {
      skin: '#e0a878',
      skinShade: '#c68a5c',
      hair: '#2a1a12',
      hairStyle: 'quiff',
      beard: 'none',
      accessory: 'none',
      accColor: '#ffffff',
      shirt: '#c6f21a',
      shirtTrim: '#1b1b1b',
      sleeveless: true,
      shorts: '#25272e',
      shortsTrim: '#c6f21a',
      capri: false,
      shoes: '#e8ff4a',
      socks: '#ffffff',
      racketFrame: '#1b1b1b',
      height: 1.83,
      build: 1.08,
    },
    stats: { speed: 94, power: 86, precision: 85, stamina: 88 },
    style: {
      label: 'Imprevisible, velocitat i dropshots',
      netTendency: 0.2,
      aggression: 0.6,
      topspinPref: 0.35,
      slicePref: 0.12,
      lobPref: 0.1,
      dropPref: 0.06,
      spinBonus: 1.1,
      serveBonus: 1.0,
      baselineOffset: 0.3,
      lefty: false,
      oneHandBackhand: false,
      swingSpeed: 1.2,
      stride: 1.1,
      slide: true,
      lasso: false,
    },
  }),
  mk({
    id: 'djokobits',
    name: 'Novac Djokobits',
    shortName: 'DJOKOBITS',
    tagline: 'Defensa elàstica i restador mestre',
    look: {
      skin: '#eac09b',
      skinShade: '#cf9d77',
      hair: '#1c1612',
      hairStyle: 'swept',
      beard: 'stubble',
      accessory: 'none',
      accColor: '#ffffff',
      shirt: '#f4f6fa',
      shirtTrim: '#2a6cd0',
      sleeveless: false,
      shorts: '#f4f6fa',
      shortsTrim: '#2a6cd0',
      capri: false,
      shoes: '#e9eef7',
      socks: '#ffffff',
      racketFrame: '#2b2b30',
      height: 1.88,
      build: 0.95,
    },
    stats: { speed: 88, power: 78, precision: 92, stamina: 97 },
    style: {
      label: 'Contraatac i devolucions perfectes',
      netTendency: 0.12,
      aggression: 0.5,
      topspinPref: 0.25,
      slicePref: 0.22,
      lobPref: 0.12,
      dropPref: 0.03,
      spinBonus: 0.95,
      serveBonus: 0.97,
      baselineOffset: 0.9,
      lefty: false,
      oneHandBackhand: false,
      swingSpeed: 1.0,
      stride: 1.05,
      slide: true,
      lasso: false,
    },
  }),
  mk({
    id: 'nadol',
    name: 'Rafa Nadol',
    shortName: 'NADOL',
    tagline: 'Esquerrà, topspin brutal i garra',
    look: {
      skin: '#d49866',
      skinShade: '#b87b4c',
      hair: '#1b130e',
      hairStyle: 'long',
      beard: 'none',
      accessory: 'headband',
      accColor: '#f2f2f2',
      shirt: '#ffe23a',
      shirtTrim: '#1a1a1a',
      sleeveless: true,
      shorts: '#1f6fd0',
      shortsTrim: '#ffe23a',
      capri: true,
      shoes: '#ffe23a',
      socks: '#ffffff',
      racketFrame: '#d02b2b',
      height: 1.85,
      build: 1.16,
    },
    stats: { speed: 90, power: 80, precision: 78, stamina: 93 },
    style: {
      label: 'Topspin pesat i resistència infinita',
      netTendency: 0.08,
      aggression: 0.6,
      topspinPref: 0.45,
      slicePref: 0.08,
      lobPref: 0.08,
      dropPref: 0.05,
      spinBonus: 1.15,
      serveBonus: 0.98,
      baselineOffset: 1.3,
      lefty: true,
      oneHandBackhand: false,
      swingSpeed: 1.1,
      stride: 1.0,
      slide: false,
      lasso: true,
    },
  }),
  mk({
    id: 'fedepixel',
    name: 'Rogelio Fedepixel',
    shortName: 'FEDEPIXEL',
    tagline: 'Elegància, servei i volea',
    look: {
      skin: '#f0c8a6',
      skinShade: '#d6a780',
      hair: '#6b4a2b',
      hairStyle: 'slick',
      beard: 'none',
      accessory: 'headband',
      accColor: '#ffffff',
      shirt: '#ffffff',
      shirtTrim: '#14305f',
      sleeveless: false,
      shorts: '#ffffff',
      shortsTrim: '#14305f',
      capri: false,
      shoes: '#ffffff',
      socks: '#ffffff',
      racketFrame: '#1d1d1d',
      height: 1.85,
      build: 0.93,
    },
    stats: { speed: 83, power: 85, precision: 96, stamina: 82 },
    style: {
      label: 'Revés a una mà, servei-volea',
      netTendency: 0.3,
      aggression: 0.6,
      topspinPref: 0.3,
      slicePref: 0.18,
      lobPref: 0.05,
      dropPref: 0.08,
      spinBonus: 0.85,
      serveBonus: 1.04,
      baselineOffset: 0.8,
      lefty: false,
      oneHandBackhand: true,
      swingSpeed: 0.95,
      stride: 0.95,
      slide: false,
      lasso: false,
    },
  }),
  mk({
    id: 'medvedit',
    name: 'Daniil Medvedit',
    shortName: 'MEDVEDIT',
    tagline: 'Gegant, servei potent i defensa de fons',
    look: {
      skin: '#f0cfb4',
      skinShade: '#d8ad8e',
      hair: '#3a2a20',
      hairStyle: 'short',
      beard: 'none',
      accessory: 'cap',
      accColor: '#1fb5b0',
      shirt: '#1fb5b0',
      shirtTrim: '#0d4d63',
      sleeveless: false,
      shorts: '#0d4d63',
      shortsTrim: '#1fb5b0',
      capri: false,
      shoes: '#e8f6f6',
      socks: '#ffffff',
      racketFrame: '#2a7de0',
      height: 1.98,
      build: 0.86,
    },
    stats: { speed: 70, power: 92, precision: 82, stamina: 85 },
    style: {
      label: 'Servei enorme i defensa elàstica',
      netTendency: 0.12,
      aggression: 0.45,
      topspinPref: 0.15,
      slicePref: 0.25,
      lobPref: 0.1,
      dropPref: 0.02,
      spinBonus: 0.85,
      serveBonus: 1.08,
      baselineOffset: 2.0,
      lefty: false,
      oneHandBackhand: false,
      swingSpeed: 0.9,
      stride: 1.25,
      slide: false,
      lasso: false,
    },
  }),
  mk({
    id: 'zverbyte',
    name: 'Sasha Zverbyte',
    shortName: 'ZVERBYTE',
    tagline: 'Gegant de fons amb servei i revés demolidors',
    look: {
      skin: '#f1cdb0',
      skinShade: '#d6a98a',
      hair: '#8a6a3c',
      hairStyle: 'short',
      beard: 'stubble',
      accessory: 'none',
      accColor: '#ffffff',
      shirt: '#1c2540',
      shirtTrim: '#e0382d',
      sleeveless: false,
      shorts: '#1c2540',
      shortsTrim: '#e0382d',
      capri: false,
      shoes: '#f2f2f2',
      socks: '#ffffff',
      racketFrame: '#e0382d',
      height: 1.98,
      build: 0.92,
    },
    stats: { speed: 74, power: 91, precision: 82, stamina: 84 },
    style: {
      label: 'Servei i revés a dues mans des del fons',
      netTendency: 0.15,
      aggression: 0.65,
      topspinPref: 0.25,
      slicePref: 0.15,
      lobPref: 0.07,
      dropPref: 0.03,
      spinBonus: 0.95,
      serveBonus: 1.07,
      baselineOffset: 1.8,
      lefty: false,
      oneHandBackhand: false,
      swingSpeed: 0.92,
      stride: 1.2,
      slide: false,
      lasso: false,
    },
  }),
  mk({
    id: 'tsitsipixel',
    name: 'Stefanos Tsitsipixel',
    shortName: 'TSITSIPIXEL',
    tagline: 'Revés a una mà i atac constant',
    look: {
      skin: '#e6b891',
      skinShade: '#c99870',
      hair: '#6a4a2a',
      hairStyle: 'long',
      beard: 'none',
      accessory: 'headband',
      accColor: '#ffffff',
      shirt: '#7a4bd0',
      shirtTrim: '#ffffff',
      sleeveless: false,
      shorts: '#2a1f5a',
      shortsTrim: '#7a4bd0',
      capri: false,
      shoes: '#ffffff',
      socks: '#ffffff',
      racketFrame: '#2a1f5a',
      height: 1.93,
      build: 0.94,
    },
    stats: { speed: 85, power: 85, precision: 84, stamina: 80 },
    style: {
      label: 'Drive potent, revés a una mà i volees',
      netTendency: 0.25,
      aggression: 0.78,
      topspinPref: 0.3,
      slicePref: 0.15,
      lobPref: 0.05,
      dropPref: 0.05,
      spinBonus: 1.05,
      serveBonus: 1.03,
      baselineOffset: 0.4,
      lefty: false,
      oneHandBackhand: true,
      swingSpeed: 1.08,
      stride: 1.05,
      slide: false,
      lasso: false,
    },
  }),
];

export const getPlayerDef = (id: string): PlayerDef => {
  const d = ROSTER.find((p) => p.id === id);
  if (!d) throw new Error(`Jugador desconegut: ${id}`);
  return d;
};
