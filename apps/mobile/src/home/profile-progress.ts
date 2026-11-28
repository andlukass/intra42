export type PaceProfile = {
  is_activated: boolean;
  deadline: string | null;
  cursus_begin_date: string | null;
  eta_end_of_cursus: string | null;
  end_of_cursus_max_deadline?: string | null;
  probationary_period: boolean;
  pace?: number | null;
  milestones: { level: number; deadline: string | null; validated_at: string | null }[];
};
export type AttendanceSummary = { weeks: { at: string; total: string }[] };
const day = 86_400_000;

export function dateValue(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
    ? time
    : undefined;
}
export function progressDate(value?: string | null) {
  return dateValue(value) === undefined
    ? "-"
    : `${value?.slice(8, 10)}/${value?.slice(5, 7)}/${value?.slice(0, 4)}`;
}
export function attendanceHours(duration: string) {
  const match =
    /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(
      duration,
    );
  if (!match?.slice(1).some(Boolean)) return undefined;
  const hours =
    Number(match[1] ?? 0) * 24 +
    Number(match[2] ?? 0) +
    Number(match[3] ?? 0) / 60 +
    Number(match[4] ?? 0) / 3600;
  return Number.isFinite(hours) ? hours : undefined;
}
export function profileProgress(profile: PaceProfile | null | undefined, now: number) {
  if (!profile?.is_activated) return undefined;
  const begin = dateValue(profile.cursus_begin_date);
  if (begin === undefined) return undefined;
  const milestones = [...(profile.milestones ?? [])].sort((a, b) => a.level - b.level);
  const deadline = dateValue(profile.deadline);
  const eta = dateValue(profile.eta_end_of_cursus);
  const latestValidated = milestones.reduce(
    (latest, item) => Math.max(latest, dateValue(item.validated_at) ?? begin),
    begin,
  );
  const elapsed = Math.max(0, Math.floor((now - latestValidated) / day));
  const duration = deadline === undefined ? 0 : Math.floor((deadline - latestValidated) / day);
  const segments = milestones.flatMap((item, index) => {
    const previous = milestones[index - 1];
    const start =
      index === 0 ? begin : (dateValue(previous?.validated_at) ?? dateValue(previous?.deadline));
    const end = dateValue(item.validated_at) ?? dateValue(item.deadline);
    return start === undefined || end === undefined || end <= start
      ? []
      : [{ ...item, start, end }];
  });
  const showDeadline = deadline !== undefined && duration > 0;
  const showEta = eta !== undefined && eta > begin && segments.length > 0;
  if (!showDeadline && !showEta) return undefined;
  return {
    begin,
    deadline: showDeadline ? deadline : undefined,
    eta: showEta ? eta : undefined,
    elapsed,
    duration,
    segments,
  };
}
