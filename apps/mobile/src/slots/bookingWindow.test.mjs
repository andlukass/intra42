import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as calendarTime from "./calendarTime.ts";

const api = {};
const source = stripTypeScriptTypes(
  readFileSync(new URL("./bookingWindow.ts", import.meta.url), "utf8"),
)
  .replace(/import[^;]+;\s*/, "")
  .replaceAll("export function", "function");
runInNewContext(
  `${source}\napi.deadline = slotBookingDeadline; api.error = slotBookingError; api.times = slotStartTimes;`,
  {
    api,
    ...calendarTime,
    Date,
  },
);
test("booking window includes the precise deadline but rejects an end beyond it", () => {
  const now = new Date("2026-11-27T19:05:00Z");
  const deadline = api.deadline(now);
  assert.equal(deadline.toISOString(), "2026-12-11T19:05:00.000Z");
  assert.equal(api.error(new Date("2026-12-11T18:30:00Z"), deadline, now), null);
  assert.match(
    api.error(new Date("2026-12-11T18:45:00Z"), new Date("2026-12-11T19:15:00Z"), now),
    /14 days/,
  );
  assert.match(
    api.error(new Date("2026-12-11T19:15:00Z"), new Date("2026-12-11T19:45:00Z"), now),
    /14 days/,
  );
  assert.match(api.error(now, new Date(now.getTime() + 1800000), now), /future/);
});
test("deadline is a rolling 336 hours across daylight saving changes", () => {
  const now = new Date("2026-03-22T19:05:00Z");
  assert.equal(api.deadline(now).getTime() - now.getTime(), 336 * 3600000);
});

test("start times are future quarters and leave at least 30 minutes before the deadline", () => {
  const now = new Date(2026, 10, 27, 19, 5);
  const today = api.times(now, now);
  assert.equal(today[0].getHours(), 19);
  assert.equal(today[0].getMinutes(), 15);
  const finalDay = api.deadline(now);
  const last = api.times(finalDay, now).at(-1);
  assert.equal(last.getHours(), 18);
  assert.equal(last.getMinutes(), 30);
  assert.ok(last.getTime() + 30 * 60000 <= finalDay.getTime());
  assert.ok(last.getTime() + 45 * 60000 > finalDay.getTime());
  assert.equal(api.times(new Date(2026, 10, 28), now).length, 96);
  assert.equal(api.times(new Date(2026, 11, 12), now).length, 0);
  const exactQuarter = new Date(2026, 10, 27, 19, 15);
  assert.equal(api.times(exactQuarter, exactQuarter)[0].getMinutes(), 30);
});
