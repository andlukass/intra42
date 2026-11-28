import { TZDate } from "@date-fns/tz";

export function calendarTimeZone(date: Date) {
  return (date as TZDate).timeZone;
}

// Preserve the calendar's zone when cloning or moving to another instant.
export function calendarDate(value: Date | number = Date.now(), zone?: string): Date {
  const timeZone = zone ?? (value instanceof Date ? calendarTimeZone(value) : undefined);
  return timeZone ? new TZDate(+value, timeZone) : new Date(+value);
}

export function parseCalendarInput(value: string, zone: string): Date {
  const [year, month, day, hour, minute] = value.split(/[- :]/).map(Number);
  return new TZDate(year, month - 1, day, hour, minute, 0, 0, zone);
}

export function utcISOString(date: Date) {
  return new Date(date.getTime()).toISOString();
}
