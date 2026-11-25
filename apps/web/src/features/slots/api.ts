import type { Session } from "@/lib/intra";

export interface Slot {
  start: string;
  end: string;
  title?: string;
}

export interface CalendarSlots {
  slots: Slot[];
  unavailable: Slot[];
}

async function slotsRequest(
  session: Session,
  action: "" | "/create",
  start: Date,
  end: Date,
  signal?: AbortSignal,
) {
  const timeout = AbortSignal.timeout(25_000);
  const params = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() });
  const response = await fetch(`/local-api/slots${action}?${params}`, {
    method: "POST",
    credentials: "omit",
    headers: { Authorization: `Bearer ${session.refreshSession ?? session.accessToken}` },
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(
      typeof body?.error === "string" ? body.error : `42 returned HTTP ${response.status}.`,
    );
  }
  return body;
}

export async function loadSlots(
  session: Session,
  start: Date,
  end: Date,
  signal: AbortSignal,
): Promise<CalendarSlots> {
  const body = await slotsRequest(session, "", start, end, signal);
  return { slots: body.slots, unavailable: body.unavailable };
}

export function createSlot(session: Session, start: Date, end: Date) {
  return slotsRequest(session, "/create", start, end);
}
