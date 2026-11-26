import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { AchievementRow } from "../achievements/AchievementRow";
import { earnedAchievements } from "../achievements/earned";
import {
  type Evaluation,
  useAchievementAwards,
  useAgenda,
  useIntraQuery,
  useLogtime,
  useProfile,
  useProfileCoalitions,
} from "../api";
import { useSession } from "../session";
import { theme } from "../theme";
import { Button, Card, QueryMessage, Screen, SkeletonBlock, SkeletonList, styles } from "../ui";
import { useDecodedAvatar } from "../useDecodedAvatar";
import { defaultProfileCourse, profilePalette } from "./coalition";
import { EventCard, EventCardSkeleton } from "./EventCard";
import { Logtime, LogtimeSkeleton } from "./Logtime";
import { ProfileCard, ProfileCardSkeleton } from "./ProfileCard";

const projectActions = [
  { label: "Evaluation logs", href: "/evaluation-logs" },
  { label: "Feedback logs", href: "/feedbacks" },
  { label: "Quests", href: "/quests" },
] as const;

export function ProfileScreen({ userId }: { userId?: number }) {
  const ownHome = userId === undefined;
  const router = useRouter();
  const { token, loading, signIn, logout } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCursusId, setSelectedCursusId] = useState<number>();
  const profile = useProfile(userId);
  const { refetch: refreshProfile } = profile;
  const user = profile.data;
  const awards = useAchievementAwards(user?.id);
  const achievements = earnedAchievements(user?.achievements, awards.data);
  const ongoingProjects = user?.projects_users?.filter(
    ({ marked, status }) =>
      !marked && (status === "in_progress" || status === "waiting_for_correction"),
  );
  const avatar = useDecodedAvatar(user);
  const coalitions = useProfileCoalitions(user);
  const courses = user?.cursus_users ?? [];
  const course =
    courses.find(({ cursus }) => cursus.id === selectedCursusId) ??
    defaultProfileCourse(courses, coalitions.byCourse);
  const palette = profilePalette(course && coalitions.byCourse.get(course.cursus.id)?.color);
  const campus =
    user?.campus?.find(
      (item) => item.id === user.campus_users?.find((entry) => entry.is_primary)?.campus_id,
    ) ?? user?.campus?.[0];
  const events = useAgenda(ownHome ? campus?.id : undefined);
  const agenda = events.data?.pages.flatMap((page) => page.items);
  const evaluations = useIntraQuery<Evaluation[]>(
    ownHome && user ? `/users/${user.id}/scale_teams?sort=-begin_at&page[size]=30` : undefined,
  );
  const locations = useLogtime(user?.id);

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([
        refreshProfile(),
        coalitions.refresh?.(),
        ownHome && campus && events.refetch(),
        ownHome && user && evaluations.refetch(),
        user && locations.refetch(),
        user && awards.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }

  const waitingForContent =
    !!token &&
    (profile.isPending ||
      (!!user &&
        (avatar.loading ||
          coalitions.loading ||
          locations.isPending ||
          (ownHome && (evaluations.isPending || (!!campus && events.isPending))))));

  if (loading || waitingForContent)
    return (
      <Screen scrollUnderStatusBar={ownHome}>
        <View
          accessible
          accessibilityLabel="Loading profile"
          accessibilityState={{ busy: true }}
          style={homeStyles.skeleton}
        >
          <ProfileCardSkeleton palette={palette} />
          {ownHome && (
            <>
              <View style={styles.card}>
                <SkeletonBlock width="55%" height={19} />
                <View style={homeStyles.evaluationActions}>
                  <SkeletonBlock width={112} height={44} radius={0} />
                  <SkeletonBlock width={109} height={44} radius={0} />
                </View>
                <SkeletonBlock width="68%" height={18} />
              </View>
              <View style={styles.card}>
                <SkeletonBlock width="24%" height={19} />
                {(agenda?.map((event) => event.id) ?? [1, 2, 3]).map((id) => (
                  <EventCardSkeleton key={id} />
                ))}
                {(events.hasNextPage || events.isPending) && (
                  <View style={homeStyles.loadMore}>
                    <SkeletonBlock width={72} height={18} />
                  </View>
                )}
              </View>
            </>
          )}
          <View style={styles.card}>
            <SkeletonBlock width="48%" height={19} />
            {ownHome && (
              <View style={homeStyles.evaluationActions}>
                <SkeletonBlock width={120} height={44} radius={0} />
                <SkeletonBlock width={112} height={44} radius={0} />
                <SkeletonBlock width={62} height={44} radius={0} />
              </View>
            )}
            <SkeletonBlock width="68%" height={18} />
          </View>
          <View style={styles.card}>
            <SkeletonBlock width="28%" height={19} />
            <LogtimeSkeleton />
          </View>
          <View style={styles.card}>
            <SkeletonBlock width="40%" height={19} />
            {[1, 2, 3].map((item) => (
              <View key={item} style={homeStyles.achievement}>
                <SkeletonBlock width="55%" height={19} />
                <SkeletonBlock width="80%" height={18} />
              </View>
            ))}
          </View>
        </View>
      </Screen>
    );

  if (!token)
    return (
      <Screen>
        <Text style={styles.title}>Intra42</Text>
        <Card title="Welcome">
          <Text style={styles.muted}>Sign in with your 42 account.</Text>
          <Button
            title={busy ? "Signing in…" : "Sign in with 42"}
            disabled={busy}
            onPress={() => {
              setBusy(true);
              setError("");
              void signIn()
                .catch((reason) =>
                  setError(reason instanceof Error ? reason.message : "Sign-in failed."),
                )
                .finally(() => setBusy(false));
            }}
          />
          {error && <Text accessibilityRole="alert">{error}</Text>}
        </Card>
      </Screen>
    );
  const upcoming = evaluations.data?.filter(
    (item) => !item.filled_at && Date.parse(item.begin_at) >= Date.now(),
  );
  const evaluationActions = [
    { id: "feedback", label: "Feedback logs", onPress: () => router.push("/feedbacks") },
    { id: "slots", label: "Manage slots", onPress: () => router.navigate("/slots") },
  ];
  if (!user)
    return (
      <Screen scrollUnderStatusBar={ownHome}>
        <Card title="Profile">
          <QueryMessage pending={false} error={profile.error} empty="No profile." />
          <Button title="Try again" onPress={() => void refreshProfile()} />
        </Card>
      </Screen>
    );
  return (
    <Screen
      scrollUnderStatusBar={ownHome}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          tintColor={theme.tealText}
          colors={[theme.tealText]}
        />
      }
    >
      <ProfileCard
        key={user.id}
        user={user}
        avatar={avatar.image}
        campus={campus?.name}
        course={course}
        palette={palette}
        onCourseChange={setSelectedCursusId}
      />
      {ownHome && (
        <Card title="Pending evaluations">
          <View style={homeStyles.evaluationActions}>
            {evaluationActions.map(({ id, label, onPress }) => (
              <Pressable
                key={id}
                accessibilityRole="button"
                onPress={onPress}
                style={({ pressed }) => [
                  homeStyles.evaluationAction,
                  pressed && homeStyles.pressedAction,
                ]}
              >
                <Text style={homeStyles.evaluationActionText}>{label}</Text>
              </Pressable>
            ))}
          </View>
          {upcoming?.length ? (
            upcoming.map((item) => (
              <Text key={item.id} style={styles.text}>
                {item.scale?.name ?? "Evaluation"} · {new Date(item.begin_at).toLocaleString()}
              </Text>
            ))
          ) : (
            <QueryMessage
              pending={profile.isPending || (!!user && evaluations.isPending)}
              error={profile.error ?? evaluations.error}
              empty="No pending evaluations."
            />
          )}
        </Card>
      )}
      {ownHome && (
        <Card title="Agenda">
          {agenda?.length ? (
            agenda.map((item) => <EventCard key={item.id} event={item} />)
          ) : (
            <QueryMessage
              pending={!!campus && events.isPending}
              error={events.error}
              empty="No upcoming campus events."
            />
          )}
          {events.isFetchNextPageError && (
            <Text accessibilityRole="alert" style={styles.muted}>
              {events.error.message}
            </Text>
          )}
          {events.isFetchingNextPage ? (
            <EventCardSkeleton />
          ) : events.hasNextPage ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy: events.isFetchingNextPage, disabled: events.isFetching }}
              disabled={events.isFetching}
              onPress={() => void events.fetchNextPage({ cancelRefetch: false })}
              style={({ pressed }) => [homeStyles.loadMore, pressed && homeStyles.loadMorePressed]}
            >
              <Text style={homeStyles.loadMoreText}>Load more</Text>
            </Pressable>
          ) : null}
        </Card>
      )}
      <Card title="Ongoing projects">
        {ownHome && (
          <View style={homeStyles.evaluationActions}>
            {projectActions.map(({ label, href }) => (
              <Pressable
                key={href}
                accessibilityRole="link"
                onPress={() => router.push(href)}
                style={({ pressed }) => [
                  homeStyles.evaluationAction,
                  pressed && homeStyles.pressedAction,
                ]}
              >
                <Text style={homeStyles.evaluationActionText}>{label}</Text>
              </Pressable>
            ))}
          </View>
        )}
        {ongoingProjects?.length ? (
          ongoingProjects.map((item) => (
            <Text key={item.id} style={styles.text}>
              {item.project.name}
            </Text>
          ))
        ) : (
          <Text style={styles.muted}>No ongoing projects.</Text>
        )}
      </Card>
      <Card title="Logtime">
        {locations.data ? (
          <Logtime locations={locations.data.locations} now={locations.data.now} />
        ) : (
          <QueryMessage
            pending={!!user && locations.isPending}
            error={locations.error}
            empty="No recent sessions."
          />
        )}
      </Card>
      <Card title={awards.isError && !awards.data ? "Achievements" : "Last achievements"}>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({
              pathname: "/achievements",
              params: userId === undefined ? {} : { userId: String(userId) },
            })
          }
          style={({ pressed }) => [
            homeStyles.evaluationAction,
            homeStyles.achievementAction,
            pressed && homeStyles.pressedAction,
          ]}
        >
          <Text style={homeStyles.evaluationActionText}>See all achievements</Text>
        </Pressable>
        {user && awards.isPending ? (
          <SkeletonList cardHeight={76} />
        ) : achievements.length ? (
          achievements
            .slice(0, 3)
            .map(({ achievement }) => (
              <AchievementRow key={achievement.id} achievement={achievement} />
            ))
        ) : (
          <Text style={styles.muted}>No achievements to show.</Text>
        )}
      </Card>
      {ownHome && (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void logout().catch(() => Alert.alert("Could not clear the stored session."));
          }}
          style={({ pressed }) => [homeStyles.logout, pressed && homeStyles.logoutPressed]}
        >
          <Svg width={18} height={18} viewBox="0 0 24 24" accessible={false}>
            <Path
              d="M10 17l5-5-5-5m5 5H3m11-9h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"
              fill="none"
              stroke={logoutRed}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
          <Text style={homeStyles.logoutText}>Logout</Text>
        </Pressable>
      )}
    </Screen>
  );
}

const logoutRed = "#b42318";

const homeStyles = StyleSheet.create({
  skeleton: { gap: theme.spacing },
  evaluationActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  evaluationAction: {
    borderColor: theme.tealText,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  evaluationActionText: { color: theme.tealText, fontSize: 13, textTransform: "uppercase" },
  pressedAction: { backgroundColor: "#e6f8f8" },
  loadMore: { alignSelf: "center", justifyContent: "center", minHeight: 44, paddingHorizontal: 16 },
  loadMorePressed: { opacity: 0.65 },
  loadMoreText: { color: theme.tealText, fontSize: 14, fontWeight: "500" },
  logout: {
    ...styles.card,
    ...styles.row,
    minHeight: 48,
    paddingVertical: 8,
    justifyContent: "center",
  },
  logoutPressed: { backgroundColor: theme.background },
  logoutText: { ...styles.action, color: logoutRed },
  achievement: {
    borderWidth: 2,
    borderColor: "#e3e3e3",
    borderRadius: 4,
    padding: 12,
    gap: 6,
  },
  achievementAction: { alignSelf: "flex-start" },
});
