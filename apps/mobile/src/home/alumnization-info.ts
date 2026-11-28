import { dateValue, progressDate } from "./profile-progress";

export type AlumniCountdown = { deadline?: string | null; status?: string };

export function alumnizationInfo(
  countdown?: AlumniCountdown | null,
  alumnizedAt?: string | null,
  now = Date.now(),
) {
  const alumniDate = alumnizedAt?.slice(0, 10);
  const deadlineDate = countdown?.deadline?.slice(0, 10);
  if (dateValue(alumniDate) !== undefined)
    return { date: progressDate(alumniDate), caption: "You're now an Alumni!" };
  const deadline = dateValue(deadlineDate);
  if (countdown?.status === "banned" || deadline === undefined) return;
  const days = Math.ceil((deadline - now) / 86_400_000);
  const months = Math.ceil(days / 30.44);
  const amount = days < 61 ? days : months;
  const unit = days < 61 ? "day" : "month";
  return {
    date: progressDate(deadlineDate),
    caption:
      days > 0
        ? `${amount} ${unit}${amount === 1 ? "" : "s"} left before alumnization`
        : "Alumnization date",
  };
}
