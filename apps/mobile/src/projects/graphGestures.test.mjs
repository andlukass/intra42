import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { graphDrawingMatrix, moveGraphCamera } from "./graphCamera.ts";

const graph = JSON.parse(readFileSync(new URL("./holy-graph.json", import.meta.url)));
const source = ts.transpileModule(
  readFileSync(new URL("../../app/holy-graph.tsx", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  },
).outputText;
function fixture({ size = { width: 400, height: 600 }, signedIn = false } = {}) {
  const shared = [];
  const states = [];
  const scheduled = [];
  const configs = {};
  let stateIndex = 0;
  const jsx = (type, props) => ({ type, props });
  const exports = {};
  runInNewContext(source, {
    exports,
    require(name) {
      if (name === "react")
        return {
          useMemo: (fn) => fn(),
          useCallback: (fn) => fn,
          useState(initial) {
            const index = stateIndex++;
            return [index === 0 ? size : initial, (value) => states.push({ index, value })];
          },
        };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "expo-router") return { useRouter: () => ({ push() {} }) };
      if (name === "../src/api") return { useProfile: () => (signedIn ? { data: {} } : {}) };
      if (name === "../src/session") return { useSession: () => ({ token: signedIn }) };
      if (name === "../src/projects/graphCamera") return { graphDrawingMatrix, moveGraphCamera };
      if (name.endsWith("holy-graph.json")) return graph;
      if (name === "../src/projects/HolyGraphArtwork") return { HolyGraphArtwork: "Artwork" };
      if (name === "../src/theme") return { theme: {} };
      if (name === "../src/ui") return { styles: {} };
      if (name === "react-native")
        return { Platform: { OS: "ios" }, StyleSheet: { create: (value) => value } };
      if (name === "react-native-safe-area-context") return {};
      if (name === "react-native-worklets")
        return { scheduleOnRN: (fn, ...args) => scheduled.push(() => fn(...args)) };
      if (name === "react-native-reanimated")
        return {
          default: { View: "AnimatedView" },
          useSharedValue(value) {
            const sv = {
              value,
              get() {
                return this.value;
              },
              set(next) {
                this.value = next;
              },
            };
            shared.push(sv);
            return sv;
          },
          useAnimatedProps(fn) {
            configs.drawing = fn;
            return {};
          },
        };
      if (name === "react-native-gesture-handler")
        return {
          usePanGesture: (c) => (configs.pan = c),
          usePinchGesture: (c) => (configs.pinch = c),
          useTapGesture: (c) => (configs.tap = c),
          useSimultaneousGestures: (...gestures) => ({ simultaneous: gestures }),
          useCompetingGestures: (...gestures) => (configs.composition = { competing: gestures }),
        };
      throw new Error(`Unexpected module ${name}`);
    },
  });
  const tree = exports.default();
  return { tree, shared, states, scheduled, configs };
}

function findArtwork(node) {
  if (node?.type === "Artwork") return node;
  for (const child of [node?.props?.children].flat()) {
    const artwork = child && findArtwork(child);
    if (artwork) return artwork;
  }
}

test("the artwork mounts with the same framing before and after canvas measurement", () => {
  const first = findArtwork(fixture({ signedIn: true, size: { width: 0, height: 0 } }).tree);
  const measured = findArtwork(fixture({ signedIn: true, size: { width: 390, height: 520 } }).tree);
  assert.ok(first);
  assert.ok(measured);
  assert.equal(first.props.viewBox, measured.props.viewBox);
  assert.equal(measured.props.width, undefined);
  assert.equal(measured.props.height, undefined);
});

test("pan and pinch update shared camera without rendering React or scheduling per-frame JS work", () => {
  const f = fixture();
  const start = f.shared[0].value;
  for (let i = 0; i < 60; i++)
    f.configs.pan.onUpdate({ numberOfPointers: 1, changeX: 2, changeY: 1 });
  assert.ok(f.shared[0].value.x < start.x);
  assert.equal(f.shared[0].value.zoom, 1);
  f.configs.pinch.onActivate({ numberOfPointers: 2, focalX: 300, focalY: 200 });
  for (let i = 0; i < 60; i++)
    f.configs.pinch.onUpdate({ numberOfPointers: 2, focalX: 300, focalY: 200, scaleChange: 1.01 });
  assert.ok(f.shared[0].value.zoom > 1);
  assert.equal(f.states.length, 0);
  assert.equal(f.scheduled.length, 0);
  f.configs.pinch.onFinalize();
  assert.equal(f.scheduled.length, 1);
  f.scheduled[0]();
  assert.equal(f.states.length, 1);
});
test("pan does not double-apply pinch movement, and cancelled taps do not select", () => {
  const f = fixture();
  f.configs.pinch.onActivate({ numberOfPointers: 2, focalX: 100, focalY: 100 });
  const current = f.shared[0].value;
  f.configs.pan.onUpdate({ numberOfPointers: 2, changeX: 100, changeY: 100 });
  assert.equal(f.shared[0].value, current);
  f.configs.tap.onDeactivate({ canceled: true, x: 100, y: 100 });
  assert.equal(f.scheduled.length, 0);
  assert.equal(f.configs.composition.competing[0].simultaneous.length, 2);
});
test("native transform uses the shared camera", () => {
  const f = fixture();
  f.shared[0].value = { x: 3100, y: 3200, zoom: 4 };
  assert.equal(f.configs.drawing().matrix[0], 4);
  assert.equal(f.configs.drawing().matrix[3], 4);
});

test("tap selection resolves the project in transformed graph coordinates", () => {
  const f = fixture();
  const node = graph.nodes[0];
  f.shared[0].value = { x: node.x, y: node.y, zoom: 4 };
  f.configs.tap.onDeactivate({ canceled: false, x: 200, y: 300 });
  assert.equal(f.scheduled.length, 1);
  f.scheduled[0]();
  assert.equal(f.states.find(({ index }) => index === 2).value.id, node.id);
  assert.equal(f.shared[0].value.zoom, 4);
});

test("lifting either pinch finger preserves the exact last two-finger camera", () => {
  const f = fixture();
  f.configs.pan.onBegin();
  f.configs.pinch.onActivate({ numberOfPointers: 2, focalX: 300, focalY: 220 });
  f.configs.pinch.onUpdate({ numberOfPointers: 2, focalX: 315, focalY: 230, scaleChange: 1.8 });
  const finalCamera = f.shared[0].value;
  f.configs.pinch.onUpdate({ numberOfPointers: 1, focalX: 380, focalY: 160, scaleChange: 1.1 });
  assert.equal(f.shared[0].value, finalCamera);
  f.configs.pinch.onUpdate({ numberOfPointers: 0, focalX: 0, focalY: 0, scaleChange: 0.9 });
  assert.equal(f.shared[0].value, finalCamera);
  f.configs.pinch.onFinalize();
  f.configs.pan.onUpdate({ numberOfPointers: 1, changeX: 90, changeY: -60 });
  f.configs.tap.onDeactivate({ canceled: false, x: 315, y: 230 });
  f.configs.pan.onFinalize();
  assert.equal(f.shared[0].value, finalCamera);
  assert.equal(f.scheduled.length, 2); // Only the two completion notifications, never selection.
  for (const callback of f.scheduled) callback();
  assert.equal(f.shared[0].value, finalCamera);
  assert.ok(f.states.every(({ index, value }) => index === 1 && value === finalCamera));
});

test("selecting a project at low zoom never recenters or changes zoom", () => {
  const f = fixture();
  const node = graph.nodes[0];
  f.shared[0].value = { x: node.x, y: node.y, zoom: 1.5 };
  const before = f.shared[0].value;
  f.configs.pan.onBegin();
  f.configs.tap.onDeactivate({ canceled: false, x: 200, y: 300 });
  f.scheduled[0]();
  assert.equal(f.states.find(({ index }) => index === 2).value.id, node.id);
  assert.equal(f.shared[0].value, before);
});
