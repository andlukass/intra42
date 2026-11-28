import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = stripTypeScriptTypes(
  readFileSync(new URL("./imageCache.ts", import.meta.url), "utf8"),
)
  .replace(/^import .*;\n/gm, "")
  .replaceAll("export ", "");
const image = "data:image/svg+xml;base64,PHN2Zy8+";
const photo = "data:image/png;base64,dGVzdA==";
function fixture(disk = new Map(), { storageFails = false } = {}) {
  const api = {};
  let now = Date.now();
  class File {
    constructor(directory, name) {
      this.path = `${directory.path}/${name}`;
    }
    get modificationTime() {
      return disk.get(this.path)?.modified ?? null;
    }
    async text() {
      return disk.get(this.path)?.text;
    }
    write(text) {
      if (storageFails) throw Error("Disk unavailable");
      disk.set(this.path, { text, modified: now });
    }
    delete() {
      disk.delete(this.path);
    }
  }
  class Directory {
    constructor(root, name) {
      this.path = `${root}/${name}`;
    }
    create() {
      if (storageFails) throw Error("Disk unavailable");
    }
    list() {
      return [...disk.keys()]
        .filter((key) => key.startsWith(`${this.path}/`))
        .map((key) => new File(this, key.slice(this.path.length + 1)));
    }
  }
  runInNewContext(`${source}\napi.loadCachedImage=loadCachedImage;`, {
    api,
    File,
    Directory,
    Paths: { cache: "device-cache" },
    CryptoDigestAlgorithm: { SHA256: "sha256" },
    digestStringAsync: async (_algorithm, value) =>
      createHash("sha256").update(value).digest("hex"),
    Date: class extends Date {
      static now() {
        return now;
      }
    },
  });
  return {
    disk,
    load: api.loadCachedImage,
    advance(ms) {
      now += ms;
    },
  };
}
function options(download, overrides = {}) {
  return {
    directoryName: "achievement-icons-v1",
    source: "/achievement/image/1/badge.svg",
    signal: new AbortController().signal,
    isValid: (uri) => typeof uri === "string" && uri.startsWith("data:image/"),
    download,
    ...overrides,
  };
}

test("a new cache instance restores icons from disk without downloading, with separate photo storage", async () => {
  const first = fixture();
  let downloads = 0;
  const load = options(async () => {
    downloads++;
    return image;
  });
  assert.equal(await first.load(load), image);
  assert.equal(await fixture(first.disk).load(load), image);
  assert.equal(downloads, 1);
  await first.load(options(async () => photo, { directoryName: "small-avatars-v1" }));
  assert.equal(first.disk.size, 2);
});

test("changed URLs, corrupt cache files and 30-day expiry trigger a new download", async () => {
  const cache = fixture();
  let downloads = 0;
  const download = async () => {
    downloads++;
    return image;
  };
  await cache.load(options(download));
  await cache.load(options(download, { source: "/achievement/image/2/new.svg" }));
  assert.equal(downloads, 2);
  for (const entry of cache.disk.values()) entry.text = "invalid JSON";
  await cache.load(options(download));
  assert.equal(downloads, 3);
  cache.advance(31 * 86400000);
  await cache.load(options(download));
  assert.equal(downloads, 4);
});

test("storage failures still display downloaded icons; invalid or canceled downloads are not cached", async () => {
  assert.equal(
    await fixture(undefined, { storageFails: true }).load(options(async () => image)),
    image,
  );
  const cache = fixture();
  await assert.rejects(
    cache.load(options(async () => "<html>error</html>")),
    /Invalid cached image/,
  );
  assert.equal(cache.disk.size, 0);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    cache.load(
      options(
        async () => {
          throw Error("Should not download");
        },
        { signal: controller.signal },
      ),
    ),
    /canceled/,
  );
  const running = new AbortController();
  await assert.rejects(
    cache.load(
      options(
        async () => {
          running.abort();
          return image;
        },
        { signal: running.signal },
      ),
    ),
    /canceled/,
  );
  assert.equal(cache.disk.size, 0);
});
