import assert from "node:assert/strict";
import test from "node:test";
import { calendarDate, parseCalendarInput, utcISOString } from "./calendarTime.ts";

test("Lisboa slot times use the campus winter and summer offsets", () => {
  assert.equal(
    utcISOString(parseCalendarInput("2026-11-27 19:30", "Europe/Lisbon")),
    "2026-11-27T19:30:00.000Z",
  );
  assert.equal(
    utcISOString(parseCalendarInput("2026-07-06 19:30", "Europe/Lisbon")),
    "2026-07-06T18:30:00.000Z",
  );
});
test("calendar day arithmetic preserves campus midnight across DST", () => {
  const start = parseCalendarInput("2026-03-29 00:00", "Europe/Lisbon");
  const next = calendarDate(start);
  next.setDate(next.getDate() + 1);
  assert.equal(next.getHours(), 0);
  assert.equal(next.getTime() - start.getTime(), 23 * 3600000);
});
test("start and end labels stay in the campus zone and cross midnight", () => {
  const start = parseCalendarInput("2026-07-06 23:30", "Europe/Lisbon");
  const end = calendarDate(start.getTime() + 3600000, "Europe/Lisbon");
  assert.equal(end.getDate(), 7);
  assert.equal(end.getHours(), 0);
  assert.equal(end.getMinutes(), 30);
  assert.equal(calendarDate(Date.parse("2026-07-06T18:30Z"), "Europe/Lisbon").getHours(), 19);
});
