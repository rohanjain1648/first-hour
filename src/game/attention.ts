import type { AgentId } from '../sim/types';

export interface V3 { x: number; y: number; z: number }

/** The agent closest to the head direction within a cone, or null. Allocation-free. */
export function focusedAgent(
  headDir: V3,
  headPos: V3,
  agents: { id: AgentId; pos: V3 }[],
  coneDeg = 20,
): AgentId | null {
  const dl = Math.hypot(headDir.x, headDir.y, headDir.z) || 1;
  const cosCone = Math.cos((coneDeg * Math.PI) / 180);
  let best: AgentId | null = null;
  let bestCos = cosCone;
  for (const a of agents) {
    const vx = a.pos.x - headPos.x;
    const vy = a.pos.y - headPos.y;
    const vz = a.pos.z - headPos.z;
    const vl = Math.hypot(vx, vy, vz) || 1;
    const c = (vx * headDir.x + vy * headDir.y + vz * headDir.z) / (vl * dl);
    if (c >= bestCos) {
      bestCos = c;
      best = a.id;
    }
  }
  return best;
}
