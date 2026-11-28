import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { api } from "../api";
import { CircularLoader } from "../CircularLoader";
import { useSession } from "../session";
import { theme } from "../theme";
import { Button, QueryMessage, styles } from "../ui";
import type { OfficialProjectOverview } from "./overview";
import { ProjectCharts } from "./ProjectCharts";
import { ProjectOverviewSkeleton } from "./ProjectOverviewSkeleton";
import { ProjectTeams } from "./ProjectTeams";
import { shareProjectAttachment } from "./shareAttachment";

const activityIcons = [
  "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-3a8 8 0 0 1 16 0v3",
  "M8 3h8v7a4 4 0 0 1-8 0V3ZM8 5H4v3a4 4 0 0 0 4 4M16 5h4v3a4 4 0 0 1-4 4M12 14v7m-4 0h8",
  "M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM2 21v-3a7 7 0 0 1 12-5m1 5 3 3 5-6",
  "M21 3H3v14h5l4 4v-4h9V3ZM7 8h10M7 12h6",
];

export function ProjectOverviewContent({
  data,
  projectSlug,
  pending,
  error,
  onRetry,
}: {
  data?: OfficialProjectOverview;
  projectSlug?: string;
  pending: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  const router = useRouter();
  const client = useQueryClient();
  const [unregistering, setUnregistering] = useState(false);
  const unregisterLock = useRef(false);
  const { token } = useSession();
  const sharing = useRef(false);
  const [sharingUrl, setSharingUrl] = useState<string>();
  async function share(attachment: { name: string; url: string }) {
    if (sharing.current) return;
    sharing.current = true;
    setSharingUrl(attachment.url);
    try {
      await shareProjectAttachment(attachment, token?.accessToken ?? "");
    } catch (error) {
      Alert.alert(
        "Could not share attachment",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      sharing.current = false;
      setSharingUrl(undefined);
    }
  }
  function confirmUnregister() {
    const slug = data?.unregisterSlug;
    if (!slug || unregisterLock.current) return;
    Alert.alert("Unregister from project?", `You will leave ${data.name}.`, [
      { text: "Close", style: "cancel" },
      { text: "Unregister", style: "destructive", onPress: () => void unregister(slug) },
    ]);
  }
  async function unregister(slug: string) {
    if (!token || unregisterLock.current) return;
    unregisterLock.current = true;
    setUnregistering(true);
    try {
      await api(token.accessToken, `/projects/${slug}/unregister`, undefined, {});
      router.replace({ pathname: "/project/[slug]", params: { slug } });
      await client.invalidateQueries({ queryKey: ["42"] });
    } catch (error) {
      Alert.alert(
        "Could not unregister",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      unregisterLock.current = false;
      setUnregistering(false);
    }
  }
  if (!data && pending && !error) return <ProjectOverviewSkeleton />;
  if (!data)
    return (
      <View style={styles.card}>
        <QueryMessage
          pending={pending}
          error={error}
          empty="Official project information is unavailable."
        />
        {error && <Button title="Try again" variant="outline" onPress={onRetry} />}
      </View>
    );
  const studentLists = [...(data.studentLists ?? [])];
  if (projectSlug && !data.teams && !studentLists.some((list) => list.kind === "can_register")) {
    studentLists.push({
      slug: projectSlug,
      kind: "can_register",
      label: "Students who can subscribe and never did",
    });
  }
  const closed = data.status.toLowerCase() === "closed";
  const forbidden = /forbidden|unavailable|not allowed|fail|closed/i.test(data.status);
  const color = forbidden ? "#D8636F" : theme.teal;
  return (
    <>
      <View style={[styles.card, { gap: 0 }]}>
        {!!data.status && (
          <View style={[s.status, { backgroundColor: color }]}>
            <Text style={s.statusLabel}>{data.status.replaceAll("_", " ")}</Text>
            {data.status.toLowerCase() === "subscribed" ? (
              <Svg width={64} height={72} viewBox="0 0 24 28" accessible={false}>
                <Path fill="#fff" d="M15 1 2 17h9l-2 10L23 11h-9l1-10Z" />
              </Svg>
            ) : closed ? (
              <Svg width={64} height={72} viewBox="0 0 64 72" accessible={false}>
                <Path d="M15 29V19a17 17 0 0 1 34 0v10" fill="none" stroke="#fff" strokeWidth={3} />
                <Path d="M9 29h46v40H9Z" fill="#fff" />
                <Path d="M32 44v10" stroke={color} strokeWidth={3} strokeLinecap="round" />
              </Svg>
            ) : (
              <Svg width={64} height={72} viewBox="0 0 64 72" accessible={false}>
                <Path d="M5 3H59V25C59 46 47 60 32 69C17 60 5 46 5 25Z" fill="#fff" />
                <Path
                  d={forbidden ? "M21 22L43 44M43 22L21 44" : "M19 32L29 42L46 22"}
                  fill="none"
                  stroke={color}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            )}
          </View>
        )}
        {!!data.metadata && <Text style={[s.copy, { paddingVertical: 16 }]}>{data.metadata}</Text>}
        {(data.notes ?? []).map((note) => (
          <View
            key={note}
            style={[s.document, { flexDirection: "row", alignItems: "flex-start", gap: 8 }]}
          >
            <Svg width={22} height={24} viewBox="0 0 24 24" accessible={false}>
              <Path
                d="M2 22h20M4 19v-5h4v5m3 0V9h4v10m3 0V3h4v16M3 10l8-6 5 2 6-5"
                fill="none"
                stroke={theme.ink}
                strokeWidth={1}
              />
            </Svg>
            <Text style={[s.copy, { flex: 1 }]}>{note}</Text>
          </View>
        ))}
        {data.attachments.map((attachment) => (
          <Pressable
            key={attachment.url}
            accessibilityRole="button"
            accessibilityLabel={`Download and share ${attachment.name}`}
            accessibilityState={{ disabled: !!sharingUrl, busy: sharingUrl === attachment.url }}
            disabled={!!sharingUrl}
            onPress={() => void share(attachment)}
            style={s.document}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={s.link}>▤ {attachment.name}</Text>
              {sharingUrl === attachment.url && <CircularLoader label="Downloading attachment" />}
            </View>
          </Pressable>
        ))}
        {(data.steps ?? []).map((step) => (
          <Pressable
            key={step.slug}
            accessibilityRole="link"
            style={[s.document, { paddingVertical: 10 }]}
            onPress={() =>
              router.push({
                pathname: "/project/[slug]",
                params: { slug: step.slug, view: "mine" },
              })
            }
          >
            <Text style={[s.link, { fontWeight: "400", lineHeight: 24 }]}>{step.name}</Text>
          </Pressable>
        ))}
        {data.personalSlug && (
          <View style={[s.document, { paddingTop: 12 }]}>
            <Button
              title="See my project page"
              onPress={() =>
                router.push({
                  pathname: "/project/[slug]",
                  params: { slug: data.personalSlug ?? "", view: "mine" },
                })
              }
            />
          </View>
        )}
        {data.unregisterSlug && (
          <View style={[s.document, { paddingHorizontal: 24 }]}>
            <Button
              title={unregistering ? "Unregistering…" : "Unregister"}
              variant="danger"
              disabled={unregistering}
              onPress={confirmUnregister}
            />
          </View>
        )}
        {data.requirements.map((requirement) => (
          <Text key={requirement} style={s.requirement}>
            {requirement}
          </Text>
        ))}
      </View>
      {data.teams && <ProjectTeams teams={data.teams} projectSlug={projectSlug} />}
      {!!data.description && (
        <View style={styles.card}>
          <Text accessibilityRole="header" style={s.heading}>
            Description
          </Text>
          <Text style={s.copy}>{data.description}</Text>
        </View>
      )}
      {(data.keywords.length > 0 || data.skills.length > 0) && (
        <View style={styles.card}>
          {[
            { title: "Keywords", items: data.keywords },
            { title: "Skills", items: data.skills },
          ]
            .filter((group) => group.items.length)
            .map((group) => (
              <View key={group.title} style={{ gap: 10 }}>
                <Text accessibilityRole="header" style={s.heading}>
                  {group.title}
                </Text>
                <View style={s.list}>
                  {group.items.map((item) => (
                    <Text key={item} style={s.copy}>
                      {item}
                    </Text>
                  ))}
                </View>
              </View>
            ))}
        </View>
      )}
      {(data.registrations.length > 0 || data.registrationsError || !!studentLists.length) && (
        <View style={styles.card}>
          <Text accessibilityRole="header" style={s.heading}>
            Project activity
          </Text>
          {data.registrations.map((line, index) => (
            <View key={line} style={s.activity}>
              <Svg width={22} height={24} viewBox="0 0 24 24" accessible={false}>
                <Path
                  d={activityIcons[index % activityIcons.length]}
                  fill="none"
                  stroke={theme.muted}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
              <Text style={[s.copy, { flex: 1 }]}>{line}</Text>
            </View>
          ))}
          {studentLists.map((list) => (
            <Pressable
              key={list.kind}
              accessibilityRole="link"
              onPress={() =>
                router.push({
                  pathname: "/project-students",
                  params: { slug: list.slug, kind: list.kind, project: data.name },
                })
              }
              style={[s.activity, { minHeight: 44, alignItems: "center" }]}
            >
              <Svg width={22} height={24} viewBox="0 0 24 24" accessible={false}>
                <Path d={activityIcons[0]} fill="none" stroke={theme.muted} strokeWidth={1.5} />
              </Svg>
              <Text style={[s.link, { flex: 1 }]}>{list.label}</Text>
            </Pressable>
          ))}
          {data.registrationsError && <Text style={styles.muted}>{data.registrationsError}</Text>}
          {data.registrationsError && (
            <Button title="Try again" variant="outline" onPress={onRetry} />
          )}
        </View>
      )}
      {data.statistics && <ProjectCharts statistics={data.statistics} />}
      {data.statisticsError && (
        <View style={styles.card}>
          <Text style={styles.muted}>{data.statisticsError}</Text>
          <Button title="Retry charts" variant="outline" onPress={onRetry} />
        </View>
      )}
    </>
  );
}
const s = StyleSheet.create({
  status: {
    minHeight: 150,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: 20,
  },
  statusLabel: { color: "#fff", fontSize: 25, textTransform: "lowercase" },
  heading: { color: theme.ink, fontSize: 18, fontWeight: "700" },
  copy: { color: "#2b2c34", fontSize: 16, lineHeight: 24 },
  list: { borderLeftWidth: 4, borderColor: theme.border, paddingLeft: 12, gap: 4, marginBottom: 8 },
  document: {
    minHeight: 48,
    paddingVertical: 12,
    justifyContent: "center",
    borderTopWidth: 1,
    borderColor: theme.border,
  },
  link: { color: theme.tealText, fontSize: 16, fontWeight: "600" },
  requirement: {
    color: "#D8636F",
    fontSize: 15,
    lineHeight: 23,
    borderTopWidth: 1,
    borderColor: theme.border,
    paddingTop: 12,
  },
  activity: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
});
