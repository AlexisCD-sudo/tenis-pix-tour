export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const sign = (v: number): number => (v < 0 ? -1 : 1);
export const smooth = (t: number): number => {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};
export const approach = (cur: number, target: number, maxDelta: number): number => {
  if (cur < target) return Math.min(target, cur + maxDelta);
  return Math.max(target, cur - maxDelta);
};
