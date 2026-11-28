import type { Achievement } from "../api";

export type AchievementEntry = { achievement: Achievement; earnedAt?: string };
export type AchievementLevel = AchievementEntry & { level?: number };
export type AchievementGroup = {
  key: string;
  levels: AchievementLevel[];
  summary: AchievementLevel;
};

function family(achievement: Achievement) {
  return typeof achievement.nbr_of_success === "number" && achievement.nbr_of_success > 0
    ? JSON.stringify([achievement.kind, achievement.name])
    : `single:${achievement.id}`;
}

export function groupAchievements(
  entries: AchievementEntry[],
  catalog: Achievement[] = [],
  status: "earned" | "unearned" = "earned",
): AchievementGroup[] {
  const known = new Map(catalog.map((achievement) => [achievement.id, achievement]));
  for (const { achievement } of entries) known.set(achievement.id, achievement);
  const families = new Map<string, Achievement[]>();
  for (const achievement of known.values()) {
    const key = family(achievement);
    const levels = families.get(key) ?? [];
    levels.push(achievement);
    families.set(key, levels);
  }
  const positions = new Map<number, number>();
  for (const levels of families.values()) {
    if (levels.length < 2) continue;
    levels.sort((a, b) => (a.nbr_of_success ?? 0) - (b.nbr_of_success ?? 0) || a.id - b.id);
    levels.forEach((achievement, index) => {
      if (achievement.nbr_of_success != null && achievement.nbr_of_success > 0)
        positions.set(achievement.id, index + 1);
    });
  }
  const groups = new Map<string, AchievementLevel[]>();
  for (const entry of entries) {
    const key = family(entry.achievement);
    const levels = groups.get(key) ?? [];
    if (!levels.some(({ achievement }) => achievement.id === entry.achievement.id))
      levels.push({ ...entry, level: positions.get(entry.achievement.id) });
    groups.set(key, levels);
  }
  return [...groups].map(([key, levels]) => {
    levels.sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || a.achievement.id - b.achievement.id);
    return {
      key,
      levels,
      summary: levels[status === "earned" ? levels.length - 1 : 0] as AchievementLevel,
    };
  });
}

export function achievementLevelName({ achievement, level }: AchievementLevel) {
  return level === undefined ? achievement.name : `${achievement.name} ${level}`;
}
