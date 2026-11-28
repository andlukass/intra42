import assert from "node:assert/strict";
import test from "node:test";
import { parseMetaClusterMaps } from "./cluster-maps.ts";

const page = (content) => `<div id="cluster-map" data-campus-id="33">${content}</div>`;
test("reads official maps, skips zones without SVGs and preserves campus identity", () => {
  assert.deepEqual(
    parseMetaClusterMaps(
      page(
        '<div role="tabpanel" id="cluster-288" data-floor="Zone 1" data-image="https://cdn.intra.42.fr/cluster/image/288/map.svg"></div><div role="tabpanel" id="cluster-289" data-floor="Zone 2"></div>',
      ),
      33,
    ),
    [
      {
        id: 288,
        name: "Zone 1",
        image: "https://cdn.intra.42.fr/cluster/image/288/map.svg",
        campus_id: 33,
      },
    ],
  );
  assert.deepEqual(
    parseMetaClusterMaps(
      page('<div role="tabpanel" id="cluster-288" data-floor="Zone 1"></div>'),
      33,
    ),
    [],
  );
});
test("rejects login pages, wrong campuses and untrusted image URLs", () => {
  assert.throws(() => parseMetaClusterMaps("<form>Sign in</form>", 33));
  assert.throws(() => parseMetaClusterMaps(page(""), 38));
  assert.throws(() =>
    parseMetaClusterMaps(
      page(
        '<div role="tabpanel" id="cluster-288" data-floor="Zone 1" data-image="https://example.com/map.svg"></div>',
      ),
      33,
    ),
  );
});
