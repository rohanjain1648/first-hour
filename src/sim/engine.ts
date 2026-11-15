import { applyAction } from './actions.js';
import { stepFlood } from './flood.js';
import { buildHarrowBend } from './map.js';
import { stepPeople } from './people.js';
import { stepPower } from './power.js';
import type { Action, Actor, Modifier, ResourceType, SimState, Token, XY } from './types.js';
import { DISTRICTS } from './types.js';

export { logEvent } from './log.js';

export const TICK_REAL_S = 0.5;
export const TIME_SCALE = 6;
export const START_COMPLIANCE = 0.6;
const BASE_RAIN: Record<Modifier, number> = { light: 0.7, heavy: 1, night: 0.9 };

export interface SimOptions {
  extraTokens?: ResourceType[];
  generatorFuel?: number;
  /** cells that start with one permanent sandbag (levee upgrade) */
  levee?: XY[];
}

export function createSim(seed: number, modifier: Modifier, opts: SimOptions = {}): SimState {
  const tokens: Token[] = [];
  const add = (type: ResourceType, n: number, prefix: string) => {
    for (let i = 1; i <= n; i++) tokens.push({ id: `${prefix}${i}`, type, cell: null, busyUntil: 0 });
  };
  add('crew', 3, 'crew');
  add('bus', 2, 'bus');
  add('sandbags', 6, 'sand');
  add('pump', 1, 'pump');
  add('fuel', 1, 'fuel');
  (opts.extraTokens ?? []).forEach((type, i) => tokens.push({ id: `extra${i + 1}`, type, cell: null, busyUntil: 0 }));

  const cells = buildHarrowBend();
  for (const c of opts.levee ?? []) cells[c.y][c.x].sandbags += 1;

  return {
    seed,
    t: 0,
    cells,
    tokens,
    rain: BASE_RAIN[modifier] * 0.7,
    generatorFuel: opts.generatorFuel ?? 60,
    substationFlooded: false,
    bridgeIntact: true,
    compliance: Object.fromEntries(DISTRICTS.map((d) => [d, START_COMPLIANCE])) as SimState['compliance'],
    cutDistricts: [],
    peopleInDanger: {},
    harmed: 0,
    saved: 0,
    rumours: [],
    log: [],
    modifier,
    hospitalDarkS: 0,
    liveWater: [],
    carry: 0,
  };
}

/** scenario rain curve: ramps to full over the first game half hour */
function rainAt(s: SimState): number {
  return BASE_RAIN[s.modifier] * (0.7 + 0.5 * Math.min(1, s.t / 1800));
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export function tick(s: SimState, dtReal: number): void {
  // whole half-second steps only, so replays are exact regardless of frame times
  s.carry = round6(s.carry + Math.max(0, dtReal));
  while (s.carry >= TICK_REAL_S) {
    s.carry = round6(s.carry - TICK_REAL_S);
    const dtGame = TICK_REAL_S * TIME_SCALE;
    s.rain = Math.max(s.rain, rainAt(s));
    stepFlood(s, dtGame);
    stepPower(s, dtGame);
    stepPeople(s, dtGame);
    s.t += dtGame;
  }
}

export interface ReplayInput {
  tReal: number;
  action: Action;
  actor: Actor;
}

export function replay(
  seed: number,
  modifier: Modifier,
  inputs: ReplayInput[],
  untilReal: number,
  opts: SimOptions = {},
): SimState {
  const s = createSim(seed, modifier, opts);
  let elapsed = 0;
  for (const inp of [...inputs].sort((a, b) => a.tReal - b.tReal)) {
    if (inp.tReal > untilReal) break;
    tick(s, inp.tReal - elapsed);
    elapsed = inp.tReal;
    applyAction(s, inp.action, inp.actor);
  }
  tick(s, untilReal - elapsed);
  return s;
}
