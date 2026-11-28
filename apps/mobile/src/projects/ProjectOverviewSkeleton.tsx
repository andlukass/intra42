import { StyleSheet, View } from "react-native";
import { theme } from "../theme";
import { SkeletonBlock, styles } from "../ui";

export function ProjectOverviewSkeleton() {
  return (
    <View
      accessibilityLabel="Loading project details"
      accessibilityState={{ busy: true }}
      style={s.content}
    >
      <View style={styles.card}>
        <View style={s.status}>
          <SkeletonBlock width={100} height={25} color="#d9dcde" />
          <SkeletonBlock width={56} height={64} radius={12} color="#d9dcde" />
        </View>
        <SkeletonBlock width="85%" height={16} />
        <View style={s.document}>
          <SkeletonBlock width={16} height={20} radius={2} />
          <SkeletonBlock width={108} height={16} />
        </View>
      </View>
      <View style={styles.card}>
        <SkeletonBlock width={114} height={18} />
        <View style={s.lines}>
          <SkeletonBlock height={14} />
          <SkeletonBlock width="94%" height={14} />
          <SkeletonBlock width="88%" height={14} />
          <SkeletonBlock width="60%" height={14} />
        </View>
      </View>
      <View style={styles.card}>
        {["keywords", "skills"].map((group) => (
          <View key={group} style={s.lines}>
            <SkeletonBlock width={group === "keywords" ? 90 : 52} height={18} />
            <View style={s.list}>
              <SkeletonBlock width="58%" height={14} />
              <SkeletonBlock width="72%" height={14} />
              <SkeletonBlock width="45%" height={14} />
            </View>
          </View>
        ))}
      </View>
      <View style={styles.card}>
        <SkeletonBlock width={130} height={18} />
        {["attempts", "finished", "active", "waiting", "without-team", "eligible"].map((key) => (
          <View key={key} style={s.document}>
            <SkeletonBlock width={20} height={20} />
            <SkeletonBlock width="75%" height={14} />
          </View>
        ))}
      </View>
      <View style={styles.card}>
        <SkeletonBlock width={110} height={18} />
        <View style={s.chart}>
          <View style={s.ring} />
        </View>
        {["pending", "success", "fail"].map((key) => (
          <View key={key} style={s.legend}>
            <SkeletonBlock width={10} height={10} radius={2} />
            <SkeletonBlock width={100} height={14} />
            <View style={{ flex: 1 }} />
            <SkeletonBlock width={38} height={14} />
          </View>
        ))}
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  content: { gap: theme.spacing },
  status: {
    height: 150,
    backgroundColor: "#eceeef",
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  lines: { gap: 12 },
  document: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 10 },
  list: {
    borderLeftWidth: 4,
    borderColor: theme.border,
    paddingLeft: 12,
    gap: 12,
    marginVertical: 6,
  },
  chart: { height: 190, justifyContent: "center", alignItems: "center" },
  ring: { width: 150, height: 150, borderRadius: 75, borderWidth: 28, borderColor: theme.border },
  legend: { minHeight: 30, flexDirection: "row", alignItems: "center", gap: 8 },
});
