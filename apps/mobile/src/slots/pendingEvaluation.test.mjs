import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = stripTypeScriptTypes(
  readFileSync(new URL("./pendingEvaluation.ts", import.meta.url), "utf8"),
)
  .replace(/^import .*;\n/gm, "")
  .replace("export function", "function");
const api = {};
runInNewContext(`${source}\napi.status = pendingEvaluationStatus;`, { api, Date });
test("pending rows distinguish evaluator, evaluated, and ready states", () => {
  const now = Date.parse("2026-11-27T16:00:00Z");
  const evaluation = { id: 42, kind: "evaluator", begin_at: "2026-11-28T16:00:00Z" };
  let result = api.status(evaluation, now);
  assert.equal(result.message, "You will evaluate");
  assert.equal(result.relativeTime, "in 1 day");
  assert.equal(result.canBegin, false);
  result = api.status({ ...evaluation, kind: "evaluated" }, now);
  assert.equal(result.message, "You will be evaluated by");
  result = api.status({ ...evaluation, begin_at: "2026-11-27T15:00:00Z" }, now);
  assert.equal(result.message, "You are ready to evaluate");
  assert.equal(result.canBegin, true);
  assert.equal(result.relativeTime, "1 hour ago");
  assert.equal(api.status({ ...evaluation, id: 0 }, now + 2 * 86_400_000).canBegin, false);
});
