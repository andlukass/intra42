import { Link } from "expo-router";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";
import {
  type CompletedEvaluation,
  type EvaluationPoint,
  type ProjectDetails,
  useEvaluationLogs,
  useIntraQuery,
} from "../src/api";
import { useSession } from "../src/session";
import { theme } from "../src/theme";
import {
  Button,
  QueryMessage,
  SkeletonBlock,
  SkeletonList,
  stackScreenEdges,
  styles,
  useStackScrollInsets,
} from "../src/ui";
import { useProfileRoute } from "../src/useProfileRoute";

const chartHeight = 180;
const dateTime = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });
const month = new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit" });
function formatDate(value: string) {
  return Number.isFinite(Date.parse(value)) ? dateTime.format(new Date(value)) : "Date unavailable";
}

function PointsChart({ entries }: { entries: EvaluationPoint[] }) {
  const points = entries
    .map((entry) => ({ id: entry.id, time: Date.parse(entry.created_at), total: entry.total }))
    .filter(({ time, total }) => Number.isFinite(time) && Number.isFinite(total))
    .sort((a, b) => a.time - b.time);
  if (!points.length) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const ceiling = Math.max(5, Math.ceil(Math.max(...points.map((point) => point.total)) / 5) * 5);
  const floor = Math.min(0, Math.floor(Math.min(...points.map((point) => point.total)) / 5) * 5);
  const left = 30;
  const right = 328;
  const top = 12;
  const bottom = 142;
  const x = (time: number) =>
    left + ((time - first.time) / (last.time - first.time || 1)) * (right - left);
  const y = (total: number) => bottom - ((total - floor) / (ceiling - floor)) * (bottom - top);
  const path = points
    .map(({ time, total }, index) =>
      index === 0 ? `M${x(time)} ${y(total)}` : `H${x(time)}V${y(total)}`,
    )
    .join(" ");
  return (
    <View style={s.chart}>
      <Text accessibilityRole="header" style={s.chartTitle}>
        Evaluation points history
      </Text>
      <Svg
        width="100%"
        height={chartHeight}
        viewBox="0 0 340 180"
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Evaluation points over time. From ${first.total} to ${last.total} points.`}
      >
        {[0, 1, 2, 3, 4].map((index) => {
          const value = floor + ((ceiling - floor) * index) / 4;
          return <ViewGrid key={index} value={value} y={y(value)} />;
        })}
        <Path d={path} fill="none" stroke={theme.tealText} strokeWidth={1.5} />
        {points.map((point) => (
          <Circle
            key={point.id}
            cx={x(point.time)}
            cy={y(point.total)}
            r={2.3}
            fill={theme.tealText}
          />
        ))}
        {[0, 0.5, 1].map((fraction) => {
          const time = first.time + (last.time - first.time) * fraction;
          return (
            <SvgText
              key={fraction}
              x={left + (right - left) * fraction}
              y={160}
              textAnchor={fraction === 0 ? "start" : fraction === 1 ? "end" : "middle"}
              fontSize={10}
              fill={theme.muted}
            >
              {month.format(new Date(time))}
            </SvgText>
          );
        })}
        <SvgText x={179} y={178} textAnchor="middle" fontSize={10} fill={theme.muted}>
          Date
        </SvgText>
      </Svg>
      <Text style={s.balance}>{last.total} evaluation points</Text>
    </View>
  );
}

function ViewGrid({ value, y }: { value: number; y: number }) {
  return (
    <>
      <Line x1={30} x2={328} y1={y} y2={y} stroke={theme.border} strokeWidth={0.7} />
      <SvgText x={23} y={y + 3} textAnchor="end" fontSize={10} fill={theme.muted}>
        {Number(value.toFixed(1))}
      </SvgText>
    </>
  );
}

function Participant({ user }: { user: { id: number; login: string } }) {
  return (
    <Link href={{ pathname: "/profile/[id]", params: { id: user.login } }} style={s.link}>
      {user.login}
    </Link>
  );
}

function EvaluationContext({ id }: { id: number }) {
  const evaluation = useIntraQuery<CompletedEvaluation>(`/scale_teams/${id}`);
  const record = evaluation.data;
  const project = useIntraQuery<ProjectDetails>(
    record?.team?.project_id ? `/projects/${record.team.project_id}` : undefined,
  );
  if (evaluation.isPending || (record?.team?.project_id && project.isPending)) {
    return (
      <View style={s.contextSkeleton}>
        <SkeletonBlock height={14} />
        <SkeletonBlock width="70%" height={14} />
      </View>
    );
  }
  if (!record || evaluation.error || project.error)
    return <Text style={s.meta}>Evaluation details unavailable.</Text>;
  const members = record.correcteds?.length ? record.correcteds : (record.team?.users ?? []);
  return (
    <Text style={s.context}>
      {record.corrector ? <Participant user={record.corrector} /> : "Unknown evaluator"}
      {" evaluated "}
      {members.map((user, index) => (
        <Text key={user.id}>
          {index ? ", " : ""}
          <Participant user={user} />
        </Text>
      ))}
      {project.data ? ` on ${project.data.name}` : ""}
      {` on ${formatDate(record.begin_at)}`}
    </Text>
  );
}

export default function EvaluationLogs() {
  const scrollInsets = useStackScrollInsets();
  const { token, loading } = useSession();
  const profile = useProfileRoute();
  const logs = useEvaluationLogs(token ? profile.data?.id : undefined);
  const entries = token ? logs.data : undefined;
  const error = profile.error ?? logs.error;
  return (
    <SafeAreaView edges={stackScreenEdges} style={[styles.screen, s.screen]}>
      <FlatList
        {...scrollInsets}
        data={entries}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={s.content}
        ListHeaderComponent={entries?.length ? <PointsChart entries={entries} /> : null}
        ListEmptyComponent={
          <>
            <QueryMessage
              pending={loading || (!!token && !error && (profile.isPending || logs.isPending))}
              error={error}
              empty={token ? "No evaluation point changes." : "Sign in to view evaluation logs."}
              skeleton={
                <>
                  <SkeletonBlock height={chartHeight} />
                  <SkeletonList cardHeight={121} />
                </>
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
        renderItem={({ item, index }) => {
          const day = item.created_at.slice(0, 10);
          const firstOfDay = index === 0 || entries?.[index - 1].created_at.slice(0, 10) !== day;
          return (
            <View style={s.timelineEntry}>
              {firstOfDay && <Text style={s.day}>{day}</Text>}
              <View style={s.reasonRow}>
                <Text style={[s.delta, item.sum < 0 && s.debit]}>
                  {item.sum > 0 ? "+" : ""}
                  {item.sum}
                </Text>
                <Text style={s.reason}>
                  {item.reason?.replaceAll("_", " ") || "Evaluation point change"}
                </Text>
              </View>
              {item.scale_team_id ? <EvaluationContext id={item.scale_team_id} /> : null}
              <Text style={s.meta}>
                {item.total} points · {formatDate(item.created_at)}
              </Text>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { backgroundColor: theme.surface },
  content: { padding: theme.spacing },
  chart: { gap: 12, paddingBottom: 24 },
  chartTitle: { fontSize: 16, color: theme.ink, textAlign: "center" },
  balance: { fontSize: 13, color: theme.muted, textAlign: "center" },
  timelineEntry: {
    borderLeftWidth: 3,
    borderLeftColor: theme.tealText,
    paddingLeft: 14,
    paddingBottom: 22,
    gap: 8,
  },
  day: {
    alignSelf: "flex-start",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.muted,
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginBottom: 4,
    fontSize: 12,
    color: theme.ink,
  },
  reasonRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  reason: { flex: 1, fontSize: 16, lineHeight: 23, color: theme.ink },
  delta: {
    color: theme.tealText,
    backgroundColor: "#e0f4f5",
    paddingHorizontal: 4,
    fontSize: 15,
    lineHeight: 23,
  },
  debit: { color: "#c83c50", backgroundColor: "#fceff2" },
  link: { color: theme.tealText },
  context: { color: theme.ink, fontSize: 14, lineHeight: 21 },
  meta: { color: theme.muted, fontSize: 13, lineHeight: 19 },
  contextSkeleton: { gap: 6 },
});
