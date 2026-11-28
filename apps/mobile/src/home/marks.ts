export type MarkAttempt = {
  occurrence: number;
  final_mark: number | null;
  is_validated: boolean;
  last_event_date: string;
};
export type MarkedProject = MarkAttempt & {
  projects_user_id: number;
  project_name: string;
  project_slug: string;
  teams: MarkAttempt[];
  children: MarkedProject[];
};

export function markAttempts(project: MarkedProject) {
  const attempts =
    project.teams.length > 1
      ? project.teams.map((attempt) => ({
          ...attempt,
          projects_user_id: project.projects_user_id,
          project_name: project.project_name,
          project_slug: project.project_slug,
        }))
      : project.children;
  return [...attempts].sort((a, b) => b.occurrence - a.occurrence);
}

export function markAge(value: string, now = Date.now()) {
  const time = Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`);
  if (!Number.isFinite(time)) return "";
  const days = Math.max(0, Math.round((now - time) / 86400000));
  if (days < 1) return "today";
  const [amount, unit] =
    days < 30
      ? [days, "day"]
      : days < 365
        ? [Math.round(days / 30), "month"]
        : [Math.round(days / 365), "year"];
  return `${amount} ${unit}${amount === 1 ? "" : "s"} ago`;
}
