import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Svg, { Circle, G, Line, Rect, Text as SvgText } from "react-native-svg";
import type { useIntraQuery } from "../api";
import { CalendarTooltip } from "./CalendarTooltip";
import {
  type AttendanceSummary,
  attendanceHours,
  type PaceProfile,
  profileProgress,
  progressDate,
} from "./profile-progress";

const teal = "#00babc";

export function ProfileProgress({
  pace,
  attendance,
}: {
  pace: ReturnType<typeof useIntraQuery<PaceProfile | null>>;
  attendance: ReturnType<typeof useIntraQuery<AttendanceSummary | null>>;
}) {
  const [now, setNow] = useState(Date.now);
  const [selected, setSelected] = useState<{
    level: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }>();
  const { width } = useWindowDimensions();
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const progress = profileProgress(pace.data, now);
  if (pace.isError)
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => void pace.refetch()}
        style={[s.panel, { padding: 12 }]}
      >
        <Text style={s.text}>Could not load milestone progress. Tap to retry.</Text>
      </Pressable>
    );
  if (!progress || !pace.data) return null;
  const profile = pace.data;
  const weeks = [...(attendance.data?.weeks ?? [])]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 4)
    .reverse();
  const ringLength = 2 * Math.PI * 52;
  const elapsedRatio = Math.max(0, Math.min(1, progress.elapsed / progress.duration));
  const end = progress.eta ?? progress.begin;
  const span = Math.max(1, end - progress.begin);
  const monthCount =
    (new Date(end).getUTCFullYear() - new Date(progress.begin).getUTCFullYear()) * 12 +
    new Date(end).getUTCMonth() -
    new Date(progress.begin).getUTCMonth() +
    1;
  const timelineWidth = Math.max(width - 64, monthCount * 64);
  const position = (time: number) =>
    Math.max(0, Math.min(1, (time - progress.begin) / span)) * timelineWidth;
  const months = Array.from({ length: monthCount }, (_, index) => {
    const date = new Date(progress.begin);
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + index);
    return date;
  });
  const detail = progress.segments.find((item) => item.level === selected?.level);
  return (
    <View style={s.container}>
      {progress.deadline !== undefined && (
        <View style={s.panel}>
          <View style={s.deadline}>
            <Text style={s.text}>
              {profile.probationary_period ? "Blackholed at:" : "Milestone Deadline:"}
            </Text>
            <Text style={s.date}>{progressDate(profile.deadline)}</Text>
          </View>
          {profile.pace != null && <Text style={s.pace}>Pace {profile.pace}</Text>}
          <View style={s.charts}>
            <View
              style={s.elapsed}
              accessible
              accessibilityLabel={`Elapsed time: ${progress.elapsed} days out of ${progress.duration}`}
            >
              <Text style={s.text}>Elapsed time</Text>
              <View style={s.ring}>
                <Svg width={124} height={124} viewBox="0 0 124 124" accessible={false}>
                  <Circle cx={62} cy={62} r={52} fill="none" stroke="#00babc40" strokeWidth={8} />
                  <Circle
                    cx={62}
                    cy={62}
                    r={52}
                    fill="none"
                    stroke={profile.probationary_period ? "#ef4444" : teal}
                    strokeWidth={8}
                    strokeLinecap="round"
                    strokeDasharray={`${ringLength} ${ringLength}`}
                    strokeDashoffset={ringLength * (1 - elapsedRatio)}
                    rotation={-90}
                    origin="62, 62"
                  />
                </Svg>
                <View style={s.ringLabel}>
                  <Text style={s.days}>{progress.elapsed} days</Text>
                  <Text style={s.secondary}>On {progress.duration}</Text>
                </View>
              </View>
            </View>
            <View style={s.attendance}>
              {attendance.data && weeks.length ? (
                <Svg
                  width="100%"
                  height={170}
                  viewBox="0 0 220 170"
                  accessible
                  accessibilityLabel={`Weekly attendance. ${weeks.map((week) => `${week.at}: ${Math.floor((attendanceHours(week.total) ?? 0) * 60)} minutes`).join(". ")}`}
                >
                  {[60, 45, 30, 15, 0].map((hours) => {
                    const y = 14 + (60 - hours) * 2;
                    return <AttendanceGrid key={hours} hours={hours} y={y} />;
                  })}
                  {weeks.map((week, index) => {
                    const hours = attendanceHours(week.total);
                    const x = 46 + index * 45;
                    const height = Math.min(60, hours ?? 0) * 2;
                    return (
                      <G key={week.at}>
                        <Rect
                          x={x}
                          y={134 - height}
                          width={24}
                          height={height}
                          rx={Math.min(12, height / 2)}
                          fill={teal}
                        />
                        <SvgText
                          x={x + 12}
                          y={Math.max(10, 128 - height)}
                          fill="#fff"
                          fontSize={11}
                          textAnchor="middle"
                        >
                          {hours === undefined ? "-" : `${Math.floor(hours)}h`}
                        </SvgText>
                        <SvgText x={x + 12} y={154} fill="#fff" fontSize={10} textAnchor="middle">
                          {index === weeks.length - 1 ? "Last week" : `W-${weeks.length - index}`}
                        </SvgText>
                      </G>
                    );
                  })}
                </Svg>
              ) : attendance.isPending ? (
                <Text style={s.secondary}>Loading attendance…</Text>
              ) : (
                <Pressable accessibilityRole="button" onPress={() => void attendance.refetch()}>
                  <Text style={s.secondary}>Attendance unavailable. Tap to retry.</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      )}
      {progress.eta !== undefined && (
        <View style={s.timelinePanel}>
          <View style={s.eta}>
            <Text style={s.text}>Common Core ETA:</Text>
            <Text style={s.date}>{progressDate(profile.eta_end_of_cursus)}</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator
            contentContainerStyle={s.timelineScroll}
          >
            <View style={{ width: timelineWidth, height: 110 }}>
              {months.map((month, index) =>
                index === 0 && months[1] && position(months[1].getTime()) < 56 ? null : (
                  <Text
                    key={month.toISOString()}
                    style={[
                      s.month,
                      { left: Math.min(timelineWidth - 55, position(month.getTime())) },
                    ]}
                  >
                    {month.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}
                    {index === 0 || month.getUTCMonth() === 0
                      ? ` '${String(month.getUTCFullYear()).slice(-2)}`
                      : ""}
                  </Text>
                ),
              )}
              {progress.segments.map((item) => {
                const segmentWidth = Math.max(1, position(item.end) - position(item.start) - 4);
                return (
                  <Pressable
                    key={item.level}
                    accessibilityRole="button"
                    accessibilityLabel={`Milestone ${item.level}, ${item.validated_at ? "validated" : "deadline"} ${progressDate(item.validated_at ?? item.deadline)}`}
                    accessibilityState={{ expanded: selected?.level === item.level }}
                    onPress={(event) => {
                      event.currentTarget.measureInWindow((x, y, width, height) => {
                        setSelected({ level: item.level, x, y, width, height });
                      });
                    }}
                    style={[
                      s.segment,
                      {
                        left: position(item.start),
                        width: segmentWidth,
                        backgroundColor: item.validated_at ? teal : "#005b60",
                      },
                    ]}
                  >
                    <Text numberOfLines={1} style={s.segmentText}>
                      {item.validated_at ? "✓ " : "● "}
                      {segmentWidth > 130
                        ? `Milestone ${item.level}`
                        : segmentWidth > 65
                          ? `M.${item.level}`
                          : item.level}
                    </Text>
                  </Pressable>
                );
              })}
              <View
                pointerEvents="none"
                style={[s.today, { left: Math.min(timelineWidth - 2, position(now)) }]}
              >
                <View style={s.todayDot} />
              </View>
            </View>
          </ScrollView>
          {profile.end_of_cursus_max_deadline && (
            <Text style={s.maximum}>
              Pace 24 max deadline: {progressDate(profile.end_of_cursus_max_deadline)}
            </Text>
          )}
        </View>
      )}
      <CalendarTooltip
        anchor={detail ? selected : undefined}
        text={
          detail
            ? `Begin at: ${progressDate(new Date(detail.start).toISOString().slice(0, 10))}\n${detail.validated_at ? "End at" : "Deadline at"}: ${progressDate(detail.validated_at ?? detail.deadline)}`
            : ""
        }
        width={260}
        height={66}
        onClose={() => setSelected(undefined)}
        closeLabel="Close milestone details"
      />
    </View>
  );
}

function AttendanceGrid({ hours, y }: { hours: number; y: number }) {
  return (
    <G>
      <SvgText x={0} y={y + 4} fill="#fff" fontSize={12}>
        {hours}h
      </SvgText>
      <Line x1={32} x2={218} y1={y} y2={y} stroke="#ffffff90" strokeDasharray="2 2" />
    </G>
  );
}

const s = StyleSheet.create({
  container: { gap: 12 },
  panel: {
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#ffffff40",
    backgroundColor: "#162a2a80",
    overflow: "hidden",
  },
  deadline: {
    padding: 12,
    borderBottomWidth: 1,
    borderColor: "#ffffff40",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  text: { color: "#fff", fontSize: 15 },
  date: { color: "#fff", fontSize: 18, fontWeight: "800" },
  pace: { color: "#fff", paddingHorizontal: 12, paddingTop: 8 },
  charts: { flexDirection: "row", alignItems: "center", padding: 8, gap: 8 },
  elapsed: { alignItems: "center", gap: 4 },
  ring: { width: 124, height: 124 },
  ringLabel: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  days: { color: teal, fontSize: 24, fontWeight: "800" },
  secondary: { color: "#ccd6d6", fontSize: 14, textAlign: "center" },
  attendance: { flex: 1 },
  timelinePanel: { backgroundColor: "#171717", borderRadius: 10, overflow: "hidden" },
  eta: {
    padding: 14,
    gap: 8,
    borderBottomWidth: 1,
    borderColor: "#ffffff30",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
  },
  timelineScroll: { padding: 12 },
  month: { position: "absolute", top: 0, color: "#fff", fontSize: 12 },
  segment: {
    position: "absolute",
    top: 38,
    height: 44,
    borderRadius: 5,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  segmentText: { color: "#fff", fontSize: 15 },
  today: { position: "absolute", top: 25, bottom: 0, width: 2, backgroundColor: "#ef4444" },
  todayDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#ef4444", marginLeft: -4 },
  maximum: { padding: 12, color: "#ddd", fontSize: 13 },
});
