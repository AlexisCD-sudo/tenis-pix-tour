// Full de sprites: totes les poses del tennista en vista d'esquena i de cara (per revisar les animacions).
import { Player, Stroke, HitKey } from '../../src/players/player';
import { ROSTER } from '../../src/players/roster';
import { drawPlayerFinished } from '../../src/render/finish';
import { poseFor } from '../../src/render/sprites';

const params = new URLSearchParams(location.search);
const who = ROSTER[Number(params.get('p') ?? 1)];
const S = Number(params.get('s') ?? 46);
const Z = 2;
const cv = document.getElementById('c') as HTMLCanvasElement;
const COLW = 110;
const ROWH = 150;
type Row = { label: string; stroke?: Stroke; variant?: HitKey; special?: 'ready' | 'run' | 'toss' | 'recover' | 'celebrate' };
const rows: Row[] = [
  { label: 'READY', special: 'ready' },
  { label: 'RUN', special: 'run' },
  { label: 'FH', stroke: 'fh', variant: 'flat' },
  { label: 'BH', stroke: 'bh', variant: 'flat' },
  { label: 'SERVE', stroke: 'serve', variant: 'flat' },
  { label: 'SMASH', stroke: 'smash', variant: 'flat' },
  { label: 'VOLLEY', stroke: 'vol', variant: 'flat' },
  { label: 'LOB', stroke: 'fh', variant: 'lob' },
  { label: 'RECOVER', special: 'recover' },
];
const N = 6;
const views: ('back' | 'front')[] = ['back', 'front'];
cv.width = (N * COLW + 60) * 2 * 1;
cv.height = ROWH * rows.length * 1;
cv.style.width = `${cv.width * Z / 2}px`;
const ctx = cv.getContext('2d')!;
ctx.imageSmoothingEnabled = false;
ctx.fillStyle = '#2f7a4f';
ctx.fillRect(0, 0, cv.width, cv.height);
ctx.fillStyle = '#fff';
ctx.font = '10px monospace';
views.forEach((view, vi) => {
  const ox = vi * (N * COLW + 60);
  rows.forEach((r, ri) => {
    ctx.fillStyle = '#fff';
    ctx.fillText(`${r.label} ${view}`, ox + 4, ri * ROWH + 12);
    for (let i = 0; i < N; i++) {
      const p = new Player(view === 'back' ? 0 : 1, who);
      let tossZ: number | null = null;
      let time = 0.3;
      if (r.stroke) {
        p.beginSwing(r.stroke, r.variant!, 0, 0);
        p.swing!.t = (i / (N - 1)) * p.swing!.dur * 0.999;
      } else if (r.special === 'toss') {
        p.tossing = true;
        tossZ = 1.4 + i * 0.2;
      } else if (r.special === 'run') {
        p.vx = 4.5; p.vy = -2; p.runPhase = (i / N) * Math.PI * 2;
      } else if (r.special === 'recover') {
        p.lastStroke = 'fh'; p.lastVariant = 'flat';
        p.sinceHit = 0.3 + (i / (N - 1)) * 0.6;
      } else {
        time = i;
      }
      const pose = poseFor(p, time, tossZ);
      drawPlayerFinished(ctx, { look: who.look, style: who.style, view, s: S, x: ox + 30 + i * COLW + COLW / 2, y: ri * ROWH + ROWH - 14, pose });
    }
  });
});
(window as unknown as { ready: boolean }).ready = true;
