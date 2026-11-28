import assert from "node:assert/strict";
import test from "node:test";
import { eventAction, eventDuration } from "./events.ts";

const now = Date.parse("2026-11-27T14:00:00Z");
const event = {
  id: 1,
  name: "Exam",
  begin_at: "2026-12-02T10:00:00Z",
  end_at: "2026-12-02T13:00:00Z",
  max_subscribers: 40,
  nbr_subscribers: 7,
};
test("registration actions follow capacity, ownership, waiting list and cancellation deadlines", () => {
  assert.equal(eventAction(event, now), "subscribe");
  assert.equal(eventAction({ ...event, nbr_subscribers: 40 }, now), undefined);
  assert.equal(
    eventAction({ ...event, nbr_subscribers: 40, waitlist_id: 20 }, now),
    "join-waitlist",
  );
  assert.equal(eventAction({ ...event, is_waitlisted: true }, now), "leave-waitlist");
  assert.equal(eventAction({ ...event, is_subscribed: true }, now), "unsubscribe");
  assert.equal(
    eventAction({ ...event, is_subscribed: true, unsubscription_delay: 120 }, now),
    undefined,
  );
  assert.equal(eventAction(event, Date.parse(event.begin_at)), undefined);
  assert.equal(eventAction({ ...event, begin_at: "invalid" }, now), undefined);
  assert.equal(
    eventAction({ ...event, max_subscribers: null, nbr_subscribers: 10000 }, now),
    "subscribe",
  );
});
test("formats short events, hours with minutes and multi-day events", () => {
  assert.equal(eventDuration(event), "3h");
  assert.equal(eventDuration({ ...event, end_at: "2026-12-02T10:30:00Z" }), "30 min");
  assert.equal(eventDuration({ ...event, end_at: "2026-12-02T11:30:00Z" }), "1h30");
  assert.equal(eventDuration({ ...event, end_at: "2026-12-04T10:00:00Z" }), "2d");
});
