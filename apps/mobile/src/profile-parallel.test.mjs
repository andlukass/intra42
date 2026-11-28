import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const apiSource = stripTypeScriptTypes(readFileSync(new URL("./api.ts", import.meta.url), "utf8"))
  .replace(/^import [\s\S]*?;\n/gm, "")
  .replaceAll("export ", "");
test("portal profile services start together even when the public API queue is busy", async () => {
  const client = {};
  const calls = [];
  runInNewContext(`${apiSource}\nclient.api=api;nextRequestAt=Date.now()+60000;`, {
    client,
    broker: "http://localhost:3000",
    demo: false,
    URLSearchParams,
    setTimeout() {
      throw Error("Profile service waited behind another service");
    },
    fetch: async (url) => {
      calls.push(url);
      return Response.json(null);
    },
  });
  await Promise.all(
    ["alumnization", "pace", "attendance"].map((resource) =>
      client.api("local", `/users/42/${resource}`),
    ),
  );
  assert.equal(calls.length, 3);
});
test("a portal service's Retry-After does not pause the public API", async () => {
  const client = {};
  let clock = Date.now();
  class Clock extends Date {
    static now() {
      return clock;
    }
  }
  let attempts = 0;
  runInNewContext(`${apiSource}\nclient.api=api;client.deadline=()=>nextRequestAt;`, {
    client,
    broker: "http://localhost:3000",
    demo: false,
    URLSearchParams,
    Date: Clock,
    setTimeout(callback, ms) {
      clock += ms;
      callback();
    },
    fetch: async () =>
      ++attempts === 1
        ? new Response(null, { status: 429, headers: { "Retry-After": "3" } })
        : Response.json(null),
  });
  await client.api("local", "/users/42/alumnization");
  assert.equal(attempts, 2);
  assert.equal(client.deadline(), 0);
});

const screenSource = ts.transpileModule(
  readFileSync(new URL("./home/ProfileScreen.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;
function renderProfile(pending, { ownHome = false, mutation, notify = () => {} } = {}) {
  const queries = [];
  const exported = {};
  const user = {
    id: 42,
    login: "peer",
    cursus_users: [{ level: 1, cursus: { id: 21, slug: "42cursus" } }],
  };
  const result = { isPending: false, isError: false, error: null };
  const jsx = (type, props) => ({ type, props });
  runInNewContext(`${screenSource}\nexported.render=ProfileScreen;`, {
    exports: {},
    exported,
    require(name) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "react") return { useState: (value) => [value, () => {}] };
      if (name === "react-native") return { StyleSheet: { create: (value) => value } };
      if (name === "@tanstack/react-query") return { useQueryClient: () => ({}) };
      if (name === "expo-router") return { useRouter: () => ({}) };
      if (name.endsWith("/session")) return { useSession: () => ({ token: {}, loading: false }) };
      if (name.endsWith("/theme")) return { theme: { spacing: 12 } };
      if (name.endsWith("/ui"))
        return new Proxy(
          { styles: {}, useToast: () => ({ toast: null, showToast: notify, hideToast() {} }) },
          { get: (target, key) => target[key] ?? String(key) },
        );
      if (name.endsWith("/coalition"))
        return { defaultProfileCourse: (courses) => courses[0], profilePalette: () => ({}) };
      if (name.endsWith("/earned")) return { earnedAchievements: () => [] };
      if (name.endsWith("/useDecodedAvatar"))
        return { useDecodedAvatar: () => ({ loading: false }) };
      if (name.endsWith("/api"))
        return {
          useProfile: () => ({ ...result, data: user }),
          useAchievementAwards: () => result,
          useAgenda: () => result,
          useLogtime: () => result,
          useSelectTitle: () => mutation ?? result,
          useProfileCoalitions: () => ({ loading: false, byCourse: new Map() }),
          useIntraQuery: (path) => {
            queries.push(path);
            return { ...result, isPending: pending.includes(path?.split("/").at(-1)), data: null };
          },
        };
      return new Proxy({ styles: {} }, { get: (target, key) => target[key] ?? String(key) });
    },
  });
  return { tree: exported.render(ownHome ? {} : { userId: 42 }), queries };
}
function includesType(tree, type) {
  return Array.isArray(tree)
    ? tree.some((node) => includesType(node, type))
    : !!tree &&
        typeof tree === "object" &&
        (tree.type === type || includesType(tree.props?.children, type));
}
test("all profile services start before the content gate and the card waits for the slowest", () => {
  for (const pending of [
    ["alumnization"],
    ["pace"],
    ["attendance"],
    ["alumnization", "pace", "attendance"],
  ]) {
    const { tree, queries } = renderProfile(pending);
    for (const resource of ["alumnization", "pace", "attendance"])
      assert.ok(queries.includes(`/users/42/${resource}`));
    assert.equal(includesType(tree, "ProfileCard"), false);
    assert.equal(includesType(tree, "ProfileCardSkeleton"), true);
  }
  const { tree } = renderProfile([]);
  assert.equal(includesType(tree, "ProfileCard"), true);
  assert.equal(includesType(tree, "ProfileCardSkeleton"), false);
});

test("title selection uses the shared toast only after saving succeeds or fails", () => {
  let callbacks;
  const messages = [];
  const { tree } = renderProfile([], {
    ownHome: true,
    notify: (...args) => messages.push(args),
    mutation: {
      mutate(id, options) {
        assert.equal(id, 55);
        callbacks = options;
      },
    },
  });
  const card = tree.props.children.find((node) => node?.type === "ProfileCard");
  card.props.onTitleChange(55);
  assert.equal(messages.length, 0);
  callbacks.onSuccess();
  assert.deepEqual(messages, [["Title updated."]]);
  callbacks.onError(new Error("42 could not save the title."));
  assert.deepEqual(messages.at(-1), ["42 could not save the title.", true]);
});
