import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Line, Path } from "react-native-svg";
import { useEvaluationLogs, useProfile } from "../src/api";
import { useSession } from "../src/session";
import { theme } from "../src/theme";
import {
  Button,
  Card,
  QueryMessage,
  SkeletonBlock,
  SkeletonList,
  stackScreenEdges,
  styles,
  useStackScrollInsets,
} from "../src/ui";

const chartHeight = 104;

function PointsChart({ entries }: { entries: { total: number; created_at: string }[] }) {
  const points = entries
    .map((entry) => ({ time: Date.parse(entry.created_at), total: entry.total }))
    .filter(({ time, total }) => Number.isFinite(time) && Number.isFinite(total))
    .reverse();
  if (!points.length) return null;

  const first = points[0];
  const last = points[points.length - 1];
  const ceiling = Math.max(1, ...points.map((point) => point.total));
  const floor = Math.min(0, ...points.map((point) => point.total));
  const width = 300;
  const height = chartHeight;
  const duration = last.time - first.time || 1;
  const y = (total: number) => 4 + ((ceiling - total) / (ceiling - floor)) * (height - 8);
  const path = points
    .map(({ time, total }, index) =>
      index === 0 ? `M0 ${y(total)}` : `H${((time - first.time) / duration) * width}V${y(total)}`,
    )
    .join(" ");

  return (
    <Card title="Evaluation points history">
      <Text style={s.total}>{last.total} points</Text>
      <Svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Evaluation points over time. From ${first.total} to ${last.total} points.`}
      >
        <Line x1={0} y1={y(0)} x2={width} y2={y(0)} stroke={theme.border} strokeWidth={1} />
        <Path
          d={`${path}H${width}`}
          fill="none"
          stroke={theme.tealText}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      </Svg>
      <View style={s.row}>
        <Text style={styles.muted}>{new Date(first.time).toLocaleDateString()}</Text>
        {first.time !== last.time && (
          <Text style={styles.muted}>{new Date(last.time).toLocaleDateString()}</Text>
        )}
      </View>
    </Card>
  );
}

export default function EvaluationLogs() {
  const scrollInsets = useStackScrollInsets();
  const { token, loading } = useSession();
  const profile = useProfile();
  const logs = useEvaluationLogs(token ? profile.data?.id : undefined);
  const entries = token ? logs.data : undefined;
  const error = profile.error ?? logs.error;

  return (
    <SafeAreaView edges={stackScreenEdges} style={styles.screen}>
      <FlatList
        {...scrollInsets}
        data={entries}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={s.content}
        ListHeaderComponent={
          <View style={s.contentHeader}>
            <Text accessibilityRole="header" style={styles.title}>
              Evaluation logs
            </Text>
            {entries?.length ? <PointsChart entries={entries} /> : null}
          </View>
        }
        ListEmptyComponent={
          <>
            <QueryMessage
              pending={loading || (!!token && logs.isPending)}
              error={error}
              empty={token ? "No evaluation point changes." : "Sign in to view evaluation logs."}
              skeleton={
                <View style={s.contentHeader}>
                  <View style={styles.card}>
                    <SkeletonBlock width="70%" height={19} />
                    <SkeletonBlock width="28%" height={26} />
                    <SkeletonBlock height={chartHeight} />
                    <SkeletonBlock width="32%" height={18} />
                  </View>
                  <SkeletonList cardHeight={121} />
                </View>
              }
            />
            {token && error && (
              <Button
                title="Try again"
                onPress={() => void (profile.error ? profile.refetch() : logs.refetch())}
              />
            )}
          </>
        }
        renderItem={({ item }) => (
          <Card
            title={
              (typeof item.reason === "string" && item.reason.replaceAll("_", " ")) ||
              "Evaluation point change"
            }
          >
            <View style={s.row}>
              <Text style={[s.delta, item.sum < 0 && s.debit]}>
                {item.sum > 0 ? "+" : ""}
                {item.sum}
              </Text>
              <Text style={styles.text}>{item.total} points</Text>
            </View>
            <Text style={styles.muted}>{new Date(item.created_at).toLocaleString()}</Text>
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  content: { padding: theme.spacing, gap: theme.spacing },
  contentHeader: { gap: theme.spacing },
  row: { ...styles.row, justifyContent: "space-between", flexWrap: "wrap" },
  total: { fontSize: 22, color: theme.ink, fontWeight: "800" },
  delta: { color: theme.tealText, fontSize: 18, fontWeight: "800" },
  debit: { color: "#b42318" },
});
