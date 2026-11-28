import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(new URL("./ProjectTeams.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;
function render(canFinish, suppliedTeams) {
  const state = [];
  let cursor = 0;
  const out = {};
  const alerts = [];
  const requests = [];
  const jsx = (type, props) => ({ type, props });
  runInNewContext(`${source}\nout.render=ProjectTeams;`, {
    out,
    exports: {},
    require(name) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (name === "react")
        return {
          useRef: () => ({ current: false }),
          useState: (initial) => {
            const index = cursor++;
            if (!(index in state))
              state[index] = typeof initial === "function" ? initial() : initial;
            return [
              state[index],
              (value) => {
                state[index] = typeof value === "function" ? value(state[index]) : value;
              },
            ];
          },
        };
      if (name === "@tanstack/react-query")
        return { useQueryClient: () => ({ invalidateQueries: async () => {} }) };
      if (name === "expo-router") return { useRouter: () => ({}) };
      if (name === "react-native")
        return {
          View: "View",
          Text: "Text",
          Pressable: "Pressable",
          StyleSheet: { create: (x) => x },
          Alert: { alert: (...args) => alerts.push(args) },
        };
      if (name === "../session") return { useSession: () => ({ token: { accessToken: "test" } }) };
      if (name === "../api") return { api: async (...args) => requests.push(args) };
      return { styles: {}, theme: {} };
    },
  });
  const result = { alerts, requests };
  function rerender() {
    cursor = 0;
    const tree = out.render({
      projectSlug: "test",
      teams: suppliedTeams ?? [
        { id: "team-123", name: "My team", canFinish, progress: [], evaluations: [] },
      ],
    });
    const buttons = [],
      headers = [],
      texts = [];
    function walk(node) {
      if (!node) return;
      if (typeof node === "string") {
        texts.push(node);
        return;
      }
      if (Array.isArray(node)) return node.forEach(walk);
      if (typeof node.type === "function" && !node.props.expanded) return;
      if (node.type === "Pressable") {
        if (typeof node.props.accessibilityState?.expanded === "boolean") headers.push(node);
        else buttons.push(node);
      }
      walk(node.props?.children);
    }
    walk(tree);
    Object.assign(result, { buttons, headers, texts });
  }
  result.rerender = rerender;
  rerender();
  return result;
}
test("finish control follows eligibility and asks for confirmation before any request", () => {
  assert.equal(render(false).buttons.length, 0);
  const result = render(true);
  assert.equal(result.buttons.length, 1);
  assert.equal(result.buttons[0].props.style[0].backgroundColor, "#57B45C");
  result.buttons[0].props.onPress();
  assert.equal(result.requests.length, 0);
  assert.equal(result.alerts[0][0], "Finish project?");
  assert.equal(result.alerts[0][2][0].style, "cancel");
});

test("only the latest attempt starts expanded and opening another collapses it", () => {
  const result = render(false, [
    { id: "team-3", name: "Group 3", repository: "latest-repo", progress: [], evaluations: [] },
    { id: "team-2", name: "Group 2", repository: "previous-repo", progress: [], evaluations: [] },
  ]);
  assert.deepEqual(
    result.headers.map((h) => h.props.accessibilityState.expanded),
    [true, false],
  );
  assert.ok(result.texts.includes("latest-repo"));
  assert.ok(!result.texts.includes("previous-repo"));
  result.headers[1].props.onPress();
  result.rerender();
  assert.deepEqual(
    result.headers.map((h) => h.props.accessibilityState.expanded),
    [false, true],
  );
  assert.ok(!result.texts.includes("latest-repo"));
  assert.ok(result.texts.includes("previous-repo"));
  result.headers[1].props.onPress();
  result.rerender();
  assert.deepEqual(
    result.headers.map((h) => h.props.accessibilityState.expanded),
    [false, false],
  );
});
