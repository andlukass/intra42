const assert = require("node:assert/strict");
const { test } = require("node:test");
const { serveManifest } = require("./manifest.cjs");

test("serves only the manifest for the requesting platform, channel, and runtime", async () => {
  const runtime = "a".repeat(40);
  const headers = {
    "expo-platform": "ios",
    "expo-channel-name": "preview",
    "expo-runtime-version": runtime,
    "expo-protocol-version": "1",
  };
  const response = {
    set() {
      return this;
    },
    vary() {},
    status(code) {
      this.code = code;
      return this;
    },
    type(value) {
      this.contentType = value;
      return this;
    },
    send(value) {
      this.body = value;
    },
    end() {},
  };
  const request = { method: "GET", get: (name) => headers[name] };
  await serveManifest(request, response, (key) => {
    assert.equal(key, `intra42-active/ios/preview/${runtime}.json`);
    return "{}";
  });
  assert.equal(response.code, 200);
  assert.equal(response.contentType, "application/expo+json");
  assert.equal(response.body, "{}");

  headers["expo-platform"] = "android";
  await serveManifest(request, response, (key) => {
    assert.equal(key, `intra42-active/android/preview/${runtime}.json`);
    return null;
  });
  assert.equal(response.code, 204);

  headers["expo-runtime-version"] = "../other";
  await serveManifest(request, response, () =>
    assert.fail("invalid runtimes must not reach Storage"),
  );
  assert.equal(response.code, 400);
});
