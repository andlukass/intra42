import { randomInt } from "node:crypto";
import { TZDate } from "@date-fns/tz";
import { type Event, eventAction } from "../../src/events.ts";
import { db } from "./store.ts";

export const timeZone = "Europe/Lisbon";
const agenda = db.doc("review/agenda");
const events = [
  ["Student Exam", "exam", "Cluster 2", "Practice problem solving in a timed session.", 3],
  [
    "Campus Meetup",
    "meet up",
    "Lounge",
    "Meet other students and share what you are working on.",
    1,
  ],
  ["Project Demo", "event", "Lab", "Watch students present their latest projects.", 2],
  [
    "Peer Study Session",
    "event",
    "Study Room",
    "Bring a question and work through it with your peers.",
    1,
  ],
  [
    "Career Workshop",
    "workshop",
    "Auditorium",
    "Practice presenting a project and giving constructive feedback.",
    2,
  ],
] as const;

export async function reviewAgenda(action?: { id: number; name: string }, now = new Date()) {
  const today = new TZDate(now.getTime(), timeZone);
  return db.runTransaction(async (transaction) => {
    const current = (await transaction.get(agenda)).get("events") as Event[] | undefined;
    let changed = false;
    const items = Array.from({ length: 7 }, (_, index) => {
      const date = new TZDate(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() + index + 1,
        0,
        timeZone,
      );
      const id = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
      const saved = current?.find((event) => event.id === id);
      if (saved) return saved;
      const [name, kind, location, description, hours] = events[randomInt(events.length)];
      date.setHours(randomInt(10, 17));
      changed = true;
      return {
        id,
        name,
        kind,
        location,
        description,
        begin_at: new Date(date.getTime()).toISOString(),
        end_at: new Date(date.getTime() + hours * 3_600_000).toISOString(),
        max_subscribers: 40,
        nbr_subscribers: randomInt(4, 25),
        is_subscribed: false,
      };
    });
    if (action) {
      const event = items.find(({ id }) => id === action.id);
      if (!event) return null;
      const subscribed = action.name === "subscribe";
      if (event.is_subscribed !== subscribed) {
        if (eventAction(event, now.getTime()) !== action.name) return null;
        event.is_subscribed = subscribed;
        event.nbr_subscribers = (event.nbr_subscribers ?? 0) + (subscribed ? 1 : -1);
        changed = true;
      }
    }
    if (changed) transaction.set(agenda, { events: items });
    return items;
  });
}
