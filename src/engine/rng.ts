/** Generador pseudoaleatori determinista (mulberry32). */
export class Rng {
  private s: number;
  constructor(seed = 1) {
    this.s = seed >>> 0 || 1;
  }

  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Distribució aproximadament normal (suma de 3 uniformes), mitjana 0, sigma ~1. */
  gauss(): number {
    return (this.next() + this.next() + this.next() - 1.5) * 2;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length) % arr.length];
  }
}
