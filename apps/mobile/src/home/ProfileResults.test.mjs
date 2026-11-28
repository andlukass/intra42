import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(new URL("./ProfileResults.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;
function render({ marks, pending = false, error = null }) {
  const exports = {};
  const requests = [];
  const jsx = (type, props) => ({ type, props });
  runInNewContext(source, {
    exports,
    require(name) {
      if (name === "react") return { useState: () => ["Marks", () => {}] };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "expo-router") return { useRouter: () => ({ push() {} }) };
      if (name === "react-native")
        return {
          View: "View",
          Text: "Text",
          Pressable: "Pressable",
          StyleSheet: { create: (value) => value },
        };
      if (name === "../api")
        return {
          useIntraQuery: (...args) => {
            requests.push(args);
            return marks;
          },
        };
      if (name === "../theme") return { theme: {} };
      if (name === "../ui")
        return {
          styles: {},
          Button: "Button",
          QueryMessage: "QueryMessage",
          SkeletonList: "SkeletonList",
        };
      return {};
    },
  });
  const tree = exports.ProfileResults({
    userId: 108838,
    cursusId: 21,
    achievements: [],
    pending,
    error,
  });
  const nodes = [];
  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    nodes.push(node);
    walk(node.props?.children);
  }
  walk(tree);
  return {
    nodes,
    requests,
    tabs: nodes
      .filter((node) => node.props?.accessibilityRole === "tab")
      .map((node) => node.props.children.props.children),
  };
}

test("failed marks fall back to achievements only after retries finish and achievements succeed", () => {
  const marks = { isError: true, isFetching: false, error: new Error("Not found") };
  const result = render({ marks });
  assert.deepEqual(result.tabs, ["Achievements"]);
  assert.equal(
    result.nodes.some((node) => node.props?.children === "See all marks"),
    false,
  );
  assert.equal(
    result.nodes.some((node) => node.props?.children === "See all achievements"),
    true,
  );
  assert.equal(result.requests[0][0], "/users/108838/marks?cursus_id=21");
  assert.equal(result.requests[0][1].retry, 2);
  for (const scenario of [
    { marks: { ...marks, isFetching: true } },
    { marks, pending: true },
    { marks, error: new Error("Achievements failed") },
    { marks: { ...marks, data: [] } },
    { marks: { ...marks, isError: false, isPending: true } },
  ])
    assert.deepEqual(render(scenario).tabs, ["Marks", "Achievements"]);
});
