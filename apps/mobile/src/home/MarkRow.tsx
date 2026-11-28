import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { theme } from "../theme";
import { type MarkAttempt, type MarkedProject, markAge, markAttempts } from "./marks";

function MarkScore({ mark }: { mark: MarkAttempt }) {
  const status = mark.is_validated
    ? "Validated"
    : mark.final_mark === null
      ? "Pending"
      : "Not validated";
  return (
    <Text accessibilityLabel={`${status}, mark ${mark.final_mark ?? "pending"}`} style={s.score}>
      <Text
        style={{
          color: mark.is_validated ? "#22c55e" : mark.final_mark === null ? "#c98310" : "#dc4545",
        }}
      >
        {mark.is_validated ? "✓" : mark.final_mark === null ? "◷" : "✕"}{" "}
      </Text>
      {mark.final_mark ?? "-"}
    </Text>
  );
}

export function MarkRow({ project, userId }: { project: MarkedProject; userId: number }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [attemptsHeight, setAttemptsHeight] = useState(0);
  const reducedMotion = useReducedMotion();
  const height = useSharedValue(0);
  const progress = useSharedValue(0);
  useEffect(() => {
    const config = { duration: reducedMotion ? 0 : 320, easing: Easing.out(Easing.cubic) };
    height.set(withTiming(expanded ? attemptsHeight : 0, config));
    progress.set(withTiming(expanded ? 1 : 0, config));
  }, [expanded, attemptsHeight, reducedMotion, height, progress]);
  const containerStyle = useAnimatedStyle(() => ({ height: height.get() }));
  const attemptsStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, (progress.get() - 0.15) / 0.85),
    transform: [{ translateY: (1 - progress.get()) * -8 }],
  }));
  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.get() * 180}deg` }],
  }));
  const attempts = markAttempts(project);
  const open = (slug: string, registrationId: number) =>
    router.push({
      pathname: "/project/[slug]",
      params: {
        slug,
        userId: String(userId),
        registrationId: String(registrationId),
        view: "mine",
      },
    });
  return (
    <View>
      <View style={s.row}>
        <View style={s.copy}>
          <Pressable
            accessibilityRole="link"
            onPress={() => open(project.project_slug, project.projects_user_id)}
            hitSlop={4}
          >
            <Text style={s.link}>{project.project_name}</Text>
          </Pressable>
          <Text style={s.age}>{markAge(project.last_event_date)}</Text>
        </View>
        {!!attempts.length && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Attempts for ${project.project_name}`}
            accessibilityState={{ expanded }}
            onPress={() => setExpanded(!expanded)}
            style={s.disclosure}
          >
            <Animated.View style={arrowStyle}>
              <Svg width={20} height={20} viewBox="0 0 24 24" accessible={false}>
                <Path
                  d="m5 8.5 7 7 7-7"
                  fill="none"
                  stroke={theme.ink}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </Animated.View>
          </Pressable>
        )}
        <MarkScore mark={project} />
      </View>
      {!!attempts.length && (
        <Animated.View
          style={[s.animationContainer, containerStyle]}
          pointerEvents={expanded ? "auto" : "none"}
          accessibilityElementsHidden={!expanded}
          importantForAccessibility={expanded ? "auto" : "no-hide-descendants"}
        >
          <Animated.View
            style={[s.attempts, attemptsStyle]}
            onLayout={(event) => setAttemptsHeight(event.nativeEvent.layout.height)}
          >
            {attempts.map((attempt) => (
              <View
                key={`${attempt.project_slug}:${attempt.occurrence}:${attempt.last_event_date}`}
                style={s.row}
              >
                <Pressable
                  accessibilityRole="link"
                  onPress={() => open(attempt.project_slug, attempt.projects_user_id)}
                  style={s.copy}
                >
                  <Text style={s.link}>
                    {attempt.project_name} #{attempt.occurrence}
                  </Text>
                  <Text style={s.age}>{markAge(attempt.last_event_date)}</Text>
                </Pressable>
                <MarkScore mark={attempt} />
              </View>
            ))}
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 52, paddingVertical: 8 },
  copy: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 5, alignItems: "center" },
  link: { fontSize: 15, color: theme.tealText },
  age: { fontSize: 13, color: theme.muted },
  score: { fontSize: 15, color: theme.ink },
  disclosure: { minWidth: 36, minHeight: 44, alignItems: "center", justifyContent: "center" },
  animationContainer: { overflow: "hidden" },
  attempts: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    borderLeftWidth: 2,
    borderLeftColor: theme.border,
    paddingLeft: 10,
  },
});
