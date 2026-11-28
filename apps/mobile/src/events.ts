export type Event = {
  id: number;
  name: string;
  begin_at: string;
  end_at: string;
  description?: string;
  location?: string;
  kind?: string;
  max_subscribers?: number | null;
  nbr_subscribers?: number;
  is_subscribed?: boolean;
  events_user_id?: number | null;
  unsubscription_delay?: number | null;
  waitlist_id?: number | null;
  is_waitlisted?: boolean;
  users_waitlist_id?: number | null;
};
export type EventAction = "subscribe" | "unsubscribe" | "join-waitlist" | "leave-waitlist";

export function eventAction(event: Event, now = Date.now()): EventAction | undefined {
  const start = Date.parse(event.begin_at);
  if (!Number.isFinite(start) || start <= now) return;
  if (event.is_subscribed) {
    const deadline = start - (event.unsubscription_delay ?? 0) * 3_600_000;
    return now < deadline ? "unsubscribe" : undefined;
  }
  if (event.is_waitlisted) return "leave-waitlist";
  if (event.max_subscribers && (event.nbr_subscribers ?? 0) >= event.max_subscribers) {
    return event.waitlist_id ? "join-waitlist" : undefined;
  }
  return "subscribe";
}

export function eventDuration(event: Event) {
  const minutes = Math.max(
    0,
    Math.round((Date.parse(event.end_at) - Date.parse(event.begin_at)) / 60_000),
  );
  if (minutes >= 1440) return `${Math.floor(minutes / 1440)}d`;
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h${minutes % 60 || ""}`;
}
