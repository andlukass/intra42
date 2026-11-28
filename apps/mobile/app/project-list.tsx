import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { FlatList, Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { type ProjectListItem, type ProjectSort, useProfile, useProjectList } from "../src/api";
import { SearchField } from "../src/SearchField";
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

const xpFormat = new Intl.NumberFormat("en");
const sortOptions = [
  { value: "name", label: "Name", path: "M4 5V3h16v2M12 3v18M8 21h8" },
  { value: "duration", label: "Duration", path: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l4 3" },
  {
    value: "recommendation",
    label: "Recommendation",
    path: "M7 10H3v11h4V10Zm0 10h11a2 2 0 0 0 2-2l1-6a2 2 0 0 0-2-2h-5l1-5c0-2-3-3-3-1l-5 8",
  },
  { value: "registration", label: "Registration", path: "M5 21V3l14 4-14 5" },
  { value: "recent", label: "Newest", path: "M5 5h14v16H5V5Zm3-3v6m8-6v6M5 11h14" },
  { value: "xp", label: "XP", path: "m14 2-9 12h6l-1 8 9-12h-6l1-8Z" },
] as const;

function FilterOption({
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
      style={s.filterOption}
    >
      <Text style={[s.optionText, selected && s.selectedText]}>{label}</Text>
    </Pressable>
  );
}

function ProjectListSkeleton() {
  return (
    <View accessibilityLabel="Loading projects" accessibilityState={{ busy: true }}>
      {[0, 1, 2].map((index) => (
        <View key={index}>
          {index > 0 && <View style={s.separator} />}
          <View style={s.project}>
            <View style={s.projectCopy}>
              <SkeletonBlock width="65%" height={20} radius={3} />
              <SkeletonBlock width="48%" height={21} radius={3} />
              <View style={s.badges}>
                <SkeletonBlock width={110} height={22} radius={3} />
                <SkeletonBlock width={92} height={22} radius={3} />
              </View>
            </View>
            <SkeletonBlock width={8} height={18} radius={3} />
          </View>
        </View>
      ))}
    </View>
  );
}

export default function ProjectList() {
  const scrollInsets = useStackScrollInsets();
  const router = useRouter();
  const { token, loading } = useSession();
  const profile = useProfile();
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [cursusId, setCursusId] = useState<number>();
  const [recommended, setRecommended] = useState(false);
  const [sort, setSort] = useState<ProjectSort>("name");
  const cursusName = profile.data?.cursus_users?.find(({ cursus }) => cursus.id === cursusId)
    ?.cursus.name;
  const projects = useProjectList(search, sort, cursusId, cursusName, recommended);
  const list = useRef<FlatList<ProjectListItem>>(null);
  const user = profile.data;
  const cursusOptions = [
    ...new Map(user?.cursus_users?.map(({ cursus }) => [cursus.id, cursus])).values(),
  ];

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
              <SearchField
                label="Search projects"
                placeholder="Search projects…"
                value={input}
                onChangeText={setInput}
                onSubmit={submitSearch}
              />
              <View style={s.filterGroup}>
                <Text style={s.groupLabel}>SORT BY</Text>
                <View style={s.sortRow}>
                  {sortOptions.map((option) => (
                    <Pressable
                      key={option.value}
                      accessibilityRole="button"
                      accessibilityLabel={`Sort by ${option.label.toLowerCase()}`}
                      accessibilityState={{ selected: option.value === sort }}
                      onPress={() => {
                        setSort(option.value);
                        list.current?.scrollToOffset({ offset: 0, animated: false });
                      }}
                      style={s.sortOption}
                    >
                      <Svg width={23} height={23} viewBox="0 0 24 24" accessible={false}>
                        <Path
                          d={option.path}
                          fill="none"
                          stroke={option.value === sort ? theme.tealText : "#626269"}
                          strokeWidth={1.6}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </Svg>
                    </Pressable>
                  ))}
                </View>
                <Text style={s.sortCaption}>
                  {sortOptions.find((option) => option.value === sort)?.label}
                </Text>
              </View>
              <View style={s.filterGroup}>
                <Text style={s.groupLabel}>FILTERS</Text>
                <View style={s.optionRow}>
                  <FilterOption
                    label="None"
                    selected={!recommended}
                    onPress={() => {
                      setRecommended(false);
                      list.current?.scrollToOffset({ offset: 0, animated: false });
                    }}
                  />
                  <FilterOption
                    label="Recommended projects"
                    selected={recommended}
                    onPress={() => {
                      setRecommended(true);
                      list.current?.scrollToOffset({ offset: 0, animated: false });
                    }}
                  />
                </View>
              </View>
              {cursusOptions.length ? (
                <View style={s.filterGroup}>
                  <Text style={s.groupLabel}>CURSUS</Text>
                  <ScrollView
                    horizontal
                    keyboardShouldPersistTaps="handled"
                    showsHorizontalScrollIndicator={false}
                  >
                    <FilterOption
                      label="All"
                      selected={cursusId === undefined}
                      onPress={() => setCursusId(undefined)}
                    />
                    {cursusOptions.map((cursus) => (
                      <FilterOption
                        key={cursus.id}
                        label={cursus.name}
                        selected={cursusId === cursus.id}
                        onPress={() => setCursusId(cursus.id)}
                      />
                    ))}
                  </ScrollView>
                </View>
              ) : null}
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={s.empty}>
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
              skeleton={<ProjectListSkeleton />}
            />
            {token && error ? (
              <Button title="Try again" onPress={() => void projects.refetch()} />
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const enrollment = user?.projects_users?.find(
            (entry) => entry.project.slug === item.slug || entry.project.id === item.id,
          );
          const status =
            item.registration ?? enrollment?.status.replaceAll("_", " ") ?? "Not registered";
          const result =
            item.result ??
            (enrollment?.marked && enrollment.final_mark != null
              ? `(${enrollment["validated?"] ? "succeeded" : "failed"} with ${enrollment.final_mark}%)`
              : undefined);
          const success = item.resultSuccess ?? enrollment?.["validated?"];
          const recommendationStyle =
            item.recommendation === "Recommended"
              ? s.success
              : item.recommendation === "Forbidden"
                ? s.failure
                : s.caution;
          const metadata = [
            item.duration,
            item.xp == null ? null : `${xpFormat.format(item.xp)} XP`,
          ]
            .filter(Boolean)
            .join(" · ");
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
                {item.parent ? <Text style={s.parent}>{item.parent}</Text> : null}
                <Text style={[s.name, result && (success ? s.success : s.failure)]}>
                  {item.name}
                  {result ? ` ${result}` : ""}
                </Text>
                {metadata ? <Text style={styles.muted}>{metadata}</Text> : null}
                <View style={s.badges}>
                  {item.recommendation ? (
                    <Text style={[s.badge, recommendationStyle]}>{item.recommendation}</Text>
                  ) : null}
                  <Text
                    style={[s.badge, status.toLowerCase() === "finished" ? s.success : s.status]}
                  >
                    {status}
                  </Text>
                </View>
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
              {projects.isFetchingNextPage ? (
                <SkeletonBlock height={44} />
              ) : (
                <Button
                  title="Load more"
                  disabled={projects.isFetching}
                  onPress={() => void projects.fetchNextPage({ cancelRefetch: false })}
                />
              )}
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  empty: { gap: 16, marginBottom: 12 },
  content: { padding: 12, paddingBottom: 24 },
  filters: {
    gap: 16,
    marginBottom: 12,
    padding: 12,
    backgroundColor: theme.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  filterGroup: { gap: 5 },
  groupLabel: { color: "#626269", fontSize: 11 },
  sortRow: { flexDirection: "row" },
  sortOption: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: theme.border,
  },
  sortCaption: { color: theme.tealText, fontSize: 12 },
  optionRow: { flexDirection: "row", flexWrap: "wrap" },
  filterOption: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: theme.border,
  },
  optionText: { color: "#626269", fontSize: 14 },
  selectedText: { color: theme.tealText },
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
  parent: { color: theme.muted, fontSize: 12 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 5 },
  badge: { fontSize: 13, fontWeight: "700", paddingVertical: 3 },
  success: { color: "#52b65a" },
  failure: { color: "#df5b70" },
  caution: { color: "#cf9477" },
  name: { color: theme.tealText, fontSize: 16, fontWeight: "700" },
  status: { color: "#69696e", fontSize: 13, fontWeight: "600", textTransform: "capitalize" },
  arrow: { color: theme.tealText, fontSize: 22 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: theme.border },
  footer: { paddingTop: 12, gap: 8 },
});
