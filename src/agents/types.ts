import { z } from 'zod';
import type { AgentId } from '../sim/types.js';

export type { AgentId } from '../sim/types.js';
export type SystemAgentId = 'director' | 'rumor' | 'debrief';

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const maxWords = (n: number) => z.string().min(1).refine((s) => words(s) <= n, { message: `at most ${n} words` });

export const AgentIdSchema = z.enum(['fire', 'hospital', 'utilities', 'press']);
export const DistrictSchema = z.enum(['riverside', 'oldtown', 'hillcrest', 'market', 'eastfield']);
const XYSchema = z.object({ x: z.number().int(), y: z.number().int() });

export const ActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('deploy'), token: z.string(), cell: XYSchema }),
  z.object({ kind: z.literal('recall'), token: z.string() }),
  z.object({ kind: z.literal('cut_power'), district: DistrictSchema }),
  z.object({ kind: z.literal('restore_power'), district: DistrictSchema }),
  z.object({ kind: z.literal('broadcast'), text: maxWords(30), counters: z.string().optional() }),
  z.object({ kind: z.literal('report'), fact: maxWords(20) }),
]);

export const TurnOutput = z.object({
  say: maxWords(25),
  mood: z.enum(['calm', 'tense', 'angry', 'relieved']),
  proposals: z.array(z.object({ action: ActionSchema, rationale: maxWords(15) })).max(2),
  messages: z.array(z.object({ to: AgentIdSchema, text: maxWords(20), private: z.boolean() })).max(2),
  memoryNote: maxWords(15).optional(),
  withhold: z.boolean().optional(),
  /** press only: three broadcast drafts when asked */
  drafts: z.array(maxWords(30)).max(3).optional(),
});
export type TurnOutput = z.infer<typeof TurnOutput>;

export function parseTurnOutput(raw: unknown): TurnOutput | null {
  let v = raw;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  const r = TurnOutput.safeParse(v);
  return r.success ? r.data : null;
}

export type Mood = TurnOutput['mood'];

export interface InboxItem {
  from: 'player' | AgentId | 'sim';
  text: string;
  t: number;
}

export interface AgentState {
  id: AgentId;
  trust: number;
  mood: Mood;
  /** this session, at most 5 */
  memory: string[];
  /** from earlier sessions, at most 3 */
  pastMemory: string[];
  inbox: InboxItem[];
  holdsChip: boolean;
  /** real seconds (crisis clock) when the player last looked at this agent */
  lastFocusedT: number;
  inFlight: boolean;
}

export interface TurnRequest {
  agentId: AgentId | SystemAgentId;
  observation: unknown;
  inbox: InboxItem[];
  memory: string[];
  trust?: number;
  sessionId: string;
}
