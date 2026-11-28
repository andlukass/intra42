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
import { AchievementRow } from "./AchievementRow";
import { achievementLevelName, type AchievementGroup as Group } from "./groups";

export function AchievementGroup({
  group,
  locked,
  expanded,
  onToggle,
}: {
  group: Group;
  locked: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const [opened, setOpened] = useState(expanded);
  const [collapsedHeight, setCollapsedHeight] = useState(0);
  const [expandedHeight, setExpandedHeight] = useState(0);
  const height = useSharedValue(0);
  const progress = useSharedValue(expanded ? 1 : 0);

  useEffect(() => {
    if (!collapsedHeight) return;
    if (height.get() === 0) height.set(collapsedHeight);
    const target = expanded ? expandedHeight : collapsedHeight;
    if (!target) return;
    const config = { duration: reducedMotion ? 0 : 320, easing: Easing.out(Easing.cubic) };
    height.set(withTiming(target, config));
    progress.set(withTiming(expanded ? 1 : 0, config));
  }, [collapsedHeight, expandedHeight, expanded, reducedMotion, height, progress]);

  const containerStyle = useAnimatedStyle(() => ({ height: height.get() || undefined }));
  const collapsedStyle = useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, progress.get() * 2) }));
  const expandedStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, (progress.get() - 0.15) / 0.85),
    transform: [{ translateY: (1 - progress.get()) * -8 }],
  }));
  const row = (entry: Group["summary"]) => (
    <AchievementRow
      achievement={entry.achievement}
      earnedAt={entry.earnedAt}
      locked={locked}
      displayName={achievementLevelName(entry)}
      showStatus
    />
  );
  if (group.levels.length < 2) return row(group.summary);

  return (
    <Animated.View style={[s.animationContainer, containerStyle]}>
      <Animated.View
        style={collapsedStyle}
        pointerEvents={expanded ? "none" : "auto"}
        accessibilityElementsHidden={expanded}
        importantForAccessibility={expanded ? "no-hide-descendants" : "auto"}
        onLayout={(event) => setCollapsedHeight(event.nativeEvent.layout.height)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityHint={`Show all ${group.levels.length} ${locked ? "unearned" : "earned"} levels`}
          accessibilityState={{ expanded: false }}
          onPress={() => {
            setOpened(true);
            onToggle();
          }}
          style={s.stack}
        >
          <View pointerEvents="none" style={s.bottomSheet} />
          <View pointerEvents="none" style={s.middleSheet} />
          <View>
            {row(group.summary)}
            <View style={s.levelCount} pointerEvents="none">
              <Text style={s.count}>{group.levels.length} levels</Text>
              <Chevron />
            </View>
          </View>
        </Pressable>
      </Animated.View>
      {(opened || expanded) && (
        <Animated.View
          style={[s.expanded, expandedStyle]}
          pointerEvents={expanded ? "auto" : "none"}
          accessibilityElementsHidden={!expanded}
          importantForAccessibility={expanded ? "auto" : "no-hide-descendants"}
          onLayout={(event) => setExpandedHeight(event.nativeEvent.layout.height)}
        >
          {group.levels.map((entry) => (
            <View key={entry.achievement.id}>{row(entry)}</View>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Collapse ${group.summary.achievement.name} levels`}
            accessibilityState={{ expanded: true }}
            onPress={onToggle}
            style={s.toggle}
          >
            <Text style={s.toggleText}>
              {locked ? "Hide other levels" : "Hide previous levels"}
            </Text>
            <Chevron expanded />
          </Pressable>
        </Animated.View>
      )}
    </Animated.View>
  );
}

function Chevron({ expanded = false }: { expanded?: boolean }) {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24" accessible={false}>
      <Path
        d={expanded ? "m5 15 7-7 7 7" : "m5 9 7 7 7-7"}
        stroke={theme.slate}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
const s = StyleSheet.create({
  animationContainer: { overflow: "hidden" },
  stack: { paddingLeft: 4, paddingBottom: 5 },
  bottomSheet: {
    position: "absolute",
    left: 0,
    top: 4,
    bottom: 0,
    right: 4,
    borderWidth: 1,
    borderColor: "#d7d7d7",
    backgroundColor: "#fff",
    borderRadius: 2,
  },
  middleSheet: {
    position: "absolute",
    left: 2,
    top: 2,
    bottom: 2,
    right: 2,
    borderWidth: 1,
    borderColor: "#d7d7d7",
    backgroundColor: "#fff",
    borderRadius: 2,
  },
  levelCount: {
    position: "absolute",
    bottom: 8,
    right: 76,
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
  },
  count: { fontSize: 10, color: theme.slate },
  expanded: { gap: 8, position: "absolute", top: 0, left: 0, right: 0 },
  toggle: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  toggleText: { color: theme.tealText, fontSize: 13 },
});
