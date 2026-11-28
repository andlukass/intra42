import assert from "node:assert/strict";
import test from "node:test";
import { moveGraphCamera } from "./graphCamera.ts";

const viewport = { width: 400, height: 600, x: 20, y: 80 };
const span = { width: 2400, height: 2400 };
const camera = { x: 3000, y: 3000, zoom: 2 };
const touch = (x, y, distance = 0, count = 1) => ({ x, y, distance, count });

test("drag moves horizontally and vertically at the current zoom", () => {
  assert.deepEqual(moveGraphCamera(camera, touch(200, 300), touch(240, 280), viewport, span), {
    x: 2880,
    y: 3060,
    zoom: 2,
  });
});

test("pinch preserves the world position under the fingers while allowing translation", () => {
  const previous = touch(300, 200, 100, 2);
  const next = touch(320, 220, 200, 2);
  const result = moveGraphCamera(camera, previous, next, viewport, span);
  assert.equal(result.zoom, 4);
  const world = (state, focal) => ({
    x: state.x + ((focal.x - viewport.x - viewport.width / 2) * 6) / state.zoom,
    y: state.y + ((focal.y - viewport.y - viewport.height / 2) * 6) / state.zoom,
  });
  assert.deepEqual(world(camera, previous), world(result, next));
});

test("pinch clamps zoom without accumulating beyond either limit", () => {
  const previous = touch(220, 380, 100, 2);
  assert.equal(
    moveGraphCamera(camera, previous, touch(220, 380, 10000, 2), viewport, span).zoom,
    12,
  );
  assert.equal(moveGraphCamera(camera, previous, touch(220, 380, 1, 2), viewport, span).zoom, 1);
});

test("adding or removing a finger rebases without a camera jump", () => {
  assert.equal(
    moveGraphCamera(camera, touch(220, 380), touch(270, 380, 100, 2), viewport, span),
    camera,
  );
  assert.equal(
    moveGraphCamera(camera, touch(270, 380, 100, 2), touch(220, 380), viewport, span),
    camera,
  );
});

test("vector matrix maps camera center to the fixed SVG center at any zoom", async () => {
  const { graphDrawingMatrix } = await import("./graphCamera.ts");
  for (const zoom of [1, 1.8, 4, 12]) {
    const camera = { x: 3200, y: 2900, zoom };
    const center = { x: 3000, y: 3000 };
    const [a, b, c, d, tx, ty] = graphDrawingMatrix(camera, center);
    assert.equal(a * camera.x + c * camera.y + tx, center.x);
    assert.equal(b * camera.x + d * camera.y + ty, center.y);
    assert.equal(a, zoom);
    assert.equal(d, zoom);
  }
});
