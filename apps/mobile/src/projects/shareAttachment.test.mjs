import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const code = ts.transpileModule(
  readFileSync(new URL("./shareAttachment.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;
function fixture({ available = true, failure = false } = {}) {
  const calls = [];
  class Directory {
    constructor(...parts) {
      this.uri = parts.map((p) => p.uri ?? p).join("/");
    }
    create() {}
  }
  class File {
    constructor(directory, name) {
      this.uri = `${directory.uri}/${name}`;
      this.exists = true;
      this.size = 12;
    }
    delete() {
      calls.push("cleanup");
    }
    static async downloadFileAsync(url, destination) {
      calls.push({ download: url });
      if (failure) throw new Error("HTTP 500");
      return destination;
    }
  }
  const exports = {};
  runInNewContext(code, {
    exports,
    URL,
    URLSearchParams,
    require(name) {
      if (name === "../session") return { broker: "https://broker.test" };
      if (name === "expo-crypto")
        return {
          CryptoDigestAlgorithm: { SHA256: "SHA256" },
          digestStringAsync: async () => "file-key",
        };
      if (name === "expo-file-system")
        return { Directory, File, Paths: { cache: "file:///cache" } };
      if (name === "expo-sharing")
        return {
          isAvailableAsync: async () => available,
          shareAsync: async (uri, options) => {
            calls.push({ share: uri, ...options });
          },
        };
      throw new Error(name);
    },
  });
  return { share: (file) => exports.shareProjectAttachment(file, "local-session"), calls };
}
test("downloads a PDF before sharing its local URI with native PDF metadata", async () => {
  const f = fixture();
  await f.share({ name: "subject.pdf", url: "https://cdn.intra.42.fr/pdf/pdf/42/en.subject.pdf" });
  assert.ok(f.calls[0].download);
  assert.equal(f.calls[1].share, "file:///cache/project-attachments/file-key/subject.pdf");
  assert.equal(f.calls[1].mimeType, "application/pdf");
});
test("other project files are downloaded and shared with a safe filename", async () => {
  const f = fixture();
  await f.share({ name: "../resources.zip", url: "https://cdn.intra.42.fr/project/resources.zip" });
  assert.ok(
    f.calls[1].share.endsWith("/resources.zip") || f.calls[1].share.endsWith("/_resources.zip"),
  );
  assert.ok(!f.calls[1].share.includes("../"));
  assert.equal(f.calls[1].mimeType, undefined);
});
test("unsupported destinations and failed downloads never open the share sheet", async () => {
  const f = fixture({ failure: true });
  await assert.rejects(
    f.share({ name: "subject.pdf", url: "https://example.com/test.pdf" }),
    /Unsupported/,
  );
  assert.equal(f.calls.length, 0);
  await assert.rejects(
    f.share({ name: "subject.pdf", url: "https://cdn.intra.42.fr/pdf/test.pdf" }),
    /Could not download/,
  );
  assert.ok(f.calls.includes("cleanup"));
  assert.ok(!f.calls.some((call) => call.share));
  const unavailable = fixture({ available: false });
  await assert.rejects(
    unavailable.share({ name: "test.zip", url: "https://cdn.intra.42.fr/test.zip" }),
    /unavailable/,
  );
  assert.equal(unavailable.calls.length, 0);
});
