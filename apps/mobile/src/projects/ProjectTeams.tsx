import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { api } from "../api";
import { useSession } from "../session";
import { theme } from "../theme";
import { styles } from "../ui";
import type { PersonalProjectTeam } from "./overview";

export function ProjectTeams({
  teams,
  projectSlug,
}: {
  teams: PersonalProjectTeam[];
  projectSlug?: string;
}) {
  const { token } = useSession();
  const client = useQueryClient();
  const [finishing, setFinishing] = useState<string>();
  const [expandedTeam, setExpandedTeam] = useState<string | undefined>(() => teams[0]?.id);
  const busy = useRef(false);
  function confirmFinish(team: PersonalProjectTeam) {
    if (busy.current || !team.canFinish || !projectSlug) return;
    Alert.alert(
      "Finish project?",
      `Submit ${team.name} for evaluation? Make sure your final work has been pushed before continuing.`,
      [
        { text: "Close", style: "cancel" },
        { text: "Finish project", onPress: () => void finish(team.id) },
      ],
    );
  }
  async function finish(teamId: string) {
    if (busy.current || !token || !projectSlug) return;
    busy.current = true;
    setFinishing(teamId);
    try {
      await api(
        token.accessToken,
        `/projects/${projectSlug}/teams/${teamId}/finish`,
        undefined,
        {},
      );
      await client.invalidateQueries({ queryKey: ["42"] });
    } catch (error) {
      Alert.alert(
        "Could not finish project",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      busy.current = false;
      setFinishing(undefined);
    }
  }
  const router = useRouter();
  return (
    <>
      {teams.map((team) => (
        <View key={team.id} style={[styles.card, { gap: 0 }]}>
          <Pressable
            style={[s.header, { minHeight: 44 }]}
            accessibilityRole="button"
            accessibilityLabel={team.name}
            accessibilityState={{ expanded: expandedTeam === team.id }}
            onPress={() =>
              setExpandedTeam((current) => (current === team.id ? undefined : team.id))
            }
          >
            <Text accessibilityRole="header" style={s.name}>
              {team.name}
            </Text>
            {team.mark ? (
              <Text style={[s.mark, { color: team.success ? "#57B45C" : "#D8636F" }]}>
                {team.mark}
              </Text>
            ) : (
              <View style={{ flexDirection: "row", gap: 6 }}>
                {team.progress.map((step) => (
                  <Text
                    key={step.label}
                    accessibilityLabel={`${step.label.replace("?", "")}: ${step.complete ? "yes" : "no"}`}
                    style={{ color: step.complete ? "#57B45C" : theme.border }}
                  >
                    ●
                  </Text>
                ))}
              </View>
            )}
            <Text accessible={false} style={s.link}>
              {expandedTeam === team.id ? "⌄" : "›"}
            </Text>
          </Pressable>
          <AttemptDetails expanded={expandedTeam === team.id}>
            {!!team.timeline && <Text style={s.copy}>{team.timeline}</Text>}
            {!!team.repository && (
              <View style={s.section}>
                <Text style={s.heading}>Git repository</Text>
                <Text selectable style={s.repository}>
                  {team.repository}
                </Text>
              </View>
            )}
            {!!team.evaluations.length && (
              <View style={s.section}>
                <Text accessibilityRole="header" style={s.heading}>
                  Evaluations
                </Text>
                {team.evaluations.map((evaluation) => (
                  <View
                    key={`${evaluation.evaluator}-${evaluation.date}-${evaluation.comment}`}
                    style={s.evaluation}
                  >
                    <Text style={s.subheading}>
                      {evaluation.login ? "Peer evaluation" : "Automatic evaluation"}
                    </Text>
                    <View style={s.header}>
                      <Text style={[s.copy, { flex: 1 }]}>Evaluated by </Text>
                      {evaluation.login ? (
                        <Pressable
                          accessibilityRole="link"
                          onPress={() =>
                            router.push({
                              pathname: "/profile/[id]",
                              params: { id: evaluation.login ?? "" },
                            })
                          }
                        >
                          <Text style={s.link}>{evaluation.evaluator}</Text>
                        </Pressable>
                      ) : (
                        <Text style={s.copy}>{evaluation.evaluator}</Text>
                      )}
                      <Text
                        style={{
                          color: evaluation.success ? "#57B45C" : "#D8636F",
                          fontWeight: "600",
                        }}
                      >
                        {evaluation.mark}
                      </Text>
                    </View>
                    <Text style={styles.muted}>{evaluation.date}</Text>
                    {!!evaluation.comment && (
                      <Text
                        selectable
                        style={[
                          s.comment,
                          !evaluation.login && {
                            color: evaluation.success ? "#57B45C" : "#D8636F",
                          },
                        ]}
                      >
                        {evaluation.comment}
                      </Text>
                    )}
                    {evaluation.feedback !== null && (
                      <>
                        <Text style={s.subheading}>Your feedback</Text>
                        <Text style={s.comment}>{evaluation.feedback}</Text>
                        <View style={s.ratings}>
                          {evaluation.ratings.map((rating) => (
                            <Text key={rating.label} style={s.rating}>
                              {rating.label.startsWith("Evaluation Rated")
                                ? rating.label
                                : `${rating.label} ${rating.value}`}
                            </Text>
                          ))}
                        </View>
                      </>
                    )}
                  </View>
                ))}
              </View>
            )}
            {team.canFinish && projectSlug && (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !!finishing, busy: finishing === team.id }}
                disabled={!!finishing}
                onPress={() => confirmFinish(team)}
                style={[s.finish, !!finishing && { opacity: 0.5 }]}
              >
                <Text style={s.finishText}>
                  {finishing === team.id ? "Finishing project…" : "Set the project as finished"}
                </Text>
              </Pressable>
            )}
          </AttemptDetails>
        </View>
      ))}
    </>
  );
}
function AttemptDetails({ expanded, children }: { expanded: boolean; children: ReactNode }) {
  const [opened, setOpened] = useState(expanded);
  const [contentHeight, setContentHeight] = useState(0);
  const reducedMotion = useReducedMotion();
  const height = useSharedValue(0);
  const progress = useSharedValue(expanded ? 1 : 0);
  useEffect(() => {
    if (expanded) setOpened(true);
    const config = { duration: reducedMotion ? 0 : 320, easing: Easing.out(Easing.cubic) };
    height.set(withTiming(expanded ? contentHeight : 0, config));
    progress.set(withTiming(expanded ? 1 : 0, config));
  }, [expanded, contentHeight, reducedMotion, height, progress]);
  const containerStyle = useAnimatedStyle(() => ({ height: height.get() }));
  const contentStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, (progress.get() - 0.15) / 0.85),
    transform: [{ translateY: (1 - progress.get()) * -8 }],
  }));
  return (
    <Animated.View
      style={[{ overflow: "hidden" }, containerStyle]}
      pointerEvents={expanded ? "auto" : "none"}
      accessibilityElementsHidden={!expanded}
      importantForAccessibility={expanded ? "auto" : "no-hide-descendants"}
    >
      {(opened || expanded) && (
        <Animated.View
          style={[
            { position: "absolute", top: 0, left: 0, right: 0, paddingTop: 16, gap: 16 },
            contentStyle,
          ]}
          onLayout={(event) => setContentHeight(event.nativeEvent.layout.height)}
        >
          {children}
        </Animated.View>
      )}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  finish: {
    minHeight: 48,
    padding: 12,
    borderRadius: 3,
    backgroundColor: "#57B45C",
    alignItems: "center",
    justifyContent: "center",
  },
  finishText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  header: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  name: { color: theme.tealText, fontSize: 20, flex: 1 },
  mark: { fontSize: 20 },
  copy: { color: theme.ink, fontSize: 15, lineHeight: 23 },
  section: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    paddingTop: 16,
    gap: 12,
  },
  heading: { color: theme.ink, fontSize: 17, fontWeight: "600" },
  subheading: { color: theme.muted, fontSize: 13 },
  repository: {
    fontFamily: "monospace",
    backgroundColor: "#F7F7F7",
    padding: 12,
    color: theme.ink,
    fontSize: 13,
  },
  evaluation: {
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    paddingBottom: 18,
    marginBottom: 4,
  },
  link: { color: theme.tealText, fontWeight: "600", fontSize: 15 },
  comment: {
    backgroundColor: "#F7F7F7",
    padding: 12,
    fontSize: 15,
    color: theme.ink,
    lineHeight: 23,
  },
  ratings: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  rating: { color: "#57B45C", fontSize: 13 },
});
