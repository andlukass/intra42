import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as calendarTime from "./calendarTime.ts";

const api = {};
const source = stripTypeScriptTypes(readFileSync(new URL("./slotWeek.ts", import.meta.url), "utf8"))
  .replace(/import[^;]+;\s*/, "")
  .replace("export function", "function");
runInNewContext(`${source}\napi.path = slotWeekPath;`, {
  api,
  Date,
  URLSearchParams,
  ...calendarTime,
});
test("slot queries stay within one Monday-to-Monday week, including day and year boundaries", () => {
  for (const day of [
    new Date(2026, 10, 27),
    new Date(2026, 10, 29),
    new Date(2026, 10, 30),
    new Date(2027, 0, 1),
    new Date(2026, 2, 29),
    new Date(2026, 9, 25),
  ]) {
    const url = new URL(api.path(day), "http://localhost");
    const [start, end] = url.searchParams
      .get("range[begin_at]")
      .split(",")
      .map((value) => new Date(value));
    assert.equal(start.getDay(), 1);
    assert.equal(end.getDay(), 1);
    assert.equal(start.getHours(), 0);
    assert.ok(start <= day && day < end);
    assert.ok(end - start <= 8 * 86_400_000);
  }
  assert.equal(api.path(new Date(2026, 10, 23)), api.path(new Date(2026, 10, 29)));
  assert.notEqual(api.path(new Date(2026, 10, 29)), api.path(new Date(2026, 10, 30)));
});

test("campus weeks retain their local midnights while requests use UTC", () => {
  const day = calendarTime.parseCalendarInput("2026-07-08 19:30", "Europe/Lisbon");
  const url = new URL(api.path(day), "http://localhost");
  assert.equal(
    url.searchParams.get("range[begin_at]"),
    "2026-07-05T23:00:00.000Z,2026-07-12T23:00:00.000Z",
  );
});
