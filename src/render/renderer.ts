import { COURT, netHeightAt } from '../engine/constants';
import { clamp, lerp } from '../engine/math';
import { Match, MatchEvent } from '../game/match';
import { Player } from '../players/player';
import { BAYER4, Ctx, disc, ellipse, line, px, rect } from './pixel';
import { Crowd } from './crowd';
import { buildBackground, BOARD_Y } from './court';
import { drawText, textWidth } from './font';
import { H, W, newProj, project } from './projection';
import { drawPlayerSprite, drawSittingOfficial, poseFor } from './sprites';

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  color: string;
}

interface Mark {
  x: number;
  y: number;
  age: number;
  out: boolean;
}

interface Popup {
  text: string;
  color: string;
  t: number;
  dur: number;
  y: number;
}

interface Floater {
  text: string;
  color: string;
  x: number;
  y: number;
  z: number;
  t: number;
  dur: number;
  size: number;
}

interface Judge {
  x: number;
  y: number;
  signal: number;
}

type Drawable = { key: number; draw: () => void };

let bgCache: HTMLCanvasElement | null = null;
let vignetteCache: HTMLCanvasElement | null = null;

function sharedBackground(): HTMLCanvasElement {
  return (bgCache ??= buildBackground());
}

/** Vinyeta amb trama Bayer, escrita directament en un ImageData (molt més ràpid que 130.000 fillRect). */
function sharedVignette(): HTMLCanvasElement {
  if (vignetteCache) return vignetteCache;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  const px32 = new Uint32Array(img.data.buffer);
  // RGBA little-endian: (a<<24)|(b<<16)|(g<<8)|r  -> rgba(4,8,24,0.42)
  const color = ((Math.round(0.42 * 255) << 24) | (24 << 16) | (8 << 8) | 4) >>> 0;
  for (let y = 0; y < H; y++) {
    const dy = ((y - H / 2) / 190) ** 2;
    for (let x = 0; x < W; x++) {
      const d = ((x - W / 2) / 300) ** 2 + dy;
      const th = 0.55 + (BAYER4[(y & 3) * 4 + (x & 3)] / 16) * 0.5;
      if (d > th) px32[y * W + x] = color;
    }
  }
  g.putImageData(img, 0, 0);
  return (vignetteCache = c);
}

export class Renderer {
  private ctx: Ctx;
  private bg: HTMLCanvasElement;
  private crowd = new Crowd();
  private vignette: HTMLCanvasElement;
  private particles: Particle[] = [];
  private marks: Mark[] = [];
  private popups: Popup[] = [];
  private floaters: Floater[] = [];
  private teamsSet = false;
  private lastMeterFull: [boolean, boolean] = [false, false];
  private trail: { sx: number; sy: number }[] = [];
  private judges: Judge[] = [
    { x: -7.6, y: -11.9, signal: 0 },
    { x: 7.6, y: -6.4, signal: 0 },
    { x: -7.6, y: 6.4, signal: 0 },
    { x: 7.6, y: 11.9, signal: 0 },
    { x: 0, y: -15.2, signal: 0 },
  ];
  private shake = 0;
  private time = 0;
  private proj = newProj();
  private proj2 = newProj();
  /** Ajuda de punteria (reticle) per al jugador humà. */
  assist = true;
  aimX = 0;
  aimY = 0;
  humanIdx: 0 | 1 | null = 0;
  private umpireArm = 0;
  private flashWhite = 0;

  private scale = 1;
  private ro: ResizeObserver | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.ctx.imageSmoothingEnabled = false;
    // El fons i la vinyeta no canvien mai: es calculen una sola vegada i es comparteixen.
    this.bg = sharedBackground();
    this.vignette = sharedVignette();
    this.fit();
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.fit());
      this.ro.observe(canvas);
    }
  }

  /**
   * Ajusta la resolució interna al DPR: la pantalla lògica segueix sent de 480x270
   * però es pinta a un múltiple enter (1x..6x) de la mida real en píxels del dispositiu,
   * de manera que a pantalles retina els píxels es veuen nítids i sense borrosor.
   */
  fit(): void {
    const dpr = window.devicePixelRatio || 1;
    const cssW = this.canvas.clientWidth;
    if (!cssW) return;
    const devW = cssW * dpr;
    // Màxim 6x a l'ordinador i 4x en dispositius tàctils (menys ompliment de píxels)
    const maxK = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches ? 4 : 6;
    const k = Math.min(maxK, Math.max(1, Math.ceil(devW / W - 0.02)));
    if (k !== this.scale || this.canvas.width !== W * k) {
      this.scale = k;
      this.canvas.width = W * k; // reinicia l'estat del context
      this.canvas.height = H * k;
      this.ctx.imageSmoothingEnabled = false;
    }
    this.ctx.setTransform(k, 0, 0, k, 0, 0);
    // Si el buffer és igual o més gran que la pantalla es redueix amb suavitat; si no, píxels durs.
    this.canvas.style.imageRendering = W * k >= devW ? 'auto' : 'pixelated';
  }

  dispose(): void {
    this.ro?.disconnect();
    this.ro = null;
  }

  // ------------------------------------------------------------ esdeveniments
  handleEvents(events: MatchEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'bounce': {
          const big = e.vz > 2.5;
          if (big) {
            for (let i = 0; i < 5; i++) {
              this.particles.push({
                x: e.x,
                y: e.y,
                z: 0.02,
                vx: (Math.random() - 0.5) * 1.6,
                vy: (Math.random() - 0.5) * 1.6,
                vz: 0.8 + Math.random() * 1.4,
                life: 0,
                max: 0.35 + Math.random() * 0.2,
                color: '#dfe9f5',
              });
            }
          }
          this.marks.push({ x: e.x, y: e.y, age: 0, out: !e.inBounds });
          if (this.marks.length > 14) this.marks.shift();
          break;
        }
        case 'hit': {
          const n = 3 + Math.floor(e.power * 4);
          for (let i = 0; i < n; i++) {
            this.particles.push({
              x: e.x,
              y: e.y,
              z: e.z,
              vx: (Math.random() - 0.5) * 3,
              vy: (Math.random() - 0.5) * 3,
              vz: (Math.random() - 0.3) * 2.5,
              life: 0,
              max: 0.15,
              color: '#ffffff',
            });
          }
          if (e.stroke === 'smash' || (e.stroke === 'serve' && e.power > 0.9)) this.shake = 0.12;
          this.hitFeedback(e);
          break;
        }
        case 'fault':
          this.popup(e.double ? 'DOBLE FALTA' : 'FALTA!', '#ff6b4a');
          break;
        case 'let':
          this.popup('LET', '#ffe066');
          break;
        case 'out': {
          this.popup('FORA!', '#ff6b4a');
          this.umpireArm = 1.2;
          const m = this.marks[this.marks.length - 1];
          if (m) {
            let best = this.judges[0];
            let bd = Infinity;
            for (const j of this.judges) {
              const d = Math.hypot(j.x - m.x, j.y - m.y);
              if (d < bd) {
                bd = d;
                best = j;
              }
            }
            best.signal = 1.3;
          }
          break;
        }
        case 'net':
          this.popup(e.cord ? 'CINTA!' : 'XARXA', '#a8d8ff');
          break;
        case 'point':
          if (e.reason === 'ace') this.popup('ACE!', '#ffe066');
          if (e.reason === 'ace' || e.reason === 'winner') {
            this.crowd.cheer(e.reason === 'ace' ? 0.9 : 0.65);
            if (e.reason === 'ace' || e.rally >= 8) this.crowd.jump();
          } else {
            this.crowd.cheer(0.3);
            this.crowd.gasp();
          }
          break;
        case 'game':
          this.popup('JOC', '#ffffff');
          this.crowd.cheer(0.9);
          this.crowd.jump();
          break;
        case 'set':
          this.popup('SET!', '#ffe066');
          this.crowd.cheer(1);
          break;
        case 'crowd':
          this.crowd.cheer(e.intensity * (e.kind === 'gasp' ? 0.6 : 1));
          if (e.kind === 'gasp' || e.kind === 'ooh') this.crowd.gasp();
          break;
        default:
          break;
      }
    }
  }

  /** Valoració del cop: text flotant, esclat de partícules, flaix i tremolor als súper cops. */
  private hitFeedback(e: Extract<MatchEvent, { type: 'hit' }>): void {
    const mine = this.humanIdx === e.player;
    if (e.superShot) {
      this.floaters.push({ text: 'SUPER SHOT!', color: '#ff8a2a', x: e.x, y: e.y, z: e.z + 1.1, t: 0, dur: 1.2, size: 2 });
      this.flashWhite = 0.55;
      this.shake = 0.3;
      this.crowd.cheer(1);
      this.crowd.jump();
      this.crowd.startWave();
      for (let i = 0; i < 22; i++) {
        this.particles.push({
          x: e.x, y: e.y, z: e.z,
          vx: (Math.random() - 0.5) * 7, vy: (Math.random() - 0.5) * 7, vz: Math.random() * 4,
          life: 0, max: 0.35 + Math.random() * 0.25, color: ['#ff4a1a', '#ff9a1a', '#ffe066'][i % 3],
        });
      }
      return;
    }
    if (e.rating === 'perfect' || e.rating === 'nice') {
      const perfect = e.rating === 'perfect';
      if (mine || (perfect && this.humanIdx === null)) {
        this.floaters.push({ text: perfect ? 'PERFECT!' : 'NICE!', color: perfect ? '#ffe066' : '#8cf0ff', x: e.x, y: e.y, z: e.z + 0.9, t: 0, dur: perfect ? 0.9 : 0.6, size: perfect ? 2 : 1 });
      }
      if (perfect) {
        this.flashWhite = Math.max(this.flashWhite, 0.18);
        for (let i = 0; i < 12; i++) {
          this.particles.push({
            x: e.x, y: e.y, z: e.z,
            vx: Math.cos((i / 12) * 6.283) * 3.2, vy: Math.sin((i / 12) * 6.283) * 3.2, vz: (Math.random() - 0.2) * 2,
            life: 0, max: 0.28, color: i % 2 ? '#ffe066' : '#ffffff',
          });
        }
      }
    }
  }

  private drawFloaters(ctx: Ctx, dt: number): void {
    const p = this.proj;
    for (const f of this.floaters) f.t += dt;
    this.floaters = this.floaters.filter((f) => f.t < f.dur);
    for (const f of this.floaters) {
      const k = f.t / f.dur;
      project(f.x, f.y, f.z + k * 0.5, p);
      if (k > 0.7 && Math.floor(f.t * 20) % 2 === 0) continue;
      drawText(ctx, f.text, Math.round(clamp(p.sx, 30, W - 30)), Math.round(p.sy), f.color, f.size, '#0b1230', 'center');
    }
  }

  /** Medidor de súper cop de cada jugador (a la part inferior). */
  private drawMeters(ctx: Ctx, m: Match): void {
    if (m.phase === 'intro') return;
    const bw = 56;
    for (const i of [0, 1] as const) {
      const x = i === 0 ? 6 : W - 6 - bw;
      const y = H - 10;
      const v = m.meter[i];
      const full = v >= 1;
      rect(ctx, x - 1, y - 1, bw + 2, 6, '#05070d');
      rect(ctx, x, y, bw, 4, '#1a2240');
      const fw = Math.round(bw * v);
      const blink = full && Math.floor(this.time * 8) % 2 === 0;
      rect(ctx, x, y, fw, 4, full ? (blink ? '#ffffff' : '#ff9a1a') : '#ffb347');
      rect(ctx, x, y, fw, 1, full ? '#ffe066' : '#ffd98a');
      drawText(ctx, full ? 'SUPER!' : 'SUPER', x, y - 8, full ? '#ffe066' : '#9fb4e8');
      if (full && !this.lastMeterFull[i] && this.humanIdx === i) this.popup('SUPER A PUNT!', '#ff9a1a');
      this.lastMeterFull[i] = full;
    }
  }

  private popup(text: string, color: string): void {
    this.popups.push({ text, color, t: 0, dur: 1.3, y: 112 });
    if (this.popups.length > 3) this.popups.shift();
  }

  // ------------------------------------------------------------------ dibuix
  draw(m: Match, dt: number): void {
    const ctx = this.ctx;
    this.time += dt;
    if (!this.teamsSet) {
      this.teamsSet = true;
      this.crowd.setTeams(m.players[0].def.look.shirt, m.players[1].def.look.shirt);
    }
    this.crowd.update(dt);
    this.umpireArm = Math.max(0, this.umpireArm - dt);
    for (const j of this.judges) j.signal = Math.max(0, j.signal - dt);
    this.shake = Math.max(0, this.shake - dt);

    ctx.save();
    if (this.shake > 0) ctx.translate(Math.round((Math.random() - 0.5) * 3), Math.round((Math.random() - 0.5) * 3));
    ctx.drawImage(this.bg, 0, 0);
    this.crowd.draw(ctx, this.time);
    this.drawScoreboard(ctx, m);
    this.drawMarks(ctx, dt);
    this.drawShadows(ctx, m);
    this.drawAim(ctx, m);

    const list: Drawable[] = [];
    list.push({ key: 0, draw: () => this.drawNet(ctx) });
    list.push({ key: 0.01, draw: () => this.drawUmpire(ctx) });
    for (const j of this.judges) list.push({ key: j.y, draw: () => this.drawJudge(ctx, j) });
    for (const p of m.players) list.push({ key: p.y, draw: () => this.drawPlayer(ctx, m, p) });
    if (m.ballVisible) list.push({ key: m.ball.y, draw: () => this.drawBall(ctx, m) });
    list.sort((a, b) => a.key - b.key);
    for (const d of list) d.draw();

    this.drawParticles(ctx, dt);
    this.drawFloaters(ctx, dt);
    this.drawMeters(ctx, m);
    this.drawPopups(ctx, dt);
    ctx.restore();
    ctx.drawImage(this.vignette, 0, 0);
    if (this.flashWhite > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flashWhite})`;
      ctx.fillRect(0, 0, W, H);
      this.flashWhite = Math.max(0, this.flashWhite - dt * 2);
    }
  }

  // --------------------------------------------------------------- elements
  private drawShadows(ctx: Ctx, m: Match): void {
    const p = this.proj;
    for (const pl of m.players) {
      project(pl.x, pl.y, 0, p);
      const lift = pl.swing && pl.swing.stroke === 'serve' ? 0.3 : 0;
      ellipse(ctx, p.sx + 1 + lift, p.sy, 0.5 * p.ppm, 0.17 * p.ppm, '#0a1a38', true);
      ellipse(ctx, p.sx + 1 + lift, p.sy, 0.3 * p.ppm, 0.1 * p.ppm, '#0a1a38', false);
    }
    if (m.ballVisible) {
      const b = m.ball;
      project(b.x, b.y, 0, p);
      const k = Math.max(1.5, 0.2 * p.ppm * (1 - Math.min(0.5, b.z * 0.06)));
      ellipse(ctx, p.sx, p.sy, k, k * 0.45, '#0a1a38', false);
    }
  }

  private drawMarks(ctx: Ctx, dt: number): void {
    const p = this.proj;
    for (const mk of this.marks) mk.age += dt;
    this.marks = this.marks.filter((mk) => mk.age < 3);
    for (const mk of this.marks) {
      project(mk.x, mk.y, 0, p);
      const f = 1 - mk.age / 3;
      if (f < 0.35 && (mk.age * 10) % 2 < 1) continue;
      ellipse(ctx, p.sx, p.sy, Math.max(1, 0.22 * p.ppm * 0.8), Math.max(1, 0.1 * p.ppm), mk.out ? '#c8d4e8' : '#24508f', true);
    }
  }

  private drawAim(ctx: Ctx, m: Match): void {
    if (!this.assist || m.cfg.humanIdx === null) return;
    const hp = m.players[m.cfg.humanIdx];
    const p = this.proj;
    let show = false;
    let tx = 0;
    let ty = 0;
    const u = (clamp(this.aimY, -1, 1) + 1) / 2;
    if ((m.phase === 'serve_wait' || m.phase === 'toss') && m.server === hp.idx) {
      const [lo, hi] = m.serveCtx.boxSign < 0 ? [-3.8, -0.5] : [0.5, 3.8];
      tx = lerp(lo, hi, (clamp(this.aimX, -1, 1) + 1) / 2);
      ty = -hp.side * (m.serveCtx.second ? lerp(3.4, 5.4, u) : lerp(3.6, 6.0, u));
      show = true;
    } else if (m.phase === 'rally' && m.lastHitter === 1 - hp.idx && !m.serveAwait) {
      tx = clamp(this.aimX, -1.15, 1.15) * 3.75;
      ty = -hp.side * (5.5 + 5.8 * u);
      show = true;
    }
    if (!show) return;
    project(tx, ty, 0, p);
    const r = Math.max(2, Math.round(0.2 * p.ppm));
    const blink = Math.floor(this.time * 6) % 2 === 0;
    const col = blink ? '#ffffff' : '#ffe066';
    px(ctx, p.sx - r, p.sy, col);
    px(ctx, p.sx + r, p.sy, col);
    px(ctx, p.sx, p.sy - Math.ceil(r / 2), col);
    px(ctx, p.sx, p.sy + Math.ceil(r / 2), col);
  }

  private drawNet(ctx: Ctx): void {
    const a = this.proj;
    const b = this.proj2;
    let lastSx = -999;
    for (let x = -COURT.netHalf; x <= COURT.netHalf + 0.001; x += 0.04) {
      const h = netHeightAt(x);
      project(x, 0, h, a);
      project(x, 0, 0, b);
      const sx = Math.round(a.sx);
      if (sx === lastSx) continue;
      lastSx = sx;
      const top = Math.round(a.sy);
      const bot = Math.round(b.sy);
      rect(ctx, sx, top, 1, 2, '#f4f6fa');
      for (let y = top + 2; y < bot; y++) {
        if (((sx + y) & 1) === 0) {
          ctx.fillStyle = (sx & 3) === 0 && (y & 3) === 0 ? '#2a3a5c' : '#0d1424';
          ctx.fillRect(sx, y, 1, 1);
        }
      }
      // banda inferior
      rect(ctx, sx, bot - 1, 1, 1, '#dfe6ee');
    }
    // pals
    for (const sg of [-1, 1]) {
      project(sg * COURT.netHalf, 0, COURT.netPostH + 0.05, a);
      project(sg * COURT.netHalf, 0, 0, b);
      rect(ctx, a.sx - 1, a.sy, 2, b.sy - a.sy, '#9aa4b4');
      rect(ctx, a.sx - 1, a.sy, 1, b.sy - a.sy, '#c9d1de');
    }
    // cinta central
    project(0, 0, COURT.netCenterH, a);
    project(0, 0, 0, b);
    rect(ctx, a.sx, a.sy + 1, 1, b.sy - a.sy - 1, '#f4f6fa');
  }

  private drawUmpire(ctx: Ctx): void {
    const a = this.proj;
    const g = this.proj2;
    const x0 = 7.5;
    project(x0 - 0.4, 0, 0, g);
    project(x0 - 0.4, 0, 1.9, a);
    rect(ctx, a.sx, a.sy, 2, g.sy - a.sy, '#c9d1de');
    const lx = a.sx;
    project(x0 + 0.4, 0, 0, g);
    project(x0 + 0.4, 0, 1.9, a);
    rect(ctx, a.sx, a.sy, 2, g.sy - a.sy, '#c9d1de');
    // travesser
    line(ctx, lx, a.sy + (g.sy - a.sy) * 0.4, a.sx, a.sy + (g.sy - a.sy) * 0.85, 1, '#9aa4b4');
    line(ctx, a.sx, a.sy + (g.sy - a.sy) * 0.4, lx, a.sy + (g.sy - a.sy) * 0.85, 1, '#9aa4b4');
    // seient i àrbitre
    project(x0, 0, 1.9, a);
    rect(ctx, lx - 1, a.sy, a.sx - lx + 5, 2, '#1f2a44');
    drawSittingOfficial(ctx, a.sx, a.sy, a.ppm * 0.85, '#f4f6fa', this.umpireArm > 0 ? 1 : 0, true);
    // micròfon
    px(ctx, a.sx + 2, a.sy - a.ppm * 0.7, '#222');
  }

  private drawJudge(ctx: Ctx, j: Judge): void {
    const p = this.proj;
    project(j.x, j.y, 0, p);
    drawSittingOfficial(ctx, p.sx, p.sy, p.ppm * 0.8, '#22304e', j.signal > 0 ? 1 : 0, true);
  }

  private drawPlayer(ctx: Ctx, m: Match, pl: Player): void {
    const p = this.proj;
    project(pl.x, pl.y, 0, p);
    const tossZ = pl.tossing || pl.serveStance ? m.ball.z : null;
    const pose = poseFor(pl, this.time, tossZ);
    drawPlayerSprite(ctx, {
      look: pl.def.look,
      style: pl.def.style,
      view: pl.side > 0 ? 'back' : 'front',
      s: p.ppm,
      x: p.sx,
      y: p.sy,
      pose,
    });
  }

  private drawBall(ctx: Ctx, m: Match): void {
    const b = m.ball;
    const p = this.proj;
    project(b.x, b.y, b.z, p);
    const sp = Math.hypot(b.vx, b.vy, b.vz);
    // Estela
    this.trail.push({ sx: p.sx, sy: p.sy });
    const maxTrail = m.fireBall ? 16 : 7;
    if (this.trail.length > maxTrail) this.trail.shift();
    if (m.fireBall && sp > 8) {
      const n = this.trail.length;
      for (let i = 0; i < n - 1; i++) {
        const t = this.trail[i];
        const f = i / n;
        const flick = Math.floor(this.time * 30 + i) % 2;
        const c = f < 0.3 ? '#7a1a0a' : f < 0.55 ? '#d8401a' : f < 0.8 ? '#ff9a1a' : '#ffe066';
        px(ctx, t.sx, t.sy - flick, c, f > 0.5 ? 3 : 2);
      }
    } else if (sp > 14 && m.phase !== 'serve_wait') {
      for (let i = 0; i < this.trail.length - 1; i++) {
        const t = this.trail[i];
        const c = i < 2 ? '#7a9a1a' : i < 4 ? '#a9d02a' : '#cdee3a';
        px(ctx, t.sx, t.sy, c, i > 3 ? 2 : 1);
      }
    } else if (sp < 14) {
      this.trail.length = 0;
    }
    const r = clamp(0.1 * p.ppm, 1.6, 2.8);
    disc(ctx, p.sx, p.sy, r + 0.6, '#1d3a10');
    disc(ctx, p.sx, p.sy, r, '#d4ff2a');
    px(ctx, p.sx - r * 0.4, p.sy - r * 0.45, '#fbffc8');
  }

  private drawParticles(ctx: Ctx, dt: number): void {
    const p = this.proj;
    for (const q of this.particles) {
      q.life += dt;
      q.vz -= 9.8 * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.z = Math.max(0, q.z + q.vz * dt);
      project(q.x, q.y, q.z, p);
      if (q.life < q.max) px(ctx, p.sx, p.sy, q.color, q.life < q.max * 0.5 ? 2 : 1);
    }
    this.particles = this.particles.filter((q) => q.life < q.max);
  }

  private drawPopups(ctx: Ctx, dt: number): void {
    for (const pp of this.popups) pp.t += dt;
    this.popups = this.popups.filter((pp) => pp.t < pp.dur);
    let i = 0;
    for (const pp of this.popups) {
      const f = pp.t / pp.dur;
      const y = pp.y - Math.round(f * 10) - i * 14;
      if (f > 0.75 && Math.floor(pp.t * 18) % 2 === 0) continue;
      drawText(ctx, pp.text, W / 2, y, pp.color, 2, '#0b1230', 'center');
      i++;
    }
  }

  private drawScoreboard(ctx: Ctx, m: Match): void {
    const a = this.proj;
    const b = this.proj2;
    project(-3.9, BOARD_Y - 0.5, 3.3, a);
    project(3.9, BOARD_Y - 0.5, 1.5, b);
    const x = Math.round(a.sx);
    const y = Math.round(a.sy);
    const w = Math.round(b.sx - a.sx);
    const h = Math.round(b.sy - a.sy);
    rect(ctx, x - 2, y - 2, w + 4, h + 4, '#10131c');
    rect(ctx, x, y, w, h, '#05070d');
    const s = m.score;
    const rows = [0, 1] as const;
    rows.forEach((i, r) => {
      const name = m.players[i].def.shortName.slice(0, 9);
      const ty = y + 3 + r * 8;
      drawText(ctx, name, x + 3, ty, '#ffd24a');
      if (m.server === i && m.phase !== 'match_end') px(ctx, x + w - 4, ty + 2, '#6cff6c', 2);
      // sets acabats
      let cx = x + 44;
      for (const st of s.sets) {
        drawText(ctx, String(st.games[i]), cx, ty, '#8fb8ff');
        cx += 5;
      }
      const g = String(s.games[i]);
      drawText(ctx, g, cx, ty, '#ffffff');
      cx += textWidth(g) + 3;
      drawText(ctx, s.pointText(i), x + w - 18 - (s.pointText(i).length > 1 ? 0 : 2), ty, '#ffd24a');
    });
  }

  flash(): void {
    this.flashWhite = 0.5;
  }

  celebrate(): void {
    this.crowd.cheer(1);
  }
}
