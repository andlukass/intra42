import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import type { PendingEvaluation } from "../api";
import { CalendarTooltip } from "../home/CalendarTooltip";
import { theme } from "../theme";
import { pendingEvaluationStatus } from "./pendingEvaluation";

const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeStyle: "short" });

export function PendingEvaluationRow({ evaluation }: { evaluation: PendingEvaluation }) {
  const [now, setNow] = useState(Date.now);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>();
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const status = pendingEvaluationStatus(evaluation, now);
  return (
    <View style={s.row}>
      <Text style={s.description}>
        {status.message}{" "}
        {evaluation.user ? (
          <Link
            href={{ pathname: "/profile/[id]", params: { id: evaluation.user } }}
            style={s.link}
          >
            {evaluation.user}
          </Link>
        ) : (
          "someone"
        )}
        {" on "}
        {evaluation.project_name}
      </Text>
      <View style={s.actions}>
        {status.canBegin ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => {
              void Linking.openURL(
                `https://projects.intra.42.fr/scale_teams/${evaluation.id}/edit`,
              ).catch(() => Alert.alert("Could not open evaluation", "Please try again."));
            }}
            style={s.action}
          >
            <Text style={s.link}>Begin Evaluation</Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Evaluation time: ${status.relativeTime}. Show full date.`}
            accessibilityState={{ expanded: !!tooltip }}
            onPress={(event) => {
              event.currentTarget.measureInWindow((x, y, width, height) => {
                setTooltip({ x, y, width, height });
              });
            }}
            style={s.time}
          >
            <Svg width={15} height={15} viewBox="0 0 24 24" accessible={false}>
              <Circle cx={12} cy={12} r={9} stroke={theme.ink} fill="none" strokeWidth={1.5} />
              <Path d="M12 6v6l4 2" stroke={theme.ink} fill="none" strokeWidth={1.5} />
            </Svg>
            <Text style={s.timeText}>{status.relativeTime}</Text>
          </Pressable>
        )}
      </View>
      <CalendarTooltip
        anchor={tooltip}
        text={dateFormat.format(new Date(evaluation.begin_at))}
        width={300}
        height={66}
        onClose={() => setTooltip(undefined)}
        closeLabel="Close evaluation time tooltip"
      />
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, paddingVertical: 8 },
  description: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 200,
    color: theme.ink,
    fontSize: 15,
    lineHeight: 23,
  },
  link: { color: theme.tealText, fontSize: 15 },
  actions: { marginLeft: "auto" },
  action: { minHeight: 44, justifyContent: "center" },
  time: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 44 },
  timeText: { fontSize: 13, color: theme.ink },
});
