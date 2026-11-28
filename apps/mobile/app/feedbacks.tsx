import { Link, Stack } from "expo-router";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  type CompletedEvaluation,
  type ProjectDetails,
  useFeedbackLogs,
  useIntraQuery,
  useProfile,
} from "../src/api";
import { useSession } from "../src/session";
import { theme } from "../src/theme";
import {
  Button,
  QueryMessage,
  SkeletonBlock,
  SkeletonList,
  stackScreenEdges,
  styles,
  useStackScrollInsets,
} from "../src/ui";
import { useProfileRoute } from "../src/useProfileRoute";

const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

function ScoreComment({
  value,
  label,
  comment,
}: {
  value?: number | null;
  label: string;
  comment?: string | null;
}) {
  if (value == null && !comment) return null;
  return (
    <View style={feedbackStyles.commentRow}>
      {value != null && (
        <Text accessibilityLabel={label} style={feedbackStyles.badge}>
          {label}
        </Text>
      )}
      {comment ? <Text style={feedbackStyles.comment}>{comment}</Text> : null}
    </View>
  );
}

function ProfileLink({ user, label }: { user: { login: string }; label?: string }) {
  return (
    <Link
      href={{ pathname: "/profile/[id]", params: { id: user.login } }}
      style={feedbackStyles.profileLink}
    >
      {label ?? user.login}
    </Link>
  );
}

function FeedbackEntry({ item }: { item: CompletedEvaluation }) {
  const project = useIntraQuery<ProjectDetails>(
    item.team?.project_id ? `/projects/${item.team.project_id}` : undefined,
  );
  const members = item.correcteds?.length ? item.correcteds : (item.team?.users ?? []);
  const leader = item.team?.users?.find((user) => user.leader) ?? members[0];
  return (
    <View style={feedbackStyles.entry}>
      <View style={feedbackStyles.summary}>
        <View style={feedbackStyles.projectRow}>
          <View style={feedbackStyles.projectName}>
            {project.isLoading ? (
              <SkeletonBlock width={160} height={20} />
            ) : (
              <Text accessibilityRole="header" style={feedbackStyles.project}>
                {project.data?.name ?? "Project unavailable"}
              </Text>
            )}
          </View>
          <View style={feedbackStyles.projectActions}>
            {item.flag && (
              <Text
                accessibilityLabel={`Evaluation result: ${item.flag.name}`}
                style={[feedbackStyles.flag, !item.flag.positive && feedbackStyles.negativeFlag]}
              >
                {item.flag.name.toLowerCase().replace(/\s+/g, "_")}
              </Text>
            )}
            {item.team?.project_id && leader ? (
              <Link
                href={{
                  pathname: "/project/[slug]",
                  params: { slug: String(item.team.project_id), userId: String(leader.id) },
                }}
                accessibilityLabel={`Show ${project.data?.name ?? "project"} for ${leader.login}`}
                style={feedbackStyles.show}
              >
                show
              </Link>
            ) : null}
          </View>
        </View>
        <Text style={feedbackStyles.context}>
          {item.corrector ? <ProfileLink user={item.corrector} /> : "Unknown evaluator"}
          {" evaluated "}
          {leader ? (
            <ProfileLink user={leader} label={item.team?.name ?? `${leader.login}'s group`} />
          ) : (
            "Unknown group"
          )}
          {members
            .filter((user) => user.id !== leader?.id)
            .map((user) => (
              <Text key={user.id}>
                {", "}
                <ProfileLink user={user} />
              </Text>
            ))}
        </Text>
        <Text style={feedbackStyles.date}>
          {"Scheduled on "}
          {Number.isFinite(Date.parse(item.begin_at))
            ? dateFormat.format(new Date(item.begin_at))
            : "Date unavailable"}
        </Text>
      </View>
      <ScoreComment value={item.final_mark} label={`${item.final_mark} %`} comment={item.comment} />
      {item.feedbacks?.length ? (
        item.feedbacks.map((entry) => (
          <ScoreComment
            key={entry.id}
            value={entry.rating}
            label={`${entry.rating} / 5`}
            comment={entry.comment}
          />
        ))
      ) : (
        <ScoreComment
          value={item.feedback_rating}
          label={`${item.feedback_rating} / 5`}
          comment={item.feedback}
        />
      )}
    </View>
  );
}

export default function FeedbackLogs() {
  const scrollInsets = useStackScrollInsets();
  const { token, loading } = useSession();
  const profile = useProfileRoute();
  const ownProfile = useProfile();
  const title = profile.data
    ? profile.data.id === ownProfile.data?.id
      ? "Feedbacks you made"
      : `Feedbacks ${profile.data.login} made`
    : "Feedbacks";
  const feedback = useFeedbackLogs(token ? profile.data?.id : undefined);
  const error = profile.error ?? feedback.error;
  const entries = token ? feedback.data?.pages.flat() : undefined;
  const pending = loading || (!!token && !error && (profile.isPending || feedback.isPending));

  return (
    <SafeAreaView edges={stackScreenEdges} style={[styles.screen, feedbackStyles.screen]}>
      <Stack.Screen options={{ title }} />
      <FlatList
        {...scrollInsets}
        data={entries}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={feedbackStyles.content}
        ListEmptyComponent={
          <>
            <QueryMessage
              pending={pending}
              error={error}
              empty={token ? "No completed evaluations." : "Sign in to view feedback logs."}
              skeleton={<SkeletonList cardHeight={138} />}
            />
            {token && error && (
              <Button
                title="Try again"
                onPress={() => void (profile.error ? profile.refetch() : feedback.refetch())}
              />
            )}
          </>
        }
        renderItem={({ item }) => <FeedbackEntry item={item} />}
        ListFooterComponent={
          feedback.isFetchingNextPage ? (
            <SkeletonList cardHeight={138} />
          ) : feedback.hasNextPage ? (
            <View style={feedbackStyles.feedback}>
              {feedback.isFetchNextPageError && (
                <Text accessibilityRole="alert" style={styles.muted}>
                  {feedback.error.message}
                </Text>
              )}
              <Button
                title="Load more"
                disabled={feedback.isFetching}
                onPress={() => void feedback.fetchNextPage()}
              />
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const feedbackStyles = StyleSheet.create({
  screen: { backgroundColor: theme.surface },
  content: { paddingHorizontal: theme.spacing, paddingBottom: 24 },
  entry: {
    paddingHorizontal: 12,
    paddingVertical: 20,
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  summary: { gap: 5 },
  projectRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  projectName: { flexGrow: 1, flexShrink: 1, maxWidth: "100%" },
  projectActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: "auto",
    maxWidth: "100%",
  },
  flag: {
    flexShrink: 1,
    color: theme.tealText,
    backgroundColor: "#e0f4f5",
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 6,
    fontSize: 14,
    lineHeight: 20,
  },
  negativeFlag: { color: "#c83c50", backgroundColor: "#f2cbd0" },
  show: {
    color: "#fff",
    backgroundColor: "#57bfdc",
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 15,
    lineHeight: 20,
  },
  project: { color: "#2d2d35", fontSize: 17, lineHeight: 23, fontWeight: "700" },
  context: { color: "#2d2d35", fontSize: 15, lineHeight: 23 },
  profileLink: { color: theme.tealText, fontWeight: "700" },
  date: { color: theme.muted, fontSize: 13, lineHeight: 18 },
  commentRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  badge: {
    minWidth: 64,
    color: theme.tealText,
    backgroundColor: "#e0f4f5",
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 3,
    textAlign: "center",
    fontSize: 16,
    lineHeight: 22,
    fontVariant: ["tabular-nums"],
  },
  comment: { flex: 1, color: "#2d2d35", fontSize: 15, lineHeight: 22, paddingTop: 3 },
  feedback: { gap: 6, paddingVertical: 14 },
});
