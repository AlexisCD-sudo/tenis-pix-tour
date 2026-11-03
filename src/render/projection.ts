/**
 * Càmera de "televisió esportiva": perspectiva lleugerament elevada darrere
 * la línia de fons del jugador humà. La pantalla lògica és de 480x270 píxels
 * (es reescala amb vora dura per mantenir l'estètica pixel art).
 */
export const W = 480;
export const H = 270;

export const CAM = {
  y: 42,
  z: 22,
  pitch: 0.52,
  f: 722,
  cx: 240,
  cy: 164,
};

const S = Math.sin(CAM.pitch);
const C = Math.cos(CAM.pitch);

export interface Proj {
  sx: number;
  sy: number;
  /** Píxels per metre a aquesta profunditat. */
  ppm: number;
  /** Profunditat al llarg de l'eix de la càmera (per ordenar). */
  depth: number;
}

export function project(x: number, y: number, z: number, out: Proj): Proj {
  const ry = y - CAM.y;
  const rz = z - CAM.z;
  const fwd = -ry * C - rz * S;
  const up = -ry * S + rz * C;
  const k = CAM.f / fwd;
  out.sx = CAM.cx + x * k;
  out.sy = CAM.cy - up * k;
  out.ppm = k;
  out.depth = fwd;
  return out;
}

export const newProj = (): Proj => ({ sx: 0, sy: 0, ppm: 1, depth: 1 });

/** Raig des de la càmera pel píxel (sx, sy): retorna la direcció al món. */
export function rayDir(sx: number, sy: number): { dx: number; dy: number; dz: number } {
  const r = (sx - CAM.cx) / CAM.f;
  const u = -(sy - CAM.cy) / CAM.f;
  return { dx: r, dy: -C - u * S, dz: -S + u * C };
}

/** Punt del terra (z = 0) que es veu al píxel; null si és per sobre l'horitzó. */
export function groundAt(sx: number, sy: number): { x: number; y: number } | null {
  const d = rayDir(sx, sy);
  if (d.dz >= -1e-6) return null;
  const t = -CAM.z / d.dz;
  return { x: t * d.dx, y: CAM.y + t * d.dy };
}
