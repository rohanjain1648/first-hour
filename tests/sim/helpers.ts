import type { Cell, CellType, SimState, Token } from '../../src/sim/types';

export function cell(x: number, y: number, type: CellType, elevation: Cell['elevation'], extra: Partial<Cell> = {}): Cell {
  return { x, y, type, elevation, water: 0, sandbags: 0, residents: 0, district: 'riverside', powered: true, ...extra };
}

export function makeState(cells: Cell[][], extra: Partial<SimState> = {}): SimState {
  return {
    seed: 1,
    t: 0,
    cells,
    tokens: [] as Token[],
    rain: 0,
    generatorFuel: 60,
    substationFlooded: false,
    bridgeIntact: true,
    compliance: { riverside: 0.7, oldtown: 0.7, hillcrest: 0.7, market: 0.7, eastfield: 0.7 },
    cutDistricts: [],
    peopleInDanger: {},
    harmed: 0,
    saved: 0,
    rumours: [],
    log: [],
    modifier: 'heavy',
    ...extra,
  };
}

/** river(elev 0) | bank(elev 0) | park(elev 3) in one row */
export function strip(riverWater = 2, bankSandbags = 0): SimState {
  return makeState([[
    cell(0, 0, 'river', 0, { water: riverWater }),
    cell(1, 0, 'bank', 0, { sandbags: bankSandbags }),
    cell(2, 0, 'park', 3),
  ]]);
}
