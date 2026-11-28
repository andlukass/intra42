import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = stripTypeScriptTypes(readFileSync(new URL("./api.ts", import.meta.url), "utf8"))
  .replace(/^import [\s\S]*?;\n/gm, "")
  .replaceAll("export ", "");

test("native agenda uses an AbortSignal without throwIfAborted and paginates the same official response", async () => {
  const client = {};
  const events = Array.from({ length: 7 }, (_, id) => ({ id: id + 1 }));
  let request;
  runInNewContext(`${source}\nclient.agenda=useAgenda;`, {
    client,
    URLSearchParams,
    setTimeout,
    useSession: () => ({ token: { accessToken: "local" } }),
    useQueryClient: () => ({
      fetchQuery: async (options) => {
        assert.deepEqual(Array.from(options.queryKey), ["42", "events"]);
        return options.queryFn({ signal: { aborted: false } });
      },
    }),
    useInfiniteQuery: (options) => options,
    queryOptions: (options) => options,
    demo: false,
    broker: "http://localhost:3000",
    fetch: async (url, options) => {
      request = { url, method: options.method };
      return Response.json(events);
    },
  });
  const agenda = client.agenda(38);
  const first = await agenda.queryFn({ pageParam: 1, signal: { aborted: false } });
  assert.deepEqual(first.items, events.slice(0, 3));
  assert.equal(first.hasMore, true);
  assert.deepEqual(request, { url: "http://localhost:3000/api/me/events", method: "GET" });
  const last = await agenda.queryFn({ pageParam: 3, signal: { aborted: false } });
  assert.deepEqual(last.items, events.slice(6));
  assert.equal(last.hasMore, false);
  await assert.rejects(
    agenda.queryFn({ pageParam: 1, signal: { aborted: true } }),
    /Request canceled/,
  );
});
