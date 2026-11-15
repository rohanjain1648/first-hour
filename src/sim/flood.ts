import type { SimState } from './types';

/** river water gained per game second at rain = 1 */
export const RAIN_RATE = 0.0013;
/** fraction of head difference moved per game second */
export const FLOW_K = 0.02;
/** water removed per game second by a pump, from its cell and each neighbour */
export const PUMP_RATE = 0.004;
/** height of wall one sandbag unit adds */
export const SANDBAG_HEIGHT = 1;

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

export function stepFlood(s: SimState, dtGame: number): void {
  const { cells } = s;
  const h = cells.length;
  const w = cells[0].length;

  for (const row of cells) for (const c of row) if (c.type === 'river') c.water += s.rain * RAIN_RATE * dtGame;

  const delta: number[][] = cells.map((row) => row.map(() => 0));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = cells[y][x];
      if (src.water <= 0) continue;
      const head = src.elevation + src.water;
      let budget = src.water;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const dst = cells[ny][nx];
        const dstHead = dst.elevation + dst.water;
        const wall = dst.elevation + dst.sandbags * SANDBAG_HEIGHT;
        if (head <= dstHead || head <= wall) continue;
        const flow = Math.min(budget, ((head - dstHead) / 2) * Math.min(1, FLOW_K * dtGame));
        if (flow <= 0) continue;
        budget -= flow;
        delta[y][x] -= flow;
        delta[ny][nx] += flow;
      }
    }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cells[y][x].water = Math.max(0, cells[y][x].water + delta[y][x]);

  for (const t of s.tokens) {
    if (t.type !== 'pump' || !t.cell) continue;
    const drain = PUMP_RATE * dtGame;
    const targets = [[0, 0], ...DIRS];
    for (const [dx, dy] of targets) {
      const c = cells[t.cell.y + dy]?.[t.cell.x + dx];
      if (c && c.type !== 'river') c.water = Math.max(0, c.water - drain);
    }
  }
}
