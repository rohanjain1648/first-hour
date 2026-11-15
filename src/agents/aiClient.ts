import { parseTurnOutput, type TurnOutput, type TurnRequest } from './types';

export const MAX_CALLS = 250;
export const TIMEOUT_MS = 8000;

export interface AiClientOpts {
  enabled: boolean;
  maxCalls?: number;
  timeoutMs?: number;
  endpoint?: string;
}

/** Calls /api/turn. Any failure (disabled, over cap, timeout, HTTP error, bad JSON, bad schema) returns null. */
export class AiClient {
  calls = 0;
  failures = 0;
  enabled: boolean;
  private maxCalls: number;
  private timeoutMs: number;
  private endpoint: string;

  constructor(opts: AiClientOpts) {
    this.enabled = opts.enabled;
    this.maxCalls = opts.maxCalls ?? MAX_CALLS;
    this.timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
    this.endpoint = opts.endpoint ?? '/api/turn';
  }

  /** raw JSON variant for system agents whose output is not a TurnOutput */
  async raw(req: TurnRequest): Promise<unknown | null> {
    if (!this.enabled || this.calls >= this.maxCalls) return null;
    this.calls++;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        this.failures++;
        return null;
      }
      return await res.json();
    } catch {
      this.failures++;
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async turn(req: TurnRequest): Promise<TurnOutput | null> {
    const body = await this.raw(req);
    if (body === null) return null;
    const out = parseTurnOutput(body);
    if (!out) this.failures++;
    return out;
  }
}
