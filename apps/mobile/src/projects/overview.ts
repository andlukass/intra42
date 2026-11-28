export type ProjectOutcomes = { none: number; true: number; false: number };
export type ProjectStatistics = {
  success: ProjectOutcomes;
  average_team_lifespan: ProjectOutcomes;
  final_mark_by_campus: { name: string; data: [number, number][] }[];
  flags: { name: string; y: number }[];
};
export type OfficialProjectOverview = {
  teams?: PersonalProjectTeam[];
  name: string;
  status: string;
  metadata: string;
  description: string;
  keywords: string[];
  skills: string[];
  requirements: string[];
  notes?: string[];
  steps?: { name: string; slug: string }[];
  personalSlug?: string | null;
  unregisterSlug?: string | null;
  attachments: { name: string; url: string }[];
  studentLists?: { slug: string; kind: "without_team" | "can_register"; label: string }[];
  registrations: string[];
  registrationsError: string | null;
  statistics: ProjectStatistics | null;
  statisticsError: string | null;
};

export type PersonalProjectTeam = {
  canFinish: boolean;
  closed: boolean;
  id: string;
  name: string;
  mark: string;
  success: boolean;
  timeline: string;
  repository: string | null;
  progress: { label: string; complete: boolean }[];
  evaluations: {
    login: string | null;
    evaluator: string;
    date: string;
    mark: string;
    success: boolean;
    comment: string;
    feedback: string | null;
    ratings: { label: string; value: string }[];
  }[];
};
