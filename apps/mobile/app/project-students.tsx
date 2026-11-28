import { useInfiniteQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, useSearchPhoto } from "../src/api";
import { useSession } from "../src/session";
import { theme } from "../src/theme";
import {
  Button,
  QueryMessage,
  SkeletonBlock,
  stackScreenEdges,
  styles,
  useStackScrollInsets,
} from "../src/ui";

type Student = { login: string; cdn_uri?: string; available: boolean; closed?: boolean };
type StudentPage = { users: Student[]; total: number; page: number; hasMore: boolean };

function StudentAvatar({ user }: { user: Student }) {
  const photo = useSearchPhoto(user.cdn_uri);
  const [failed, setFailed] = useState<string>();
  return (
    <View style={s.avatar}>
      {photo.data && photo.data !== failed ? (
        <Image
          source={photo.data}
          style={s.image}
          accessible={false}
          onError={() => setFailed(photo.data)}
        />
      ) : photo.isFetching ? (
        <SkeletonBlock width={40} height={40} radius={20} />
      ) : (
        <Text style={s.initials}>{user.login.slice(0, 2).toUpperCase()}</Text>
      )}
    </View>
  );
}
function StudentsSkeleton() {
  return (
    <View accessibilityLabel="Loading students" accessibilityState={{ busy: true }}>
      {["one", "two", "three", "four", "five", "six", "seven", "eight"].map((key) => (
        <View key={key} style={s.row}>
          <SkeletonBlock width={40} height={40} radius={20} />
          <View style={s.copy}>
            <SkeletonBlock width="65%" height={18} radius={3} />
          </View>
          <SkeletonBlock width={8} height={8} radius={4} />
        </View>
      ))}
    </View>
  );
}

export default function ProjectStudents() {
  const { slug, kind, project } = useLocalSearchParams<{
    slug: string;
    kind: string;
    project?: string;
  }>();
  const valid =
    typeof slug === "string" &&
    /^[a-z0-9_-]{1,100}$/i.test(slug) &&
    (kind === "without_team" || kind === "can_register");
  const { token } = useSession();
  const router = useRouter();
  const insets = useStackScrollInsets();
  const students = useInfiniteQuery({
    queryKey: ["42", "project-students", slug, kind],
    enabled: !!token && valid,
    initialPageParam: 1,
    staleTime: 60_000,
    queryFn: ({ pageParam, signal }) => {
      if (!token || !valid) throw new Error("Choose a valid project student list.");
      return api<StudentPage>(
        token.accessToken,
        `/projects/${slug}/students/${kind}?page=${pageParam}`,
        signal,
      );
    },
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });
  const title = kind === "without_team" ? "Looking for a team" : "Eligible students";
  const total = students.data?.pages[0]?.total;
  const users = [
    ...new Map(
      students.data?.pages.flatMap((page) => page.users).map((user) => [user.login, user]),
    ).values(),
  ];
  return (
    <SafeAreaView edges={stackScreenEdges} style={styles.screen}>
      <Stack.Screen options={{ title }} />
      <FlatList
        {...insets}
        data={users}
        keyExtractor={(user) => user.login}
        contentContainerStyle={s.content}
        ListHeaderComponent={
          <View style={s.header}>
            {project && <Text style={s.project}>{project}</Text>}
            {total !== undefined ? (
              <Text style={styles.muted}>
                {total} {total === 1 ? "student" : "students"}{" "}
                {kind === "without_team"
                  ? "looking for a team"
                  : "can subscribe and have never enrolled"}
              </Text>
            ) : students.isPending && valid && token ? (
              <SkeletonBlock width="75%" height={20} radius={3} />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <QueryMessage
            pending={valid && !!token && students.isPending}
            error={students.error}
            empty={
              !valid
                ? "Invalid student list."
                : !token
                  ? "Sign in from Home to view students."
                  : "No students in this list."
            }
            skeleton={<StudentsSkeleton />}
          />
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Open ${item.login}'s profile. ${item.closed ? "Closed profile. " : ""}${item.available ? "Available" : "Unavailable"}.`}
            onPress={() => router.push({ pathname: "/profile/[id]", params: { id: item.login } })}
            style={({ pressed }) => [s.row, item.closed && s.closed, pressed && s.pressed]}
          >
            <StudentAvatar user={item} />
            <Text style={[s.login, s.copy]}>{item.login}</Text>
            <View
              accessible={false}
              style={[s.dot, { backgroundColor: item.available ? "#52b65a" : "#a1a1a1" }]}
            />
          </Pressable>
        )}
        ListFooterComponent={
          students.isFetchingNextPage ? (
            <StudentsSkeleton />
          ) : (
            <View style={s.footer}>
              {students.isError ? (
                <Button title="Try again" onPress={() => void students.refetch()} />
              ) : null}
              {students.hasNextPage ? (
                <Button
                  title="Load more"
                  onPress={() => void students.fetchNextPage({ cancelRefetch: false })}
                  disabled={students.isFetching}
                />
              ) : null}
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  content: { padding: 16, paddingBottom: 24 },
  header: { gap: 6, marginBottom: 16 },
  project: { fontSize: 18, fontWeight: "700", color: theme.ink },
  row: {
    minHeight: 64,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#e8f7f7",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  image: { width: 40, height: 40 },
  initials: { color: theme.tealText, fontWeight: "700" },
  copy: { flex: 1 },
  login: { color: theme.tealText, fontSize: 16, fontWeight: "600" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  closed: { opacity: 0.5 },
  pressed: { backgroundColor: "#e8f7f7" },
  footer: { paddingTop: 16, gap: 12 },
});
