import { AIController } from '../../src/ai/ai';
import { DT } from '../../src/engine/constants';
import { Match } from '../../src/game/match';
import { ROSTER } from '../../src/players/roster';
import { Renderer } from '../../src/render/renderer';

const median = (a: number[]): number => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

function run(): Record<string, number> {
  const canvas = document.createElement('canvas');
  canvas.style.width = '1280px';
  canvas.style.height = '720px';
  document.body.appendChild(canvas);
  const ctor: number[] = [];
  for (let i = 0; i < 5; i++) {
    const c = document.createElement('canvas');
    c.style.width = '1280px';
    c.style.height = '720px';
    document.body.appendChild(c);
    const t0 = performance.now();
    new Renderer(c);
    ctor.push(performance.now() - t0);
  }
  const r = new Renderer(canvas);
  const m = new Match({ p0: ROSTER[0], p1: ROSTER[1], humanIdx: null, difficulty: 'normal', seed: 3 }, [new AIController(4), new AIController(5)]);
  const frame: number[] = [];
  const crowdIdle: number[] = [];
  const crowdHot: number[] = [];
  // 4 s de partit per escalfar
  for (let i = 0; i < 240; i++) {
    m.step(DT);
    m.step(DT);
    r.handleEvents(m.drainEvents());
    r.draw(m, 1 / 60);
  }
  for (let i = 0; i < 600; i++) {
    m.step(DT);
    m.step(DT);
    r.handleEvents(m.drainEvents());
    const t0 = performance.now();
    r.draw(m, 1 / 60);
    frame.push(performance.now() - t0);
  }
  const anyR = r as unknown as { crowd: { draw: (c: CanvasRenderingContext2D, t: number) => void; cheer: (l: number) => void; excitement: number; update: (dt: number) => void }; ctx: CanvasRenderingContext2D };
  anyR.crowd.excitement = 0.12;
  for (let i = 0; i < 300; i++) {
    anyR.crowd.excitement = 0.12;
    const t0 = performance.now();
    anyR.crowd.draw(anyR.ctx, i / 60);
    crowdIdle.push(performance.now() - t0);
  }
  for (let i = 0; i < 300; i++) {
    anyR.crowd.excitement = 0.9;
    const t0 = performance.now();
    anyR.crowd.draw(anyR.ctx, i / 60);
    crowdHot.push(performance.now() - t0);
  }
  return {
    ctorMs: +median(ctor).toFixed(2),
    frameMedianMs: +median(frame).toFixed(2),
    frameP95Ms: +[...frame].sort((a, b) => a - b)[Math.floor(frame.length * 0.95)].toFixed(2),
    crowdIdleMs: +median(crowdIdle).toFixed(3),
    crowdHotMs: +median(crowdHot).toFixed(3),
    canvasW: canvas.width,
    canvasH: canvas.height,
  };
}
(window as unknown as { result: Record<string, number> }).result = run();
