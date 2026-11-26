import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { type Achievement, useAchievementIcon } from "../api";
import { theme } from "../theme";
import { styles } from "../ui";

const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });
const medals = new Map([
  ["easy", { label: "bronze", backgroundColor: "#ead1ba", color: "#633c20" }],
  ["medium", { label: "silver", backgroundColor: "#d8e1e2", color: "#354d51" }],
  ["hard", { label: "gold", backgroundColor: "#f6dfa2", color: "#594311" }],
  ["challenge", { label: "platinum", backgroundColor: "#dedde7", color: "#454054" }],
]);

export function AchievementRow({
  achievement,
  earnedAt,
  locked = false,
}: {
  achievement: Achievement;
  earnedAt?: string;
  locked?: boolean;
}) {
  const icon = useAchievementIcon(achievement.image);
  const date = earnedAt ? Date.parse(earnedAt) : NaN;
  const medal = medals.get(achievement.tier ?? "");

  return (
    <View style={[s.row, locked && s.lockedRow]}>
      <View style={s.copy}>
        <Text style={[s.name, locked && styles.muted]}>{achievement.name}</Text>
        <Text style={styles.muted}>{achievement.description}</Text>
        {Number.isFinite(date) ? <Text style={s.date}>{dateFormat.format(date)}</Text> : null}
      </View>
      <View style={[s.badge, locked && s.lockedBadge]} accessible={false}>
        {icon.data ? (
          <Image
            source={{ uri: icon.data }}
            style={s.image}
            contentFit="contain"
            accessible={false}
          />
        ) : (
          <Svg width={25} height={25} viewBox="0 0 24 24" accessible={false}>
            <Path
              d="M8 3h8v6a4 4 0 0 1-8 0V3ZM8 5H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 2v6m-4 2h8"
              fill="none"
              stroke={theme.tealText}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        )}
        {medal ? (
          <Text style={[s.medal, { backgroundColor: medal.backgroundColor, color: medal.color }]}>
            {medal.label}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    overflow: "hidden",
  },
  copy: { flex: 1, justifyContent: "center", padding: 12, gap: 4, minHeight: 76 },
  lockedRow: { backgroundColor: "#fafafa" },
  lockedBadge: { opacity: 0.65 },
  name: { color: theme.ink, fontWeight: "700", fontSize: 16 },
  badge: {
    minWidth: 64,
    padding: 6,
    gap: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3f3f3",
  },
  image: { width: 44, height: 44 },
  medal: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    fontSize: 11,
    fontWeight: "600",
  },
  date: { color: theme.tealText, fontSize: 13 },
});
