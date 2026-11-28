import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { eventAction, eventDuration } from "../events.ts";

const source = ts.transpileModule(
  readFileSync(new URL("./EventDetails.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;
const event = {
  id: 32819,
  name: "Student Exam",
  kind: "exam",
  begin_at: new Date(Date.now() + 5 * 86_400_000).toISOString(),
  end_at: new Date(Date.now() + 5 * 86_400_000 + 10_800_000).toISOString(),
  description: "Exam Rank 02",
  location: "Cluster 2",
  max_subscribers: 40,
  nbr_subscribers: 7,
  is_subscribed: false,
};
function render({
  os = "ios",
  data = event,
  fetching = false,
  error = null,
  pending = false,
  mutateAsync = async () => {},
  share = async () => {},
  alert = () => {},
  notify = () => {},
} = {}) {
  const module = { exports: {} };
  let closed = 0;
  const jsx = (type, props) => ({ type, props });
  runInNewContext(source, {
    Intl: { DateTimeFormat: Intl.DateTimeFormat },
    exports: module.exports,
    require(name) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "react") return { useRef: () => ({ current: false }) };
      if (name === "react-native")
        return {
          Platform: { OS: os },
          Share: { share },
          Alert: { alert },
          StyleSheet: { create: (x) => x, absoluteFill: {} },
          Modal: "Modal",
          View: "View",
          Text: "Text",
          ScrollView: "ScrollView",
          Pressable: "Pressable",
          ActivityIndicator: "ActivityIndicator",
        };
      if (name === "react-native-safe-area-context")
        return { SafeAreaView: "SafeAreaView", useSafeAreaInsets: () => ({ bottom: 34 }) };
      if (name === "react-native-svg") return { default: "Svg", Path: "Path" };
      if (name === "../api")
        return {
          useEventDetails: () => ({
            data: data ? [data] : [],
            isSuccess: true,
            isFetching: fetching,
            error,
          }),
          useEventRegistration: () => ({ isPending: pending, mutateAsync }),
        };
      if (name === "../events") return { eventAction, eventDuration };
      if (name === "../ui")
        return {
          Button: "Button",
          Toast: "Toast",
          useToast: () => ({ toast: null, showToast: notify, hideToast() {} }),
        };
      if (name === "../theme") return { theme: {} };
      return { EventDescription: "EventDescription" };
    },
  });
  const tree = module.exports.EventDetails({
    event,
    color: "#ed8179",
    onClose: () => {
      closed++;
    },
  });
  function walk(node) {
    if (Array.isArray(node)) return node.flatMap(walk);
    if (!node || typeof node !== "object") return [node];
    if (typeof node.type === "function") return walk(node.type(node.props));
    return [node, ...walk(node.props.children)];
  }
  return { tree, nodes: walk(tree), closed: () => closed };
}

test("presents an iOS native sheet and Android native modal with the official exam details", () => {
  for (const os of ["ios", "android"]) {
    const view = render({ os });
    assert.equal(view.tree.type, "Modal");
    assert.equal(view.tree.props.presentationStyle, os === "ios" ? "pageSheet" : "fullScreen");
    for (const text of ["Student Exam", "Cluster 2", "7/40", "3h"])
      assert.ok(view.nodes.includes(text));
    assert.ok(
      view.nodes.some(
        (node) =>
          typeof node === "string" && node.includes("registered to both the event and the project"),
      ),
    );
    assert.ok(
      view.nodes.some(
        (node) =>
          node?.type === "Button" && node.props.title === "Subscribe" && !node.props.disabled,
      ),
    );
  }
});

test("prevents duplicate submission and dismissal while a registration is in flight", async () => {
  let calls = 0;
  let finish;
  const done = new Promise((resolve) => {
    finish = resolve;
  });
  const view = render({
    mutateAsync: async (action) => {
      assert.equal(action, "subscribe");
      calls++;
      await done;
    },
  });
  const subscribe = view.nodes.find((node) => node?.props?.title === "Subscribe");
  subscribe.props.onPress();
  subscribe.props.onPress();
  view.tree.props.onRequestClose();
  assert.equal(calls, 1);
  assert.equal(view.closed(), 0);
  finish();
  await new Promise((resolve) => setImmediate(resolve));
  view.tree.props.onRequestClose();
  assert.equal(view.closed(), 1);
});

test("shows unsubscribe after registration and disables stale, missing and refreshing state", () => {
  const subscribed = render({ data: { ...event, is_subscribed: true, events_user_id: 100 } });
  assert.equal(
    subscribed.nodes.find((node) => node?.props?.title === "Unsubscribe").props.variant,
    "danger",
  );
  for (const options of [{ fetching: true }, { error: new Error("Offline") }, { data: null }]) {
    const view = render(options);
    assert.ok(view.nodes.find((node) => node?.props?.title === "Subscribe").props.disabled);
  }
  const saving = render({ pending: true });
  assert.equal(saving.tree.props.allowSwipeDismissal, false);
  assert.ok(saving.nodes.some((node) => node?.props?.title === "Saving…" && node.props.disabled));
});

test("renders the official Markdown descriptions as native text and safe links", async () => {
  const descriptionSource = ts.transpileModule(
    readFileSync(new URL("./EventDescription.tsx", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
  ).outputText;
  const module = { exports: {} };
  const opened = [];
  const jsx = (type, props) => ({ type, props });
  runInNewContext(descriptionSource, {
    Intl: { DateTimeFormat: Intl.DateTimeFormat },
    exports: module.exports,
    require(name) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "react-native")
        return {
          View: "View",
          Text: "Text",
          StyleSheet: { create: (x) => x },
          Linking: { openURL: async (url) => opened.push(url) },
          Alert: { alert() {} },
        };
      return { theme: {} };
    },
  });
  const tree = module.exports.EventDescription({
    description:
      "## What to expect\n\n**Bring questions**\n- Meet peers\n\nJoin [here](https://meet.google.com/meet/test)\n\n[Unsafe](javascript:alert(1))",
  });
  const paragraphs = tree.props.children;
  const heading = paragraphs[0];
  assert.deepEqual(Array.from(heading.props.children), ["What to expect"]);
  const bold = paragraphs[1].props.children.find(
    (part) => part?.props?.style?.fontWeight === "700",
  );
  assert.equal(bold.props.children, "Bring questions");
  const link = paragraphs[2].props.children.find(
    (part) => part?.props?.accessibilityRole === "link",
  );
  assert.equal(link.props.children, "here");
  link.props.onPress();
  assert.deepEqual(opened, ["https://meet.google.com/meet/test"]);
  assert.ok(
    !paragraphs[3].props.children.some((part) => part?.props?.accessibilityRole === "link"),
  );
});

test("shares official exam and event links through the platform share sheet", async () => {
  for (const os of ["ios", "android"])
    for (const kind of ["exam", "event"]) {
      const calls = [];
      const view = render({
        os,
        data: { ...event, kind },
        share: async (...args) => {
          calls.push(args);
        },
      });
      view.nodes.find((node) => node?.props?.title === "Share event").props.onPress();
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(calls.length, 1);
      const url = `https://profile.intra.42.fr/${kind === "exam" ? "exams" : "events"}/${event.id}`;
      assert.equal(calls[0][0][os === "ios" ? "url" : "message"], url);
    }
});
test("share failures show an error and let the user try again", async () => {
  let errors = 0;
  const view = render({
    share: async () => {
      throw new Error("Unavailable");
    },
    alert: () => {
      errors++;
    },
  });
  const button = view.nodes.find((node) => node?.props?.title === "Share event");
  button.props.onPress();
  await new Promise((resolve) => setImmediate(resolve));
  button.props.onPress();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(errors, 2);
});

test("event registration sends the success toast only after the mutation succeeds", async () => {
  for (const subscribed of [false, true]) {
    const messages = [];
    let finish;
    const done = new Promise((resolve) => {
      finish = resolve;
    });
    const view = render({
      data: { ...event, is_subscribed: subscribed },
      mutateAsync: () => done,
      notify: (...args) => messages.push(args),
    });
    view.nodes
      .find((node) => node?.props?.title === (subscribed ? "Unsubscribe" : "Subscribe"))
      .props.onPress();
    assert.equal(messages.length, 0);
    finish();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(messages, [[subscribed ? "Unsubscribed" : "Subscribed"]]);
  }
});
test("failed subscriptions show an error toast instead of a success message", async () => {
  const messages = [];
  const view = render({
    mutateAsync: async () => {
      throw Error("Offline");
    },
    notify: (...args) => messages.push(args),
  });
  view.nodes.find((node) => node?.props?.title === "Subscribe").props.onPress();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(messages.length, 1);
  assert.equal(messages[0][1], true);
});
