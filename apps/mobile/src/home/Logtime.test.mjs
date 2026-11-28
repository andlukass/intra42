import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(readFileSync(new URL("./Logtime.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
function fixture() {
  const exports = {},
    states = [],
    refs = [],
    offsets = [];
  let stateIndex = 0,
    refIndex = 0;
  const jsx = (type, props) => ({ type, props });
  runInNewContext(source, {
    exports,
    require(name) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "react")
        return {
          useState(initial) {
            const i = stateIndex++;
            if (!(i in states)) states[i] = initial;
            return [
              states[i],
              (value) => {
                states[i] = typeof value === "function" ? value(states[i]) : value;
              },
            ];
          },
          useRef(initial) {
            const i = refIndex++;
            refs[i] ??= { current: initial };
            return refs[i];
          },
          useMemo: (fn) => fn(),
        };
      if (name === "react-native")
        return {
          View: "View",
          ScrollView: "ScrollView",
          Pressable: "Pressable",
          Text: "Text",
          StyleSheet: { create: (s) => s },
        };
      if (name === "../theme") return { theme: {} };
      if (name === "./logtime-data")
        return { logtimeByDay: () => ({}), dayKey: (date) => date.toISOString().slice(0, 10) };
      if (name === "./CalendarTooltip") return { CalendarTooltip: "Tooltip" };
      return {};
    },
  });
  function render() {
    stateIndex = 0;
    refIndex = 0;
    const tree = exports.Logtime({ locations: [], now: new Date(2026, 10, 27).getTime() });
    return tree.props.children[0];
  }
  function layout(width) {
    render().props.onLayout({ nativeEvent: { layout: { width } } });
    const frame = render();
    refs[0].current = { scrollTo: (value) => offsets.push(value) };
    return frame.props.children[1];
  }
  return { render, layout, offsets, states };
}
test("initial positioning waits for all four months and restores the selected month after resizing", () => {
  const f = fixture();
  const scroll = f.layout(340);
  assert.equal(scroll.props.pagingEnabled, true);
  assert.equal(scroll.props.contentInsetAdjustmentBehavior, "never");
  scroll.props.onContentSizeChange(340);
  assert.equal(f.offsets.length, 0);
  scroll.props.onContentSizeChange(1360);
  assert.equal(f.offsets.at(-1).x, 1020);
  scroll.props.onContentSizeChange(1360);
  assert.equal(f.offsets.length, 1);
  const resized = f.layout(390);
  resized.props.onContentSizeChange(1560);
  assert.equal(f.offsets.at(-1).x, 1170);
});
test("settling snaps exactly to one month instead of leaving a column of the adjacent month visible", () => {
  const f = fixture();
  const scroll = f.layout(340);
  assert.equal(scroll.props.onScroll, undefined);
  scroll.props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x: 975 } } });
  assert.equal(f.states[0], 3);
  assert.equal(f.offsets.at(-1).x, 1020);
  assert.equal(f.offsets.at(-1).animated, false);
  scroll.props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x: 650 } } });
  assert.equal(f.states[0], 2);
  assert.equal(f.offsets.at(-1).x, 680);
});
