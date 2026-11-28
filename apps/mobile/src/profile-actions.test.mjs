import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

const routeSource = stripTypeScriptTypes(
  readFileSync(new URL("./useProfileRoute.ts", import.meta.url), "utf8"),
)
  .replace(/^import .*;\n/gm, "")
  .replaceAll("export ", "");
test("project action routes preserve the viewed user and reject invalid explicit IDs", () => {
  for (const [id, expected] of [
    [undefined, "/me"],
    ["146577", "/users/146577"],
    ["0", undefined],
    ["../me", undefined],
    ["NaN", undefined],
  ]) {
    const paths = [];
    const context = {
      useLocalSearchParams: () => ({ userId: id }),
      useIntraQuery: (path) => {
        paths.push(path);
        return { isPending: true, error: null };
      },
    };
    runInNewContext(`${routeSource}\nuseProfileRoute();`, context);
    assert.deepEqual(paths, [expected]);
  }
});

const apiSource = stripTypeScriptTypes(readFileSync(new URL("./api.ts", import.meta.url), "utf8"))
  .replace(/^import [\s\S]*?;\n/gm, "")
  .replaceAll("export ", "");
test("feedback requests and caches are scoped to the viewed user", async () => {
  const hooks = {};
  const paths = [];
  runInNewContext(
    `${apiSource}\nhooks.feedback=useFeedbackLogs;api=async (_token,path)=>{paths.push(path);return [];};`,
    {
      hooks,
      paths,
      URLSearchParams,
      demo: false,
      useSession: () => ({ token: { accessToken: "local" } }),
      useInfiniteQuery: (options) => options,
    },
  );
  const first = hooks.feedback(42);
  const second = hooks.feedback(146577);
  assert.notDeepEqual(first.queryKey, second.queryKey);
  assert.equal(hooks.feedback(undefined).enabled, false);
  await second.queryFn({ pageParam: 1, signal: new AbortController().signal });
  assert.match(paths[0], /^\/users\/146577\/scale_teams\/as_corrector\?/);
  assert.ok(paths[0].includes("page%5Bnumber%5D=1"));
});

test("query retries are opt-in and two retries make three total marks attempts", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  const hooks = {};
  runInNewContext(`${apiSource}\nhooks.query=useIntraQuery;`, {
    hooks,
    demo: false,
    useSession: () => ({ token: { accessToken: "local" } }),
    useQuery: (options) => options,
  });
  assert.equal(hooks.query("/me").retry, false);
  const options = hooks.query("/users/108838/marks?cursus_id=21", { retry: 2 });
  const client = new QueryClient();
  let attempts = 0;
  await assert.rejects(
    client.fetchQuery({
      ...options,
      retryDelay: 0,
      queryFn: async () => {
        attempts++;
        throw new Error("Marks unavailable");
      },
    }),
    /Marks unavailable/,
  );
  assert.equal(attempts, 3);
  client.clear();
});

test("title saves cancel stale profile reads and restore selection when membership data was absent", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  const client = new QueryClient();
  const hooks = {};
  runInNewContext(`${apiSource}\nhooks.title=useSelectTitle;api=async()=>({titleId:55});`, {
    hooks,
    URLSearchParams,
    demo: false,
    useSession: () => ({ token: { accessToken: "local" } }),
    useQueryClient: () => client,
    useMutation: (options) => options,
  });
  const profile = { id: 42, titles: [{ id: 55, name: "Mastermind %login" }] };
  client.setQueryData(["42", "/me"], profile);
  client.setQueryData(["42", "/users/42"], profile);
  client.setQueryData(["42", "/users/99"], { id: 99 });
  const mutation = hooks.title(42);
  const previous = await mutation.onMutate(55);
  assert.equal(client.getQueryData(["42", "/me"]).titles_users[0].selected, true);
  const saved = await mutation.mutationFn(55);
  let finishOldRead;
  const oldRead = client
    .fetchQuery({
      queryKey: ["42", "/me"],
      queryFn: () =>
        new Promise((resolve) => {
          finishOldRead = resolve;
        }),
    })
    .catch(() => {});
  await mutation.onSuccess(saved);
  finishOldRead(profile);
  await oldRead;
  for (const path of ["/me", "/users/42"]) {
    assert.deepEqual(JSON.parse(JSON.stringify(client.getQueryData(["42", path]).titles_users)), [
      { title_id: 55, selected: true },
    ]);
  }
  assert.deepEqual(client.getQueryData(["42", "/users/99"]), { id: 99 });
  // Restore only the title, retaining other profile changes received during the save.
  client.setQueryData(["42", "/me"], (current) => ({ ...current, wallet: 700 }));
  await mutation.onError(new Error("Save failed"), 55, previous);
  assert.equal(client.getQueryData(["42", "/me"]).titles_users, undefined);
  assert.equal(client.getQueryData(["42", "/me"]).wallet, 700);
  assert.equal(client.getQueryData(["42", "/users/42"]).titles_users, undefined);
  client.setQueryData(["42", "/me"], (current) => ({
    ...current,
    titles_users: [{ title_id: 55, selected: true }],
  }));
  const cleared = await mutation.onMutate(0);
  assert.equal(client.getQueryData(["42", "/me"]).titles_users[0].selected, false);
  await mutation.onError(new Error("Save failed"), 0, cleared);
  assert.equal(client.getQueryData(["42", "/me"]).titles_users[0].selected, true);
  client.clear();
});
