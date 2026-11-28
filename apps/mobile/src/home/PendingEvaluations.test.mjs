import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(new URL("./PendingEvaluations.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;
function render(query) {
  const exports = {};
  const jsx = (type, props) => ({ type, props });
  const paths = [];
  const destinations = [];
  runInNewContext(source, {
    exports,
    require(name) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "react-native")
        return {
          View: "View",
          Text: "Text",
          Pressable: "Pressable",
          StyleSheet: { create: (s) => s },
        };
      if (name === "expo-router")
        return { useRouter: () => ({ push: (href) => destinations.push(href) }) };
      if (name === "../theme") return { theme: {} };
      if (name === "../api")
        return {
          useIntraQuery: (path) => {
            paths.push(path);
            return query;
          },
        };
      if (name === "../slots/PendingEvaluationRow") return { PendingEvaluationRow: "Row" };
      if (name === "../ui")
        return {
          Card: "Card",
          QueryMessage: "QueryMessage",
          SkeletonBlock: "SkeletonBlock",
          styles: {},
        };
      throw Error(name);
    },
  });
  const tree = exports.PendingEvaluations();
  return { tree, content: tree.props.children[1], paths, destinations };
}
test("Home's pending card keeps the official row data and account-only feed", () => {
  const row = { id: 42, kind: "evaluator", user: "peer", project_name: "ft_printf" };
  const view = render({ data: [row], isSuccess: true });
  assert.deepEqual(view.paths, ["/me/evaluations"]);
  assert.equal(view.content.length, 1);
  assert.equal(view.content[0].props.evaluation, row);
});
test("loading and failed requests use the existing skeleton and error message", () => {
  for (const query of [{ isPending: true }, { isPending: false, error: new Error("Offline") }]) {
    const view = render(query);
    assert.equal(view.content.type, "QueryMessage");
    assert.equal(view.content.props.error, query.error);
    assert.equal(view.content.props.skeleton.props.height, 18);
  }
});
test("a successful empty response shows no pending evaluations", () => {
  const view = render({ data: [], isSuccess: true });
  assert.equal(view.content.type, "QueryMessage");
  assert.equal(view.content.props.empty, "No pending evaluations.");
});

test("Feedback logs and Manage slots open the native routes without a Hide action", () => {
  const view = render({ data: [], isSuccess: true });
  const buttons = view.tree.props.children[0].props.children;
  assert.deepEqual(
    Array.from(buttons, (button) => button.props.children.props.children),
    ["Feedback logs", "Manage slots"],
  );
  for (const button of buttons) button.props.onPress();
  assert.deepEqual(view.destinations, ["/feedbacks", "/slots"]);
});
