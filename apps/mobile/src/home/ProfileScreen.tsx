import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { AchievementRow } from "../achievements/AchievementRow";
import { earnedAchievements } from "../achievements/earned";
import {
  useAchievementAwards,
  useAgenda,
  useIntraQuery,
  useLogtime,
  useProfile,
  useProfileCoalitions,
  useSelectTitle,
} from "../api";
import { SignIn } from "../SignIn";
import { useSession } from "../session";
import { theme } from "../theme";
import {
  Button,
  Card,
  QueryMessage,
  Screen,
  SkeletonBlock,
  SkeletonList,
  styles,
  Toast,
  useToast,
} from "../ui";
import { useDecodedAvatar } from "../useDecodedAvatar";
import { Alumnization } from "./Alumnization";
import type { AlumniCountdown } from "./alumnization-info";
import { defaultProfileCourse, profilePalette } from "./coalition";
import { EventCard, EventCardSkeleton } from "./EventCard";
import { Logtime, LogtimeSkeleton } from "./Logtime";
import { PendingEvaluations, PendingEvaluationsSkeleton } from "./PendingEvaluations";
import { ProfileCard, ProfileCardSkeleton } from "./ProfileCard";
import { ProfileProgress } from "./ProfileProgress";
import { ProfileResults } from "./ProfileResults";
import type { AttendanceSummary, PaceProfile } from "./profile-progress";

const projectActions = [
  { label: "Evaluation logs", href: "/evaluation-logs" },
  { label: "Feedback logs", href: "/feedbacks" },
  { label: "Quests", href: "/quests" },
] as const;

function AgendaSkeleton() {
  return (
    <View style={homeStyles.skeleton}>
      {[1, 2, 3].map((id) => (
        <EventCardSkeleton key={id} />
      ))}
      <View style={homeStyles.loadMore}>
        <SkeletonBlock width={72} height={18} />
      </View>
    </View>
  );
}

export function ProfileScreen({ userId }: { userId?: number | string }) {
  const ownHome = userId === undefined;
  const router = useRouter();
  const client = useQueryClient();
  const { token, loading, logout } = useSession();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCursusId, setSelectedCursusId] = useState<number>();
  const profile = useProfile(userId);
  const { refetch: refreshProfile } = profile;
  const user = profile.data;
  const titleMutation = useSelectTitle(ownHome ? user?.id : undefined);
  const { toast, showToast, hideToast } = useToast();
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
  const alumnization = useIntraQuery<AlumniCountdown | null>(
    user && !user.alumnized_at ? `/users/${user.id}/alumnization` : undefined,
  );
  const pace = useIntraQuery<PaceProfile | null>(
    user && course?.cursus.id === 21 ? `/users/${user.id}/pace` : undefined,
  );
  const attendance = useIntraQuery<AttendanceSummary | null>(
    user && course?.cursus.id === 21 ? `/users/${user.id}/attendance` : undefined,
  );
  const campus =
    user?.campus?.find(
      (item) => item.id === user.campus_users?.find((entry) => entry.is_primary)?.campus_id,
    ) ?? user?.campus?.[0];
  const events = useAgenda(ownHome ? campus?.id : undefined);
  const agenda = events.data?.pages.flatMap((page) => page.items);
  const locations = useLogtime(user?.id);

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([
        refreshProfile(),
        coalitions.refresh?.(),
        ownHome && user && client.refetchQueries({ queryKey: ["42", "/me/evaluations"] }),
        ownHome &&
          campus &&
          client.invalidateQueries({ queryKey: ["42", "events"] }).then(() => events.refetch()),
        user && locations.refetch(),
        user && awards.refetch(),
        user && client.refetchQueries({ queryKey: ["42", `/users/${user.id}/alumnization`] }),
        !ownHome &&
          user &&
          course &&
          client.refetchQueries({
            queryKey: ["42", `/users/${user.id}/marks?cursus_id=${course.cursus.id}`],
          }),
        user &&
          course?.cursus.id === 21 &&
          client.refetchQueries({ queryKey: ["42", `/users/${user.id}/pace`] }),
        user &&
          course?.cursus.id === 21 &&
          client.refetchQueries({ queryKey: ["42", `/users/${user.id}/attendance`] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }

  if (loading || (!!token && !user && profile.isPending))
    return (
      <Screen scrollUnderStatusBar={ownHome} underHeader={!ownHome}>
        <View
          accessible
          accessibilityLabel="Loading profile"
          accessibilityState={{ busy: true }}
          style={homeStyles.skeleton}
        >
          <ProfileCardSkeleton palette={palette} />
          {ownHome && <PendingEvaluationsSkeleton />}
          {ownHome && (
            <View style={styles.card}>
              <SkeletonBlock width="24%" height={19} />
              <AgendaSkeleton />
            </View>
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

  if (!token) return <SignIn />;
  if (!user)
    return (
      <Screen scrollUnderStatusBar={ownHome} underHeader={!ownHome}>
        <Card title="Profile">
          <QueryMessage pending={false} error={profile.error} empty="No profile." />
          <Button title="Try again" onPress={() => void refreshProfile()} />
        </Card>
      </Screen>
    );
  return (
    <Screen
      scrollUnderStatusBar={ownHome}
      underHeader={!ownHome}
      overlay={toast ? <Toast {...toast} /> : null}
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
        avatarPending={avatar.loading}
        campus={campus?.name}
        course={course}
        palette={palette}
        onCourseChange={setSelectedCursusId}
        savingTitle={titleMutation.isPending}
        onTitleChange={
          ownHome
            ? (titleId) => {
                hideToast();
                titleMutation.mutate(titleId, {
                  onSuccess: () => showToast("Title updated."),
                  onError: (error) => showToast(error.message, true),
                });
              }
            : undefined
        }
      >
        <Alumnization
          key={`alumnization-${user.id}`}
          countdown={alumnization.data}
          alumnizedAt={user.alumnized_at}
          pending={!user.alumnized_at && alumnization.isPending}
          palette={palette}
        />
        {course?.cursus.id === 21 && (
          <ProfileProgress key={`progress-${user.id}`} pace={pace} attendance={attendance} />
        )}
      </ProfileCard>
      {!ownHome && (
        <ProfileResults
          key={`results-${user.id}`}
          userId={user.id}
          cursusId={course?.cursus.id}
          achievements={achievements}
          pending={awards.isPending}
          error={awards.error}
        />
      )}
      {ownHome && <PendingEvaluations />}
      {ownHome && (
        <Card title="Agenda">
          {agenda?.length ? (
            agenda.map((item) => <EventCard key={item.id} event={item} />)
          ) : (
            <QueryMessage
              pending={!!campus && events.isPending}
              error={events.error}
              empty="No upcoming campus events."
              skeleton={<AgendaSkeleton />}
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
        <View style={homeStyles.evaluationActions}>
          {projectActions.map(({ label, href }) => (
            <Pressable
              key={href}
              accessibilityRole="link"
              onPress={() =>
                router.push({ pathname: href, params: ownHome ? {} : { userId: String(user.id) } })
              }
              style={({ pressed }) => [
                homeStyles.evaluationAction,
                pressed && homeStyles.pressedAction,
              ]}
            >
              <Text style={homeStyles.evaluationActionText}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {ongoingProjects?.length ? (
          ongoingProjects.map((item) => {
            const slug = item.project.slug ?? item.project.id?.toString();
            return (
              <Pressable
                key={item.id}
                accessibilityRole="link"
                accessibilityLabel={`Open ${user.login}'s ${item.project.name}`}
                disabled={!slug}
                onPress={() => {
                  if (slug)
                    router.push({
                      pathname: "/project/[slug]",
                      params: { slug, userId: String(user.id), view: "mine" },
                    });
                }}
                style={({ pressed }) => [
                  homeStyles.projectRow,
                  pressed && homeStyles.projectRowPressed,
                ]}
              >
                {({ pressed }) => (
                  <Text
                    style={[
                      styles.text,
                      homeStyles.projectLink,
                      pressed && homeStyles.projectLinkPressed,
                    ]}
                  >
                    {item.project.name}
                  </Text>
                )}
              </Pressable>
            );
          })
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
            skeleton={<LogtimeSkeleton />}
          />
        )}
      </Card>
      {ownHome && (
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
      )}
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
  projectRow: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  projectRowPressed: { backgroundColor: "#f4f3f5" },
  projectLink: { color: theme.tealText },
  projectLinkPressed: { color: "#006b6d" },
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
