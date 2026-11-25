import { string } from "./queries";

export function format(date: Date, options: Intl.DateTimeFormatOptions, timeZone?: string) {
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone }).format(date);
}

export function timeZone(value: unknown) {
  const zone = string(value);
  if (!zone) return undefined;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
    return zone;
  } catch {
    return undefined;
  }
}

export function dateText(value: unknown, options: Intl.DateTimeFormatOptions, zone?: string) {
  const date = new Date(string(value));
  return Number.isNaN(date.getTime()) ? "" : format(date, options, zone);
}
