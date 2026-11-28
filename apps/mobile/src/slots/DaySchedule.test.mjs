import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as calendarTime from "./calendarTime.ts";

const source = ts.transpileModule(
  readFileSync(new URL("./DaySchedule.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;
function timeline(tree) {
  const children = Array.isArray(tree.props.children) ? tree.props.children : [tree.props.children];
  return children.find((node) => node?.type === "ScrollView").props.children;
}
function fixture(slots = []) {
  const refs = [];
  const state = [];
  const selected = [];
  const tapped = [];
  const canceled = [];
  const locks = [];
  const exports = {};
  let cursor = 0;
  let handlers;
  const jsx = (type, props) => ({ type, props });
  runInNewContext(source, {
    exports,
    Date,
    Intl,
    require(name) {
      if (name === "./calendarTime") return calendarTime;
      if (name === "react")
        return {
          useRef: (current) => {
            const i = cursor++;
            if (!refs[i]) refs[i] = { current };
            return refs[i];
          },
          useState: (initial) => {
            const i = cursor++;
            if (state[i] === undefined) state[i] = initial;
            return [
              state[i],
              (value) => {
                state[i] = value;
              },
            ];
          },
        };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "react-native")
        return {
          View: "View",
          Text: "Text",
          ScrollView: "ScrollView",
          Pressable: "Pressable",
          StyleSheet: { create: (styles) => styles },
          PanResponder: {
            create: (callbacks) => {
              handlers = callbacks;
              return { panHandlers: {} };
            },
          },
        };
      return {};
    },
  });
  const day = new Date(2030, 0, 1);
  function render() {
    cursor = 0;
    return exports.DaySchedule({
      day,
      slots,
      onSelect: (...range) => tapped.push(range),
      onCancel: (slot) => canceled.push(slot),
      onDragSelect: (...range) => selected.push(range),
      onInvalidTime: () => assert.fail("Future time"),
      onSelectionChange: (locked) => locks.push(locked),
    });
  }
  function start(index) {
    const tree = render();
    const row = timeline(tree).props.children[0][index];
    row.props.children.props.onTouchStart({ nativeEvent: { pageY: 100, locationY: 0 } });
    row.props.children.props.onLongPress();
    render();
    return handlers;
  }
  return {
    day,
    render,
    start,
    selected,
    tapped,
    locks,
    refs,
    canceled,
    blocks: exports.openSlotBlocks,
  };
}

test("drag highlights the range and labels both endpoints before confirming on release", () => {
  const f = fixture();
  const pan = f.start(18);
  assert.equal(pan.onMoveShouldSetPanResponderCapture(), true);
  assert.equal(pan.onPanResponderTerminationRequest(), false);
  pan.onPanResponderGrant({ nativeEvent: { pageY: 100 } });
  pan.onPanResponderMove({ nativeEvent: { pageY: 175 } });
  const tree = f.render();
  const range = timeline(tree).props.children[1];
  assert.equal(range.props.style[1].top, 18 * 30);
  assert.equal(range.props.style[1].height, 90);
  assert.match(range.props.children.props.children, /9:00.*10:30/);
  assert.equal(f.selected.length, 0);
  pan.onPanResponderRelease();
  assert.equal(f.selected.length, 1);
  assert.equal(f.tapped.length, 0);
  assert.equal(f.selected[0][0].getHours(), 9);
  assert.equal(f.selected[0][1].getHours(), 10);
  assert.equal(f.selected[0][1].getMinutes(), 30);
  assert.equal(f.locks.at(-1), false);
  assert.equal(pan.onMoveShouldSetPanResponderCapture(), false);
  assert.equal(pan.onPanResponderTerminationRequest(), true);
});

test("drag stops before occupied times and cancellation clears without confirming", () => {
  const day = new Date(2030, 0, 1, 10);
  const f = fixture([
    { id: 1, begin_at: day.toISOString(), end_at: new Date(2030, 0, 1, 11).toISOString() },
  ]);
  const pan = f.start(18);
  pan.onPanResponderGrant({ nativeEvent: { pageY: 100 } });
  pan.onPanResponderMove({ nativeEvent: { pageY: 280 } });
  const tree = f.render();
  const range = timeline(tree).props.children[1];
  assert.equal(range.props.style[1].height, 60);
  assert.match(range.props.children.props.children, /9:00.*10:00/);
  pan.onPanResponderTerminate();
  assert.equal(f.selected.length, 0);
  assert.equal(f.locks.at(-1), false);
});

test("a simple tap still opens the form instead of saving the slot", () => {
  const f = fixture();
  const row = timeline(f.render()).props.children[0][18];
  row.props.children.props.onPress();
  assert.equal(f.tapped.length, 1);
  assert.equal(f.selected.length, 0);
});

test("initial scroll keeps an hour of unavailable times above the first free time", () => {
  const f = fixture([
    {
      id: 1,
      begin_at: new Date(2030, 0, 1, 0).toISOString(),
      end_at: new Date(2030, 0, 1, 9).toISOString(),
    },
  ]);
  const tree = f.render();
  const offsets = [];
  f.refs[0].current = { scrollTo: ({ y }) => offsets.push(y) };
  const scroll = tree.props.children;
  scroll.props.onContentSizeChange();
  scroll.props.onContentSizeChange();
  assert.deepEqual(offsets, [16 * 30]);
});

test("initial scroll stays at midnight when the day starts available", () => {
  const f = fixture();
  const tree = f.render();
  let offset;
  f.refs[0].current = {
    scrollTo: ({ y }) => {
      offset = y;
    },
  };
  tree.props.children.props.onContentSizeChange();
  assert.equal(offset, 0);
});

test("open slots are continuous blocks with exact quarter-hour placement and official labels", () => {
  const f = fixture();
  const blocks = f.blocks(
    [
      {
        id: 9,
        begin_at: new Date(2030, 0, 1, 6, 45).toISOString(),
        end_at: new Date(2030, 0, 1, 8, 45).toISOString(),
      },
    ],
    f.day,
  );
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].top, 405);
  assert.equal(blocks[0].height, 120);
  assert.equal(blocks[0].label, "6:45 - 8:45");
});
test("clips open slots at day boundaries and excludes booked or invalid intervals", () => {
  const f = fixture();
  const slot = {
    id: 1,
    begin_at: new Date(2029, 11, 31, 23).toISOString(),
    end_at: new Date(2030, 0, 1, 1).toISOString(),
  };
  assert.equal(f.blocks([slot], f.day)[0].top, 0);
  assert.equal(f.blocks([slot], f.day)[0].height, 60);
  for (const patch of [
    { scale_team_id: -1 },
    { scale_team_id: 42 },
    { begin_at: "invalid" },
    { end_at: slot.begin_at },
  ])
    assert.equal(f.blocks([{ ...slot, ...patch }], f.day).length, 0);
});

test("the cancel button targets the full original slot even when clipped to the day", () => {
  const slot = {
    id: 123,
    begin_at: new Date(2029, 11, 31, 23).toISOString(),
    end_at: new Date(2030, 0, 1, 1).toISOString(),
  };
  const f = fixture([slot]);
  const block = timeline(f.render()).props.children[2][0];
  const button = block.props.children.find((node) => node?.type === "Pressable");
  assert.match(button.props.accessibilityLabel, /Cancel slot/);
  button.props.onPress();
  assert.equal(f.canceled[0], slot);
});

test("holding without moving saves exactly the selected 30 minutes once on release", () => {
  const f = fixture();
  const pan = f.start(18);
  assert.equal(f.selected.length, 0);
  const content = timeline(f.render());
  content.props.onTouchEnd();
  assert.equal(f.selected.length, 1);
  const [start, end] = f.selected[0];
  assert.equal(start.getHours(), 9);
  assert.equal(start.getMinutes(), 0);
  assert.equal(end - start, 30 * 60_000);
  assert.equal(f.locks.at(-1), false);
  content.props.children[0][18].props.children.props.onPress();
  pan.onPanResponderRelease();
  assert.equal(f.selected.length, 1);
  assert.equal(f.tapped.length, 0);
});

test("cancelling a stationary hold does not save or open the slot form", () => {
  const f = fixture();
  f.start(18);
  const content = timeline(f.render());
  content.props.onTouchCancel();
  content.props.onTouchEnd();
  content.props.children[0][18].props.children.props.onPress();
  assert.equal(f.selected.length, 0);
  assert.equal(f.tapped.length, 0);
  assert.equal(f.locks.at(-1), false);
});
