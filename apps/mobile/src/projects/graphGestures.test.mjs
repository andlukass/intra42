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
function fixture({
  size = { width: 400, height: 600 },
  signedIn = true,
  login = "student-a",
  platform = "ios",
  cursus = 21,
  selected,
  layout = { ...graph, variant: "default", rings: [], states: [] },
} = {}) {
  const apiPaths = [];
  const shared = [];
  const states = [];
  const scheduled = [];
  const configs = {};
  let stateIndex = 0;
  let inGraphView = false;
  const jsx = (type, props, key) => ({ type, props, key });
  const exports = {};
  runInNewContext(source, {
    exports,
    URLSearchParams,
    require(name) {
      if (name === "react")
        return {
          useRef: () => ({ current: null }),
          useMemo: (fn) => fn(),
          useCallback: (fn) => fn,
          useState(initial) {
            if (!inGraphView) return [cursus, (value) => states.push({ index: "cursus", value })];
            const index = stateIndex++;
            return [
              index === 3 && selected
                ? selected
                : index === 1
                  ? size
                  : typeof initial === "function"
                    ? initial()
                    : initial,
              (value) => states.push({ index, value }),
            ];
          },
        };
      if (name === "react-native-svg") return { default: "Svg", Path: "Path" };
      if (name === "../src/CircularLoader") return { CircularLoader: "Loader" };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "expo-router")
        return { Stack: { Screen: "StackScreen" }, useRouter: () => ({ push() {} }) };
      if (name === "../src/home/ProfileSelector") return { ProfileSelector: "CourseSelector" };
      if (name === "expo-blur") return { BlurTargetView: "BlurTargetView", BlurView: "BlurView" };
      if (name === "../src/api") {
        return {
          useIntraQuery: (path) => {
            apiPaths.push(path);
            return { data: path?.includes("layout=1") ? layout : undefined };
          },
          useProfile: () => (signedIn ? { data: { login, campus: [{ id: 38 }] } } : {}),
        };
      }
      if (name === "../src/session") return { useSession: () => ({ token: signedIn }) };
      if (name === "../src/projects/graphCamera") return { graphDrawingMatrix, moveGraphCamera };
      if (name.endsWith("holy-graph.json")) return graph;
      if (name === "../src/projects/HolyGraphArtwork") {
        return { HolyGraphArtwork: "Artwork", graphStatus: { done: { label: "Completed" } } };
      }
      if (name === "../src/theme") return { theme: {} };
      if (name === "../src/ui") return { styles: {} };
      if (name === "react-native")
        return {
          Keyboard: { dismiss() {} },
          Platform: { OS: platform },
          StyleSheet: { create: (value) => value },
        };
      if (name === "react-native-safe-area-context")
        return { useSafeAreaInsets: () => ({ top: 50, bottom: 30 }) };
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
  const screen = exports.default();
  inGraphView = true;
  const tree = screen.type(screen.props);
  return { tree, graphKey: screen.key, shared, states, scheduled, configs, apiPaths };
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
  assert.equal(f.states.find(({ index }) => index === 3).value.id, node.id);
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
  assert.ok(f.states.every(({ index, value }) => index === 2 && value === finalCamera));
});

test("selecting a project at low zoom never recenters or changes zoom", () => {
  const f = fixture();
  const node = graph.nodes[0];
  f.shared[0].value = { x: node.x, y: node.y, zoom: 1.5 };
  const before = f.shared[0].value;
  f.configs.pan.onBegin();
  f.configs.tap.onDeactivate({ canceled: false, x: 200, y: 300 });
  f.scheduled[0]();
  assert.equal(f.states.find(({ index }) => index === 3).value.id, node.id);
  assert.equal(f.shared[0].value, before);
});

test("Android header blur samples the graph target while the bottom panel stays outside", () => {
  const { tree } = fixture({ signedIn: true, platform: "android" });
  const nodes = [];
  function walk(node) {
    if (!node) return;
    if (Array.isArray(node)) return node.forEach(walk);
    nodes.push(node);
    walk(node.props?.children);
  }
  walk(tree);
  const header = nodes.find((node) => node.type === "StackScreen");
  const target = nodes.find((node) => node.type === "BlurTargetView");
  const blur = header.props.options.headerBackground();
  assert.equal(blur.type, "BlurView");
  assert.equal(blur.props.blurTarget, target.props.ref);
  assert.equal(blur.props.blurMethod, "dimezisBlurView");
  assert.equal(blur.props.intensity, 25);
  assert.ok(findArtwork(target));
});

test("course selector requests and draws the selected course instead of the bundled 42 graph", () => {
  const layout = {
    nodes: [{ id: 10, name: "C Piscine Shell", slug: "shell", kind: "project", x: 20, y: 30 }],
    edges: [],
    states: [],
  };
  const f = fixture({ signedIn: true, cursus: 9, layout });
  assert.equal(findArtwork(f.tree).props.data, layout);
  assert.ok(f.apiPaths.some((path) => path?.includes("cursus_id=9") && path?.includes("layout=1")));
  const selectors = [];
  function walk(node) {
    if (!node) return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (node.type === "CourseSelector") selectors.push(node);
    walk(node.props?.children);
  }
  walk(f.tree);
  assert.equal(selectors[0].props.selectedId, 9);
  assert.equal(selectors[0].props.label, "C Piscine");
  selectors[0].props.onChange(21);
  assert.ok(f.states.some((s) => s.index === "cursus" && s.value === 21));
});

test("42cursus waits for the signed-in profile's variant instead of showing the bundled graph", () => {
  const pending = fixture({ signedIn: true, layout: null });
  assert.equal(findArtwork(pending.tree), undefined);
  const layout = {
    nodes: [{ id: 2687, name: "push_swap", slug: "42next-push_swap", x: 2856, y: 2917 }],
    edges: [[4100, 3000, 4000, 3000]],
    variant: "42next",
    states: [],
  };
  const next = fixture({ login: "student-b", layout });
  assert.equal(findArtwork(next.tree).props.data, layout);
  assert.ok(
    next.apiPaths[0].includes("login=student-b") && next.apiPaths[0].includes("cursus_id=21"),
  );
  assert.equal(
    next.graphKey,
    fixture({ login: "student-b", layout: { ...layout, states: [{ id: 2687, state: "done" }] } })
      .graphKey,
  );
});

test("selected projects use a top preview and the old footer is absent", () => {
  const f = fixture({ selected: graph.nodes[0] });
  const elements = [];
  function walk(node) {
    if (!node) return;
    if (Array.isArray(node)) return node.forEach(walk);
    elements.push(node);
    walk(node.props?.children);
  }
  walk(f.tree);
  const preview = elements.find((node) => node.type?.name === "GraphProjectCard");
  assert.equal(preview.props.node.id, graph.nodes[0].id);
  assert.ok(
    !elements.some((node) =>
      ["Reset view", "Open in 42 ↗", "Drag to explore or tap a project."].includes(
        node.props?.children,
      ),
    ),
  );
  preview.props.onClose();
  assert.ok(f.states.some((entry) => entry.index === 3 && entry.value === undefined));
});

test("Exam Rank previews show the graph description without loading a separate overview", () => {
  const node = {
    id: 1322,
    slug: "exam-rank-04",
    name: "Exam Rank 04",
    kind: "exam",
    x: 3000,
    y: 3500,
    description: "This project will evaluate your knowledge about programming.",
    duration: "about 0 days",
  };
  const f = fixture({ selected: node, layout: { ...graph, nodes: [node], states: [] } });
  function findPreview(element) {
    if (element?.type?.name === "GraphProjectCard") return element;
    return [element?.props?.children].flat().filter(Boolean).map(findPreview).find(Boolean);
  }
  const preview = findPreview(f.tree);
  const card = preview.type(preview.props);
  const content = card.props.children.map((child) => child?.props?.children);
  assert.ok(content.includes(node.description));
  assert.ok(content.includes(node.duration));
  assert.equal(f.apiPaths.at(-1), undefined);
});

test("tapping empty graph space dismisses the project preview without moving the camera", () => {
  const f = fixture({ selected: graph.nodes[0] });
  const camera = { x: -100000, y: -100000, zoom: 4 };
  f.shared[0].value = camera;
  f.configs.tap.onDeactivate({ canceled: false, x: 200, y: 300 });
  for (const callback of f.scheduled) callback();
  assert.ok(f.states.some((entry) => entry.index === 3 && entry.value === undefined));
  assert.equal(f.shared[0].value, camera);
});
