import type { IncomingMessage, ServerResponse } from "node:http";
import { json } from "@intra42/portal-server/http";
import { type Event, eventAction } from "../src/events.ts";

type EventSession = { access_token: string; userId: number; savingEvent?: boolean };

export async function readEvents(session: EventSession): Promise<Event[]> {
  const response = await fetch("https://intrapy.intra.42.fr/api/v1/users/me/events", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("42 could not load your agenda. Try again.");
  const events: unknown = await response.json();
  if (
    !Array.isArray(events) ||
    events.some(
      (event) =>
        !event ||
        !Number.isSafeInteger(event.id) ||
        event.id <= 0 ||
        typeof event.name !== "string" ||
        !Number.isFinite(Date.parse(event.begin_at)) ||
        !Number.isFinite(Date.parse(event.end_at)),
    )
  ) {
    throw new Error("42 returned an invalid agenda.");
  }
  return events;
}

export async function changeEvent(
  req: IncomingMessage,
  res: ServerResponse,
  session: EventSession,
  eventId: number,
) {
  if (req.headers["content-type"]?.split(";")[0] !== "application/json") {
    json(res, 415, { error: "Use a JSON event request." });
    return;
  }
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1024) {
      json(res, 413, { error: "Request too large." });
      return;
    }
  }
  let action: unknown;
  try {
    action = JSON.parse(raw)?.action;
  } catch {
    /* Invalid input is rejected below. */
  }
  if (!["subscribe", "unsubscribe", "join-waitlist", "leave-waitlist"].includes(action as string)) {
    json(res, 400, { error: "Choose a valid event action." });
    return;
  }
  if (session.savingEvent) {
    json(res, 409, { error: "Another event registration is being saved." });
    return;
  }
  session.savingEvent = true;
  try {
    const event = (await readEvents(session)).find((item) => item.id === eventId);
    if (!event) {
      json(res, 404, { error: "This event is not available in your agenda." });
      return;
    }
    if (eventAction(event) !== action) {
      json(res, 409, {
        error: "Registration has changed or is closed. Refresh the event and try again.",
      });
      return;
    }
    if (
      (action === "join-waitlist" || action === "leave-waitlist") &&
      (!Number.isSafeInteger(event.waitlist_id) || (event.waitlist_id ?? 0) <= 0)
    ) {
      json(res, 409, {
        error: "42 did not return an available waiting list. Refresh the event and try again.",
      });
      return;
    }
    const exam = event.kind === "exam";
    const collection = exam ? "exams_users" : "events_users";
    const base = `/${exam ? "exams" : "events"}/${event.id}/${collection}`;
    let path = `${base}.json`;
    let method = "POST";
    let body: string | undefined;
    if (action === "unsubscribe" || action === "leave-waitlist") {
      const id = action === "unsubscribe" ? event.events_user_id : event.users_waitlist_id;
      if (!Number.isSafeInteger(id) || (id ?? 0) <= 0) {
        json(res, 409, {
          error: "42 did not return your registration. Refresh the event and try again.",
        });
        return;
      }
      path =
        action === "unsubscribe"
          ? `${base}/${id}.json`
          : `/waitlist/${event.waitlist_id}/users_waitlists/${id}.json`;
      method = "DELETE";
    } else if (action === "join-waitlist") {
      path = `/waitlist/${event.waitlist_id}/users_waitlists.json`;
      body = JSON.stringify({ users_waitlist: { user_id: session.userId } });
    }
    const response = await fetch(`https://profile.intra.42.fr${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body,
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      json(res, response.status === 401 ? 401 : 409, {
        error: `42 did not save your registration (HTTP ${response.status}). Refresh the event and try again.`,
      });
      return;
    }
    // A successful write may have no response body; always reread the authoritative state in the app.
    await response.body?.cancel();
    json(res, 200, { saved: true });
  } catch {
    json(res, 502, {
      error: "Could not confirm your registration. Refresh the event before trying again.",
    });
  } finally {
    session.savingEvent = false;
  }
}
