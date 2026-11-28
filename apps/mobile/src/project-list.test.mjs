import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(new URL("../app/project-list.tsx", import.meta.url), "utf8"),
  {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  },
).outputText;
function textOf(node) {
  if (node == null || node === false) return "";
  if (typeof node !== "object") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (typeof node.type === "function") return textOf(node.type(node.props));
  return textOf(node.props?.children);
}

test("project cards show all official fields including a failed zero mark and open the native project", () => {
  const exports = {};
  const pushed = [];
  const jsx = (type, props) => ({ type, props });
  runInNewContext(source, {
    exports,
    Intl,
    Map,
    require(name) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "react")
        return { useState: (value) => [value, () => {}], useRef: () => ({ current: null }) };
      if (name === "react-native")
        return {
          StyleSheet: { create: (x) => x },
          FlatList: "FlatList",
          View: "View",
          Text: "Text",
          Pressable: "Pressable",
          Keyboard: { dismiss() {} },
        };
      if (name === "expo-router")
        return { useRouter: () => ({ push: (route) => pushed.push(route) }) };
      if (name.endsWith("/session"))
        return { useSession: () => ({ token: { accessToken: "test" }, loading: false }) };
      if (name.endsWith("/api"))
        return {
          useProfile: () => ({ data: { cursus_users: [], projects_users: [] } }),
          useProjectList: () => ({ data: { pages: [{ items: [] }] } }),
        };
      if (name.endsWith("/theme")) return { theme: {} };
      if (name.endsWith("/ui")) return { styles: {}, useStackScrollInsets: () => ({}) };
      return {};
    },
  });
  const list = exports.default().props.children;
  assert.match(textOf(list.props.ListHeaderComponent), /SORT BY/);
  assert.match(textOf(list.props.ListHeaderComponent), /FILTERS/);
  assert.match(textOf(list.props.ListHeaderComponent), /Recommended projects/);
  const card = list.props.renderItem({
    item: {
      id: "rush",
      slug: "rush",
      name: "Rush 02",
      parent: "C Piscine",
      duration: "1 day",
      xp: 0,
      recommendation: "Forbidden",
      registration: "finished",
      result: "(failed with 0%)",
      resultSuccess: false,
    },
  });
  const text = textOf(card);
  for (const expected of [
    "C Piscine",
    "Rush 02",
    "failed with 0%",
    "1 day",
    "0 XP",
    "Forbidden",
    "finished",
  ])
    assert.ok(text.includes(expected), expected);
  card.props.onPress();
  assert.equal(pushed[0].pathname, "/project/[slug]");
  assert.equal(pushed[0].params.slug, "rush");
});
