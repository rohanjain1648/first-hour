import { afterEach, describe, expect, test, vi } from 'vitest';
import { AiClient } from '../../src/agents/aiClient';
import type { TurnRequest } from '../../src/agents/types';

const req: TurnRequest = { agentId: 'fire', observation: {}, inbox: [], memory: [], trust: 50, sessionId: 's1' };
const good = { say: 'River is rising.', mood: 'tense', proposals: [], messages: [] };
const ok = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('AiClient', () => {
  test('returns parsed output on valid 200', async () => {
    vi.stubGlobal('fetch', ok(good));
    expect((await new AiClient({ enabled: true }).turn(req))?.say).toBe('River is rising.');
  });
  test('returns null on 500', async () => {
    vi.stubGlobal('fetch', ok({ error: 'x' }, 500));
    expect(await new AiClient({ enabled: true }).turn(req)).toBeNull();
  });
  test('returns null on 429', async () => {
    vi.stubGlobal('fetch', ok({ error: 'slow down' }, 429));
    expect(await new AiClient({ enabled: true }).turn(req)).toBeNull();
  });
  test('returns null on invalid JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 200 })));
    expect(await new AiClient({ enabled: true }).turn(req)).toBeNull();
  });
  test('returns null on schema failure', async () => {
    vi.stubGlobal('fetch', ok({ say: 7 }));
    expect(await new AiClient({ enabled: true }).turn(req)).toBeNull();
  });
  test('returns null when fetch throws (offline)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    expect(await new AiClient({ enabled: true }).turn(req)).toBeNull();
  });
  test('returns null after 8000 ms', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_u: string, init: RequestInit) => new Promise((_r, rej) => {
      init.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
    })));
    const p = new AiClient({ enabled: true }).turn(req);
    await vi.advanceTimersByTimeAsync(8000);
    expect(await p).toBeNull();
  });
  test('returns null after 250 calls without fetching', async () => {
    const f = ok(good);
    vi.stubGlobal('fetch', f);
    const c = new AiClient({ enabled: true });
    c.calls = 250;
    expect(await c.turn(req)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
  test('returns null when disabled', async () => {
    const f = ok(good);
    vi.stubGlobal('fetch', f);
    expect(await new AiClient({ enabled: false }).turn(req)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
});
