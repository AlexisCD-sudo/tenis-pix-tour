/** Tipografia pixel 3x5 (majúscules, xifres i signes) per al món i els menús. */
const G: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
  Q: '010101101111011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111',
  '0': '111101101101111', '1': '010110010010111', '2': '110001010100111', '3': '110001010001110',
  '4': '101101111001001', '5': '111100110001110', '6': '011100111101111', '7': '111001010010010',
  '8': '111101111101111', '9': '111101111001110',
  '-': '000000111000000', ':': '000010000010000', '.': '000000000000010', '!': '010010010000010',
  '?': '110001010000010', '/': '001001010100100', '%': '101001010100101', '+': '000010111010000',
  ',': '000000000010100', "'": '010010000000000', '(': '010100100100010', ')': '010001001001010',
  '·': '000000010000000', '>': '100010001010100', '<': '001010100010001', '=': '000111000111000',
  '*': '101010111010101', '#': '101111101111101', '_': '000000000000111', '&': '010101010101011', '"': '101101000000000', ';': '000010000010100',
  ' ': '000000000000000',
};

const ACCENTS: Record<string, [string, number]> = {
  À: ['A', 1], Á: ['A', 2], È: ['E', 1], É: ['E', 2], Í: ['I', 2], Ï: ['I', 3], Ò: ['O', 1], Ó: ['O', 2],
  Ú: ['U', 2], Ü: ['U', 3], Ç: ['C', 4], Ñ: ['N', 5],
};

export const FONT_W = 3;
export const FONT_H = 5;

type Plot = (x: number, y: number) => void;

function glyphBits(ch: string): string {
  return G[ch] ?? G['?'];
}

/** Dibuixa text amb una funció de punt (x, y en unitats de pixel de la font). */
export function plotText(text: string, plot: Plot, spacing = 1): void {
  let cx = 0;
  for (const raw of text.toUpperCase()) {
    let ch = raw;
    let acc = 0;
    const a = ACCENTS[raw];
    if (a) {
      ch = a[0];
      acc = a[1];
    }
    const bits = glyphBits(ch);
    for (let i = 0; i < 15; i++) {
      if (bits[i] === '1') plot(cx + (i % 3), Math.floor(i / 3));
    }
    if (acc === 1) plot(cx, -1);
    else if (acc === 2) plot(cx + 2, -1);
    else if (acc === 3) {
      plot(cx, -1);
      plot(cx + 2, -1);
    } else if (acc === 4) plot(cx + 1, 5);
    else if (acc === 5) plot(cx + 1, -1);
    cx += FONT_W + spacing;
  }
}

export function textWidth(text: string, scale = 1, spacing = 1): number {
  return Math.max(0, text.length * (FONT_W + spacing) - spacing) * scale;
}

/** Text al canvas amb contorn opcional. */
export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  scale = 1,
  outline?: string,
  align: 'left' | 'center' | 'right' = 'left',
): void {
  const w = textWidth(text, scale);
  let ox = Math.round(x);
  if (align === 'center') ox = Math.round(x - w / 2);
  else if (align === 'right') ox = Math.round(x - w);
  const oy = Math.round(y);
  if (outline) {
    ctx.fillStyle = outline;
    plotText(text, (px, py) => {
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) ctx.fillRect(ox + px * scale + dx, oy + py * scale + dy, scale, scale);
    });
  }
  ctx.fillStyle = color;
  plotText(text, (px, py) => ctx.fillRect(ox + px * scale, oy + py * scale, scale, scale));
}
