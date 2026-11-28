import { calendarDate, utcISOString } from "./calendarTime";
export function slotWeekPath(day: Date) {
  const start = calendarDate(day);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = calendarDate(start);
  end.setDate(end.getDate() + 7);
  const params = new URLSearchParams({
    "range[begin_at]": `${utcISOString(start)},${utcISOString(end)}`,
    "page[size]": "100",
    sort: "begin_at",
  });
  return `/me/slots?${params}`;
}
