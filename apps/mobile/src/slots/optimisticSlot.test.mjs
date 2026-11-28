import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { QueryClient } from "@tanstack/react-query";
import ts from "typescript";
import { utcISOString } from "./calendarTime.ts";

const source = ts.createSourceFile(
  "slots.tsx",
  readFileSync(new URL("../../app/(tabs)/slots.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const mutations = [];
function find(node) {
  if (ts.isCallExpression(node) && node.expression.getText(source) === "useMutation")
    mutations.push(node.arguments[0]);
  ts.forEachChild(node, find);
}
find(source);
const compiled = ts.transpileModule(
  `exports.creation = ${mutations[0].getText(source)}; exports.cancellation = ${mutations[1].getText(source)};`,
  {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  },
).outputText;

function fixture(kind = "creation") {
  const client = new QueryClient();
  const key = ["42", "/me/slots?week"];
  const original = [{ id: 15, begin_at: "2030-01-01T08:00:00Z", end_at: "2030-01-01T09:00:00Z" }];
  client.setQueryData(key, original);
  client.setQueryData(["42", "/me/slots?other-week"], []);
  const exports = {};
  let requests = 0;
  runInNewContext(compiled, {
    exports,
    utcISOString,
    client,
    Date,
    token: { accessToken: "test" },
    id: 42,
    slots: {
      get data() {
        return client.getQueryData(key);
      },
    },
    // Booking-window boundaries are covered separately in bookingWindow.test.mjs.
    slotBookingError: () => null,
    slotWeekPath: () => key[1],
    overlapsSlot: (slot, start, end) =>
      Date.parse(slot.begin_at) < end.getTime() && Date.parse(slot.end_at) > start.getTime(),
    api: async () => {
      requests++;
      return { saved: true };
    },
    hideToast() {},
    showToast() {},
    setDay() {},
    setDraft() {},
    midnight: (date) => date,
    savingSlot: { current: true },
  });
  return { client, key, original, mutation: exports[kind], requests: () => requests };
}
const interval = { start: new Date("2030-01-01T10:00:00Z"), end: new Date("2030-01-01T11:00:00Z") };

test("slot is visible before the request finishes without conflicting with its own optimistic interval", async () => {
  const f = fixture();
  await f.mutation.onMutate(interval);
  assert.equal(f.requests(), 0);
  const data = f.client.getQueryData(f.key);
  assert.equal(data.length, 2);
  assert.equal(data[1].begin_at, interval.start.toISOString());
  assert.deepEqual(f.client.getQueryData(["42", "/me/slots?other-week"]), []);
  await f.mutation.mutationFn(interval);
  assert.equal(f.requests(), 1);
});

test("rejected creation restores the previous calendar and real overlaps still prevent writes", async () => {
  const f = fixture();
  const context = await f.mutation.onMutate(interval);
  f.mutation.onError(new Error("Rejected"), interval, context);
  assert.deepEqual(f.client.getQueryData(f.key), f.original);
  const overlap = {
    start: new Date("2030-01-01T08:00:00Z"),
    end: new Date("2030-01-01T08:30:00Z"),
  };
  assert.throws(() => f.mutation.mutationFn(overlap), /overlaps/);
  assert.equal(f.requests(), 0);
});

test("cancellation removes the slot immediately from cached weeks before sending the request", async () => {
  const f = fixture("cancellation");
  const neighbor = ["42", "/me/slots?neighbor"];
  f.client.setQueryData(neighbor, [...f.original]);
  await f.mutation.onMutate(f.original[0]);
  assert.equal(f.requests(), 0);
  assert.deepEqual(f.client.getQueryData(f.key), []);
  assert.deepEqual(f.client.getQueryData(neighbor), []);
  await f.mutation.mutationFn(f.original[0]);
  assert.equal(f.requests(), 1);
});

test("failed cancellation restores the original cached slots", async () => {
  const f = fixture("cancellation");
  const context = await f.mutation.onMutate(f.original[0]);
  f.mutation.onError(new Error("42 rejected cancellation"), f.original[0], context);
  assert.deepEqual(f.client.getQueryData(f.key), f.original);
});
