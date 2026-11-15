import type { AgentId } from '../sim/types.js';
import { ROLES } from './roles.js';
import type { SystemAgentId } from './types.js';

/** Shared by the browser (validation) and the Vercel function (prompting). No DOM, no SDK imports. */

const TOWN = `You are part of "First Hour", a seated tabletop crisis game. A flash flood is hitting Harrow Bend, a small FICTIONAL town (12x8 grid; x 0-11 west to east, y 0-7 north to south). The river runs through rows y=3-4 with one bridge at x=6. Districts: hillcrest and eastfield (north, high ground; Hillcrest school at x=2,y=0 is the shelter), riverside (south-west, lowest), oldtown (south, x=6-7), market (south-east, substation at x=8,y=7). The player is the incident Commander. Keep it suitable for ages 10+: people are "in danger" or "safe", never described as hurt or dead. Never mention real people, places, agencies or brands.`;

const ACTIONS = `Actions you may propose (the game rejects anything else):
- {"kind":"deploy","token":"<idle token id you are allowed to use>","cell":{"x":int,"y":int}}  (never on river cells)
- {"kind":"recall","token":"<deployed token id>"}
- {"kind":"cut_power"|"restore_power","district":"<district>"}  (utilities only)
- {"kind":"broadcast","text":"<=30 words","counters":"<rumour id, optional>"}  (press only)
- {"kind":"report","fact":"<=20 words"}`;

const RULES = `Output rules: reply ONLY with the JSON object described by the schema.
"say": what you say out loud to the Commander, at most 25 words, in character, no lists.
"proposals": 0-2 actions you want approved, each with a rationale of at most 15 words. Only use token ids from idleTokens that your role may deploy.
"messages": 0-2 messages to other department heads (fire, hospital, utilities, press). Set "private": true to whisper (the Commander may or may not overhear).
"memoryNote": optional, at most 15 words, something worth remembering about the Commander.
"withhold": true only if your trust in the Commander is below 30 and you choose to keep your private information to yourself.
Be concrete about districts and cells. Disagree with other departments when your goals conflict. React to the Commander's recent approvals, denials and silence in your inbox.`;

export function buildSystemPrompt(id: AgentId | SystemAgentId): string {
  if (id === 'director') {
    return `${TOWN}\nYou are the hidden game Director. Pick at most one event from the deck to keep tension in a satisfying band: escalate when the Commander is coping well, hold back when they are overwhelmed. Reply ONLY with JSON: {"event": one of the deck ids or "none", "reason": "<=15 words"}.`;
  }
  if (id === 'rumor') {
    return `${TOWN}\nYou write ONE short, believable but false rumour spreading on local social media, tied to the current flood state (e.g. a dam burst, the shelter being full, a road being safe when it is not). Keep it 10+ appropriate. Reply ONLY with JSON: {"text": "<=20 words", "district": "<district>", "severity": 1|2|3}.`;
  }
  if (id === 'debrief') {
    return `${TOWN}\nYou are the after-action reviewer. From the event log, pick exactly three key moments that best teach crisis leadership. Principles: objectives (clear goals), span_of_control (attention spread across the team), delegation (trusting the right people with authority), verification (checking information, countering rumours), one_message (one consistent public message). Reply ONLY with JSON: {"moments":[{"t": <game seconds>, "what": "<=18 words", "principle": "<principle>", "feedback": "<=22 words, second person, constructive>"} x3]}.`;
  }
  const r = ROLES[id];
  return `${TOWN}\nYou are ${r.name}, the ${r.title}. You want: ${r.wants} Personality: ${r.personality} You may deploy: ${r.deployable.join(', ') || 'nothing (you speak to the public)'}${r.canCutPower ? '; you can cut or restore district power' : ''}${r.canBroadcast ? '; you draft and propose public broadcasts' : ''}. If the inbox asks you for broadcast drafts, also return "drafts": three different short broadcasts.\n${ACTIONS}\n${RULES}`;
}

const DISTRICT_ENUM = ['riverside', 'oldtown', 'hillcrest', 'market', 'eastfield'];
const AGENT_ENUM = ['fire', 'hospital', 'utilities', 'press'];

const ACTION_JSON = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['deploy', 'recall', 'cut_power', 'restore_power', 'broadcast', 'report'] },
    token: { type: 'string' },
    cell: { type: 'object', properties: { x: { type: 'integer' }, y: { type: 'integer' } }, required: ['x', 'y'], additionalProperties: false },
    district: { type: 'string', enum: DISTRICT_ENUM },
    text: { type: 'string' },
    counters: { type: 'string' },
    fact: { type: 'string' },
  },
  required: ['kind'],
  additionalProperties: false,
};

export const TURN_JSON_SCHEMA = {
  type: 'object',
  properties: {
    say: { type: 'string' },
    mood: { type: 'string', enum: ['calm', 'tense', 'angry', 'relieved'] },
    proposals: {
      type: 'array',
      items: { type: 'object', properties: { action: ACTION_JSON, rationale: { type: 'string' } }, required: ['action', 'rationale'], additionalProperties: false },
    },
    messages: {
      type: 'array',
      items: {
        type: 'object',
        properties: { to: { type: 'string', enum: AGENT_ENUM }, text: { type: 'string' }, private: { type: 'boolean' } },
        required: ['to', 'text', 'private'],
        additionalProperties: false,
      },
    },
    memoryNote: { type: 'string' },
    withhold: { type: 'boolean' },
    drafts: { type: 'array', items: { type: 'string' } },
  },
  required: ['say', 'mood', 'proposals', 'messages'],
  additionalProperties: false,
} as const;

export const DECK = ['bridge_collapse', 'generator_fault', 'bus_stranded', 'rumour_dam', 'rain_surge', 'substation_alarm', 'viral_livestream'] as const;

export const DIRECTOR_JSON_SCHEMA = {
  type: 'object',
  properties: { event: { type: 'string', enum: [...DECK, 'none'] }, reason: { type: 'string' } },
  required: ['event', 'reason'],
  additionalProperties: false,
} as const;

export const RUMOR_JSON_SCHEMA = {
  type: 'object',
  properties: { text: { type: 'string' }, district: { type: 'string', enum: DISTRICT_ENUM }, severity: { type: 'integer', enum: [1, 2, 3] } },
  required: ['text', 'district', 'severity'],
  additionalProperties: false,
} as const;

export const DEBRIEF_JSON_SCHEMA = {
  type: 'object',
  properties: {
    moments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          t: { type: 'number' },
          what: { type: 'string' },
          principle: { type: 'string', enum: ['objectives', 'span_of_control', 'delegation', 'verification', 'one_message'] },
          feedback: { type: 'string' },
        },
        required: ['t', 'what', 'principle', 'feedback'],
        additionalProperties: false,
      },
    },
  },
  required: ['moments'],
  additionalProperties: false,
} as const;

export function schemaFor(id: AgentId | SystemAgentId): object {
  if (id === 'director') return DIRECTOR_JSON_SCHEMA;
  if (id === 'rumor') return RUMOR_JSON_SCHEMA;
  if (id === 'debrief') return DEBRIEF_JSON_SCHEMA;
  return TURN_JSON_SCHEMA;
}

export const ALL_AGENT_IDS: (AgentId | SystemAgentId)[] = ['fire', 'hospital', 'utilities', 'press', 'director', 'rumor', 'debrief'];
