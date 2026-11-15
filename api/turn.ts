import Anthropic from '@anthropic-ai/sdk';
import { ALL_AGENT_IDS, buildSystemPrompt, schemaFor } from '../src/agents/prompts';
import { parseTurnOutput } from '../src/agents/types';

const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;
const MAX_BODY_CHARS = 24_000;
const hits = new Map<string, number[]>();

/** test hook */
export function _resetRateLimit(): void {
  hits.clear();
}

function limited(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  return list.length > RATE_LIMIT;
}

let client: Anthropic | null = null;

export async function POST(req: Request): Promise<Response> {
  let body: { agentId?: string; observation?: unknown; inbox?: unknown; memory?: unknown; trust?: unknown };
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_CHARS) return Response.json({ error: 'too large' }, { status: 413 });
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 });
  }
  const id = body?.agentId as (typeof ALL_AGENT_IDS)[number];
  if (!ALL_AGENT_IDS.includes(id)) return Response.json({ error: 'bad agentId' }, { status: 400 });

  const ip = (req.headers.get('x-forwarded-for') ?? 'local').split(',')[0].trim();
  if (limited(ip)) return Response.json({ error: 'rate limited' }, { status: 429 });

  client ??= new Anthropic();
  const content = JSON.stringify({
    observation: body.observation ?? {},
    inbox: body.inbox ?? [],
    memory: body.memory ?? [],
    trustInCommander: body.trust,
  });
  try {
    const msg = await client.messages.create({
      model: process.env.AGENT_MODEL ?? 'claude-haiku-5-5',
      max_tokens: 1024,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: schemaFor(id) } },
      system: [{ type: 'text', text: buildSystemPrompt(id), cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content }],
    } as Anthropic.MessageCreateParamsNonStreaming);
    if (msg.stop_reason === 'refusal') return Response.json({ error: 'refused' }, { status: 502 });
    const text = msg.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') return Response.json({ error: 'no text' }, { status: 502 });
    let parsed: unknown;
    try {
      parsed = JSON.parse(text.text);
    } catch {
      return Response.json({ error: 'model returned invalid json' }, { status: 502 });
    }
    const isAgent = id === 'fire' || id === 'hospital' || id === 'utilities' || id === 'press';
    if (isAgent && !parseTurnOutput(parsed)) return Response.json({ error: 'schema' }, { status: 502 });
    return Response.json(parsed);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return Response.json({ error: 'upstream rate limited' }, { status: 429 });
    if (e instanceof Anthropic.APIError) return Response.json({ error: 'upstream error' }, { status: 502 });
    return Response.json({ error: 'server error' }, { status: 500 });
  }
}
