import { Ctx } from './pixel';
import { DrawSpec, drawPlayerSprite } from './sprites';

/**
 * Acabat pixel art dels personatges: el sprite es dibuixa pla en un llenç auxiliar
 * i després s'hi afegeix un contorn fosc d'1 píxel (del to de la zona veïna) i
 * llum/ombra a les vores (llum des de dalt a l'esquerra), cosa que dona volum
 * i separa les parts (braços, tors, cap) com als sprites de 16 bits.
 */
let off: HTMLCanvasElement | null = null;
let offCtx: CanvasRenderingContext2D | null = null;
let out: HTMLCanvasElement | null = null;
let outCtx: CanvasRenderingContext2D | null = null;

function ensure(w: number, h: number): void {
  if (!off) {
    off = document.createElement('canvas');
    out = document.createElement('canvas');
  }
  if (off.width !== w || off.height !== h) {
    off.width = out!.width = w;
    off.height = out!.height = h;
    offCtx = off.getContext('2d', { willReadFrequently: true })!;
    outCtx = out!.getContext('2d')!;
  }
}

export interface Finished {
  /** Centre del cap de la raqueta en coordenades del llenç de destí. */
  racketX: number;
  racketY: number;
}

const clamp8 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

export function drawPlayerFinished(ctx: Ctx, d: DrawSpec): Finished {
  const w = Math.ceil(3.4 * d.s) + 12;
  const h = Math.ceil(3.8 * d.s) + 12;
  ensure(w, h);
  const g = offCtx!;
  g.clearRect(0, 0, w, h);
  g.imageSmoothingEnabled = false;
  const ax = Math.round(w / 2);
  const ay = h - 6;
  const rk = drawPlayerSprite(g, { ...d, x: ax, y: ay });

  const src = g.getImageData(0, 0, w, h);
  const s = src.data;
  const dst = new ImageData(w, h);
  const o = dst.data;
  const A = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && s[(y * w + x) * 4 + 3] > 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (s[i + 3] > 0) {
        const up = A(x, y - 1);
        const left = A(x - 1, y);
        const down = A(x, y + 1);
        const right = A(x + 1, y);
        let f = 1;
        if (!up || !left) f = 1.16;
        else if (!down || !right) f = 0.8;
        if (!down) f = Math.min(f, 0.76);
        o[i] = clamp8(s[i] * f);
        o[i + 1] = clamp8(s[i + 1] * f);
        o[i + 2] = clamp8(s[i + 2] * f);
        o[i + 3] = 255;
      } else {
        // contorn: pinta del to fosc del veí opac
        let n = -1;
        if (A(x, y + 1)) n = ((y + 1) * w + x) * 4;
        else if (A(x - 1, y)) n = (y * w + x - 1) * 4;
        else if (A(x + 1, y)) n = (y * w + x + 1) * 4;
        else if (A(x, y - 1)) n = ((y - 1) * w + x) * 4;
        if (n >= 0) {
          o[i] = clamp8(s[n] * 0.28 + 6);
          o[i + 1] = clamp8(s[n + 1] * 0.28 + 8);
          o[i + 2] = clamp8(s[n + 2] * 0.3 + 18);
          o[i + 3] = 255;
        }
      }
    }
  }
  outCtx!.putImageData(dst, 0, 0);
  const bx = Math.round(d.x) - ax;
  const by = Math.round(d.y) - ay;
  ctx.drawImage(out!, bx, by);
  return { racketX: bx + rk.x, racketY: by + rk.y };
}
