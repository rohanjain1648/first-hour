import { logEvent } from './log';
import type { SimState } from './types';
import { cellKey } from './types';

export const SUBSTATION_FLOOD_WATER = 0.5;
export const FUEL_FULL = 60;
/** water depth at which a powered cell becomes a live-water hazard */
export const LIVE_WATER = 0.3;

export function stepPower(s: SimState, dtGame: number): void {
  const cells = s.cells.flat();
  const sub = cells.find((c) => c.type === 'substation');
  if (sub && !s.substationFlooded && sub.water > SUBSTATION_FLOOD_WATER) {
    s.substationFlooded = true;
    logEvent(s, 'power.outage', 'sim', { cell: cellKey(sub) });
  }

  for (const t of s.tokens) {
    if (t.type !== 'fuel' || !t.cell) continue;
    const c = s.cells[t.cell.y]?.[t.cell.x];
    if (c?.type === 'hospital') {
      s.generatorFuel = FUEL_FULL;
      t.cell = null;
      logEvent(s, 'power.refuel', 'sim', {});
    }
  }

  for (const c of cells) {
    const grid = !s.substationFlooded && !s.cutDistricts.includes(c.district);
    if (c.type !== 'hospital') {
      c.powered = grid;
      continue;
    }
    if (grid) {
      c.powered = true;
    } else if (s.generatorFuel > 0) {
      s.generatorFuel = Math.max(0, s.generatorFuel - dtGame / 60);
      c.powered = true;
    } else {
      c.powered = false;
      s.hospitalDarkS += dtGame;
    }
  }

  for (const c of cells) {
    const key = cellKey(c);
    if (c.powered && c.water > LIVE_WATER && c.type !== 'river' && !s.liveWater.includes(key)) {
      s.liveWater.push(key);
      logEvent(s, 'hazard.livewater', 'sim', { cell: key, district: c.district });
    }
  }
}
