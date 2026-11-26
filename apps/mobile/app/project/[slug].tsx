import { useLocalSearchParams, useRouter } from "expo-router";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import {
  type ProjectDetails,
  type ProjectEnrollment,
  useIntraQuery,
  useProfile,
} from "../../src/api";
import { useSession } from "../../src/session";
import { theme } from "../../src/theme";
import { QueryMessage, Screen, SkeletonList, styles } from "../../src/ui";

const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

function lockLabel(lockedAt: string) {
  const date = new Date(lockedAt);
  if (!Number.isFinite(date.getTime())) return "Team locked";
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days === 0) return "Locked today";
  if (days > 0 && days < 30) return `Locked ${days} ${days === 1 ? "day" : "days"} ago`;
  return `Locked on ${dateFormat.format(date)}`;
}

export default function ProjectPage() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { token } = useSession();
  const validSlug = typeof slug === "string" && /^[a-z0-9_-]+$/i.test(slug);
  const profile = useProfile();
  const projectQuery = useIntraQuery<ProjectDetails>(validSlug ? `/projects/${slug}` : undefined);
  const project = projectQuery.data;
  const user = profile.data;
  const enrollment = user?.projects_users?.find(
    (entry) => entry.project.slug === slug || (project && entry.project.id === project.id),
  );
  const enrollmentQuery = useIntraQuery<ProjectEnrollment>(
    enrollment ? `/projects_users/${enrollment.id}` : undefined,
  );
  const record = enrollmentQuery.data;
  const team = record?.teams?.find(({ id }) => id === record.current_team_id);
  const campusId =
    user?.campus_users?.find(({ is_primary }) => is_primary)?.campus_id ?? user?.campus?.[0]?.id;
  const sessions = project?.project_sessions ?? [];
  const session =
    sessions.find(({ id }) => id === team?.project_session_id) ??
    sessions.find((item) => item.campus_id === campusId && item.cursus_id === 21) ??
    sessions.find((item) => item.campus_id === campusId) ??
    sessions.find((item) => item.campus_id == null) ??
    sessions[0];
  const estimate =
    session?.estimate_time?.trim() ||
    (session?.duration_days ? `${session.duration_days} days` : null);
  const xp = session?.difficulty ?? project?.difficulty;
  const referenceSession = session?.campus_id != null && session.campus_id !== campusId;
  const meta = [
    session?.solo === true ? "Solo" : session?.solo === false ? "Team project" : null,
    estimate ? `About ${estimate}` : null,
    xp == null ? null : `${xp.toLocaleString("en-GB")} XP`,
  ]
    .filter(Boolean)
    .join("  ·  ");
  const status = enrollment?.["validated?"]
    ? "Validated"
    : enrollment?.marked
      ? "Evaluated"
      : enrollment
        ? "Subscribed"
        : "Project overview";

  if (!token || !validSlug || !project) {
    return (
      <Screen underHeader>
        {!token || !validSlug ? (
          <Text style={styles.muted}>
            {!token ? "Sign in from Home to view project details." : "Invalid project."}
          </Text>
        ) : (
          <QueryMessage
            pending={projectQuery.isPending}
            error={projectQuery.error}
            empty="Project not available."
          />
        )}
      </Screen>
    );
  }

  function openOfficial() {
    if (!project) return;
    const encoded = encodeURIComponent(project.slug);
    const path =
      enrollment && user?.login
        ? `/${encoded}/${encodeURIComponent(user.login)}`
        : `/projects/${encoded}`;
    void Linking.openURL(`https://projects.intra.42.fr${path}`).catch(() =>
      Alert.alert("Could not open 42 Projects."),
    );
  }

  return (
    <Screen underHeader>
      <Text accessibilityRole="header" style={s.title}>
        {enrollment && user ? `${user.login}'s ${project.name}` : project.name}
      </Text>
      <View style={[s.summary, enrollment && s.enrolled]}>
        {enrollment && (
          <Svg width={26} height={26} viewBox="0 0 24 24" accessible={false}>
            <Path fill={theme.tealText} d="M14 1 3 15h8l-1 8L21 9h-8l1-8Z" />
          </Svg>
        )}
        <View style={s.summaryCopy}>
          <Text style={s.summaryTitle}>{status}</Text>
          {meta ? <Text style={styles.muted}>{meta}</Text> : null}
          {referenceSession ? <Text style={styles.muted}>Reference session</Text> : null}
          {enrollment?.final_mark != null && (
            <Text style={styles.muted}>Final mark: {enrollment.final_mark}</Text>
          )}
        </View>
      </View>
      {enrollment && (
        <View style={s.panel}>
          {team ? (
            <>
              <Text accessibilityRole="header" style={s.team}>
                {team.name}
              </Text>
              {team.locked_at && <Text style={styles.muted}>{lockLabel(team.locked_at)}</Text>}
            </>
          ) : (
            <QueryMessage
              pending={enrollmentQuery.isPending}
              error={enrollmentQuery.error}
              empty="No current team."
              skeleton={<SkeletonList cardHeight={54} />}
            />
          )}
        </View>
      )}
      {project.children?.length ? (
        <View style={s.panel}>
          <Text accessibilityRole="header" style={s.heading}>
            Project steps
          </Text>
          {project.children.map((child) => (
            <Pressable
              key={child.id}
              accessibilityRole="button"
              onPress={() =>
                router.push({ pathname: "/project/[slug]", params: { slug: child.slug } })
              }
              style={({ pressed }) => [s.step, pressed && s.pressed]}
            >
              <Text style={s.stepName}>{child.name}</Text>
              <Text style={s.link} accessible={false}>
                ›
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Pressable
        accessibilityRole="link"
        onPress={openOfficial}
        style={({ pressed }) => [s.official, pressed && s.pressed]}
      >
        <Text style={s.link}>Open in 42 ↗</Text>
      </Pressable>
      {session?.description ? (
        <View style={s.panel}>
          <Text accessibilityRole="header" style={s.heading}>
            About the project
          </Text>
          <Text style={s.description}>{session.description}</Text>
          {session.objectives?.length ? (
            <Text style={styles.muted}>{session.objectives.join(" · ")}</Text>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  title: { color: theme.tealText, fontSize: 25, fontWeight: "800", marginTop: 4 },
  panel: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    gap: 8,
  },
  summary: {
    padding: 14,
    gap: 12,
    alignItems: "center",
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: theme.surface,
    borderColor: theme.border,
  },
  enrolled: { backgroundColor: "#e8f7f7", borderColor: "#c2e7e7" },
  summaryCopy: { flex: 1, gap: 3 },
  summaryTitle: { color: theme.tealText, fontSize: 17, fontWeight: "700" },
  team: { color: theme.tealText, fontSize: 18, fontWeight: "700" },
  heading: { color: theme.ink, fontSize: 17, fontWeight: "700" },
  description: { ...styles.text, lineHeight: 23 },
  step: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  stepName: { color: theme.tealText, flex: 1, fontSize: 15, fontWeight: "600" },
  official: {
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 9,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  },
  pressed: { backgroundColor: "#e8f7f7" },
  link: { color: theme.tealText, fontWeight: "700", fontSize: 15 },
});
