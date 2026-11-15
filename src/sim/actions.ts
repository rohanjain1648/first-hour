import { logEvent } from './log';
import { RESCUE_GAME_S } from './people';
import type { Action, Actor, AgentId, ResourceType, SimState } from './types';
import { DISTRICTS } from './types';

export type ActionResult = { ok: true } | { ok: false; reason: string };

export const ROLE_DEPLOY: Record<AgentId, ResourceType[]> = {
  fire: ['crew', 'sandbags'],
  hospital: ['fuel'],
  utilities: ['pump', 'sandbags'],
  press: [],
};

/** compliance added to every district by a broadcast, and extra for a countered rumour's district */
export const BROADCAST_BOOST = 0.15;
export const COUNTER_BOOST = 0.2;

export const isAgent = (a: Actor): a is AgentId =>
  a === 'fire' || a === 'hospital' || a === 'utilities' || a === 'press';

function check(s: SimState, a: Action, actor: Actor): string | null {
  switch (a.kind) {
    case 'deploy': {
      const tok = s.tokens.find((t) => t.id === a.token);
      if (!tok) return `unknown token ${a.token}`;
      if (tok.cell) return `token ${a.token} already deployed`;
      if (isAgent(actor) && !ROLE_DEPLOY[actor].includes(tok.type)) return `role: ${actor} cannot deploy ${tok.type}`;
      const { x, y } = a.cell ?? { x: NaN, y: NaN };
      if (!Number.isInteger(x) || !Number.isInteger(y) || y < 0 || x < 0 || y >= s.cells.length || x >= s.cells[0].length) {
        return `cell ${x},${y} out of bounds`;
      }
      if (s.cells[y][x].type === 'river') return `cannot place ${tok.type} in the river`;
      return null;
    }
    case 'recall': {
      const tok = s.tokens.find((t) => t.id === a.token);
      if (!tok) return `unknown token ${a.token}`;
      if (!tok.cell) return `token ${a.token} not deployed`;
      if (isAgent(actor) && !ROLE_DEPLOY[actor].includes(tok.type)) return `role: ${actor} cannot recall ${tok.type}`;
      return null;
    }
    case 'cut_power':
    case 'restore_power': {
      if (isAgent(actor) && actor !== 'utilities') return 'role: only utilities can change power';
      if (!DISTRICTS.includes(a.district)) return `unknown district ${a.district}`;
      const cut = s.cutDistricts.includes(a.district);
      if (a.kind === 'cut_power' && cut) return `${a.district} already cut`;
      if (a.kind === 'restore_power' && !cut) return `${a.district} is not cut`;
      return null;
    }
    case 'broadcast':
      if (isAgent(actor) && actor !== 'press') return 'role: only press can broadcast';
      if (!a.text?.trim()) return 'empty broadcast';
      return null;
    case 'report':
      return null;
    default:
      return 'unknown action';
  }
}

/** dry run: the rejection reason, or null if the action would be accepted now */
export function validateAction(s: SimState, a: Action, actor: Actor): string | null {
  return check(s, a, actor);
}

export function applyAction(s: SimState, a: Action, actor: Actor, opts: { delegated?: boolean } = {}): ActionResult {
  const reason = check(s, a, actor);
  if (reason) {
    logEvent(s, 'action.rejected', actor, { action: a, reason });
    return { ok: false, reason };
  }
  switch (a.kind) {
    case 'deploy': {
      const tok = s.tokens.find((t) => t.id === a.token)!;
      tok.cell = { x: a.cell.x, y: a.cell.y };
      tok.busyUntil = tok.type === 'crew' ? s.t + RESCUE_GAME_S : 0;
      if (tok.type === 'sandbags') s.cells[a.cell.y][a.cell.x].sandbags += 1;
      break;
    }
    case 'recall': {
      const tok = s.tokens.find((t) => t.id === a.token)!;
      if (tok.type === 'sandbags' && tok.cell) {
        const c = s.cells[tok.cell.y][tok.cell.x];
        c.sandbags = Math.max(0, c.sandbags - 1);
      }
      tok.cell = null;
      tok.busyUntil = 0;
      break;
    }
    case 'cut_power':
      s.cutDistricts.push(a.district);
      break;
    case 'restore_power':
      s.cutDistricts = s.cutDistricts.filter((d) => d !== a.district);
      break;
    case 'broadcast': {
      for (const d of DISTRICTS) s.compliance[d] = Math.min(1, s.compliance[d] + BROADCAST_BOOST);
      const r = a.counters ? s.rumours.find((x) => x.id === a.counters && !x.countered) : undefined;
      if (r) {
        r.countered = true;
        s.compliance[r.district] = Math.min(1, s.compliance[r.district] + COUNTER_BOOST);
      }
      break;
    }
    case 'report':
      break;
  }
  logEvent(s, 'action.ok', actor, { action: a, delegated: !!opts.delegated });
  return { ok: true };
}
