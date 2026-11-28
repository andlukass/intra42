import assert from "node:assert/strict";
import test from "node:test";
import { createSessionStore } from "./session-storage.ts";

test("the storage contract supports asynchronous providers and serializes writes across collections", async () => {
  const saved = [];
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const store = await createSessionStore({
    description: "test provider",
    load: async () => ({ native: [{ key: "existing" }] }),
    async save(snapshot) {
      if (saved.length === 0) await gate;
      saved.push(structuredClone(snapshot));
    },
  });
  const first = store.write("refresh", [{ key: "grant" }]);
  const second = store.write("calendar", [{ key: "cookies" }]);
  assert.deepEqual(store.read("refresh"), []);
  release();
  await Promise.all([first, second]);
  assert.deepEqual(saved.at(-1), {
    native: [{ key: "existing" }],
    refresh: [{ key: "grant" }],
    calendar: [{ key: "cookies" }],
  });
  assert.equal(saved.length, 2);
});

test("failed writes preserve the committed snapshot and allow the next write to succeed", async () => {
  let fails = true;
  const store = await createSessionStore({
    description: "test provider",
    load: async () => ({ native: [{ key: "existing" }] }),
    async save() {
      if (fails) throw new Error("Storage unavailable");
    },
  });
  await assert.rejects(store.write("native", []), /Storage unavailable/);
  assert.deepEqual(store.read("native"), [{ key: "existing" }]);
  fails = false;
  await store.write("native", []);
  assert.deepEqual(store.read("native"), []);
});

test("reload replaces cached credentials and consumed transactions with persisted state", async () => {
  let persisted = { native: [{ key: "old" }], transactions: [{ id: "consumed" }] };
  const store = await createSessionStore({
    description: "shared provider",
    load: async () => structuredClone(persisted),
    save: async (snapshot) => {
      persisted = structuredClone(snapshot);
    },
  });
  persisted = { native: [{ key: "renewed" }], transactions: [] };
  await store.reload();
  assert.deepEqual(store.read("native"), [{ key: "renewed" }]);
  assert.deepEqual(store.read("transactions"), []);
  await store.write("calendar", [{ key: "cookies" }]);
  assert.deepEqual(persisted.native, [{ key: "renewed" }]);
});
