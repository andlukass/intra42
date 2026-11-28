import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { dateValue, progressDate } from "./profile-progress.ts";

const source = stripTypeScriptTypes(
  readFileSync(new URL("./alumnization-info.ts", import.meta.url), "utf8"),
)
  .replace(/^import .*;\n/gm, "")
  .replaceAll("export ", "");
const scope = { dateValue, progressDate };
const info = runInNewContext(`${source}\nalumnizationInfo;`, scope);
const alumnizationInfo = (...args) => {
  const result = info(...args);
  return result === undefined ? undefined : JSON.parse(JSON.stringify(result));
};

test("renders the official deadline and countdown for any viewed profile", () => {
  const now = Date.parse("2026-11-27T13:00:00Z");
  assert.deepEqual(alumnizationInfo({ deadline: "2027-04-21T00:00:00Z" }, null, now), {
    date: "21/04/2027",
    caption: "5 months left before alumnization",
  });
  assert.equal(
    alumnizationInfo({ deadline: "2026-11-29" }, null, now).caption,
    "2 days left before alumnization",
  );
  assert.equal(
    alumnizationInfo({ deadline: "2026-11-28" }, null, now).caption,
    "1 day left before alumnization",
  );
  assert.equal(
    alumnizationInfo({ deadline: "2026-11-20" }, null, now).caption,
    "Alumnization date",
  );
});
test("hides missing, invalid and banned countdowns and recognizes existing alumni", () => {
  for (const data of [
    null,
    {},
    { deadline: "bad" },
    { deadline: "2027-02-30" },
    { status: "banned", deadline: "2027-04-21" },
  ])
    assert.equal(alumnizationInfo(data), undefined);
  assert.deepEqual(alumnizationInfo(null, "2026-10-21T15:00:00Z"), {
    date: "21/10/2026",
    caption: "You're now an Alumni!",
  });
});
