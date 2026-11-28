import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(new URL("./ProfileScreen.tsx", import.meta.url), "utf8"),
  {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;

function renderHome({ profile, agenda, logtime }) {
  const jsx = (type, props) => ({ type, props });
  const imports = {
    react: { useState: (initial) => [initial, () => {}] },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "expo-router": { useRouter: () => ({}) },
    "@tanstack/react-query": { useQueryClient: () => ({}) },
    "react-native": { StyleSheet: { create: (styles) => styles } },
    "../session": { useSession: () => ({ token: {} }) },
    "../api": {
      useProfile: () => ({ data: profile, isPending: !profile }),
      useAchievementAwards: () => ({ isPending: true }),
      useProfileCoalitions: () => ({ byCourse: new Map(), loading: true }),
      useIntraQuery: () => ({ isPending: true }),
      useSelectTitle: () => ({}),
      useAgenda: () => ({
        data: agenda ? { pages: [{ items: agenda }] } : undefined,
        isPending: !agenda,
      }),
      useLogtime: () => ({ data: logtime, isPending: !logtime }),
    },
    "../achievements/earned": { earnedAchievements: () => [] },
    "../theme": { theme: {} },
    "../ui": { useToast: () => ({}), styles: {}, QueryMessage: "QueryMessage", Card: "Card" },
    "../useDecodedAvatar": { useDecodedAvatar: () => ({ loading: true }) },
    "./coalition": {
      defaultProfileCourse: () => ({ cursus: { id: 21 } }),
      profilePalette: () => ({}),
    },
    "./ProfileCard": { ProfileCard: "ProfileCard", ProfileCardSkeleton: "ProfileCardSkeleton" },
    "./ProfileProgress": { ProfileProgress: "ProfileProgress" },
    "./Alumnization": { Alumnization: "Alumnization" },
    "./EventCard": { EventCard: "EventCard" },
    "./Logtime": { Logtime: "Logtime", LogtimeSkeleton: "LogtimeSkeleton" },
  };
  const exports = {};
  runInNewContext(source, { exports, require: (name) => imports[name] ?? {} });
  const elements = [];
  function walk(element) {
    if (Array.isArray(element)) element.forEach(walk);
    else if (element?.props) {
      elements.push(element);
      walk(element.props.children);
    }
  }
  walk(exports.ProfileScreen({}));
  return elements;
}

test("Home shows the identity as soon as the profile arrives while slow sections keep their skeletons", () => {
  assert.ok(renderHome({}).some(({ type }) => type === "ProfileCardSkeleton"));
  const profile = { id: 1, displayname: "Student Name", campus: [{ id: 38 }] };
  const elements = renderHome({ profile });
  const identity = elements.find(({ type }) => type === "ProfileCard");
  assert.equal(identity.props.user, profile);
  assert.equal(identity.props.avatarPending, true);
  assert.ok(!elements.some(({ type }) => type === "ProfileCardSkeleton"));
  assert.ok(elements.find(({ type }) => type === "Alumnization").props.pending);
  assert.ok(elements.find(({ type }) => type === "ProfileProgress").props.pace.isPending);
  const pending = elements.filter(({ type, props }) => type === "QueryMessage" && props.pending);
  assert.ok(pending.some(({ props }) => props.skeleton?.type.name === "AgendaSkeleton"));
  assert.ok(pending.some(({ props }) => props.skeleton?.type === "LogtimeSkeleton"));

  const partiallyLoaded = renderHome({ profile, agenda: [{ id: 7 }] });
  assert.ok(partiallyLoaded.some(({ type }) => type === "EventCard"));
  assert.ok(partiallyLoaded.some(({ props }) => props.skeleton?.type === "LogtimeSkeleton"));
});
