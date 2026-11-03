import { Match } from '../../src/game/match';
import { AIController } from '../../src/ai/ai';
import { ROSTER } from '../../src/players/roster';
import { Renderer } from '../../src/render/renderer';
import { DT } from '../../src/engine/constants';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const m = new Match({ p0: ROSTER[3], p1: ROSTER[4], humanIdx: null, difficulty: 'normal', seed: 5, firstServer: 0 }, [new AIController(1), new AIController(2)]);
const r = new Renderer(canvas);
(window as any).advance = (sec: number) => {
  const n = Math.round(sec / DT);
  for (let i = 0; i < n; i++) { m.step(DT); }
  r.handleEvents(m.drainEvents());
  r.draw(m, 1 / 60);
};
(window as any).state = () => JSON.stringify({ phase: m.phase, t: m.time, score: m.score.points });
(window as any).ready = true;
