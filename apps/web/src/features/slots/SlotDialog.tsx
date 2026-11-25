import { type PointerEvent, type SubmitEvent, useEffect, useRef, useState } from "react";
import { Icon } from "@/features/dashboard/Icon";
import { intervalError, localInput, quarterMinutes } from "./calendar";

const timeOptions = Array.from({ length: (24 * 60) / quarterMinutes }, (_, index) => {
  const minutes = index * quarterMinutes;
  const hour = String(Math.floor(minutes / 60)).padStart(2, "0");
  return `${hour}:${String(minutes % 60).padStart(2, "0")}`;
});
const dateLabel = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
});
const timeZone = dateLabel.resolvedOptions().timeZone;

function closeDialog(dialog: HTMLDialogElement | null) {
  if (!dialog?.open || dialog.hasAttribute("data-closing")) return;
  dialog.setAttribute("data-closing", "");
  void Promise.allSettled(dialog.getAnimations().map((animation) => animation.finished)).then(() =>
    dialog.close(),
  );
}

function isBackdrop(event: PointerEvent<HTMLDialogElement>) {
  if (event.target !== event.currentTarget) return false;
  const { left, right, top, bottom } = event.currentTarget.getBoundingClientRect();
  return (
    event.clientX < left || event.clientX >= right || event.clientY < top || event.clientY >= bottom
  );
}

function TimeFields({
  prefix,
  value,
  onChange,
}: {
  prefix: "Start" | "End";
  value: string;
  onChange: (value: string) => void;
}) {
  const [date, time] = value.split("T");
  const day = new Date(`${date}T12:00`);

  return (
    <div className="slot-time-fields">
      <div className="slot-time-day">
        <span>{prefix === "Start" ? "Starts" : "Ends"}</span>
        <label className="slot-date-picker">
          <input
            type="date"
            aria-label={`${prefix} date`}
            value={date}
            onClick={(event) => event.currentTarget.showPicker?.()}
            onChange={(event) => onChange(`${event.target.value}T${time}`)}
          />
          <span aria-hidden="true">
            {Number.isFinite(day.getTime()) ? dateLabel.format(day) : "Choose a date"}
            <Icon name="chevron-down" />
          </span>
        </label>
      </div>
      <label className="slot-time-picker">
        <select
          aria-label={`${prefix} time`}
          value={time}
          onChange={(event) => onChange(`${date}T${event.target.value}`)}
        >
          {timeOptions.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <Icon name="clock" />
      </label>
    </div>
  );
}

export function SlotDialog({
  initial,
  busy,
  saved,
  error,
  onClose,
  onSave,
}: {
  initial: { start: Date; end: Date };
  busy: boolean;
  saved: boolean;
  error: string;
  onClose: () => void;
  onSave: (start: Date, end: Date) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const backdropPress = useRef(false);
  const [start, setStart] = useState(() => localInput(initial.start));
  const [end, setEnd] = useState(() => localInput(initial.end));
  const [validation, setValidation] = useState("");
  const startDate = new Date(start);
  const endDate = new Date(end);
  const duration = (endDate.getTime() - startDate.getTime()) / 60_000;
  const hours = Math.floor(duration / 60);
  const minutes = duration % 60;
  const durationText = [hours ? `${hours} hr` : "", minutes ? `${minutes} min` : ""]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  useEffect(() => {
    if (saved) closeDialog(dialog.current);
  }, [saved]);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || dialog.current?.hasAttribute("data-closing")) return;
    const message = intervalError(start, end, new Date());
    setValidation(message);
    if (!message) onSave(startDate, endDate);
  }

  function changeStart(next: string) {
    setStart(next);
    setValidation("");
    const nextTime = Date.parse(next);
    if (Number.isFinite(nextTime)) {
      const length = duration > 0 ? duration : 30;
      setEnd(localInput(new Date(nextTime + length * 60_000)));
    }
  }

  return (
    <dialog
      ref={dialog}
      className="slot-dialog"
      aria-labelledby="slot-dialog-title"
      onPointerDown={(event) => {
        backdropPress.current = event.button === 0 && isBackdrop(event);
      }}
      onPointerUp={(event) => {
        const shouldClose = backdropPress.current && event.button === 0 && isBackdrop(event);
        backdropPress.current = false;
        if (shouldClose && !busy) closeDialog(event.currentTarget);
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) closeDialog(event.currentTarget);
      }}
      onClose={(event) => {
        if (event.currentTarget.hasAttribute("data-closing")) onClose();
      }}
    >
      <form onSubmit={submit} noValidate>
        <header>
          <h2 id="slot-dialog-title">Open an evaluation slot</h2>
          <button
            type="button"
            className="slot-dialog-close"
            aria-label="Close slot dialog"
            disabled={busy}
            onClick={() => closeDialog(dialog.current)}
          >
            <Icon name="close" />
          </button>
        </header>
        <fieldset className="slot-time-range" disabled={busy}>
          <TimeFields prefix="Start" value={start} onChange={changeStart} />
          <TimeFields
            prefix="End"
            value={end}
            onChange={(next) => {
              setEnd(next);
              setValidation("");
            }}
          />
        </fieldset>
        <p className="slot-time-summary" aria-live="polite">
          {!intervalError(start, end) && `${durationText} · `}
          {timeZone}
        </p>
        {(validation || error) && (
          <p className="slots-error" role="alert">
            {validation || error}
          </p>
        )}
        <footer>
          <button type="submit" disabled={busy} className="slots-primary">
            {busy ? "Saving…" : "Open slot"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
