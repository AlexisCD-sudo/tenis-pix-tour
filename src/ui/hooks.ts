import { useEffect, useState } from 'react';

export interface Viewport {
  w: number;
  h: number;
  /** Escala entera dels textos pixel. */
  ps: number;
  portrait: boolean;
  coarse: boolean;
}

export function useViewport(): Viewport {
  const get = (): Viewport => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const coarse = window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window;
    const ps = w < 520 ? 1 : w < 900 ? 2 : 3;
    return { w, h, ps, portrait: h > w, coarse };
  };
  const [v, setV] = useState<Viewport>(get);
  useEffect(() => {
    const f = (): void => setV(get());
    window.addEventListener('resize', f);
    window.addEventListener('orientationchange', f);
    return () => {
      window.removeEventListener('resize', f);
      window.removeEventListener('orientationchange', f);
    };
  }, []);
  return v;
}
