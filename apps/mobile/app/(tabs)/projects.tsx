import { useRouter } from "expo-router";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useProfile } from "../../src/api";
import { useSession } from "../../src/session";
import { theme } from "../../src/theme";
import { QueryMessage, Screen, SkeletonList, styles } from "../../src/ui";

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
      {status && (
        <View style={s.teamIcon}>
          <Svg width={18} height={18} viewBox="0 0 24 24" accessible={false}>
            <Path fill={theme.tealText} d="M14 1 3 15h8l-1 8L21 9h-8l1-8Z" />
          </Svg>
        </View>
      )}
      <View style={s.rowCopy}>
        <Text style={[s.name, status && s.teamName]}>{name}</Text>
        {status && <Text style={s.status}>{status}</Text>}
      </View>
      <Text style={s.link} accessible={false}>
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
      <Text accessibilityRole="header" style={styles.title}>
        Projects
      </Text>
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
              skeleton={<SkeletonList cardHeight={64} />}
            />
          )}
          <View style={s.links}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/holy-graph")}
              style={({ pressed }) => [s.shortcut, s.graphShortcut, pressed && s.pressed]}
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
            {recommendations.map(({ name, slug }, index) => (
              <View key={slug} style={index > 0 ? s.divider : undefined}>
                <ProjectRow name={name} onPress={() => showProject(slug)} />
              </View>
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
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  teamRow: {
    minHeight: 66,
    backgroundColor: "#e8f7f7",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#c2e7e7",
  },
  teamIcon: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: "#d2efef",
    alignItems: "center",
    justifyContent: "center",
  },
  rowCopy: { flex: 1, gap: 3 },
  name: { color: theme.ink, fontSize: 15, fontWeight: "500" },
  teamName: { fontWeight: "700" },
  status: { color: theme.tealText, fontSize: 13, fontWeight: "600" },
  recommendations: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    overflow: "hidden",
  },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.border },
  pressed: { backgroundColor: "#e2f2f2" },
  links: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  shortcut: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 9,
  },
  link: { color: theme.tealText, fontSize: 14, fontWeight: "600", flexShrink: 1 },
  graphShortcut: { borderColor: "#c2e7e7", backgroundColor: "#e8f7f7" },
});
