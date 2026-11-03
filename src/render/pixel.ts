/** Primitives de dibuix sense antialiàsing (tot en píxels enters). */
export type Ctx = CanvasRenderingContext2D;

export function px(ctx: Ctx, x: number, y: number, color: string, s = 1): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), s, s);
}

export function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  ctx.fillRect(x0, y0, Math.max(1, Math.round(x + w) - x0), Math.max(1, Math.round(y + h) - y0));
}

/** Línia gruixuda de Bresenham amb pinzell quadrat de `w` píxels. */
export function line(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, w: number, color: string): void {
  ctx.fillStyle = color;
  let ax = Math.round(x0);
  let ay = Math.round(y0);
  const bx = Math.round(x1);
  const by = Math.round(y1);
  const dx = Math.abs(bx - ax);
  const dy = -Math.abs(by - ay);
  const sx = ax < bx ? 1 : -1;
  const sy = ay < by ? 1 : -1;
  let err = dx + dy;
  const off = Math.floor((w - 1) / 2);
  for (let i = 0; i < 400; i++) {
    ctx.fillRect(ax - off, ay - off, w, w);
    if (ax === bx && ay === by) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      ax += sx;
    }
    if (e2 <= dx) {
      err += dx;
      ay += sy;
    }
  }
}

export function disc(ctx: Ctx, cx: number, cy: number, r: number, color: string): void {
  ctx.fillStyle = color;
  const x0 = Math.round(cx);
  const y0 = Math.round(cy);
  const ri = Math.max(1, Math.round(r));
  for (let y = -ri; y <= ri; y++) {
    const half = Math.round(Math.sqrt(Math.max(0, r * r + 0.25 - y * y)));
    if (half <= 0 && Math.abs(y) > 0) continue;
    ctx.fillRect(x0 - half, y0 + y, half * 2 + 1, 1);
  }
}

/** El·lipse plena (ombres). `dither` fa un patró de escacs per simular transparència. */
export function ellipse(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, color: string, dither = false): void {
  ctx.fillStyle = color;
  const x0 = Math.round(cx);
  const y0 = Math.round(cy);
  const ryi = Math.max(1, Math.round(ry));
  for (let y = -ryi; y <= ryi; y++) {
    const t = y / ryi;
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - t * t)));
    if (dither) {
      for (let x = -half; x <= half; x++) if (((x0 + x + y0 + y) & 1) === 0) ctx.fillRect(x0 + x, y0 + y, 1, 1);
    } else ctx.fillRect(x0 - half, y0 + y, half * 2 + 1, 1);
  }
}

export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * f)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * f)));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * f)));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Matriu de Bayer 4x4 per al tramat ordenat (estil 16 bits). */
export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
