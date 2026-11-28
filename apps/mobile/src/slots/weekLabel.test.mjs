import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = stripTypeScriptTypes(
  readFileSync(new URL("./weekLabel.ts", import.meta.url), "utf8"),
).replace("export function", "function");

test("week labels work without Intl.formatRange across months and years", () => {
  const api = {};
  runInNewContext(`${source}\napi.label = weekLabel;`, {
    api,
    Intl: {
      DateTimeFormat: class {
        constructor(...args) {
          this.format = new Intl.DateTimeFormat(...args).format;
        }
      },
    },
  });
  assert.equal(api.label(new Date(2026, 10, 23), new Date(2026, 10, 29)), "Nov 23 – 29, 2026");
  assert.equal(api.label(new Date(2026, 10, 30), new Date(2026, 11, 6)), "Nov 30 – Dec 6, 2026");
  assert.equal(
    api.label(new Date(2026, 11, 28), new Date(2027, 0, 3)),
    "Dec 28, 2026 – Jan 3, 2027",
  );
});
