import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = (await readFile(new URL("./dev.mjs", import.meta.url), "utf8"))
  .replace(/^import .*;\n/gm, "")
  .replace("createRequire(import.meta.url)", "createRequire()")
  .split("run().catch")[0];

for (const configured of ["https://example.test/intra42", "", undefined]) {
  test(`dev:all selects the app URL independently of local backend startup (${configured ?? "unset"})`, () => {
    const env = configured === undefined ? {} : { EXPO_PUBLIC_INTRA42_OAUTH_URL: configured };
    let banner;
    runInNewContext(source, {
      process: { argv: ["node", "dev.mjs", "--all"], env, platform: "darwin", once() {} },
      createRequire: () => () => {},
      createDevTerminal: (text) => {
        banner = text;
      },
    });
    assert.equal(env.EXPO_PUBLIC_INTRA42_OAUTH_URL, configured || "http://127.0.0.1:8787");
    assert.ok(banner.includes("Backend   http://127.0.0.1:8787"));
    assert.ok(banner.includes(`App API   ${env.EXPO_PUBLIC_INTRA42_OAUTH_URL}`));
  });
}
