import { beforeEach, describe, expect, test, vi } from 'vitest';

const create = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create };
  },
}));

const { POST, _resetRateLimit } = await import('../../api/turn');

const body = { agentId: 'fire', observation: { gameMinute: 3 }, inbox: [], memory: [], trust: 60, sessionId: 's' };
const req = (b: unknown, ip = '1.1.1.1') =>
  new Request('https://x/api/turn', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(b) });
const reply = (obj: unknown, stop = 'end_turn') => ({ stop_reason: stop, content: [{ type: 'text', text: JSON.stringify(obj) }] });

beforeEach(() => {
  create.mockReset();
  _resetRateLimit();
  delete process.env.AGENT_MODEL;
});

describe('POST /api/turn', () => {
  test('400 on bad body', async () => {
    expect((await POST(req({ agentId: 'mayor' }))).status).toBe(400);
    expect((await POST(new Request('https://x/api/turn', { method: 'POST', body: '{nope' }))).status).toBe(400);
  });
  test('returns parsed JSON for an agent turn', async () => {
    create.mockResolvedValue(reply({ say: 'River is up.', mood: 'tense', proposals: [], messages: [] }));
    const res = await POST(req(body));
    expect(res.status).toBe(200);
    expect((await res.json()).say).toBe('River is up.');
  });
  test('uses AGENT_MODEL env, defaulting to claude-haiku-5-5', async () => {
    create.mockResolvedValue(reply({ say: 'x', mood: 'calm', proposals: [], messages: [] }));
    await POST(req(body));
    expect(create.mock.calls[0][0].model).toBe('claude-haiku-5-5');
    process.env.AGENT_MODEL = 'claude-opus-5-5';
    await POST(req(body, '2.2.2.2'));
    expect(create.mock.calls[1][0].model).toBe('claude-opus-5-5');
  });
  test('sends low effort, a json schema, and no temperature', async () => {
    create.mockResolvedValue(reply({ say: 'x', mood: 'calm', proposals: [], messages: [] }));
    await POST(req(body));
    const p = create.mock.calls[0][0];
    expect(p.output_config.effort).toBe('low');
    expect(p.output_config.format.type).toBe('json_schema');
    expect(p).not.toHaveProperty('temperature');
  });
  test('502 on refusal and on invalid model output', async () => {
    create.mockResolvedValue(reply({}, 'refusal'));
    expect((await POST(req(body))).status).toBe(502);
    create.mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'not json' }] });
    expect((await POST(req(body))).status).toBe(502);
  });
  test('429 after 60 requests from one IP', async () => {
    create.mockResolvedValue(reply({ say: 'x', mood: 'calm', proposals: [], messages: [] }));
    for (let i = 0; i < 60; i++) expect((await POST(req(body, '9.9.9.9'))).status).toBe(200);
    expect((await POST(req(body, '9.9.9.9'))).status).toBe(429);
  });
});
