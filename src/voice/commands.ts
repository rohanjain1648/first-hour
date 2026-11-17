import type { AgentId } from '../sim/types';

export type VoiceCommand =
  | { kind: 'approve' | 'deny' | 'report'; agent?: AgentId }
  | { kind: 'pause' | 'resume' | 'broadcast' }
  | { kind: 'order'; agent?: AgentId; text: string };

const AGENT_WORDS: [AgentId, RegExp][] = [
  ['fire', /\b(fire|chief|okafor|crews?)\b/],
  ['hospital', /\b(hospital|doctor|dr|lindqvist|medical)\b/],
  ['utilities', /\b(utilit(y|ies)|ravi|menon|power|roads?)\b/],
  ['press', /\b(press|mara|quist|public officer|media)\b/],
];

function agentIn(s: string): AgentId | undefined {
  return AGENT_WORDS.find(([, re]) => re.test(s))?.[0];
}

/** Turn a speech transcript into a game command. Pure; every command also has a hand equivalent. */
export function parseCommand(transcript: string): VoiceCommand | null {
  const raw = transcript.trim();
  if (!raw) return null;
  const s = raw.toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
  const words = s.split(' ');
  const agent = agentIn(s);
  const withAgent = <T extends { kind: string }>(c: T) => (agent ? { ...c, agent } : c);

  if (/^(pause|hold on|freeze)\b/.test(s) || /\bpause the game\b/.test(s)) return { kind: 'pause' };
  if (/^(resume|continue|unpause|go on)\b/.test(s)) return { kind: 'resume' };
  if (/\b(broadcast|public (message|statement|announcement))\b/.test(s)) return { kind: 'broadcast' };
  if (/\b(report|status|update|sitrep)\b/.test(s)) return withAgent({ kind: 'report' as const });
  if (words.length <= 6 && /^(approve|approved|yes|do it|go ahead|affirmative|confirm)\b/.test(s)) return withAgent({ kind: 'approve' as const });
  if (words.length <= 6 && /^(deny|denied|no|negative|reject|don't|do not)\b/.test(s)) return withAgent({ kind: 'deny' as const });

  const text = raw.split(/\s+/).slice(0, 20).join(' ');
  return agent ? { kind: 'order', agent, text } : { kind: 'order', text };
}
