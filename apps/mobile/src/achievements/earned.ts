import type { Achievement, AchievementAward } from "../api";

export function earnedAchievements(achievements?: Achievement[], awards?: AchievementAward[]) {
  const dates = new Map<number, string>();
  for (const award of awards ?? []) {
    const date =
      award.updated_at && Number.isFinite(Date.parse(award.updated_at))
        ? award.updated_at
        : award.created_at;
    if (!dates.has(award.achievement_id) && Number.isFinite(Date.parse(date))) {
      dates.set(award.achievement_id, date);
    }
  }
  return (achievements ?? [])
    .map((achievement) => ({ achievement, earnedAt: dates.get(achievement.id) }))
    .sort((a, b) => {
      const dateA = a.earnedAt ? Date.parse(a.earnedAt) : 0;
      const dateB = b.earnedAt ? Date.parse(b.earnedAt) : 0;
      return dateB - dateA || a.achievement.name.localeCompare(b.achievement.name);
    });
}
