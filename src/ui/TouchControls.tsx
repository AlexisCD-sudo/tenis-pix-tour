import { useRef, useState } from 'react';
import { InputManager } from '../controls/input';
import { HitKey } from '../players/player';
import { PixelText } from './PixelText';

interface Props {
  input: InputManager;
  serving: boolean;
  ps: number;
}

/**
 * Controls tàctils: joystick virtual a l'esquerra, botons de cop a la dreta.
 * En vertical es col·loquen sota la pista perquè no la tapin.
 */
export function TouchControls({ input, serving, ps }: Props) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const active = useRef<number | null>(null);

  const setStick = (clientX: number, clientY: number): void => {
    const el = base.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const rad = r.width / 2;
    let dx = (clientX - cx) / rad;
    let dy = (clientY - cy) / rad;
    const m = Math.hypot(dx, dy);
    if (m > 1) {
      dx /= m;
      dy /= m;
    }
    const dead = 0.12;
    input.stickX = Math.abs(dx) < dead ? 0 : dx;
    input.stickY = Math.abs(dy) < dead ? 0 : dy;
    setKnob({ x: dx * rad * 0.6, y: dy * rad * 0.6 });
  };

  const endStick = (): void => {
    active.current = null;
    input.stickX = 0;
    input.stickY = 0;
    setKnob({ x: 0, y: 0 });
  };

  const btn = (label: string, key: HitKey, cls: string) => (
    <button
      className={`tbtn ${cls}`}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        input.press(key);
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <PixelText text={label} scale={Math.max(1, ps)} />
    </button>
  );

  return (
    <div className="touch">
      <div
        className="joy"
        ref={base}
        onPointerDown={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          active.current = e.pointerId;
          setStick(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (active.current === e.pointerId) setStick(e.clientX, e.clientY);
        }}
        onPointerUp={endStick}
        onPointerCancel={endStick}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="joy-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
      </div>
      <div className="tbtns">
        {btn('EFECTE', 'slice', 'tb-a')}
        {btn(serving ? 'SERVEI' : 'COP', 'flat', 'tb-main')}
      </div>
    </div>
  );
}
