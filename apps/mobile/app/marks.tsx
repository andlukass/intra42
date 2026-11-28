import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useIntraQuery, useProfile } from "../src/api";
import { MarkRow } from "../src/home/MarkRow";
import type { MarkedProject } from "../src/home/marks";
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

export default function Marks() {
  const params = useLocalSearchParams<{ userId?: string; cursusId?: string }>();
  const validUser = /^[1-9]\d{0,9}$/.test(params.userId ?? "");
  const { token, loading } = useSession();
  const profile = useProfile(validUser ? Number(params.userId) : undefined);
  const user = validUser && token ? profile.data : undefined;
  const courses = user?.cursus_users ?? [];
  const [selected, setSelected] = useState(Number(params.cursusId));
  const course = courses.find(({ cursus }) => cursus.id === selected) ?? courses[0];
  const marks = useIntraQuery<MarkedProject[]>(
    user && course ? `/users/${user.id}/marks?cursus_id=${course.cursus.id}` : undefined,
  );
  const scrollInsets = useStackScrollInsets();
  return (
    <SafeAreaView edges={stackScreenEdges} style={styles.screen}>
      <FlatList
        {...scrollInsets}
        data={user ? (marks.data ?? []) : []}
        contentContainerStyle={s.content}
        keyExtractor={(item) => `${user?.id}:${course?.cursus.id}:${item.projects_user_id}`}
        renderItem={({ item }) => (user ? <MarkRow project={item} userId={user.id} /> : null)}
        ListHeaderComponent={
          user ? (
            <View style={s.header}>
              <Text style={s.count}>{marks.data?.length ?? 0} marks</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.courses}
              >
                {courses.map(({ cursus }) => (
                  <Pressable
                    key={cursus.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: cursus.id === course?.cursus.id }}
                    onPress={() => setSelected(cursus.id)}
                    style={[s.chip, cursus.id === course?.cursus.id && s.selected]}
                  >
                    <Text style={s.label}>{cursus.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <QueryMessage
            pending={
              validUser &&
              (loading || (!!token && profile.isPending) || (!!course && marks.isPending))
            }
            error={profile.error ?? marks.error}
            empty={
              !validUser
                ? "Invalid user profile."
                : !token
                  ? "Sign in from Home to view marks."
                  : course
                    ? "No marks for this course."
                    : "No course available."
            }
            skeleton={<SkeletonList cardHeight={48} />}
          />
        }
        ListFooterComponent={
          profile.isError || marks.isError ? (
            <Button
              title="Try again"
              onPress={() => {
                void profile.refetch();
                if (user && course) void marks.refetch();
              }}
            />
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
  courses: { gap: 6 },
  chip: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    backgroundColor: theme.surface,
  },
  selected: { backgroundColor: "#e8f7f7", borderColor: theme.tealText },
  label: { color: theme.tealText, fontSize: 14, fontWeight: "600" },
});
