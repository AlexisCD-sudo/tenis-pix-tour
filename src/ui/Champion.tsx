import { useEffect, useRef } from 'react';
import { audio } from '../audio/audio';
import { PlayerDef } from '../players/roster';
import { PixelButton, PixelText } from './PixelText';
import { SpritePreview } from './SpritePreview';
import { useViewport } from './hooks';

interface Props {
  champion: PlayerDef;
  isHuman: boolean;
  onBracket: () => void;
  onMenu: () => void;
}

const CUP_ROWS = [14, 14, 14, 13, 13, 12, 11, 10, 9, 8];

/** Trofeu pixel art dibuixat amb files. */
function drawTrophy(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, t: number): void {
  const gold = '#f5c518';
  const light = '#fff08a';
  const dark = '#b8860b';
  const out = '#5a3d00';
  const r = (rx: number, ry: number, w: number, h: number, c: string): void => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x + rx * k), Math.round(y + ry * k), Math.round(w * k), Math.round(h * k));
  };
  // nanses
  for (const sg of [-1, 1]) {
    const bx = sg < 0 ? -9 : 8;
    r(bx - 1, 1, 3, 1, out);
    r(bx - 1, 5, 3, 1, out);
    r(bx + (sg < 0 ? -1 : 1), 2, 1, 3, out);
    r(bx, 2, 1, 3, gold);
  }
  // copa
  CUP_ROWS.forEach((w, i) => {
    const x0 = -w / 2;
    r(x0 - 1, i, w + 2, 1, out);
    r(x0, i, w, 1, gold);
    r(x0 + 1, i, 2, 1, light);
    r(x0 + w - 3, i, 3, 1, dark);
  });
  r(-4, 10, 8, 1, out);
  // estrella brillant a la copa
  r(-1, 3, 2, 4, '#ffffff');
  r(-2, 4, 4, 2, '#ffffff');
  // tija
  r(-2, 10, 4, 4, gold);
  r(-2, 10, 1, 4, light);
  r(1, 10, 1, 4, dark);
  // base
  r(-4, 14, 8, 2, gold);
  r(-6, 16, 12, 2, dark);
  r(-7, 18, 14, 3, gold);
  r(-7, 20, 14, 1, out);
  r(-3, 18, 6, 2, '#2a6cd0');
  // brillantor
  if (Math.floor(t * 6) % 4 === 0) {
    r(5, 1, 1, 3, '#ffffff');
    r(4, 2, 3, 1, '#ffffff');
  }
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

/** Cerimònia de campió: confeti, focs artificials, trofeu i fanfàrria xiptune. */
export function Champion({ champion, isHuman, onBracket, onMenu }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const vp = useViewport();
  useEffect(() => {
    audio.unlock();
    audio.playMusic('champion');
    audio.applause(1);
    const t = window.setTimeout(() => audio.announce(`Campió del torneig, ${champion.name}`), 800);
    return () => {
      window.clearTimeout(t);
      audio.stopMusic();
    };
  }, [champion]);

  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const W = c.width;
    const H = c.height;
    const sparks: Spark[] = [];
    const confetti: Spark[] = [];
    const cols = ['#ffe066', '#ff6b4a', '#6cff6c', '#8cf0ff', '#ff6fa5', '#ffffff'];
    let raf = 0;
    let last = performance.now();
    let t = 0;
    let nextFw = 0.2;
    const frame = (now: number): void => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      // fons: degradat en bandes + feixos de llum
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = `hsl(${232 + i * 3}, 55%, ${9 + i * 2}%)`;
        ctx.fillRect(0, (i * H) / 9, W, H / 9 + 1);
      }
      ctx.fillStyle = 'rgba(255,240,160,0.07)';
      for (const sx of [0.2, 0.5, 0.8]) {
        const a = Math.sin(t * 0.8 + sx * 9) * 40;
        ctx.beginPath();
        ctx.moveTo(W * sx + a, 0);
        ctx.lineTo(W * sx + a - 60, H);
        ctx.lineTo(W * sx + a + 60, H);
        ctx.fill();
      }
      // grades amb públic saltant
      for (let i = 0; i < 70; i++) {
        const cx = (i * 37) % W;
        const cy = H - 24 - ((i * 13) % 20) + Math.abs(Math.sin(t * 6 + i)) * -5;
        ctx.fillStyle = cols[i % cols.length];
        ctx.fillRect(cx, cy, 5, 7);
        ctx.fillStyle = '#e0a878';
        ctx.fillRect(cx + 1, cy - 4, 3, 4);
      }
      ctx.fillStyle = '#10152e';
      ctx.fillRect(0, H - 14, W, 14);
      // focs artificials
      if (t > nextFw) {
        nextFw = t + 0.35 + Math.random() * 0.5;
        const fx = 60 + Math.random() * (W - 120);
        const fy = 30 + Math.random() * 80;
        const color = cols[Math.floor(Math.random() * cols.length)];
        for (let i = 0; i < 36; i++) {
          const a = (i / 36) * Math.PI * 2;
          const sp = 30 + Math.random() * 45;
          sparks.push({ x: fx, y: fy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1.1, color, size: 2 });
        }
      }
      if (confetti.length < 120 && Math.random() < 0.9) {
        confetti.push({ x: Math.random() * W, y: -4, vx: (Math.random() - 0.5) * 20, vy: 25 + Math.random() * 35, life: 6, color: cols[Math.floor(Math.random() * cols.length)], size: 2 + Math.floor(Math.random() * 2) });
      }
      for (const s of sparks) {
        s.life -= dt;
        s.vy += 40 * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (s.life > 0) {
          ctx.fillStyle = s.color;
          ctx.fillRect(Math.round(s.x), Math.round(s.y), s.size, s.size);
        }
      }
      for (const s of confetti) {
        s.life -= dt;
        s.x += s.vx * dt + Math.sin(t * 4 + s.y * 0.1) * 0.3;
        s.y += s.vy * dt;
        ctx.fillStyle = s.color;
        ctx.fillRect(Math.round(s.x), Math.round(s.y), s.size, s.size + 1);
      }
      for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].life <= 0) sparks.splice(i, 1);
      for (let i = confetti.length - 1; i >= 0; i--) if (confetti[i].life <= 0 || confetti[i].y > H) confetti.splice(i, 1);
      // trofeu
      const bob = Math.round(Math.sin(t * 2.4) * 2);
      drawTrophy(ctx, W / 2, 86 + bob, 4, t);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const s = vp.ps + 1;
  return (
    <div className="champion">
      <canvas ref={ref} width={480} height={270} className="champ-canvas" />
      <div className="champ-ui">
        <PixelText text="CAMPIÓ DEL TORNEIG" scale={s + 1} color="#ffe066" />
        <PixelText text={champion.name.toUpperCase()} scale={s + 1} color="#ffffff" />
        <PixelText text={isHuman ? 'ENHORABONA! HAS GUANYAT EL TORNEIG' : 'EL TORNEIG HA ACABAT'} scale={Math.max(1, s - 1)} color="#9fb4e8" />
        <div className="champ-sprites">
          <SpritePreview def={champion} scale={vp.w < 520 ? 3 : 4} jump />
        </div>
        <div className="row">
          <PixelButton label="QUADRE FINAL" onClick={onBracket} />
          <PixelButton label="MENÚ PRINCIPAL" variant="primary" onClick={onMenu} />
        </div>
      </div>
    </div>
  );
}
