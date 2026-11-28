import { Stack, useLocalSearchParams } from "expo-router";
import { Text } from "react-native";
import { type Profile, type ProjectDetails, useIntraQuery } from "../../src/api";
import type { OfficialProjectOverview } from "../../src/projects/overview";
import { ProjectOverviewContent } from "../../src/projects/ProjectOverviewContent";
import { ProjectOverviewSkeleton } from "../../src/projects/ProjectOverviewSkeleton";
import { useSession } from "../../src/session";
import { QueryMessage, Screen, styles } from "../../src/ui";

export default function ProjectPage() {
  const { slug, userId, view, registrationId } = useLocalSearchParams<{
    slug: string;
    userId?: string;
    view?: string;
    registrationId?: string;
  }>();
  const personal = view === "mine" || userId !== undefined || registrationId !== undefined;
  const validRegistration =
    registrationId === undefined ||
    (/^[1-9]\d*$/.test(registrationId) && Number.isSafeInteger(Number(registrationId)));
  const { token } = useSession();
  const validSlug = typeof slug === "string" && /^[a-z0-9_-]+$/i.test(slug);
  const validUser =
    userId === undefined || (/^[1-9]\d*$/.test(userId) && Number.isSafeInteger(Number(userId)));
  const profile = useIntraQuery<Profile>(
    validUser ? (userId ? `/users/${userId}` : "/me") : undefined,
  );
  const projectQuery = useIntraQuery<ProjectDetails>(validSlug ? `/projects/${slug}` : undefined);
  const project = projectQuery.data;
  const enrollment = profile.data?.projects_users?.find(
    (entry) => entry.project.slug === slug || (project && entry.project.id === project.id),
  );
  const registration = registrationId ?? (personal ? enrollment?.id : undefined);
  const overviewPath = registration
    ? `/projects/${slug}/registrations/${registration}`
    : personal
      ? userId
        ? undefined
        : `/projects/${slug}/personal`
      : `/projects/${slug}/overview`;
  const overviewQuery = useIntraQuery<OfficialProjectOverview>(
    validSlug && validUser && validRegistration ? overviewPath : undefined,
  );

  if (!token || !validSlug || !validUser || !validRegistration || !project) {
    return (
      <Screen underHeader>
        <Stack.Screen options={{ title: "" }} />
        {!token || !validSlug || !validUser || !validRegistration ? (
          <Text style={styles.muted}>
            {!token
              ? "Sign in from Home to view project details."
              : !validUser
                ? "Invalid user profile."
                : !validRegistration
                  ? "Invalid project registration."
                  : "Invalid project."}
          </Text>
        ) : (
          <QueryMessage
            pending={projectQuery.isPending}
            error={projectQuery.error}
            empty="Project not available."
            skeleton={<ProjectOverviewSkeleton />}
          />
        )}
      </Screen>
    );
  }
  return (
    <Screen underHeader>
      <Stack.Screen options={{ title: project.name }} />
      {personal && userId && !registration ? (
        <QueryMessage
          pending={profile.isPending}
          error={profile.error}
          empty="This user is not registered for this project."
          skeleton={<ProjectOverviewSkeleton />}
        />
      ) : (
        <ProjectOverviewContent
          projectSlug={slug}
          data={overviewQuery.data}
          pending={overviewQuery.isPending}
          error={overviewQuery.error}
          onRetry={() => void overviewQuery.refetch()}
        />
      )}
    </Screen>
  );
}
