import { Controller, Match } from '../game/match';
import { HitKey, Intent } from '../players/player';

/**
 * Entrada unificada: teclat (WASD/fletxes, Espai, J, K, L, Majúscules) i
 * controls tàctils (joystick virtual + botons). El joc només llegeix
 * aquest estat; no sap d'on ve.
 */
export class InputManager {
  private keys = new Set<string>();
  /** Joystick virtual (-1..1). */
  stickX = 0;
  stickY = 0;
  touchSprint = false;
  private queue: { key: HitKey; at: number }[] = [];
  onPause: (() => void) | null = null;
  private attached = false;

  private down = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'shift'].includes(k)) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(k);
    switch (k) {
      case ' ':
        this.press('flat');
        break;
      case 'j':
        this.press('slice');
        break;
      case 'k':
        this.press('top');
        break;
      case 'l':
        this.press('lob');
        break;
      case 'p':
      case 'escape':
        this.onPause?.();
        break;
      default:
        break;
    }
  };

  private up = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase());
  };

  private blur = (): void => {
    this.keys.clear();
  };

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('keydown', this.down);
    window.addEventListener('keyup', this.up);
    window.addEventListener('blur', this.blur);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('keydown', this.down);
    window.removeEventListener('keyup', this.up);
    window.removeEventListener('blur', this.blur);
    this.keys.clear();
    this.queue.length = 0;
    this.stickX = this.stickY = 0;
  }

  press(key: HitKey): void {
    this.queue.push({ key, at: performance.now() });
    if (this.queue.length > 3) this.queue.shift();
  }

  clear(): void {
    this.queue.length = 0;
  }

  get moveX(): number {
    let x = 0;
    if (this.keys.has('d') || this.keys.has('arrowright')) x += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) x -= 1;
    return x !== 0 ? x : this.stickX;
  }

  get moveY(): number {
    let y = 0;
    if (this.keys.has('s') || this.keys.has('arrowdown')) y += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) y -= 1;
    return y !== 0 ? y : this.stickY;
  }

  get sprint(): boolean {
    return this.keys.has('shift') || this.touchSprint;
  }

  /** Treu un cop pendent (amb una finestra de 150 ms de memòria). */
  takeHit(): HitKey | null {
    const now = performance.now();
    while (this.queue.length && now - this.queue[0].at > 150) this.queue.shift();
    return this.queue.length ? this.queue.shift()!.key : null;
  }

  peekHit(): boolean {
    const now = performance.now();
    while (this.queue.length && now - this.queue[0].at > 150) this.queue.shift();
    return this.queue.length > 0;
  }
}

/** Controlador del jugador humà. */
export class HumanController implements Controller {
  /** Última direcció (per a la guia de punteria). */
  aimX = 0;
  aimY = 0;

  constructor(private input: InputManager) {}

  update(m: Match, idx: 0 | 1, _dt: number): Intent {
    const inp = this.input;
    const p = m.players[idx];
    const mx = inp.moveX;
    const my = inp.moveY;
    // Direcció del cop: lateral = món x; endavant (cap a la xarxa) = profunditat/força
    const aimX = mx;
    const aimY = -my * (p.side > 0 ? 1 : -1);
    this.aimX = aimX;
    this.aimY = aimY;

    let hit: HitKey | null = null;
    if (inp.peekHit()) {
      const canStart =
        !p.swing &&
        ((m.phase === 'rally' && p.swingCool <= 0) || m.phase === 'serve_wait' || m.phase === 'toss');
      if (canStart) hit = inp.takeHit();
    }
    // Només durant el moment de joc: les pulsacions fora de context es descarten
    if (m.phase === 'point_end' || m.phase === 'intro' || m.phase === 'match_end') inp.clear();
    return {
      mx,
      my,
      sprint: inp.sprint || Math.hypot(inp.stickX, inp.stickY) > 0.93,
      hit,
      aimX,
      aimY,
    };
  }
}
