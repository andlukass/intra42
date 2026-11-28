import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = stripTypeScriptTypes(
  readFileSync(new URL("./useSettledCluster.ts", import.meta.url), "utf8"),
)
  .replace(/^import .*;\n/gm, "")
  .replace("export function", "function");
test("heavy map mounting waits for selector settlement and cancels obsolete selections", () => {
  const api = {};
  const timers = new Map();
  let state;
  let previous;
  let cleanup;
  let nextTimer = 0;
  runInNewContext(`${source}\napi.render=useSettledCluster;`, {
    api,
    useState: () => [
      state,
      (value) => {
        state = value;
      },
    ],
    useEffect: (effect, [id]) => {
      if (id !== previous) {
        cleanup?.();
        previous = id;
        cleanup = effect();
      }
    },
    setTimeout: (callback, delay) => {
      assert.equal(delay, 350);
      const id = ++nextTimer;
      timers.set(id, callback);
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
  });
  assert.equal(api.render(1).ready, false);
  assert.equal(api.render(2).ready, false);
  assert.equal(timers.size, 1);
  api.render(2).onSettled();
  assert.equal(api.render(2).ready, true);
  assert.equal(api.render(3).ready, false);
  for (const callback of timers.values()) callback();
  assert.equal(api.render(3).ready, true);
});
