export const quarterMinutes = 15;
export const halfHours = Array.from({ length: 48 }, (_, index) => index * 30);

const calendarDay = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const timeLabel = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function addDays(date: Date, count: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return next;
}

export function monday(date: Date) {
  const first = addDays(date, -((date.getDay() + 6) % 7));
  first.setHours(0, 0, 0, 0);
  return first;
}

export function timeAt(day: Date, minutes: number) {
  const date = new Date(day);
  date.setHours(0, minutes, 0, 0);
  return date;
}

export function localInput(date: Date) {
  const part = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}`;
}

export function displayTime(date: Date) {
  return timeLabel.format(date);
}

export function displayDay(date: Date) {
  return calendarDay.format(date);
}

export function rangesOverlap(start: Date, end: Date, from: string, to: string) {
  return start.getTime() < Date.parse(to) && end.getTime() > Date.parse(from);
}

export function intervalError(start: string, end: string, now?: Date) {
  const from = new Date(start);
  const to = new Date(end);
  if (
    !Number.isFinite(from.getTime()) ||
    !Number.isFinite(to.getTime()) ||
    localInput(from) !== start ||
    localInput(to) !== end
  ) {
    return "Choose valid start and end times.";
  }
  if (now && from <= now) return "Choose a start time in the future.";
  if (to <= from) return "End time must be after start time.";
  if (from.getMinutes() % quarterMinutes || to.getMinutes() % quarterMinutes) {
    return "Choose times in 15-minute increments.";
  }
  return "";
}
