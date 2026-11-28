import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const compiledSource = ts.transpileModule(
  readFileSync(new URL("../app/(tabs)/search.tsx", import.meta.url), "utf8"),
  {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  },
).outputText;
function fixture(source = "https://cdn.intra.42.fr/users/unusable.jpg") {
  const state = {
    uri: "file:///private/avatar.jpg",
    failed: undefined,
  };
  const api = {};
  const jsx = (type, props) => ({ type, props });
  runInNewContext(`${compiledSource}\napi.render = StudentPhoto;`, {
    exports: {},
    api,
    require(name) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "react")
        return {
          useState: () => [
            state.failed,
            (uri) => {
              state.failed = uri;
            },
          ],
        };
      if (name === "react-native")
        return { View: "View", Text: "Text", StyleSheet: { create: (styles) => styles } };
      if (name === "expo-image") return { Image: "Image" };
      if (name.endsWith("/api"))
        return {
          useSearchPhoto: (requested) => {
            assert.equal(requested, source);
            return { data: source ? state.uri : undefined };
          },
        };
      return { theme: {} };
    },
  });
  return {
    state,
    render: () =>
      api.render({
        user: { login: "llopes-d", cdn_uri: source },
      }).props.children,
  };
}

test("search photos use the authenticated cached avatar rather than the unprotected search CDN URL", () => {
  const client = fixture();
  const image = client.render();
  assert.equal(image.type, "Image");
  assert.equal(image.props.source, client.state.uri);
});

test("a missing search photo uses initials", () => {
  assert.equal(fixture(null).render().type, "Text");
});

test("a failed image falls back to initials but a new cached image can render", () => {
  const client = fixture();
  client.render().props.onError();
  assert.equal(client.render().type, "Text");
  client.state.uri = "file:///private/new-avatar.jpg";
  assert.equal(client.render().type, "Image");
});
