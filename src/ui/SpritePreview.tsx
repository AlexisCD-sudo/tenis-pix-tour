import { useEffect, useRef } from 'react';
import { NO_INTENT, Player } from '../players/player';
import { PlayerDef } from '../players/roster';
import { drawPlayerFinished } from '../render/finish';
import { poseFor } from '../render/sprites';

interface Props {
  def: PlayerDef;
  /** Píxels per metre dins del canvas lògic. */
  s?: number;
  width?: number;
  height?: number;
  scale?: number;
  animate?: boolean;
  jump?: boolean;
}

/** Mostra l'sprite d'un jugador amb una animació d'espera i un cop de dreta cada cert temps. */
export function SpritePreview({ def, s = 30, width = 56, height = 72, scale = 3, animate = true, jump = false }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const p = new Player(1, def);
    let raf = 0;
    let last = performance.now();
    let t = 0;
    let nextSwing = 1.2;
    const draw = (now: number): void => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      if (jump && !p.emote) p.startEmote('win', 999);
      p.update(dt, NO_INTENT);
      if (animate && t > nextSwing && !p.swing) {
        const strokes = ['fh', 'bh'] as const;
        p.beginSwing(strokes[Math.floor(t) % 2], 'flat', 0, 0);
        nextSwing = t + 2.2;
      }
      ctx.clearRect(0, 0, c.width, c.height);
      const pose = poseFor(p, t, null);
      drawPlayerFinished(ctx, { look: def.look, style: def.style, view: 'front', s, x: width / 2, y: height - 8, pose });
      // ombra
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(width / 2 - 8, height - 7, 16, 2);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [def, s, width, height, animate, jump]);
  return <canvas ref={ref} width={width} height={height} className="sprite" style={{ width: width * scale, height: height * scale }} />;
}
