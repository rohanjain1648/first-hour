import type { Cell, CellType, DistrictId } from './types';

// r residential, = road, H bridge, R river, B bank, S school, + hospital,
// F fire station, P substation, p park
const LAYOUT = [
  'rrS===rrrprr',
  'r==+===F=rrr',
  'BBBBBB=BBBBB',
  'RRRRRRHRRRRR',
  'RRRRRRHRRRRR',
  'BBBBBB=BBBBB',
  'rr=========r',
  'rrrrrrrrPrrr',
];

const ELEVATION = [
  '555555555555',
  '444444444444',
  '111111211111',
  '000000200000',
  '000000200000',
  '111111111111',
  '111111111111',
  '111111222122',
];

const TYPES: Record<string, CellType> = {
  r: 'residential', '=': 'road', H: 'bridge', R: 'river', B: 'bank',
  S: 'school', '+': 'hospital', F: 'firestation', P: 'substation', p: 'park',
};

export const RESIDENTS_PER_CELL = 40;
export const MAP_W = 12;
export const MAP_H = 8;

function districtOf(x: number, y: number): DistrictId {
  if (y <= 2) return x <= 5 ? 'hillcrest' : 'eastfield';
  if (x <= 5) return 'riverside';
  if (x <= 7) return 'oldtown';
  return 'market';
}

export function buildHarrowBend(): Cell[][] {
  return LAYOUT.map((row, y) =>
    [...row].map((ch, x) => {
      const type = TYPES[ch];
      return {
        x,
        y,
        type,
        elevation: Number(ELEVATION[y][x]) as Cell['elevation'],
        water: type === 'river' ? 0.9 : 0,
        sandbags: 0,
        residents: type === 'residential' ? RESIDENTS_PER_CELL : 0,
        district: districtOf(x, y),
        powered: true,
      };
    }),
  );
}
