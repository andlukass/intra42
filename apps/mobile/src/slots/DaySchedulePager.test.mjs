import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as calendarTime from "./calendarTime.ts";

const source = ts.transpileModule(
  readFileSync(new URL("./DaySchedulePager.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;

test("day paging commits after sliding, rebases across weeks and locks during time selection", () => {
  const exports = {};
  const references = [];
  const state = [300, false];
  const effects = [];
  let refIndex = 0;
  let stateIndex = 0;
  const offsets = [];
  const locks = [];
  const jsx = (type, props) => ({ type, props });
  runInNewContext(source, {
    exports,
    require(name) {
      if (name === "./calendarTime") return calendarTime;
      if (name === "react")
        return {
          useRef: (current) => {
            const index = refIndex++;
            if (!references[index]) references[index] = { current };
            return references[index];
          },
          useState: () => {
            const index = stateIndex++;
            return [
              state[index],
              (value) => {
                state[index] = value;
              },
            ];
          },
          useLayoutEffect: (effect) => effects.push(effect),
        };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "react-native") return { ScrollView: "ScrollView", View: "View" };
      if (name === "../api") return {};
      if (name === "../ui") return {};
      if (name === "./slotWeek") return { slotWeekPath: () => "week" };
      if (name === "./DaySchedule")
        return { DaySchedule: "DaySchedule", DayScheduleSkeleton: "Skeleton" };
      throw new Error(name);
    },
  });
  function render(day) {
    refIndex = 0;
    stateIndex = 0;
    return exports.DaySchedulePager({
      day,
      slots: [],
      onChangeDay: (offset) => offsets.push(offset),
      onSelect() {},
      onDragSelect() {},
      onInvalidTime() {},
      onSelectionChange: (active) => locks.push(active),
    }).props.children;
  }
  const day = new Date(2026, 10, 29);
  let pager = render(day);
  assert.equal(pager.props.pagingEnabled, true);
  assert.equal(pager.props.children[2].props.children.props.day.getDate(), 30);
  const settle = (page) =>
    pager.props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x: page * 300 } } });
  assert.deepEqual(offsets, []);
  settle(1);
  assert.deepEqual(offsets, []);
  settle(2);
  settle(2);
  assert.deepEqual(offsets, [1]);
  const scrolls = [];
  references[0].current = { scrollTo: (options) => scrolls.push(options.x) };
  for (const effect of effects.splice(0)) effect();
  pager = render(new Date(2026, 10, 30));
  assert.equal(pager.props.children[2].props.children.props.day.getMonth(), 11);
  for (const effect of effects.splice(0)) effect();
  assert.equal(scrolls.at(-1), 300);
  settle(0);
  assert.deepEqual(offsets, [1, -1]);
  pager.props.children[1].props.children.props.onSelectionChange(true);
  pager = render(day);
  assert.equal(pager.props.scrollEnabled, false);
  assert.equal(locks.at(-1), true);
  pager.props.children[1].props.children.props.onSelectionChange(false);
  assert.equal(locks.at(-1), false);
});
