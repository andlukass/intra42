import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type PointerEvent, useEffect, useRef, useState } from "react";
import { type CalendarSlots, createSlot, loadSlots } from "@/features/slots/api";
import {
  addDays,
  displayDay,
  displayTime,
  halfHours,
  localInput,
  monday,
  rangesOverlap,
  timeAt,
} from "@/features/slots/calendar";
import { SlotDialog } from "@/features/slots/SlotDialog";
import { requestError, type Session } from "@/lib/intra";
import "./slots.css";

const weekLabel = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short" });

function DayColumn({
  day,
  selected,
  now,
  events,
  newSlot,
}: {
  day: Date;
  selected: boolean;
  now: Date;
  events: CalendarSlots;
  newSlot: (start: Date, end?: Date) => void;
}) {
  const drag = useRef<{ pointerId: number; start: number; end: number; moved: boolean } | null>(
    null,
  );
  const ignoreClick = useRef(false);
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);

  function startDrag(event: PointerEvent<HTMLButtonElement>, minutes: number) {
    if (!event.isPrimary || event.button !== 0) return;
    ignoreClick.current = false;
    if (event.pointerType === "touch") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, start: minutes, end: minutes, moved: false };
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const active = drag.current;
    if (active?.pointerId !== event.pointerId) return;
    const button = event.currentTarget;
    const cell = button.ownerDocument
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLButtonElement>("button[data-minute]");
    if (!cell || cell.parentElement !== button.parentElement) return;

    const target = Number(cell.dataset.minute);
    if (target === active.end) return;
    const start = Math.min(active.start, target);
    const end = Math.max(active.start, target);
    active.moved = true;
    const crossesBlockedCell = Array.from(
      button.parentElement?.querySelectorAll<HTMLButtonElement>("button:disabled") ?? [],
    ).some((disabled) => {
      const minute = Number(disabled.dataset.minute);
      return minute >= start && minute <= end;
    });
    if (crossesBlockedCell) return;

    active.end = target;
    setSelection({ start, end });
  }

  function clearDrag(event: PointerEvent<HTMLButtonElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setSelection(null);
  }

  function finishDrag(event: PointerEvent<HTMLButtonElement>) {
    const active = drag.current;
    if (active?.pointerId !== event.pointerId) return;
    clearDrag(event);
    if (!active.moved) return;
    ignoreClick.current = true;
    if (active.start === active.end) return;
    newSlot(
      timeAt(day, Math.min(active.start, active.end)),
      timeAt(day, Math.max(active.start, active.end) + 30),
    );
  }

  return (
    <div data-day={localInput(day)} className={`slots-day${selected ? " slots-day-current" : ""}`}>
      <h3>
        {weekday.format(day)} {day.getDate()}/{day.getMonth() + 1}
      </h3>
      {halfHours.map((minutes) => {
        const start = timeAt(day, minutes);
        const end = timeAt(day, minutes + 30);
        const owned = events.slots.find((event) =>
          rangesOverlap(start, end, event.start, event.end),
        );
        const occupied = events.unavailable.some((event) =>
          rangesOverlap(start, end, event.start, event.end),
        );
        const past = start <= now;
        const label = owned ? "Open slot" : occupied ? "Unavailable" : past ? "Past" : "Available";
        const range = `${displayTime(owned ? new Date(owned.start) : start)}–${displayTime(owned ? new Date(owned.end) : end)}`;
        return (
          <button
            type="button"
            key={minutes}
            aria-label={`${displayDay(day)}, ${range}, ${label}`}
            data-minute={minutes}
            data-selected={
              selection && minutes >= selection.start && minutes <= selection.end ? true : undefined
            }
            data-state={owned ? "owned" : occupied ? "blocked" : past ? "past" : "available"}
            disabled={Boolean(owned) || occupied || past || start >= end}
            onPointerDown={(event) => startDrag(event, minutes)}
            onPointerMove={moveDrag}
            onPointerUp={finishDrag}
            onPointerCancel={clearDrag}
            onLostPointerCapture={clearDrag}
            onClick={(event) => {
              if (event.detail === 0 || !ignoreClick.current) newSlot(start);
              ignoreClick.current = false;
            }}
          >
            <span className="slots-mobile-time">{range}</span>
            {(owned || (!occupied && !past)) && (
              <span className="slots-cell-label">
                {owned ? `${owned.title || label} · ${range}` : label}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function Slots({ session }: { session: Session }) {
  const queryClient = useQueryClient();
  const [today, setToday] = useState(() => new Date());
  const [week, setWeek] = useState(() => monday(today));
  const [dayIndex, setDayIndex] = useState(() => (today.getDay() + 6) % 7);
  const [draft, setDraft] = useState<{ start: Date; end: Date } | null>(null);
  const [conflict, setConflict] = useState("");
  const [notice, setNotice] = useState("");
  const scroll = useRef<HTMLDivElement>(null);
  const days = Array.from({ length: 7 }, (_, index) => addDays(week, index));
  const key = ["intra", session.cacheKey, "slots", localInput(week)] as const;
  const calendar = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => loadSlots(session, week, addDays(week, 7), signal),
    retry: false,
  });
  const scrollDay = calendar.data ? localInput(days[dayIndex]) : "";
  useEffect(() => {
    if (!scrollDay || !scroll.current) return;
    const view = scroll.current;
    const column = view.querySelector(`[data-day="${scrollDay}"]`);
    const first = column?.querySelector("[data-state='available']");
    const heading = column?.querySelector("h3");
    view.scrollTop = first
      ? Math.max(
          0,
          view.scrollTop +
            first.getBoundingClientRect().top -
            view.getBoundingClientRect().top -
            (heading?.offsetHeight ?? 0),
        )
      : 0;
  }, [scrollDay]);
  const save = useMutation({
    mutationFn: ({ start, end }: { start: Date; end: Date }) => createSlot(session, start, end),
    retry: false,
    onSuccess: (_, { start }) => {
      setNotice("Slot opened.");
      setWeek(monday(start));
      setDayIndex((start.getDay() + 6) % 7);
      void queryClient.invalidateQueries({ queryKey: ["intra", session.cacheKey, "slots"] });
    },
  });

  function newSlot(start: Date, end = new Date(start.getTime() + 30 * 60_000)) {
    save.reset();
    setConflict("");
    setNotice("");
    setDraft({ start, end });
  }

  function submitSlot(start: Date, end: Date) {
    if (!calendar.data || save.isPending) return;
    const occupied = [...calendar.data.slots, ...calendar.data.unavailable];
    if (occupied.some((event) => rangesOverlap(start, end, event.start, event.end))) {
      setConflict("This range overlaps an existing slot or unavailable period.");
      return;
    }
    setConflict("");
    save.mutate({ start, end });
  }

  function goToday() {
    const now = new Date();
    setToday(now);
    setWeek(monday(now));
    setDayIndex((now.getDay() + 6) % 7);
  }

  function openNextSlot() {
    const now = new Date();
    const day = days[dayIndex];
    const time = timeAt(day, 9 * 60);
    const next = new Date(
      Math.max(time.getTime(), (Math.floor(now.getTime() / 900_000) + 1) * 900_000),
    );
    newSlot(next);
  }

  return (
    <main className="slots-page">
      <section className="slots-panel" aria-labelledby="slots-title">
        <div className="slots-toolbar">
          <div>
            <h1 id="slots-title">Manage slots</h1>
            <p>{weekLabel.formatRange(week, days[6])}</p>
          </div>
          <div className="slots-actions">
            <button type="button" onClick={goToday}>
              Today
            </button>
            <button
              type="button"
              aria-label="Previous week"
              onClick={() => setWeek(addDays(week, -7))}
            >
              ‹
            </button>
            <button type="button" aria-label="Next week" onClick={() => setWeek(addDays(week, 7))}>
              ›
            </button>
            <button
              type="button"
              className="slots-primary"
              disabled={!calendar.data}
              onClick={openNextSlot}
            >
              New slot
            </button>
          </div>
        </div>
        {notice && (
          <p className="slots-notice" role="status">
            {notice}
          </p>
        )}
        {calendar.isPending && (
          <p className="slots-notice" role="status">
            Loading slots…
          </p>
        )}
        {calendar.isError && (
          <p className="slots-error" role="alert">
            {requestError(calendar.error)}{" "}
            <button type="button" onClick={() => void calendar.refetch()}>
              Retry
            </button>
          </p>
        )}
        {calendar.data && (
          <>
            <fieldset className="slots-day-picker" aria-label="Choose a day">
              {days.map((day, index) => (
                <button
                  type="button"
                  key={localInput(day)}
                  aria-pressed={index === dayIndex}
                  aria-label={displayDay(day)}
                  onClick={() => setDayIndex(index)}
                >
                  <span>{weekday.format(day)}</span>
                  <b>{day.getDate()}</b>
                </button>
              ))}
            </fieldset>
            <div className="slots-scroll" ref={scroll}>
              <fieldset className="slots-grid" aria-label="Evaluation slot calendar">
                <div className="slots-axis" aria-hidden="true">
                  <span />
                  {halfHours.map((minutes) => (
                    <span key={minutes}>
                      {minutes % 60 === 0 ? displayTime(timeAt(week, minutes)) : ""}
                    </span>
                  ))}
                </div>
                {days.map((day, index) => (
                  <DayColumn
                    key={localInput(day)}
                    day={day}
                    selected={index === dayIndex}
                    now={today}
                    events={calendar.data}
                    newSlot={newSlot}
                  />
                ))}
              </fieldset>
            </div>
          </>
        )}
      </section>
      {draft && (
        <SlotDialog
          initial={draft}
          busy={save.isPending}
          saved={save.isSuccess}
          error={conflict || (save.error ? requestError(save.error) : "")}
          onClose={() => setDraft(null)}
          onSave={submitSlot}
        />
      )}
    </main>
  );
}
