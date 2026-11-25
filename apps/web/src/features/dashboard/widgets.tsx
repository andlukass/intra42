import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { format } from "./dates";
import { Icon } from "./Icon";
import { type Data, number, string } from "./queries";

export function Panel({
  title,
  actions,
  children,
  className = "",
}: {
  title: string;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel dashboard-panel ${className}`}>
      <div className="panel-heading">
        <h2>{title}</h2>
        {actions && <div className="panel-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function Action({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link className="outline-button" to={to}>
      {children}
    </Link>
  );
}

export function Result({
  query,
  empty,
  children,
}: {
  query: { isPending: boolean; isError: boolean; refetch: () => unknown };
  empty?: string;
  children: ReactNode;
}) {
  if (query.isPending)
    return (
      <p className="panel-status" role="status">
        Loading…
      </p>
    );
  if (query.isError)
    return (
      <p className="panel-status">
        Could not load this section.{" "}
        <button className="text-action" type="button" onClick={() => query.refetch()}>
          Retry
        </button>
      </p>
    );
  if (empty) return <p className="panel-status">{empty}</p>;
  return children;
}

const colors: Record<string, string> = {
  association: "#99a9df",
  exam: "#ed8179",
  piscine: "#ed8179",
  pedago: "#ed8179",
  workshop: "#28a877",
  challenge: "#28a877",
  hackathon: "#28a877",
};

function startsIn(start: Date, now: number) {
  const hours = (start.getTime() - now) / 3_600_000;
  if (Math.abs(hours) < 1) {
    return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
      Math.round(hours * 60),
      "minute",
    );
  }
  return Math.abs(hours) < 24
    ? new Intl.RelativeTimeFormat("en").format(Math.round(hours), "hour")
    : new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(Math.round(hours / 24), "day");
}

export function EventCard({ event, zone, now }: { event: Data; zone?: string; now: number }) {
  const start = new Date(string(event.begin_at));
  const end = new Date(string(event.end_at));
  const validDate = Number.isFinite(start.getTime());
  const minutes = Math.round((end.getTime() - start.getTime()) / 60_000);
  const kind = string(event.kind);
  const kindLabel = kind.replaceAll("_", " ");
  const capacity = number(event.max_subscribers);
  const subscribers = number(event.nbr_subscribers);
  const location = string(event.location);
  return (
    <li
      className="event-card"
      style={{ borderColor: colors[kind] ?? "#00babc", color: colors[kind] ?? "#00a5aa" }}
    >
      <div className="event-date" style={{ background: colors[kind] ?? "#00babc" }}>
        {validDate && (
          <>
            <span>{format(start, { weekday: "short" }, zone)}</span>
            <strong>{format(start, { day: "numeric" }, zone)}</strong>
            <small>{format(start, { month: "long" }, zone)}</small>
          </>
        )}
      </div>
      <div className="event-details">
        <div className="event-title">
          <strong>{kindLabel || "Event"}</strong>
          <span>{string(event.name)}</span>
        </div>
        <div className="event-meta">
          {minutes > 0 && (
            <span>
              <Icon name="calendar" />
              {minutes >= 1440
                ? `${Math.floor(minutes / 1440)}d`
                : `${Math.floor(minutes / 60)}h${minutes % 60 || ""}`}
            </span>
          )}
          {validDate && (
            <span>
              <Icon name="clock" />
              {startsIn(start, now)}
            </span>
          )}
          {location && (
            <span>
              <Icon name="pin" />
              {location}
            </span>
          )}
          {capacity && subscribers !== undefined ? (
            <span>
              <Icon name="user" />
              {subscribers} / {capacity}
            </span>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function Logtime({ stats, zone, now }: { stats: Data; zone?: string; now: number }) {
  const today = new Date(now);
  const currentMonth = Number(format(today, { month: "numeric" }, zone)) - 1;
  const currentYear = Number(format(today, { year: "numeric" }, zone));
  const months = Array.from(
    { length: 4 },
    (_, index) => new Date(Date.UTC(currentYear, currentMonth - 3 + index, 1)),
  );
  return (
    <div className="calendar-months">
      {months.map((month) => {
        const year = month.getUTCFullYear();
        const monthIndex = month.getUTCMonth();
        const days = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
        return (
          <section
            key={month.toISOString()}
            className="calendar-month"
            aria-label={format(month, { month: "long", year: "numeric" }, "UTC")}
          >
            <h3>{format(month, { month: "short" }, "UTC")}</h3>
            <div className="calendar-days">
              {Array.from({ length: days }, (_, index) => {
                const day = index + 1;
                const key = new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
                const duration = string(stats[key]);
                return (
                  <span
                    key={key}
                    title={duration ? `${key} · ${duration}` : key}
                    className={duration && !duration.startsWith("00:00:00") ? "has-logtime" : ""}
                    style={day === 1 ? { gridColumnStart: month.getUTCDay() + 1 } : undefined}
                  >
                    {day}
                  </span>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
