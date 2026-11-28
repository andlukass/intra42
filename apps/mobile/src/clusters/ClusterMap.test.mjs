import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(new URL("./ClusterMap.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;
function render(os) {
  const exports = {};
  const jsx = (type, props) => ({ type, props });
  runInNewContext(source, {
    exports,
    require(name) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "react")
        return {
          useState: () => [undefined, () => {}],
          useMemo: (factory) => factory(),
          memo: (component) => component,
        };
      if (name === "@tanstack/react-query")
        return { useQuery: () => ({ data: { box: [0, 0, 640, 800], seats: [], xml: "<svg/>" } }) };
      if (name === "react-native")
        return {
          Platform: { OS: os },
          ScrollView: "ScrollView",
          View: "View",
          Text: "Text",
          StyleSheet: { create: (styles) => styles },
        };
      if (name === "react-native-safe-area-context")
        return { useSafeAreaInsets: () => ({ bottom: 34 }) };
      if (name === "react-native-svg") return { SvgAst: "SvgAst" };
      if (name === "./artwork") return { clusterArtworkOptions: () => ({}) };
      if (name === "../theme") return { theme: {} };
      if (name === "./maps")
        return {
          mapViewport: (box) => box,
          mapInitialOffset: () => ({ x: 0, y: 0 }),
          hideOccupiedPlaceholders: (xml) => xml,
        };
      return {};
    },
  });
  const tree = exports.ClusterMap({
    cluster: { image: "https://cdn.intra.42.fr/cluster/image/map.svg" },
    occupancy: [],
    photoAttempt: 0,
  });
  return tree.props.children.find((node) => node?.type === "ScrollView");
}
test("iOS exposes the complete two-dimensional canvas to its single native zoomable scroll view", () => {
  const scroll = render("ios");
  const canvas = scroll.props.children;
  assert.equal(canvas.type, "View");
  assert.equal(scroll.props.contentContainerStyle.width, 1200);
  assert.equal(scroll.props.contentContainerStyle.height, 1500);
  assert.equal(scroll.props.contentContainerStyle.width, canvas.props.style.width);
  assert.equal(scroll.props.contentContainerStyle.height, canvas.props.style.height);
  assert.equal(scroll.props.directionalLockEnabled, false);
  assert.equal(scroll.props.pinchGestureEnabled, true);
  assert.equal(scroll.props.minimumZoomScale, 0.28);
  assert.equal(scroll.props.maximumZoomScale, 3);
  assert.equal(scroll.props.contentInset.bottom, 90);
});
test("Android retains its nested horizontal scroller", () => {
  const scroll = render("android");
  assert.equal(scroll.props.contentContainerStyle, undefined);
  assert.equal(scroll.props.children.type, "ScrollView");
  assert.equal(scroll.props.children.props.horizontal, true);
});
