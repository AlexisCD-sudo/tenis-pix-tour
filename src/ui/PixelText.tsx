import { ButtonHTMLAttributes, CSSProperties, useLayoutEffect, useRef } from 'react';
import { plotText, textWidth } from '../render/font';

interface PixelTextProps {
  text: string;
  scale?: number;
  color?: string;
  outline?: string;
  className?: string;
  style?: CSSProperties;
}

/** Text amb la tipografia pixel pròpia, renderitzat en un canvas petit i escalat sense suavitzat. */
export function PixelText({ text, scale = 2, color = '#ffffff', outline = '#0b1230', className, style }: PixelTextProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const w = Math.max(1, textWidth(text)) + 4;
  const h = 10;
  useLayoutEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    if (outline) {
      ctx.fillStyle = outline;
      plotText(text, (x, y) => {
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) ctx.fillRect(x + 2 + dx, y + 2 + dy, 1, 1);
      });
    }
    ctx.fillStyle = color;
    plotText(text, (x, y) => ctx.fillRect(x + 2, y + 2, 1, 1));
  }, [text, color, outline, w]);
  return (
    <canvas
      ref={ref}
      width={w}
      height={h}
      role="img"
      aria-label={text}
      className={`ptext ${className ?? ''}`}
      style={{ width: w * scale, height: h * scale, ...style }}
    />
  );
}

interface PixelButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  label: string;
  scale?: number;
  color?: string;
  sub?: string;
  variant?: 'primary' | 'secondary' | 'danger';
}

export function PixelButton({ label, scale = 3, color = '#ffffff', sub, variant = 'secondary', className, ...rest }: PixelButtonProps) {
  return (
    <button className={`pbtn pbtn-${variant} ${className ?? ''}`} {...rest}>
      <PixelText text={label} scale={scale} color={color} />
      {sub ? <PixelText text={sub} scale={Math.max(1, scale - 2)} color="#9fb4e8" /> : null}
    </button>
  );
}

/** Paràgraf amb salts de línia automàtics. */
export function PixelPara({ text, maxChars = 36, scale = 2, color = '#cfe0ff', align = 'left' }: { text: string; maxChars?: number; scale?: number; color?: string; align?: 'left' | 'center' }) {
  const lines: string[] = [];
  let cur = '';
  for (const word of text.split(' ')) {
    if ((cur + ' ' + word).trim().length > maxChars) {
      lines.push(cur.trim());
      cur = word;
    } else cur = (cur + ' ' + word).trim();
  }
  if (cur) lines.push(cur);
  return (
    <div className="ppara" style={{ alignItems: align === 'center' ? 'center' : 'flex-start' }}>
      {lines.map((l, i) => (
        <PixelText key={i} text={l} scale={scale} color={color} />
      ))}
    </div>
  );
}
