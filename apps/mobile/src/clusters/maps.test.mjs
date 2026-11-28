import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

// Exercise the pure parser without Expo's JSON import handling.
const source = readFileSync(new URL("./maps.ts", import.meta.url), "utf8").replace(
  'import officialMaps from "./official-maps.json";',
  "const officialMaps = [];",
);
const { parseMap, mapViewport, mapInitialOffset } = await import(
  `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString("base64")}`
);

test("ignores Amsterdam's commented seat examples without duplicating real hosts", () => {
  const map = parseMap(`<svg viewBox="0 0 1019 1212">
    <g id="hosts">
      <!--
        <image id="f1r1s17" height="20" width="16" y="80" x="540" />
      -->
      <!-- <image id="f0r1s12" height="80" width="80" x="50" y="50" /> -->
      <path d="M0 0h10" /> -->
      <rect id="f0r1s12" height="50" width="50" x="939" y="436.5" />
      <image id="f0r1s12" height="50" width="50" x="939" y="436.5" />
    </g>
  </svg>`);
  assert.deepEqual(map.seats, [{ id: "f0r1s12", x: 939, y: 436.5, width: 50, height: 50 }]);
  assert.ok(!map.xml.includes("<image"));
  assert.ok(!map.xml.includes("<!--"));
  assert.ok(!map.xml.includes("-->"));
  assert.ok(map.xml.includes('<rect id="f0r1s12"'));
});

test("ignores a commented viewBox and preserves separate real seat positions", () => {
  const map = parseMap(`<!-- <svg viewBox="invalid"></svg> -->
    <svg viewBox="0 0 100 100">
      <image id=" C1.R1.S1 " width="10" height="12" x="1" y="2"></image>
      <image id="c1r1s2" width="10" height="12" x="20" y="2" />
    </svg>`);
  assert.deepEqual(map.box, [0, 0, 100, 100]);
  assert.deepEqual(
    map.seats.map(({ id }) => id),
    ["c1r1s1", "c1r1s2"],
  );
});

test("viewport preserves SVG artwork left of the first seat with proportional whitespace", () => {
  const box = [0, 0, 640, 800];
  assert.deepEqual(
    mapViewport(box, [{ x: 200, y: 100, width: 30, height: 30 }]),
    [-16, -16, 672, 832],
  );
  assert.deepEqual(mapViewport([100, 200, 1000, 2000], []), [60, 160, 1080, 2080]);
});
test("viewport includes seats outside the declared SVG bounds", () => {
  assert.deepEqual(
    mapViewport([0, 0, 100, 100], [{ x: -30, y: 90, width: 20, height: 40 }]),
    [-46, -16, 162, 162],
  );
});

test("initial scroll skips excess blank margins while the full canvas remains available", () => {
  const viewport = [-16, -16, 672, 832];
  assert.deepEqual(mapInitialOffset(viewport, [{ x: 200, y: 160 }], 2), { x: 336, y: 288 });
  assert.deepEqual(mapInitialOffset(viewport, [{ x: 0, y: 0 }], 2), { x: 0, y: 0 });
  assert.deepEqual(mapInitialOffset(viewport, [], 2), { x: 0, y: 0 });
});
