import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, SectionList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AchievementRow } from "../src/achievements/AchievementRow";
import { CategoryIcon } from "../src/achievements/CategoryIcon";
import { earnedAchievements } from "../src/achievements/earned";
import { useAchievementAwards, useAchievementCatalog, useProfile } from "../src/api";
import { useSession } from "../src/session";
import { theme } from "../src/theme";
import {
  Button,
  QueryMessage,
  SkeletonList,
  stackScreenEdges,
  styles,
  useStackScrollInsets,
} from "../src/ui";

const categories = [
  { id: "", label: "All" },
  { id: "project", label: "Project" },
  { id: "social", label: "Social" },
  { id: "scolarity", label: "Scolarity" },
  { id: "pedagogy", label: "Pedagogy" },
] as const;

export default function Achievements() {
  const scrollInsets = useStackScrollInsets();
  const { userId } = useLocalSearchParams<{ userId?: string }>();
  const { token, loading } = useSession();
  const id = userId && /^[1-9]\d{0,9}$/.test(userId) ? Number(userId) : undefined;
  const profile = useProfile(id);
  const user = token ? profile.data : undefined;
  const awards = useAchievementAwards(user?.id);
  const catalog = useAchievementCatalog(!!token);
  const [category, setCategory] = useState("");
  const earned = earnedAchievements(user?.achievements, awards.data);
  const earnedIds = new Set(earned.map(({ achievement }) => achievement.id));
  const unearned = user
    ? (catalog.data ?? [])
        .filter(({ id, kind }) => !earnedIds.has(id) && (!category || kind === category))
        .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id)
        .map((achievement) => ({ achievement, earnedAt: undefined }))
    : [];
  const sections = [
    {
      key: "earned",
      locked: false,
      data: earned.filter(({ achievement }) => !category || achievement.kind === category),
    },
    { key: "unearned", locked: true, data: unearned },
  ].filter((section) => section.data.length > 0);
  const pending = loading || (!!token && profile.isPending);

  return (
    <SafeAreaView edges={stackScreenEdges} style={styles.screen}>
      <SectionList
        {...scrollInsets}
        sections={sections}
        stickySectionHeadersEnabled={false}
        keyExtractor={({ achievement }) => String(achievement.id)}
        contentContainerStyle={s.content}
        ListHeaderComponent={
          user ? (
            <View style={s.header}>
              <Text style={s.count}>{earned.length} earned</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.categories}
              >
                {categories.map(({ id, label }) => (
                  <Pressable
                    key={id}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    accessibilityState={{ selected: category === id }}
                    onPress={() => setCategory(id)}
                    style={[s.chip, category === id && s.selected]}
                  >
                    <CategoryIcon category={id || "all"} />
                    <Text style={[s.label, category === id && s.activeLabel]}>{label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null
        }
        ListEmptyComponent={
          user && (catalog.isPending || catalog.isError) ? null : (
            <View style={s.header}>
              <QueryMessage
                pending={pending}
                error={profile.error}
                empty={
                  token
                    ? category
                      ? "No achievements in this category."
                      : "No achievements to show."
                    : "Sign in from Home to view achievements."
                }
                skeleton={<SkeletonList cardHeight={76} />}
              />
              {profile.isError && token ? (
                <Button title="Try again" onPress={() => void profile.refetch()} />
              ) : null}
            </View>
          )
        }
        ItemSeparatorComponent={() => <View style={s.separator} />}
        renderSectionHeader={({ section }) =>
          section.locked ? (
            <Text accessibilityRole="header" style={[s.count, s.sectionHeading]}>
              Not yet earned
            </Text>
          ) : null
        }
        renderItem={({ item, section }) => (
          <AchievementRow
            achievement={item.achievement}
            earnedAt={item.earnedAt}
            locked={section.locked}
          />
        )}
        ListFooterComponent={
          user && (catalog.isPending || catalog.isError) ? (
            <View style={s.sectionHeading}>
              <QueryMessage
                pending={catalog.isPending}
                error={null}
                empty="Could not load achievements you haven't earned yet."
                skeleton={<SkeletonList cardHeight={76} />}
              />
              {catalog.isError ? (
                <Button title="Try again" onPress={() => void catalog.refetch()} />
              ) : null}
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  content: { padding: 12, paddingBottom: 24 },
  header: { gap: 10, marginBottom: 12 },
  count: { color: theme.slate, fontSize: 16, fontWeight: "700" },
  sectionHeading: { marginTop: 16, marginBottom: 8 },
  categories: { flexGrow: 1, gap: 6 },
  chip: {
    flexGrow: 1,
    minWidth: 54,
    minHeight: 64,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 5,
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 8,
  },
  selected: { backgroundColor: "#e8f7f7", borderColor: "#c2e7e7" },
  label: { color: theme.ink, fontSize: 12, fontWeight: "600" },
  activeLabel: { color: theme.tealText, fontWeight: "700" },
  separator: { height: 8 },
});
