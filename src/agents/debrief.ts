import type { SimState } from '../sim/types.js';
import { ROLES } from './roles.js';
import type { RawSource } from './director.js';
import type { AgentId } from '../sim/types.js';

export type Principle = 'objectives' | 'span_of_control' | 'delegation' | 'verification' | 'one_message';
const PRINCIPLES: Principle[] = ['objectives', 'span_of_control', 'delegation', 'verification', 'one_message'];

export interface KeyMoment {
  t: number;
  what: string;
  principle: Principle;
  feedback: string;
}

export interface MissedWhisper {
  t: number;
  from: string;
  to: string;
  text: string;
}

export interface Debrief {
  moments: KeyMoment[];
  missedWhispers: MissedWhisper[];
}

const title = (id: unknown) => (typeof id === 'string' && id in ROLES ? ROLES[id as AgentId].title : String(id));

function missed(s: SimState): MissedWhisper[] {
  return s.log
    .filter((e) => e.type === 'whisper.missed')
    .map((e) => ({ t: e.t, from: e.actor, to: String(e.data.to), text: String(e.data.text) }));
}

/** Rule-based after-action review: detects the moments named in design §6.4 and always returns exactly three. */
export function debriefFallback(s: SimState): Debrief {
  const found: (KeyMoment & { weight: number })[] = [];
  for (const e of s.log) {
    if (e.type === 'agent.ignored') {
      found.push({ t: e.t, weight: 5, principle: 'span_of_control', what: `You left the ${title(e.actor)} unattended for ${Math.round(Number(e.data.seconds))} seconds.`, feedback: 'Turn to each department head regularly, even briefly, or hand them a chip so silence still means action.' });
    } else if (e.type === 'chip.given' && Number(e.data.trust) < 30) {
      found.push({ t: e.t, weight: 4, principle: 'delegation', what: `You gave authority to the ${title(e.data.agent)} while their trust was low.`, feedback: 'Delegate to people who trust you and share their information, not just whoever is loudest.' });
    } else if (e.type === 'agent.freelance') {
      found.push({ t: e.t, weight: 3, principle: 'span_of_control', what: `The ${title(e.actor)} acted alone because nobody was steering them.`, feedback: 'Unattended teams improvise. Check in before they do, or give clear authority on purpose.' });
    } else if (e.type === 'power.outage') {
      found.push({ t: e.t, weight: 3, principle: 'objectives', what: 'The substation flooded and the town lost grid power.', feedback: 'Protect single points of failure early: one sandbag at the substation outweighs many later.' });
    } else if (e.type === 'people.harmed') {
      found.push({ t: e.t, weight: 5, principle: 'objectives', what: `People in ${String(e.data.district)} waited too long for help.`, feedback: 'Make life safety the first objective and say it out loud: rescues and evacuations before property.' });
    } else if (e.type === 'whisper.heard') {
      found.push({ t: e.t, weight: 1, principle: 'verification', what: `You overheard ${title(e.data.from)} and ${title(e.data.to)} coordinating privately.`, feedback: 'Listening in finds hidden plans but costs trust. Ask openly when you can.' });
    }
  }
  for (const r of s.rumours) {
    if (!r.countered && s.t - r.t > 180) {
      found.push({ t: r.t, weight: 4, principle: 'verification', what: `The rumour "${r.text.slice(0, 50)}" spread unanswered in ${r.district}.`, feedback: 'Counter false information fast with one clear broadcast; silence lets rumours slow evacuations.' });
    }
  }
  const broadcasts = s.log.filter((e) => e.type === 'action.ok' && (e.data.action as { kind?: string })?.kind === 'broadcast');
  if (broadcasts.length >= 3) {
    found.push({ t: broadcasts[2].t, weight: 2, principle: 'one_message', what: `You issued ${broadcasts.length} broadcasts.`, feedback: 'Keep public messages consistent: many changing statements can confuse more than they help.' });
  }

  found.sort((a, b) => b.weight - a.weight || a.t - b.t);
  const picked: KeyMoment[] = [];
  const seen = new Set<string>();
  // first pass: the strongest moment per principle, so the review teaches three different things
  for (const m of found) {
    if (picked.length === 3) break;
    if (picked.some((p) => p.principle === m.principle)) continue;
    seen.add(`${m.principle}:${m.what}`);
    picked.push({ t: m.t, what: m.what, principle: m.principle, feedback: m.feedback });
  }
  for (const m of found) {
    if (picked.length === 3) break;
    const key = `${m.principle}:${m.what}`;
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push({ t: m.t, what: m.what, principle: m.principle, feedback: m.feedback });
  }
  const PADDING: KeyMoment[] = [
    { t: 0, principle: 'objectives', what: 'The flood began and every department wanted something different.', feedback: 'Open with one stated priority, such as people first, so every later decision has a yardstick.' },
    { t: Math.round(s.t / 2), principle: 'delegation', what: 'Your gold chips were the strongest tool on the table.', feedback: 'A trusted department head with authority acts while you focus elsewhere.' },
    { t: s.t, principle: 'one_message', what: 'The public heard from you through the press officer.', feedback: 'One calm, consistent public message keeps evacuations moving.' },
  ];
  for (const p of PADDING) {
    if (picked.length >= 3) break;
    if (!picked.some((m) => m.principle === p.principle)) picked.push(p);
  }
  for (const p of PADDING) if (picked.length < 3) picked.push(p);
  return { moments: picked.slice(0, 3).sort((a, b) => a.t - b.t), missedWhispers: missed(s) };
}

function validMoments(o: unknown): KeyMoment[] | null {
  const m = (o as { moments?: unknown })?.moments;
  if (!Array.isArray(m) || m.length !== 3) return null;
  for (const x of m) {
    const k = x as KeyMoment;
    if (typeof k?.t !== 'number' || typeof k.what !== 'string' || typeof k.feedback !== 'string' || !PRINCIPLES.includes(k.principle)) return null;
  }
  return m as KeyMoment[];
}

/** AI debrief over a compressed log (≤ 200 events); falls back to rules. Missed whispers always come from the log. */
export async function debrief(s: SimState, ai: RawSource): Promise<Debrief> {
  const interesting = s.log.filter((e) => !e.type.startsWith('people.danger')).slice(-200);
  const out = await ai.raw({
    agentId: 'debrief',
    observation: {
      events: interesting.map((e) => ({ t: e.t, type: e.type, actor: e.actor, data: JSON.stringify(e.data).slice(0, 120) })),
      saved: Math.round(s.saved),
      harmed: Math.round(s.harmed),
      hospitalDarkSeconds: Math.round(s.hospitalDarkS),
    },
    inbox: [],
    memory: [],
    sessionId: 'debrief',
  });
  const moments = validMoments(out);
  if (!moments) return debriefFallback(s);
  return { moments: [...moments].sort((a, b) => a.t - b.t), missedWhispers: missed(s) };
}
