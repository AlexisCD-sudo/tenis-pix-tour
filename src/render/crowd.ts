import { Ctx, px, rect } from './pixel';
import { H, W, newProj, project } from './projection';
import { Seat, buildSeats } from './court';

const SKINS = ['#f0c8a6', '#e0a878', '#c68a5c', '#8d5a3a', '#f4d7bd', '#b97a50'];
const HAIRS = ['#1b130e', '#3a2a20', '#6b4a2b', '#d9b36a', '#8a8a8a', '#c0392b', '#111111'];
const SHIRTS = ['#e63946', '#f1c40f', '#2ecc71', '#3498db', '#ecf0f1', '#9b59b6', '#e67e22', '#1abc9c', '#ff6fa5', '#2c3e50', '#f5f5f5', '#c0392b'];

interface Spot {
  sx: number;
  sy: number;
  w: number;
  h: number;
  seat: Seat;
  skin: string;
  hair: string;
  shirt: string;
  depth: number;
  /** Constants del dibuix (es calculen una sola vegada). */
  x: number;
  hw: number;
  hx: number;
  hairH: number;
}

/**
 * Per sota d'aquesta excitació la oscil·lació és < 0,5 px i es arrodoneix a 0,
 * de manera que el públic es veu exactament igual que la imatge estàtica.
 */
const IDLE_MAX = 0.17;

/** Públic animat: reacciona a punts, aplaudiments i punts llargs. */
export class Crowd {
  private spots: Spot[] = [];
  /** Excitació global 0..1. */
  excitement = 0.1;
  /** Impuls per zones (per exemple un costat s'alça). */
  private flash = 0;
  private wave = -1;

  constructor() {
    const seats = buildSeats();
    const p = newProj();
    for (const seat of seats) {
      project(seat.x, seat.y, seat.z, p);
      const w = Math.max(3, Math.round(0.46 * p.ppm));
      const h = Math.max(3, Math.round(0.5 * p.ppm));
      if (p.sx < -8 || p.sx > W + 8 || p.sy < -8 || p.sy > H) continue;
      const hw = Math.max(2, Math.round(w * 0.55));
      const sx = Math.round(p.sx);
      this.spots.push({
        sx,
        sy: Math.round(p.sy),
        x: sx - Math.floor(w / 2),
        hw,
        hx: sx - Math.floor(hw / 2),
        hairH: Math.max(1, Math.round(hw * 0.45)),
        w,
        h,
        seat,
        skin: SKINS[(seat.hue * 7 + Math.floor(seat.phase * 10)) % SKINS.length],
        hair: HAIRS[(seat.hue * 3 + Math.floor(seat.phase * 7)) % HAIRS.length],
        shirt: SHIRTS[seat.hue % SHIRTS.length],
        depth: p.depth,
      });
    }
    // De més lluny a més a prop
    this.spots.sort((a, b) => b.depth - a.depth);
  }

  cheer(level: number): void {
    this.excitement = Math.min(1, Math.max(this.excitement, level));
    this.flash = Math.min(1, this.flash + level * 0.6);
    if (level > 0.8) this.wave = 0;
  }

  update(dt: number): void {
    this.excitement = Math.max(0.12, this.excitement - dt * 0.28);
    this.flash = Math.max(0, this.flash - dt * 1.5);
    if (this.wave >= 0) {
      this.wave += dt * 14;
      if (this.wave > 60) this.wave = -1;
    }
  }

  /** Públic en repòs, pintat una sola vegada a una imatge. */
  private idleLayer: HTMLCanvasElement | null = null;

  private buildIdleLayer(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d')!;
    this.drawLive(g, 0, 0.12, false);
    return c;
  }

  draw(ctx: Ctx, time: number): void {
    const e = this.excitement;
    if (e <= IDLE_MAX && this.wave < 0) {
      this.idleLayer ??= this.buildIdleLayer();
      ctx.drawImage(this.idleLayer, 0, 0);
    } else {
      this.drawLive(ctx, time, e, true);
    }
    // Flaixos de càmera als punts importants
    if (this.flash > 0.2) {
      const n = Math.floor(this.flash * 14);
      for (let i = 0; i < n; i++) {
        const s = this.spots[Math.floor(((Math.sin(time * 91 + i * 17.3) + 1) / 2) * (this.spots.length - 1))];
        if (s) px(ctx, s.sx, s.sy - 4, '#ffffff', 2);
      }
    }
  }

  private drawLive(ctx: Ctx, time: number, e: number, animated: boolean): void {
    for (const s of this.spots) {
      const seat = s.seat;
      const ph = seat.phase;
      let bob = Math.sin(time * (2 + e * 7) + ph) * (0.3 + e * 1.1);
      let arms = e > 0.55 && Math.sin(ph * 5 + time * 6) > 0.1;
      if (animated && this.wave >= 0) {
        const wx = seat.zone === 'far' ? seat.x + 22 : seat.zone === 'left' ? 44 + (20 - seat.y) : 44 + 22 + 44 + seat.y;
        const d = this.wave - wx * 0.5;
        if (d > -2 && d < 4) {
          arms = true;
          bob -= 1.2;
        }
      }
      const by = Math.round(s.sy + bob);
      const x = s.x;
      // cos
      rect(ctx, x, by, s.w, s.h, s.shirt);
      // cap
      rect(ctx, s.hx, by - s.hw, s.hw, s.hw, s.skin);
      rect(ctx, s.hx, by - s.hw, s.hw, s.hairH, s.hair);
      if (arms) {
        px(ctx, x - 1, by - 2, s.skin, 1);
        px(ctx, x + s.w, by - 2, s.skin, 1);
        px(ctx, x - 1, by - 1, s.skin, 1);
        px(ctx, x + s.w, by - 1, s.skin, 1);
      }
    }
  }
}
