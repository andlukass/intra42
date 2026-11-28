import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = stripTypeScriptTypes(readFileSync(new URL("../api.ts", import.meta.url), "utf8"))
  .replace(/^import [\s\S]*?;\n/gm, "")
  .replaceAll("export ", "");
function fixture(status = 200) {
  const api = {};
  const calls = [];
  runInNewContext(
    `${source}\nObject.assign(testClient,{useAchievementIcon,ApiError});nextRequestAt=Date.now()+60000;`,
    {
      testClient: api,
      URL,
      URLSearchParams,
      AbortController,
      broker: "https://login.example",
      demo: false,
      useSession: () => ({ token: { accessToken: "local-session-key" } }),
      useQuery: (options) => options,
      loadCachedImage: async ({ download, isValid, source, directoryName }) => {
        assert.equal(directoryName, "achievement-icons-v1");
        assert.match(source, /achievement/);
        const uri = await download();
        if (!isValid(uri)) throw Error("Invalid icon");
        return uri;
      },
      setTimeout() {
        throw Error("Icon entered the API queue");
      },
      fetch: async (url, options) => {
        calls.push({ url, ...options });
        return Response.json(
          status === 200 ? { uri: "data:image/svg+xml;base64,PHN2Zy8+" } : { error: "Rejected" },
          { status },
        );
      },
    },
  );
  return { ...api, calls };
}

test("icons start in parallel even when the API queue is blocked and retain authentication/cancellation", async () => {
  const client = fixture();
  const signal = new AbortController().signal;
  await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      client
        .useAchievementIcon(`/uploads/achievement/image/${index + 1}/badge.svg`)
        .queryFn({ signal }),
    ),
  );
  assert.equal(client.calls.length, 10);
  for (const call of client.calls) {
    assert.equal(call.headers.Authorization, "Bearer local-session-key");
    assert.equal(call.signal, signal);
    assert.ok(call.url.startsWith("https://login.example/achievement-icon?"));
  }
});

test("icon failures retain HTTP status and retry only transient failures", async () => {
  const client = fixture(403);
  const query = client.useAchievementIcon("/achievement/image/1/badge.svg");
  await assert.rejects(
    query.queryFn({ signal: new AbortController().signal }),
    (error) => error instanceof client.ApiError && error.status === 403,
  );
  assert.equal(query.retry(0, new client.ApiError("Denied", 403)), false);
  assert.equal(query.retry(0, new client.ApiError("Unavailable", 502)), true);
  assert.equal(query.retry(2, new Error("Offline")), false);
});
