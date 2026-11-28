import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = stripTypeScriptTypes(
  readFileSync(new URL("./recent-searches.ts", import.meta.url), "utf8"),
)
  .replace(/^import .*;\n/gm, "")
  .replaceAll("export ", "");
function fixture(disk = new Map(), fails = false) {
  const store = {};
  class File {
    constructor(root, name) {
      this.path = `${root}/${name}`;
    }
    get exists() {
      return disk.has(this.path);
    }
    textSync() {
      if (fails) throw Error("Disk unavailable");
      return disk.get(this.path);
    }
    write(value) {
      if (fails) throw Error("Disk unavailable");
      disk.set(this.path, value);
    }
  }
  runInNewContext(
    `${source}\nObject.assign(store,{readRecentSearches,saveRecentSearches,rememberSearch,recentSearchKey});`,
    { store, File, Paths: { document: "phone-documents" } },
  );
  return { ...store, disk };
}
const student = {
  kind: "user",
  login: "llopes-d",
  cdn_uri: "https://cdn.intra.42.fr/users/small.jpg",
};
const project = { kind: "project", id: 1, name: "Libft", slug: "42cursus-libft" };
const plain = (value) => JSON.parse(JSON.stringify(value));
test("opened profiles and projects survive a new store instance using phone documents only", () => {
  const first = fixture();
  assert.equal(first.saveRecentSearches(42, [student, project]), true);
  assert.deepEqual(plain(fixture(first.disk).readRecentSearches(42)), [student, project]);
  assert.deepEqual([...first.disk.keys()], ["phone-documents/recent-searches-42.json"]);
});
test("reopening a result moves it to the front without duplicates, retaining only twenty entries", () => {
  const store = fixture();
  const recent = store.rememberSearch([student, project], project);
  assert.deepEqual(plain(recent), [project, student]);
  const many = Array.from({ length: 25 }, (_, id) => ({ ...project, id: id + 2 }));
  const capped = store.rememberSearch(many, student);
  assert.equal(capped.length, 20);
  assert.deepEqual(plain(capped[0]), student);
});
test("removing one result and removing the last result remain removed after restart", () => {
  const store = fixture();
  store.saveRecentSearches(42, [student, project]);
  const next = store
    .readRecentSearches(42)
    .filter((item) => store.recentSearchKey(item) !== store.recentSearchKey(student));
  store.saveRecentSearches(42, next);
  assert.deepEqual(plain(fixture(store.disk).readRecentSearches(42)), [project]);
  store.saveRecentSearches(42, []);
  assert.deepEqual(plain(fixture(store.disk).readRecentSearches(42)), []);
});
test("bad files and invalid destinations do not break Search", () => {
  const store = fixture();
  store.disk.set("phone-documents/recent-searches-42.json", "invalid json");
  assert.deepEqual(plain(store.readRecentSearches(42)), []);
  store.disk.set(
    "phone-documents/recent-searches-42.json",
    JSON.stringify([
      null,
      {},
      { ...student, login: "../me" },
      { ...project, slug: "https://evil.example" },
      project,
      project,
    ]),
  );
  assert.deepEqual(plain(store.readRecentSearches(42)), [project]);
  assert.equal(fixture(store.disk, true).saveRecentSearches(42, [student]), false);
});

test("history stays isolated between accounts and ignores legacy unowned history", () => {
  const store = fixture();
  store.disk.set("phone-documents/recent-searches.json", JSON.stringify([student]));
  assert.deepEqual(plain(store.readRecentSearches(42)), []);
  store.saveRecentSearches(42, [student]);
  assert.deepEqual(plain(store.readRecentSearches(99)), []);
  store.saveRecentSearches(99, [project]);
  assert.deepEqual(plain(fixture(store.disk).readRecentSearches(42)), [student]);
  assert.deepEqual(plain(fixture(store.disk).readRecentSearches(99)), [project]);
  store.saveRecentSearches(99, []);
  assert.deepEqual(plain(store.readRecentSearches(42)), [student]);
  assert.equal(store.saveRecentSearches(-1, [project]), false);
  assert.deepEqual(plain(store.readRecentSearches(undefined)), []);
});
