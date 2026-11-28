import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { QueryClient } from "@tanstack/react-query";

const source = stripTypeScriptTypes(readFileSync(new URL("./artwork.ts", import.meta.url), "utf8"))
  .replace(/^import .*;\n/gm, "")
  .replace("export function", "function");
test("map artwork is parsed once across remounts and reparsed only when occupancy changes", async () => {
  const api = {};
  let parses = 0;
  const hidden = [];
  runInNewContext(`${source}\napi.options=clusterArtworkOptions;`, {
    api,
    hideOccupiedPlaceholders: (xml, hosts) => {
      hidden.push([...hosts]);
      return xml;
    },
    parse: () => {
      parses++;
      return { children: [] };
    },
  });
  const client = new QueryClient();
  const first = api.options("map.svg", "<svg/>", ["c1r1s2", "c1r1s1"]);
  assert.equal(first.structuralSharing, false);
  const result = await client.fetchQuery(first);
  const again = await client.fetchQuery(
    api.options("map.svg", "<svg/>", ["c1r1s1", "c1r1s2", "c1r1s1"]),
  );
  assert.equal(again, result);
  assert.equal(parses, 1);
  assert.deepEqual(hidden[0], ["c1r1s1", "c1r1s2"]);
  await client.fetchQuery(api.options("map.svg", "<svg/>", ["c1r1s1"]));
  assert.equal(parses, 2);
  assert.equal(api.options("map.svg", undefined, []).enabled, false);
  client.clear();
});
