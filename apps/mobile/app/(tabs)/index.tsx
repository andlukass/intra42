import { useState } from "react";
import { Image, Text, View } from "react-native";
import {
  type Evaluation,
  type Event,
  type Location,
  useIntraQuery,
  useProfile,
} from "../../src/api";
import { useSession } from "../../src/session";
import { Button, Card, QueryMessage, Screen, styles } from "../../src/ui";

export default function Home() {
  const { token, loading, signIn } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const profile = useProfile();
  const user = profile.data;
  const campus =
    user?.campus?.find(
      (item) => item.id === user.campus_users?.find((entry) => entry.is_primary)?.campus_id,
    ) ?? user?.campus?.[0];
  const events = useIntraQuery<Event[]>(
    campus && `/campus/${campus.id}/events?filter[future]=true&sort=begin_at&page[size]=30`,
  );
  const evaluations = useIntraQuery<Evaluation[]>(
    user && `/users/${user.id}/scale_teams?sort=-begin_at&page[size]=30`,
  );
  const locations = useIntraQuery<Location[]>(
    user && `/users/${user.id}/locations?sort=-begin_at&page[size]=30`,
  );
  if (!token)
    return (
      <Screen>
        <Text style={styles.title}>Intra42</Text>
        <Card title="Welcome">
          <Text style={styles.muted}>Sign in with your 42 account.</Text>
          <Button
            title={loading ? "Restoring session…" : busy ? "Signing in…" : "Sign in with 42"}
            disabled={loading || busy}
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
  const current = user?.cursus_users?.at(-1);
  const upcoming = evaluations.data?.filter(
    (item) => !item.filled_at && Date.parse(item.begin_at) >= Date.now(),
  );
  return (
    <Screen>
      <Text style={styles.title}>Home</Text>
      <Card title="Profile">
        {user ? (
          <>
            <View style={styles.row}>
              {user.image?.link && (
                <Image
                  accessibilityIgnoresInvertColors
                  source={{ uri: user.image.link }}
                  style={{ width: 64, height: 64, borderRadius: 32 }}
                />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.section}>{user.displayname}</Text>
                <Text style={styles.muted}>
                  {user.login}
                  {campus ? ` · ${campus.name}` : ""}
                </Text>
              </View>
            </View>
            {current && (
              <Text style={styles.text}>
                {current.cursus.name} · Level {current.level}
                {current.grade ? ` · ${current.grade}` : ""}
              </Text>
            )}
            <Text style={styles.muted}>
              {user.location ?? "Unavailable"} · {user.wallet ?? 0} ₳ · {user.correction_point ?? 0}{" "}
              Ev.P
            </Text>
            {user.alumni && <Text style={styles.text}>Alumni</Text>}
          </>
        ) : (
          <QueryMessage pending={profile.isPending} error={profile.error} empty="No profile." />
        )}
      </Card>
      <Card title="Agenda">
        {events.data?.length ? (
          events.data.map((item) => (
            <View key={item.id}>
              <Text style={styles.text}>{item.name}</Text>
              <Text style={styles.muted}>
                {new Date(item.begin_at).toLocaleString()}
                {item.location ? ` · ${item.location}` : ""}
              </Text>
            </View>
          ))
        ) : (
          <QueryMessage
            pending={!!campus && events.isPending}
            error={events.error}
            empty="No upcoming campus events."
          />
        )}
      </Card>
      <Card title="Pending evaluations">
        {upcoming?.length ? (
          upcoming.map((item) => (
            <Text key={item.id} style={styles.text}>
              {item.scale?.name ?? "Evaluation"} · {new Date(item.begin_at).toLocaleString()}
            </Text>
          ))
        ) : (
          <QueryMessage
            pending={!!user && evaluations.isPending}
            error={evaluations.error}
            empty="No pending evaluations."
          />
        )}
      </Card>
      <Card title="Logtime">
        {locations.data?.length ? (
          locations.data.slice(0, 7).map((item) => (
            <Text key={item.id} style={styles.text}>
              {new Date(item.begin_at).toLocaleString()} ·{" "}
              {item.end_at
                ? `${Math.max(0, Math.round((Date.parse(item.end_at) - Date.parse(item.begin_at)) / 60000))} min`
                : "Active"}
            </Text>
          ))
        ) : (
          <QueryMessage
            pending={!!user && locations.isPending}
            error={locations.error}
            empty="No recent sessions."
          />
        )}
      </Card>
      <Card title="Achievements">
        {user?.achievements?.length ? (
          user.achievements.slice(0, 5).map((item) => (
            <View key={item.id}>
              <Text style={styles.text}>{item.name}</Text>
              <Text style={styles.muted}>{item.description}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.muted}>No achievements to show.</Text>
        )}
      </Card>
      <Card title="Ongoing projects">
        {user?.projects_users
          ?.filter(
            (item) => item.status === "in_progress" || item.status === "waiting_for_correction",
          )
          .map((item) => (
            <Text key={item.id} style={styles.text}>
              {item.project.name}
            </Text>
          ))}
        {!user?.projects_users?.some(
          (item) => item.status === "in_progress" || item.status === "waiting_for_correction",
        ) && <Text style={styles.muted}>No ongoing projects.</Text>}
      </Card>
    </Screen>
  );
}
