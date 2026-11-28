import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AchievementRow } from "../achievements/AchievementRow";
import type { earnedAchievements } from "../achievements/earned";
import { useIntraQuery } from "../api";
import { theme } from "../theme";
import { Button, QueryMessage, SkeletonList, styles } from "../ui";
import { MarkRow } from "./MarkRow";
import type { MarkedProject } from "./marks";

export function ProfileResults({
  userId,
  cursusId,
  achievements,
  pending,
  error,
}: {
  userId: number;
  cursusId?: number;
  achievements: ReturnType<typeof earnedAchievements>;
  pending: boolean;
  error: Error | null;
}) {
  const [selected, setSelected] = useState("Marks");
  const router = useRouter();
  const marks = useIntraQuery<MarkedProject[]>(
    cursusId ? `/users/${userId}/marks?cursus_id=${cursusId}` : undefined,
    { retry: 2 },
  );
  const achievementsOnly = marks.isError && !marks.isFetching && !marks.data && !pending && !error;
  const activeTab = achievementsOnly ? "Achievements" : selected;
  return (
    <View style={styles.card}>
      <View accessibilityRole="tablist" style={s.tabs}>
        {(achievementsOnly ? ["Achievements"] : ["Marks", "Achievements"]).map((label) => (
          <Pressable
            key={label}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === label }}
            onPress={() => setSelected(label)}
            style={({ pressed }) => [
              s.tab,
              activeTab === label && s.active,
              pressed && s.tabPressed,
            ]}
          >
            <Text style={[s.tabText, activeTab === label && s.activeText]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {activeTab === "Marks" ? (
        <>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: "/marks",
                params: {
                  userId: String(userId),
                  ...(cursusId ? { cursusId: String(cursusId) } : {}),
                },
              })
            }
            style={({ pressed }) => [s.achievementAction, pressed && s.pressedAction]}
          >
            <Text style={s.achievementActionText}>See all marks</Text>
          </Pressable>
          {marks.data?.length ? (
            marks.data
              .slice(0, 4)
              .map((project) => (
                <MarkRow
                  key={`${cursusId}:${project.projects_user_id}`}
                  project={project}
                  userId={userId}
                />
              ))
          ) : (
            <QueryMessage
              pending={!!cursusId && marks.isPending}
              error={marks.error}
              empty={cursusId ? "No marks for this course." : "No course available."}
              skeleton={<SkeletonList cardHeight={48} />}
            />
          )}
          {marks.isError && <Button title="Try again" onPress={() => void marks.refetch()} />}
        </>
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({ pathname: "/achievements", params: { userId: String(userId) } })
            }
            style={({ pressed }) => [s.achievementAction, pressed && s.pressedAction]}
          >
            <Text style={s.achievementActionText}>See all achievements</Text>
          </Pressable>
          {pending ? (
            <SkeletonList cardHeight={76} />
          ) : error ? (
            <Text style={styles.muted}>{error.message}</Text>
          ) : achievements.length ? (
            achievements
              .slice(0, 4)
              .map(({ achievement, earnedAt }) => (
                <AchievementRow
                  key={achievement.id}
                  achievement={achievement}
                  earnedAt={earnedAt}
                />
              ))
          ) : (
            <Text style={styles.muted}>No achievements to show.</Text>
          )}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  achievementAction: {
    alignSelf: "flex-start",
    borderColor: theme.tealText,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  achievementActionText: { color: theme.tealText, fontSize: 13, textTransform: "uppercase" },
  pressedAction: { backgroundColor: "#e6f8f8" },
  tabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 24,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  tab: {
    minHeight: 44,
    justifyContent: "center",
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  active: { borderBottomColor: theme.tealText },
  tabPressed: { opacity: 0.65 },
  tabText: { fontSize: 16, fontWeight: "800", color: theme.ink, textTransform: "uppercase" },
  activeText: { color: theme.tealText },
});
