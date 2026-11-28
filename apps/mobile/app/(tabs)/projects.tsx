import { useRouter } from "expo-router";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useProfile } from "../../src/api";
import { useSession } from "../../src/session";
import { theme } from "../../src/theme";
import { QueryMessage, Screen, SkeletonBlock, styles } from "../../src/ui";

const portal = "https://projects.intra.42.fr";
const recommendations = [
  { name: "nm", slug: "nm" },
  { name: "ft_linear_regression", slug: "42cursus-ft_linear_regression" },
  { name: "matcha", slug: "42cursus-matcha" },
  { name: "Python for Data Science", slug: "python-for-data-science" },
  { name: "scop", slug: "42cursus-scop" },
  { name: "freddie-mercury", slug: "freddie-mercury" },
  { name: "corewar", slug: "42cursus-corewar" },
  { name: "malloc", slug: "42cursus-malloc" },
];
const openStatuses = new Map([
  ["creating_group", "Creating group"],
  ["searching_a_group", "Looking for a group"],
  ["in_progress", "In progress"],
  ["waiting_for_correction", "Waiting for correction"],
  ["waiting_for_correction_pool", "Waiting for correction"],
]);

function openProjectPage(path: string) {
  void Linking.openURL(portal + path).catch(() => Alert.alert("Could not open 42 Projects."));
}

function ProjectRow({
  name,
  status,
  onPress,
}: {
  name: string;
  status?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={status ? `${name}, ${status}` : name}
      onPress={onPress}
      style={({ pressed }) => [s.row, status && s.teamRow, pressed && s.pressed]}
    >
      <Svg width={24} height={24} viewBox="0 0 24 24" accessible={false}>
        <Path
          fill="#fff"
          d={
            status
              ? "M14 1 3 15h8l-1 8L21 9h-8l1-8Z"
              : "m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z"
          }
        />
      </Svg>
      <View style={s.rowCopy}>
        <Text style={s.name}>{name}</Text>
        {status && <Text style={s.status}>{status}</Text>}
      </View>
      <Text style={s.chevron} accessible={false}>
        ›
      </Text>
    </Pressable>
  );
}

export default function Projects() {
  const router = useRouter();
  const { token } = useSession();
  const profile = useProfile();
  const teams = profile.data?.projects_users?.filter(
    ({ status, marked }) => !marked && openStatuses.has(status),
  );
  function showProject(slug: string) {
    router.push({ pathname: "/project/[slug]", params: { slug } });
  }

  return (
    <Screen>
      {!token ? (
        <Text style={styles.muted}>Sign in from Home to view your projects.</Text>
      ) : (
        <>
          <Text accessibilityRole="header" style={s.heading}>
            Open teams
          </Text>
          {teams?.length ? (
            <View style={s.teams}>
              {teams.map(({ id, project, status }) => (
                <ProjectRow
                  key={id}
                  name={project.name}
                  status={openStatuses.get(status)}
                  onPress={() => {
                    const slug = project.slug ?? project.id?.toString();
                    if (slug) showProject(slug);
                    else openProjectPage("/");
                  }}
                />
              ))}
            </View>
          ) : (
            <QueryMessage
              pending={profile.isPending}
              error={profile.error}
              empty="No open teams."
              skeleton={
                <View
                  style={s.teams}
                  accessibilityLabel="Loading open teams"
                  accessibilityState={{ busy: true }}
                >
                  {[0, 1, 2].map((index) => (
                    <View key={index} style={[s.row, s.teamRow]}>
                      <SkeletonBlock width={24} height={24} radius={3} color="#ffffff55" />
                      <View style={s.rowCopy}>
                        <SkeletonBlock width="70%" height={20} radius={3} color="#ffffff55" />
                        <SkeletonBlock width="40%" height={17} radius={3} color="#ffffff55" />
                      </View>
                      <SkeletonBlock width={8} height={18} radius={3} color="#ffffff55" />
                    </View>
                  ))}
                </View>
              }
            />
          )}
          <View style={s.links}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/holy-graph")}
              style={({ pressed }) => [s.shortcut, pressed && s.pressed]}
            >
              <Text style={s.link}>Holy Graph</Text>
              <Text style={s.link} accessible={false}>
                ›
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/project-list")}
              style={({ pressed }) => [s.shortcut, pressed && s.pressed]}
            >
              <Text style={s.link}>Project list</Text>
              <Text style={s.link} accessible={false}>
                ›
              </Text>
            </Pressable>
          </View>
          <Text accessibilityRole="header" style={s.heading}>
            Recommended projects
          </Text>
          <View style={s.recommendations}>
            {recommendations.map(({ name, slug }) => (
              <ProjectRow key={slug} name={name} onPress={() => showProject(slug)} />
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  heading: { color: theme.ink, fontSize: 18, fontWeight: "700" },
  teams: { gap: 8 },
  row: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#747474",
    borderRadius: 4,
  },
  teamRow: { backgroundColor: theme.teal, minHeight: 70 },
  rowCopy: { flex: 1, gap: 4 },
  name: { color: "#fff", fontSize: 16, fontWeight: "700" },
  status: { color: "#fff", fontSize: 14, fontWeight: "500" },
  chevron: { color: "#fff", fontSize: 22 },
  recommendations: { gap: 8 },
  pressed: { opacity: 0.75 },
  links: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  shortcut: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: theme.teal,
    borderRadius: 2,
  },
  link: { color: "#fff", fontSize: 14, fontWeight: "600", flexShrink: 1 },
});
