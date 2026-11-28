import { randomInt } from "node:crypto";
import { TZDate } from "@date-fns/tz";
import type { Location } from "../../src/api.js";
import { timeZone } from "./agenda.ts";
import { db } from "./store.ts";

function logtimeFor(userId: number) {
  return userId === 1 ? db.doc("review/logtime") : db.doc(`review/student-${userId}-logtime`);
}
type Days = Record<string, Location[]>;

function dayKey(day: Date) {
  return [day.getFullYear(), day.getMonth() + 1, day.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("-");
}

export async function fillReviewLogtime(userId: number, now = new Date()) {
  const logtime = logtimeFor(userId);
  const today = new TZDate(now.getTime(), timeZone);
  await db.runTransaction(async (transaction) => {
    const saved = (await transaction.get(logtime)).get("days") as Days | undefined;
    const first = new TZDate(today.getFullYear(), today.getMonth() - 3, 1, timeZone);
    const oldest = Object.keys(saved ?? {}).sort()[0];
    if (oldest && oldest < dayKey(first)) {
      const [year, month, date] = oldest.split("-").map(Number);
      first.setFullYear(year, month - 1, date);
    }
    const missing: Days = {};
    for (const day = first; dayKey(day) <= dayKey(today); day.setDate(day.getDate() + 1)) {
      const key = dayKey(day);
      if (saved && Object.hasOwn(saved, key)) continue;
      const weekend = day.getDay() === 0 || day.getDay() === 6;
      const start = new TZDate(+day, timeZone);
      start.setHours(randomInt(8, 11), randomInt(4) * 15);
      const end = Math.min(+now, +start + randomInt(8, 29) * 15 * 60_000);
      missing[key] =
        end - +start < 30 * 60_000 || randomInt(100) < (weekend ? 75 : 15)
          ? []
          : [
              {
                id: +start,
                begin_at: new Date(+start).toISOString(),
                end_at: new Date(end).toISOString(),
              },
            ];
    }
    if (Object.keys(missing).length) transaction.set(logtime, { days: missing }, { merge: true });
  });
}

export async function readReviewLogtime(userId: number, query: URLSearchParams) {
  const [start, end] = (query.get("range[begin_at]") ?? "").split(",").map(Date.parse);
  const page = Number(query.get("page[number]") ?? 1);
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isSafeInteger(page) || page < 1)
    return [];
  const days = (await logtimeFor(userId).get()).get("days") as Days | undefined;
  return Object.values(days ?? {})
    .flat()
    .filter(({ begin_at }) => Date.parse(begin_at) >= start && Date.parse(begin_at) < end)
    .sort((a, b) => a.begin_at.localeCompare(b.begin_at))
    .slice((page - 1) * 100, page * 100);
}
