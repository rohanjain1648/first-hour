/** Local calendar day, e.g. 2026-11-17 */
export function dateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Same seed for everyone on the same calendar day (FNV-1a over the date key). */
export function dailySeed(d: Date): number {
  let h = 0x811c9dc5;
  for (const ch of `first-hour:${dateKey(d)}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h & 0x7fffffff;
}
