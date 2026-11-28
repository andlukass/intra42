import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = stripTypeScriptTypes(readFileSync(new URL("./api.ts", import.meta.url), "utf8"))
  .replace(/^import [\s\S]*?;\n/gm, "")
  .replaceAll("export ", "");

function fixture(fetch) {
  const client = {};
  runInNewContext(`${source}\nObject.assign(client, {api, ApiError});`, {
    client,
    fetch,
    broker: "http://localhost:3000",
    demo: false,
    URLSearchParams,
    setTimeout,
  });
  return client;
}

test("a stopped backend shows a useful connection error and a subsequent retry recovers", async () => {
  let running = false;
  const client = fixture(async () => {
    if (!running)
      throw Error(
        "fetch failed: UnexpectedException: Could not connect to the server. (at ExpoModulesCore/Promise.swift:56)",
      );
    return Response.json({ users: [{ login: "llopes-d" }], projects: [] });
  });
  await assert.rejects(client.api("local-key", "/search?query=llopes"), (error) => {
    assert.ok(error instanceof client.ApiError);
    assert.equal(error.status, 0);
    assert.equal(
      error.message,
      "Could not connect to Intra42. Check your connection and try again.",
    );
    return true;
  });
  running = true;
  assert.deepEqual(await client.api("local-key", "/search?query=llopes"), {
    users: [{ login: "llopes-d" }],
    projects: [],
  });
});

test("cancellation stays distinguishable from a lost backend connection", async () => {
  const controller = new AbortController();
  const cancellation = Error("Request aborted");
  const client = fixture(async () => {
    controller.abort();
    throw cancellation;
  });
  await assert.rejects(
    client.api("local-key", "/search?query=old", controller.signal),
    (error) => error === cancellation,
  );
});
