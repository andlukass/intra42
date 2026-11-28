import { calendarDate } from "./calendarTime";
export function slotBookingDeadline(now = new Date()) {
  return new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
}

export function slotBookingError(start: Date, end: Date, now = new Date()) {
  if (start <= now) return "Slots must start in the future. Choose a later time.";
  if (end > slotBookingDeadline(now)) {
    return "Slots must end within 14 days from now, including the time. Choose an earlier start or a shorter duration.";
  }
  return null;
}

export function slotStartTimes(day: Date, now = new Date()) {
  const latest = slotBookingDeadline(now).getTime() - 30 * 60000;
  const start = calendarDate(day);
  start.setHours(0, 0, 0, 0);
  const end = calendarDate(start);
  end.setDate(end.getDate() + 1);
  const times: Date[] = [];
  for (let time = start.getTime(); time < end.getTime(); time += 15 * 60000) {
    if (time > now.getTime() && time <= latest)
      times.push(calendarDate(time, (day as Date & { timeZone?: string }).timeZone));
  }
  return times;
}
