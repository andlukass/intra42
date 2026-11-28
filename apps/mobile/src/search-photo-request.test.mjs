import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = stripTypeScriptTypes(readFileSync(new URL("./api.ts", import.meta.url), "utf8"))
  .replace(/^import [\s\S]*?;\n/gm, "")
  .replaceAll("export ", "");
test("search thumbnails bypass the API queue and fetch the supplied CDN source without profile reads", async () => {
  const client = {};
  const calls = [];
  runInNewContext(`${source}\nclient.photo=useSearchPhoto;nextRequestAt=Date.now()+60000;`, {
    client,
    broker: "https://login.example",
    demo: false,
    URLSearchParams,
    useSession: () => ({ token: { accessToken: "local-key" } }),
    useQuery: (options) => options,
    isAvatarUri: (uri) => typeof uri === "string" && uri.startsWith("data:image/"),
    loadCachedImage: async ({ source, directoryName, download }) => {
      assert.equal(directoryName, "search-photos-v1");
      assert.match(source, /cdn.intra.42.fr/);
      return download();
    },
    setTimeout() {
      throw Error("Photo entered the API queue");
    },
    fetch: async (url, options) => {
      calls.push(url);
      assert.equal(options.headers.Authorization, "Bearer local-key");
      return Response.json({
        source: new URL(url).searchParams.get("source"),
        uri: "data:image/jpeg;base64,AQID",
      });
    },
  });
  await Promise.all(
    Array.from({ length: 10 }, (_, id) =>
      client
        .photo(`https://cdn.intra.42.fr/users/hash/small_user-${id}.jpg`)
        .queryFn({ signal: new AbortController().signal }),
    ),
  );
  assert.equal(calls.length, 10);
  assert.ok(calls.every((url) => new URL(url).pathname === "/search-photo"));
});
