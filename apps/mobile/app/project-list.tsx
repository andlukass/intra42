import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
  FlatList,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { type ProjectDetails, type ProjectSort, useProfile, useProjectList } from "../src/api";
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

const xpFormat = new Intl.NumberFormat("en");
const sortOptions = [
  { value: "name", label: "Name A–Z" },
  { value: "recent", label: "Newest" },
] as const;

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[s.chip, selected && s.selected]}
    >
      <Text style={[s.chipText, selected && s.selectedText]}>{label}</Text>
    </Pressable>
  );
}

function projectMetadata(project: ProjectDetails, campusId?: number, cursusId?: number) {
  const sessions = project.project_sessions?.filter(
    (session) => !cursusId || !session.cursus_id || session.cursus_id === cursusId,
  );
  const session =
    sessions?.find((item) => item.campus_id === campusId) ??
    sessions?.find((item) => item.campus_id == null);
  const duration =
    session?.estimate_time?.trim() ||
    (session?.duration_days ? `${session.duration_days} days` : "");
  const xp = session?.difficulty ?? project.difficulty;
  return [duration, xp == null ? "" : `${xpFormat.format(xp)} XP`].filter(Boolean).join(" · ");
}

export default function ProjectList() {
  const scrollInsets = useStackScrollInsets();
  const router = useRouter();
  const { token, loading } = useSession();
  const profile = useProfile();
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [cursusId, setCursusId] = useState<number>();
  const [sort, setSort] = useState<ProjectSort>("name");
  const projects = useProjectList(search, sort, cursusId);
  const list = useRef<FlatList<ProjectDetails>>(null);
  const user = profile.data;
  const campusId =
    user?.campus_users?.find((item) => item.is_primary)?.campus_id ?? user?.campus?.[0]?.id;
  const cursusOptions = [
    ...new Map(user?.cursus_users?.map(({ cursus }) => [cursus.id, cursus])).values(),
  ];
  const enrollments = new Map(user?.projects_users?.map((entry) => [entry.project.id, entry]));
  const items = token ? projects.data?.pages.flatMap((page) => page.items) : undefined;
  const error = projects.isError ? projects.error : null;

  function submitSearch() {
    setSearch(input.trim());
    list.current?.scrollToOffset({ offset: 0, animated: false });
    Keyboard.dismiss();
  }

  return (
    <SafeAreaView edges={stackScreenEdges} style={styles.screen}>
      <FlatList
        {...scrollInsets}
        ref={list}
        data={items}
        keyExtractor={(project) => String(project.id)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.content}
        ListHeaderComponent={
          token ? (
            <View style={s.filters}>
              <View style={s.searchRow}>
                <TextInput
                  accessibilityLabel="Search projects"
                  placeholder="Search projects…"
                  placeholderTextColor={theme.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={input}
                  onChangeText={setInput}
                  onSubmitEditing={submitSearch}
                  returnKeyType="search"
                  style={s.input}
                />
                <Button title="Search" onPress={submitSearch} />
              </View>
              {cursusOptions.length ? (
                <ScrollView
                  horizontal
                  keyboardShouldPersistTaps="handled"
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.chips}
                >
                  <Chip
                    label="All cursus"
                    selected={cursusId === undefined}
                    onPress={() => setCursusId(undefined)}
                  />
                  {cursusOptions.map((cursus) => (
                    <Chip
                      key={cursus.id}
                      label={cursus.name}
                      selected={cursusId === cursus.id}
                      onPress={() => setCursusId(cursus.id)}
                    />
                  ))}
                </ScrollView>
              ) : null}
              <View style={s.sortRow}>
                <Text style={styles.muted}>Sort by</Text>
                {sortOptions.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    selected={option.value === sort}
                    onPress={() => setSort(option.value)}
                  />
                ))}
              </View>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={s.filters}>
            <QueryMessage
              pending={loading || (!!token && projects.isPending)}
              error={error}
              empty={
                !token
                  ? "Sign in from Home to view projects."
                  : search
                    ? "No projects match your search."
                    : "No projects available."
              }
              skeleton={<SkeletonList cardHeight={62} />}
            />
            {token && error ? (
              <Button title="Try again" onPress={() => void projects.refetch()} />
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const enrollment = enrollments.get(item.id);
          const status =
            enrollment?.["validated?"] === true
              ? "Validated"
              : enrollment?.marked
                ? "Evaluated"
                : enrollment?.status.replaceAll("_", " ");
          const metadata = projectMetadata(item, campusId, cursusId);
          return (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: "/project/[slug]",
                  params: { slug: item.slug || String(item.id) },
                })
              }
              style={({ pressed }) => [s.project, pressed && s.pressed]}
            >
              <View style={s.projectCopy}>
                <Text style={s.name}>{item.name}</Text>
                {metadata ? <Text style={styles.muted}>{metadata}</Text> : null}
                {status ? <Text style={s.status}>{status}</Text> : null}
              </View>
              <Text style={s.arrow} accessible={false}>
                ›
              </Text>
            </Pressable>
          );
        }}
        ItemSeparatorComponent={() => <View style={s.separator} />}
        ListFooterComponent={
          items?.length && projects.hasNextPage ? (
            <View style={s.footer}>
              {projects.isFetchNextPageError ? (
                <Text style={styles.muted}>Could not load more projects.</Text>
              ) : null}
              <Button
                title={projects.isFetchingNextPage ? "Loading…" : "Load more"}
                disabled={projects.isFetching}
                onPress={() => void projects.fetchNextPage({ cancelRefetch: false })}
              />
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  content: { padding: 12, paddingBottom: 24 },
  filters: { gap: 8, marginBottom: 12 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: {
    flex: 1,
    minHeight: 48,
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 12,
    color: theme.ink,
    fontSize: 16,
  },
  chips: { gap: 8 },
  sortRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  chip: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 9,
  },
  selected: { backgroundColor: "#e8f7f7", borderColor: "#c2e7e7" },
  chipText: { color: theme.ink, fontSize: 14 },
  selectedText: { color: theme.tealText, fontWeight: "700" },
  project: {
    minHeight: 58,
    justifyContent: "space-between",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    backgroundColor: theme.surface,
  },
  pressed: { backgroundColor: "#e8f7f7" },
  projectCopy: { flex: 1, gap: 3 },
  name: { color: theme.ink, fontSize: 16, fontWeight: "700" },
  status: { color: theme.tealText, fontSize: 13, fontWeight: "600", textTransform: "capitalize" },
  arrow: { color: theme.tealText, fontSize: 22 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: theme.border },
  footer: { paddingTop: 12, gap: 8 },
});
