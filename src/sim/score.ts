import type { SimState } from './types';
import { cellKey } from './types';

export type Rating = 'A' | 'B' | 'C' | 'D' | 'E';

export interface Score {
  safePct: number;
  hospitalUptimePct: number;
  rumoursCountered: number;
  rating: Rating;
}

export function score(s: SimState): Score {
  const cells = s.cells.flat();
  const remaining = cells.reduce((a, c) => a + c.residents, 0);
  const inDanger = cells.filter((c) => cellKey(c) in s.peopleInDanger).reduce((a, c) => a + c.residents, 0);
  const total = remaining + s.saved + s.harmed;
  const safePct = total > 0 ? Math.round(((total - s.harmed - inDanger) / total) * 1000) / 10 : 100;
  const hospitalUptimePct = Math.round((1 - s.hospitalDarkS / Math.max(s.t, 1)) * 1000) / 10;
  const rumoursCountered = s.rumours.filter((r) => r.countered).length;
  const rumourPart = s.rumours.length ? rumoursCountered / s.rumours.length : 1;
  const combined = 0.6 * safePct + 0.3 * hospitalUptimePct + 10 * rumourPart;
  const rating: Rating = combined >= 90 ? 'A' : combined >= 80 ? 'B' : combined >= 65 ? 'C' : combined >= 50 ? 'D' : 'E';
  return { safePct, hospitalUptimePct, rumoursCountered, rating };
}
