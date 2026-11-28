import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const code = ts.transpileModule(
  readFileSync(new URL("./ProjectCharts.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;
function render(statistics) {
  const exports = {};
  const jsx = (type, props) => ({ type, props });
  runInNewContext(code, {
    exports,
    require(name) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (name === "react") return { useState: (value) => [value, () => {}] };
      if (name === "react-native")
        return {
          View: "View",
          Text: "Text",
          Pressable: "Pressable",
          StyleSheet: { create: (s) => s },
        };
      if (name === "react-native-svg")
        return {
          default: "Svg",
          Circle: "Circle",
          G: "G",
          Line: "Line",
          Path: "Path",
          Rect: "Rect",
          Text: "SvgText",
        };
      if (name === "../theme")
        return { theme: { border: "#ddd", ink: "#111", muted: "#666", teal: "#00babc" } };
      if (name === "../ui") return { styles: { card: {} } };
      return { ProfileSelector: "ProfileSelector" };
    },
  });
  const nodes = [];
  function walk(node) {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== "object") return;
    if (typeof node.type === "function") {
      walk(node.type(node.props));
      return;
    }
    nodes.push(node);
    walk(node.props?.children);
  }
  walk(exports.ProjectCharts({ statistics }));
  return nodes;
}
test("official project statistics render all four charts with finite native SVG geometry", () => {
  const nodes = render({
    success: { none: 198, true: 45, false: 22 },
    average_team_lifespan: { none: 1, true: 49, false: 111 },
    final_mark_by_campus: [
      {
        name: "Paris",
        data: [
          [0, 50],
          [100, 50],
        ],
      },
    ],
    flags: [
      { name: "Ok", y: 99 },
      { name: "Crash", y: 1 },
    ],
  });
  const headings = nodes
    .filter((node) => node.props?.accessibilityRole === "header")
    .map((node) => node.props.children);
  assert.deepEqual(headings, [
    "Success rate",
    "Average team lifespan",
    "Marks by campus",
    "Evaluation flags",
  ]);
  const serialized = JSON.stringify(nodes);
  assert.ok(serialized.includes("17.0"));
  assert.ok(serialized.includes("74.7"));
  assert.ok(!serialized.includes("NaN"));
  assert.ok(!serialized.includes("Infinity"));
  const selector = nodes.find((node) => node.type === "ProfileSelector");
  assert.equal(selector.props.options[1].label, "Paris");
});
test("charts without data stay hidden using the official visibility rules", () => {
  const nodes = render({
    success: { none: 2, true: 0, false: 0 },
    average_team_lifespan: { none: 0, true: 0, false: 0 },
    final_mark_by_campus: [{ name: "Lisboa", data: [] }],
    flags: [{ name: "Ok", y: 1 }],
  });
  assert.equal(nodes.filter((node) => node.props?.accessibilityRole === "header").length, 0);
});
