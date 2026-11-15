import { ROLE_DEPLOY } from '../sim/actions.js';
import { DANGER_WATER } from '../sim/people.js';
import type { Action, AgentId, Cell, DistrictId, ResourceType, SimState } from '../sim/types.js';
import { cellKey } from '../sim/types.js';
import { LINES, fillLine, type Situation } from './lines.js';
import type { AgentState, TurnOutput } from './types.js';
import { WITHHOLD_BELOW } from './trust.js';

type Rng = () => number;
type Proposal = TurnOutput['proposals'][number];
type Message = TurnOutput['messages'][number];

const pick = <T>(arr: T[], rng: Rng): T => arr[Math.floor(rng() * arr.length) % arr.length];

const cells = (s: SimState) => s.cells.flat();
const idle = (s: SimState, id: AgentId, type: ResourceType) =>
  ROLE_DEPLOY[id].includes(type) ? s.tokens.find((t) => t.type === type && !t.cell) : undefined;

function dangerCells(s: SimState): Cell[] {
  return cells(s)
    .filter((c) => cellKey(c) in s.peopleInDanger && c.residents > 0)
    .sort((a, b) => b.residents - a.residents || s.peopleInDanger[cellKey(b)] - s.peopleInDanger[cellKey(a)]);
}

function floodedPoweredDistrict(s: SimState): DistrictId | undefined {
  const c = cells(s).find((x) => x.type !== 'river' && x.water > DANGER_WATER && !s.cutDistricts.includes(x.district) && x.type !== 'hospital');
  return c?.district;
}

/** an unsandbagged bank cell on the residential side, nearest the deepest river */
function bankToBag(s: SimState): Cell | undefined {
  return cells(s)
    .filter((c) => c.type === 'bank' && c.sandbags === 0 && c.y >= 5)
    .sort((a, b) => b.water - a.water || a.x - b.x)[0];
}

function lastPlayerVerdict(a: AgentState): 'approved' | 'denied' | null {
  const last = [...a.inbox].reverse().find((m) => m.from === 'player');
  if (!last) return null;
  if (last.text.startsWith('approved')) return 'approved';
  if (last.text.startsWith('denied')) return 'denied';
  return null;
}

interface Plan {
  situation: Situation;
  district: DistrictId;
  proposals: Proposal[];
  messages: Message[];
}

function planFire(s: SimState, rng: Rng): Plan {
  const danger = dangerCells(s);
  const proposals: Proposal[] = [];
  const messages: Message[] = [];
  const crew = idle(s, 'fire', 'crew');
  if (danger.length && crew) {
    const c = danger[0];
    proposals.push({ action: { kind: 'deploy', token: crew.id, cell: { x: c.x, y: c.y } }, rationale: `People trapped in ${c.district}.` });
    if (!s.cutDistricts.includes(c.district) && rng() < 0.4) {
      messages.push({ to: 'utilities', text: `Cut ${c.district} power before my crews go in.`, private: true });
    }
  }
  const bags = idle(s, 'fire', 'sandbags');
  const bank = bankToBag(s);
  if (proposals.length < 2 && bags && bank && bank.water < 0.6) {
    proposals.push({ action: { kind: 'deploy', token: bags.id, cell: { x: bank.x, y: bank.y } }, rationale: 'Hold the bank before homes flood.' });
  }
  const worst = danger.length ? Math.max(...danger.map((c) => s.peopleInDanger[cellKey(c)])) : 0;
  const situation: Situation = worst > 300 ? 'crisis' : danger.length || floodedPoweredDistrict(s) ? 'warning' : 'calm';
  return { situation, district: danger[0]?.district ?? bank?.district ?? 'riverside', proposals, messages };
}

function planHospital(s: SimState, rng: Rng): Plan {
  const h = cells(s).find((c) => c.type === 'hospital')!;
  const onGenerator = s.substationFlooded || s.cutDistricts.includes(h.district);
  const proposals: Proposal[] = [];
  const messages: Message[] = [];
  const fuel = idle(s, 'hospital', 'fuel');
  if (onGenerator && s.generatorFuel < 40 && fuel) {
    proposals.push({ action: { kind: 'deploy', token: fuel.id, cell: { x: h.x, y: h.y } }, rationale: 'Generator fuel is running low.' });
  }
  const sub = cells(s).find((c) => c.type === 'substation')!;
  if (!onGenerator && sub.water > 0.15 && rng() < 0.35) {
    messages.push({ to: 'utilities', text: 'Please protect the substation. My patients depend on it.', private: true });
  }
  const situation: Situation = onGenerator ? (s.generatorFuel < 20 ? 'crisis' : 'warning') : sub.water > 0.2 ? 'warning' : 'calm';
  return { situation, district: h.district, proposals, messages };
}

function planUtilities(s: SimState, rng: Rng): Plan {
  const sub = cells(s).find((c) => c.type === 'substation')!;
  const proposals: Proposal[] = [];
  const messages: Message[] = [];
  const bags = idle(s, 'utilities', 'sandbags');
  if (sub.water > 0.1 && sub.sandbags === 0 && bags && !s.substationFlooded) {
    proposals.push({ action: { kind: 'deploy', token: bags.id, cell: { x: sub.x, y: sub.y } }, rationale: 'Substation is the single point of failure.' });
  }
  const live = floodedPoweredDistrict(s);
  if (live && proposals.length < 2) {
    proposals.push({ action: { kind: 'cut_power', district: live }, rationale: `Live water risk in ${live}.` });
  }
  const pump = idle(s, 'utilities', 'pump');
  if (pump && proposals.length < 2) {
    const deepest = cells(s).filter((c) => c.type !== 'river' && c.type !== 'bank' && c.water > DANGER_WATER).sort((a, b) => b.water - a.water)[0];
    if (deepest) proposals.push({ action: { kind: 'deploy', token: pump.id, cell: { x: deepest.x, y: deepest.y } }, rationale: `Drain the worst of ${deepest.district}.` });
  }
  if (!s.bridgeIntact && rng() < 0.3) messages.push({ to: 'fire', text: 'Bridge is out. Plan crew routes without it.', private: false });
  const situation: Situation = s.substationFlooded || sub.water > 0.35 || s.liveWater.length > 2 ? 'crisis' : live || sub.water > 0.1 ? 'warning' : 'calm';
  return { situation, district: live ?? sub.district, proposals, messages };
}

function planPress(s: SimState, rng: Rng): Plan {
  const open = s.rumours.filter((r) => !r.countered).sort((a, b) => b.severity - a.severity);
  const proposals: Proposal[] = [];
  const messages: Message[] = [];
  if (open.length) {
    const r = open[0];
    proposals.push({
      action: { kind: 'broadcast', text: `The rumour about ${r.district} is false. Follow official updates and go to Hillcrest school if told to evacuate.`, counters: r.id },
      rationale: 'Kill the rumour before it spreads.',
    });
    if (rng() < 0.3) messages.push({ to: 'fire', text: `People in ${r.district} believe a rumour. Expect slow evacuations.`, private: true });
  } else if (cells(s).some((c) => c.type !== 'river' && c.water > DANGER_WATER) && rng() < 0.5) {
    proposals.push({ action: { kind: 'broadcast', text: 'Flooding in low areas. Move to higher ground. Shelter open at Hillcrest school.' }, rationale: 'People need to know where to go.' });
  }
  const situation: Situation = open.some((r) => r.severity >= 2) ? 'crisis' : open.length ? 'warning' : 'calm';
  return { situation, district: open[0]?.district ?? 'riverside', proposals, messages };
}

const PLANNERS: Record<AgentId, (s: SimState, rng: Rng) => Plan> = {
  fire: planFire,
  hospital: planHospital,
  utilities: planUtilities,
  press: planPress,
};

const MOOD: Record<Situation, TurnOutput['mood']> = {
  calm: 'calm',
  warning: 'tense',
  crisis: 'tense',
  gratitude: 'relieved',
  complaint: 'angry',
  withholding: 'angry',
};

/** Rule-based turn: always schema-valid, never calls the network. */
export function fallbackTurn(s: SimState, a: AgentState, rng: Rng): TurnOutput {
  const plan = PLANNERS[a.id](s, rng);
  let situation = plan.situation;
  const verdict = lastPlayerVerdict(a);
  if (verdict === 'approved') situation = 'gratitude';
  else if (verdict === 'denied') situation = 'complaint';
  const withhold = a.trust < WITHHOLD_BELOW && rng() < 0.6;
  if (withhold) situation = 'withholding';
  const say = fillLine(pick(LINES[a.id][situation], rng), plan.district);
  return {
    say,
    mood: MOOD[situation],
    proposals: plan.proposals.slice(0, 2) as { action: Action; rationale: string }[] as TurnOutput['proposals'],
    messages: plan.messages.slice(0, 2),
    withhold: withhold || undefined,
  };
}
