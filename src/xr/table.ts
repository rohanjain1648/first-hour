import { MAP_H, MAP_W } from '../sim/map';

export interface P3 { x: number; y: number; z: number }

export interface PlaneInfo {
  center: P3;
  width: number;
  depth: number;
  label?: string;
  horizontal: boolean;
}

const TABLE_LABELS = ['table', 'desk'];
const NEVER = ['floor', 'ceiling', 'wall', 'bed', 'couch', 'shelf', 'door', 'window', 'screen'];
export const MAX_REACH_M = 1.2;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** horizontal distance from the head to the nearest point of the plane's footprint (axis-aligned approximation) */
export function reachDist(p: PlaneInfo, head: P3): number {
  const nx = clamp(head.x, p.center.x - p.width / 2, p.center.x + p.width / 2);
  const nz = clamp(head.z, p.center.z - p.depth / 2, p.center.z + p.depth / 2);
  return Math.hypot(nx - head.x, nz - head.z);
}

/** Board center on the plane: the point nearest the head, pulled inward so the board stays on the surface. */
export function boardCenterOn(p: PlaneInfo, head: P3): P3 {
  const half = boardSize(p).width / 2;
  const sx = Math.min(p.width / 2, half);
  const sz = Math.min(p.depth / 2, half);
  return {
    x: clamp(head.x, p.center.x - p.width / 2 + sx, p.center.x + p.width / 2 - sx),
    y: p.center.y,
    z: clamp(head.z, p.center.z - p.depth / 2 + sz, p.center.z + p.depth / 2 - sz),
  };
}

/** Pure: pick the plane to put the board on, or null (use fallbackDesk). Rules: design §6.1. */
export function chooseTable(planes: PlaneInfo[], head: P3, floorY: number | null): PlaneInfo | null {
  const ok = planes.filter((p) => {
    if (!p.horizontal) return false;
    const label = p.label?.toLowerCase();
    if (label && NEVER.includes(label)) return false;
    if (reachDist(p, head) > MAX_REACH_M) return false;
    if (floorY !== null) {
      const h = p.center.y - floorY;
      return h >= 0.35 && h <= 1.1;
    }
    const below = head.y - p.center.y;
    return below >= 0.2 && below <= 0.9;
  });
  const dist = (p: PlaneInfo) => reachDist(p, head);
  const labelled = ok.filter((p) => p.label && TABLE_LABELS.includes(p.label.toLowerCase()));
  const pool = labelled.length ? labelled : ok;
  return pool.sort((a, b) => dist(a) - dist(b))[0] ?? null;
}

/** Virtual desk 0.45 m ahead along the horizontal head direction, at 0.72 m (or 0.30 m below the head). */
export function fallbackDesk(head: P3, forward: { x: number; z: number }, floorY: number | null): PlaneInfo {
  const l = Math.hypot(forward.x, forward.z) || 1;
  const fx = forward.x / l;
  const fz = forward.z / l;
  const y = floorY !== null ? floorY + 0.72 : head.y - 0.3;
  return { center: { x: head.x + fx * 0.45, y, z: head.z + fz * 0.45 }, width: 0.9, depth: 0.6, label: 'virtual-desk', horizontal: true };
}

const ASPECT = MAP_H / MAP_W;

/** Board footprint: fits the plane, 12:8 aspect, max 0.9 x 0.6, min 0.5 x 0.35. */
export function boardSize(p: PlaneInfo): { width: number; depth: number } {
  let width = Math.min(0.9, p.width, p.depth / ASPECT);
  width = Math.max(0.5, width);
  const depth = Math.max(0.35, Math.min(0.6, width * ASPECT));
  return { width: Math.round(width * 1e6) / 1e6, depth: Math.round(depth * 1e6) / 1e6 };
}
