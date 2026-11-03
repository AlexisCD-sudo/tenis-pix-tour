import { COURT } from '../engine/constants';
import { BAYER4, hexToRgb } from './pixel';
import { CAM, H, W, groundAt, rayDir } from './projection';

/**
 * Fons estàtic: pista, tanques i grades. Es calcula UNA vegada amb un traçat
 * de raigs per píxel contra uns quants plans (terra, tanca, graderia inclinada),
 * de manera que tot queda en perspectiva i sense antialiàsing.
 */
export const BOARD_Y = -18.3;
const STAND_START = 18.8;
const STAND_SLOPE = 0.6;
const STAND_BASE_Z = 1.1;
const SIDE_START = 10.2;

const INNER = ['#3d74c6', '#3870c0'];
const OUTER = ['#2f8c66', '#2b8461'];

function hash(a: number, b: number): number {
  let h = Math.imul(a * 374761393 + b * 668265263, 1274126177);
  h = (h ^ (h >>> 13)) >>> 0;
  return (h % 1000) / 1000;
}

type RGB = [number, number, number];

function shadeRgb(c: RGB, f: number): RGB {
  return [Math.min(255, c[0] * f), Math.min(255, c[1] * f), Math.min(255, c[2] * f)];
}

function lineHit(x: number, y: number, hwx: number, hwy: number): boolean {
  const { halfL, halfWs, halfWd, serviceY } = COURT;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  // línies de fons
  if (Math.abs(ay - halfL) <= hwy && ax <= halfWd + hwx) return true;
  // laterals dobles i individuals
  if (ay <= halfL + hwy) {
    if (Math.abs(ax - halfWd) <= hwx) return true;
    if (Math.abs(ax - halfWs) <= hwx) return true;
  }
  // línia de servei
  if (Math.abs(ay - serviceY) <= hwy && ax <= halfWs + hwx) return true;
  // central de servei
  if (ax <= hwx && ay <= serviceY + hwy) return true;
  // marca central del fons
  if (ax <= hwx && ay >= halfL - 0.3 && ay <= halfL + hwy) return true;
  return false;
}

export function buildBackground(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const data = img.data;
  const innerRgb = INNER.map(hexToRgb);
  const outerRgb = OUTER.map(hexToRgb);
  const boardCols: RGB[] = ['#0b2a6e', '#b3122b', '#0b6e4f', '#e0a800', '#4b1f8f'].map(hexToRgb);
  const seatCols: RGB[] = ['#3b2d6e', '#4c3b86', '#2f3f7a', '#5a2f6e'].map(hexToRgb);

  for (let sy = 0; sy < H; sy++) {
    const below = groundAt(CAM.cx, sy + 1);
    const here = groundAt(CAM.cx, sy);
    const dyw = here && below ? Math.abs(below.y - here.y) : 1;
    for (let sx = 0; sx < W; sx++) {
      const d = rayDir(sx, sy);
      let bestT = Infinity;
      let kind: 'ground' | 'board' | 'far' | 'sideL' | 'sideR' | 'sky' = 'sky';
      // terra
      if (d.dz < -1e-6) {
        const t = -CAM.z / d.dz;
        bestT = t;
        kind = 'ground';
      }
      // tanca del fons
      if (d.dy < -1e-6) {
        const t = (BOARD_Y - CAM.y) / d.dy;
        const z = CAM.z + t * d.dz;
        if (t > 0 && t < bestT && z >= 0 && z <= 1.1) {
          bestT = t;
          kind = 'board';
        }
        // graderia del fons
        const den = d.dz + STAND_SLOPE * d.dy;
        if (Math.abs(den) > 1e-6) {
          const ts = (STAND_BASE_Z + STAND_SLOPE * STAND_START - CAM.z - STAND_SLOPE * CAM.y) / den;
          // z = BASE + SLOPE*(-y - START)  ->  z + SLOPE*y = BASE - SLOPE*START
          const ts2 = (STAND_BASE_Z - STAND_SLOPE * STAND_START - CAM.z - STAND_SLOPE * CAM.y) / den;
          void ts;
          const y = CAM.y + ts2 * d.dy;
          if (ts2 > 0 && ts2 < bestT && -y >= STAND_START && -y <= STAND_START + 17) {
            bestT = ts2;
            kind = 'far';
          }
        }
      }
      // grades laterals
      for (const sg of [-1, 1]) {
        const den = d.dz - STAND_SLOPE * sg * d.dx;
        if (Math.abs(den) > 1e-6) {
          // z = BASE + SLOPE*(sg*x - START)
          const t = (STAND_BASE_Z - STAND_SLOPE * SIDE_START - CAM.z) / den;
          const x = t * d.dx;
          const y = CAM.y + t * d.dy;
          if (t > 0 && t < bestT && sg * x >= SIDE_START && sg * x <= SIDE_START + 17 && y > -STAND_START && y < 22) {
            bestT = t;
            kind = sg < 0 ? 'sideL' : 'sideR';
          }
        }
      }

      let rgb: RGB;
      const wx = bestT === Infinity ? 0 : bestT * d.dx;
      const wy = bestT === Infinity ? 0 : CAM.y + bestT * d.dy;
      const wz = bestT === Infinity ? 0 : CAM.z + bestT * d.dz;
      const bayer = BAYER4[(sy & 3) * 4 + (sx & 3)] / 16;
      switch (kind) {
        case 'ground': {
          const ax = Math.abs(wx);
          const ay = Math.abs(wy);
          const dxw = (1 / CAM.f) * bestT * 1.0;
          const hwx = Math.max(0.055, 0.6 * dxw);
          const hwy = Math.max(0.055, 0.6 * dyw);
          const inside = ax <= COURT.halfWd && ay <= COURT.halfL;
          // llum: focus central
          const light = 1.0 - 0.28 * Math.min(1, (wx / 16) ** 2 + (wy / 24) ** 2);
          if (lineHit(wx, wy, hwx, hwy)) {
            rgb = [240, 244, 248];
            rgb = shadeRgb(rgb, 0.92 + 0.08 * light);
          } else {
            const cols = inside ? innerRgb : outerRgb;
            const n = hash(Math.floor(wx * 3), Math.floor(wy * 3));
            const base = cols[n > 0.55 ? 1 : 0];
            // tramat de llum ordenat
            const q = light + (bayer - 0.5) * 0.1;
            rgb = shadeRgb(base, q > 0.88 ? 1.04 : q > 0.78 ? 0.95 : q > 0.68 ? 0.86 : 0.76);
            // franja de joc una mica més clara al voltant de la xarxa (efecte focus)
          }
          break;
        }
        case 'board': {
          const seg = Math.floor((wx + 40) / 2.6);
          let c = boardCols[seg % boardCols.length];
          const zi = wz / 1.1;
          // tira superior fosca i patró de "text" publicitari
          if (zi > 0.9) c = [20, 24, 40];
          else {
            const lx = (wx + 40) / 2.6 - seg;
            const bar = zi > 0.3 && zi < 0.62 && lx > 0.12 && lx < 0.88 && Math.floor(lx * 18) % 3 !== 2 && hash(seg, Math.floor(lx * 18)) > 0.25;
            if (bar) c = [245, 245, 250];
          }
          rgb = shadeRgb(c, 0.9 + (bayer - 0.5) * 0.08);
          break;
        }
        case 'far': {
          const depth = -wy - STAND_START;
          const row = Math.floor(depth / 1.05);
          const frac = depth / 1.05 - row;
          const col = Math.floor((wx + 60) / 0.75);
          let c = seatCols[(row + Math.floor((wx + 60) / 6)) % seatCols.length];
          if (frac < 0.12) c = [150, 150, 165]; // graó de formigó
          else if (frac < 0.3) c = shadeRgb(c, 0.7);
          if (Math.floor((wx + 60) / 3.0) % 5 === 0 && Math.abs(((wx + 60) % 3.0) - 0) < 0.12) c = [110, 110, 125]; // passadís
          const dim = 1 - Math.min(0.55, row * 0.045);
          rgb = shadeRgb(c, dim * (0.92 + (bayer - 0.5) * 0.1));
          void col;
          break;
        }
        case 'sideL':
        case 'sideR': {
          const sg = kind === 'sideL' ? -1 : 1;
          const depth = sg * wx - SIDE_START;
          const row = Math.floor(depth / 1.05);
          const frac = depth / 1.05 - row;
          let c = seatCols[(row + Math.floor((wy + 60) / 6)) % seatCols.length];
          if (frac < 0.12) c = [150, 150, 165];
          else if (frac < 0.3) c = shadeRgb(c, 0.7);
          const dim = 1 - Math.min(0.55, row * 0.045);
          rgb = shadeRgb(c, dim * 0.85 * (0.92 + (bayer - 0.5) * 0.1));
          break;
        }
        default: {
          // cel nocturn amb degradat tramat
          const g = 1 - sy / 90;
          rgb = shadeRgb([14, 20, 52], 0.7 + 0.6 * Math.max(0, g) + (bayer - 0.5) * 0.12);
        }
      }
      const i = (sy * W + sx) * 4;
      data[i] = rgb[0];
      data[i + 1] = rgb[1];
      data[i + 2] = rgb[2];
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export interface Seat {
  x: number;
  y: number;
  z: number;
  /** Fila (0 = més a prop de la pista). */
  row: number;
  hue: number;
  phase: number;
  /** Zona d'on és: per sincronitzar reaccions. */
  zone: 'far' | 'left' | 'right';
}

/** Posicions 3D de cada espectador (per sobre de cada seient). */
export function buildSeats(): Seat[] {
  const seats: Seat[] = [];
  let k = 0;
  for (let r = 1; r < 15; r++) {
    const d = STAND_START + r * 1.05 + 0.5;
    const z = STAND_BASE_Z + (d - STAND_START) * STAND_SLOPE + 0.1;
    for (let xx = -22; xx <= 22; xx += 0.78) {
      const h = hash(k++, r);
      seats.push({ x: xx + (h - 0.5) * 0.3, y: -d, z, row: r, hue: Math.floor(h * 997) % 12, phase: h * 6.28, zone: 'far' });
    }
  }
  for (const sg of [-1, 1]) {
    for (let r = 1; r < 14; r++) {
      const d = SIDE_START + r * 1.05 + 0.5;
      const z = STAND_BASE_Z + (d - SIDE_START) * STAND_SLOPE + 0.1;
      for (let yy = -17; yy <= 20; yy += 0.9) {
        const h = hash(k++, r + 50);
        seats.push({ x: sg * d, y: yy + (h - 0.5) * 0.3, z, row: r, hue: Math.floor(h * 997) % 12, phase: h * 6.28, zone: sg < 0 ? 'left' : 'right' });
      }
    }
  }
  return seats;
}
