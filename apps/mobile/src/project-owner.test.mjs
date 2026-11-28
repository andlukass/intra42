import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(new URL("../app/project/[slug].tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;
function requestedProfiles(userId, view, profileData, registrationId) {
  const api = {};
  const paths = [];
  const jsx = (type, props) => ({ type, props });
  runInNewContext(`${source}\napi.render=ProjectPage;`, {
    exports: {},
    api,
    require(name) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "expo-router")
        return {
          Stack: { Screen: "StackScreen" },
          useLocalSearchParams: () => ({
            slug: "42cursus-ft_printf",
            userId,
            view,
            registrationId,
          }),
          useRouter: () => ({}),
        };
      if (name === "react-native") return { StyleSheet: { create: (x) => x }, Text: "Text" };
      if (name.endsWith("/api"))
        return {
          useIntraQuery: (path) => {
            paths.push(path);
            return { isPending: true, data: path === `/users/${userId}` ? profileData : undefined };
          },
        };
      if (name.endsWith("/session"))
        return { useSession: () => ({ token: { accessToken: "local" } }) };
      return { theme: {}, styles: {} };
    },
  });
  api.render();
  return paths;
}
test("project links from another profile read that user rather than the connected account", () => {
  const paths = requestedProfiles("146577");
  assert.equal(paths[0], "/users/146577");
  assert.ok(!paths.includes("/me"));
});
test("generic project links retain the connected user context", () =>
  assert.equal(requestedProfiles(undefined)[0], "/me"));
test("invalid explicit owners never fall back to the connected profile", () => {
  for (const id of ["0", "../me", "NaN", "9007199254740992"]) {
    const paths = requestedProfiles(id);
    assert.equal(paths[0], undefined);
    assert.ok(!paths.includes("/me"));
  }
});

test("profile project links load the viewed student's registration directly", () => {
  const paths = requestedProfiles("146577", "mine", {
    id: 146577,
    projects_users: [{ id: 123, project: { slug: "42cursus-ft_printf" } }],
  });
  assert.ok(paths.includes("/projects/42cursus-ft_printf/registrations/123"));
  assert.ok(!paths.some((path) => path?.endsWith("/personal") || path?.endsWith("/overview")));
});
test("personal links from Home open mine while explicit owners wait for their registration", () => {
  assert.ok(requestedProfiles(undefined, "mine").includes("/projects/42cursus-ft_printf/personal"));
  assert.ok(!requestedProfiles("146577", "mine").some((path) => path?.endsWith("/personal")));
});

test("marks use their exact enrollment directly even before the profile loads", () => {
  const paths = requestedProfiles("146577", "mine", undefined, "456");
  assert.ok(paths.includes("/projects/42cursus-ft_printf/registrations/456"));
  assert.ok(!paths.some((path) => path?.endsWith("/personal") || path?.endsWith("/overview")));
  for (const id of ["0", "../mine", "9007199254740992"])
    assert.ok(
      !requestedProfiles("146577", "mine", undefined, id).some((path) =>
        path?.includes("/registrations/"),
      ),
    );
});
