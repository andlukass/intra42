import type { Location } from "../api";

export function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function logtimeByDay(locations: Location[], now: number) {
  const totals: Record<string, number> = {};
  for (const location of locations) {
    const start = Date.parse(location.begin_at);
    const end = Math.min(location.end_at ? Date.parse(location.end_at) : now, now);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    let cursor = start;
    while (cursor < end) {
      const date = new Date(cursor);
      const nextMidnight = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate() + 1,
      ).getTime();
      const until = Math.min(end, nextMidnight);
      const key = dayKey(date);
      totals[key] = (totals[key] ?? 0) + (until - cursor);
      cursor = until;
    }
  }
  return totals;
}
