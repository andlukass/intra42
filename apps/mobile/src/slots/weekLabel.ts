export function weekLabel(start: Date, end: Date) {
  const fullDate = (date: Date) =>
    date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const monthName = (date: Date) => date.toLocaleDateString("en-US", { month: "short" });
  if (start.getFullYear() !== end.getFullYear()) return `${fullDate(start)} – ${fullDate(end)}`;
  const first = `${monthName(start)} ${start.getDate()}`;
  const last =
    start.getMonth() === end.getMonth()
      ? String(end.getDate())
      : `${monthName(end)} ${end.getDate()}`;
  return `${first} – ${last}, ${end.getFullYear()}`;
}
