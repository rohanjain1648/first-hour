import { logEvent } from './log';
import type { SimState, XY } from './types';
import { cellKey } from './types';

export const DANGER_WATER = 0.3;
export const HARM_AFTER_GAME_S = 900;
export const RESCUE_GAME_S = 120;
/** people per game second one bus moves at compliance 1 and a short trip */
export const BUS_RATE = 0.2;

export function findPath(s: SimState, from: XY, to: XY): XY[] | null {
  const h = s.cells.length;
  const w = s.cells[0].length;
  const home = s.cells[from.y][from.x].district;
  // roads, an intact bridge, and the start district's own residential streets
  const passable = (p: XY) => {
    const c = s.cells[p.y][p.x];
    if (c.type === 'road') return true;
    if (c.type === 'bridge') return s.bridgeIntact;
    return c.type === 'residential' && c.district === home;
  };
  const prev = new Map<string, XY | null>([[cellKey(from), null]]);
  const queue: XY[] = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur.x === to.x && cur.y === to.y) {
      const path: XY[] = [];
      for (let p: XY | null = cur; p; p = prev.get(cellKey(p)) ?? null) path.unshift(p);
      return path;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = { x: cur.x + dx, y: cur.y + dy };
      if (n.x < 0 || n.y < 0 || n.x >= w || n.y >= h || prev.has(cellKey(n))) continue;
      const isTarget = n.x === to.x && n.y === to.y;
      if (!isTarget && !passable(n)) continue;
      prev.set(cellKey(n), cur);
      queue.push(n);
    }
  }
  return null;
}

export function stepPeople(s: SimState, dtGame: number): void {
  const cells = s.cells.flat();

  for (const c of cells) {
    if (c.type !== 'residential' || c.residents <= 0) continue;
    const key = cellKey(c);
    if (c.water > DANGER_WATER) {
      if (!(key in s.peopleInDanger)) {
        s.peopleInDanger[key] = 0;
        logEvent(s, 'people.danger', 'sim', { cell: key, district: c.district, residents: c.residents });
      }
      s.peopleInDanger[key] += dtGame;
      if (s.peopleInDanger[key] >= HARM_AFTER_GAME_S) {
        s.harmed += c.residents;
        logEvent(s, 'people.harmed', 'sim', { cell: key, district: c.district, residents: c.residents });
        c.residents = 0;
        delete s.peopleInDanger[key];
      }
    }
  }

  const now = s.t + dtGame;
  for (const tok of s.tokens) {
    if (tok.type !== 'crew' || !tok.cell || tok.busyUntil <= 0) continue;
    if (now < tok.busyUntil) continue;
    const c = s.cells[tok.cell.y][tok.cell.x];
    tok.busyUntil = 0;
    if (c.residents > 0) {
      s.saved += c.residents;
      logEvent(s, 'people.rescued', tok.id, { cell: cellKey(c), residents: c.residents });
      c.residents = 0;
      delete s.peopleInDanger[cellKey(c)];
    }
  }

  const school = cells.find((c) => c.type === 'school');
  if (!school) return;
  for (const tok of s.tokens) {
    if (tok.type !== 'bus' || !tok.cell) continue;
    const district = s.cells[tok.cell.y][tok.cell.x].district;
    const path = findPath(s, tok.cell, school);
    if (!path) {
      if (tok.busyUntil !== -1) {
        tok.busyUntil = -1;
        logEvent(s, 'bus.stranded', tok.id, { district });
      }
      continue;
    }
    if (tok.busyUntil === -1) tok.busyUntil = 0;
    const rate = (BUS_RATE * s.compliance[district]) / (1 + path.length / 10);
    let toMove = rate * dtGame;
    for (const c of cells) {
      if (toMove <= 0) break;
      if (c.district !== district || c.type !== 'residential' || c.residents <= 0) continue;
      const moved = Math.min(c.residents, toMove);
      c.residents -= moved;
      s.saved += moved;
      toMove -= moved;
      if (c.residents <= 1e-6) {
        c.residents = 0;
        delete s.peopleInDanger[cellKey(c)];
      }
    }
  }
}
