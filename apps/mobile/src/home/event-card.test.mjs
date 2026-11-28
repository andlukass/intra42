import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { eventDuration } from "../events.ts";

const source = ts.transpileModule(
  readFileSync(new URL("./EventCard.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;
test("event cards match the official exam hierarchy, colors, summary and attendance metadata", () => {
  const exports = {};
  const jsx = (type, props) => ({ type, props });
  runInNewContext(source, {
    exports,
    require(name) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "react") return { useState: () => [false, () => {}] };
      if (name === "react-native")
        return {
          StyleSheet: { create: (s) => s },
          Text: "Text",
          View: "View",
          Pressable: "Pressable",
        };
      if (name === "../events") return { eventDuration };
      if (name === "../theme") return { theme: { teal: "#00babc" } };
      return { Detail: "Detail" };
    },
  });
  const begin = Date.now() + 5 * 86_400_000;
  const tree = exports.EventCard({
    event: {
      id: 1,
      kind: "exam",
      name: "Student Exam",
      description: "This session concerns only the following exams: Exam Rank 02",
      begin_at: new Date(begin).toISOString(),
      end_at: new Date(begin + 10_800_000).toISOString(),
      location: "Cluster 2",
      nbr_subscribers: 7,
      max_subscribers: 40,
    },
  });
  const nodes = [];
  function walk(node) {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") {
      nodes.push(node);
      return;
    }
    nodes.push(node);
    walk(node.props.children);
  }
  walk(tree);
  for (const text of ["Exam", "Student Exam", "For: Exam Rank 02"]) assert.ok(nodes.includes(text));
  const metadata = nodes.filter((node) => node?.type === "Detail");
  assert.deepEqual(
    metadata.map((node) => node.props.value),
    ["3h", "in 5 days", "Cluster 2", "7/40"],
  );
  assert.ok(metadata.every((node) => node.props.color === "#ed8179"));
  assert.equal(exports.eventColor("meet_up"), "#00babc");
  assert.equal(exports.eventColor("partnership"), "#ed8179");
  assert.equal(exports.eventColor("other"), "#c0c0c0");
});
