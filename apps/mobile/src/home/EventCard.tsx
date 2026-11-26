import { StyleSheet, Text, View } from "react-native";
import type { Event } from "../api";
import { theme } from "../theme";
import { SkeletonBlock } from "../ui";

const colors: Record<string, string> = {
  association: "#a2b3e5",
  exam: "#ed8179",
  piscine: "#ed8179",
  pedago: "#ed8179",
  workshop: "#39d88f",
  challenge: "#39d88f",
  hackathon: "#39d88f",
};

export function EventCardSkeleton() {
  return (
    <View style={[s.card, { borderColor: theme.border }]}>
      <View style={s.date}>
        <SkeletonBlock width={30} height={14} />
        <SkeletonBlock width={28} height={23} />
        <SkeletonBlock width={42} height={12} />
      </View>
      <View style={s.details}>
        <SkeletonBlock width="45%" height={22} />
        <SkeletonBlock width="82%" height={19} />
        <SkeletonBlock width="64%" height={17} />
      </View>
    </View>
  );
}

export function EventCard({ event }: { event: Event }) {
  const start = new Date(event.begin_at);
  const minutes = Math.round((Date.parse(event.end_at) - start.getTime()) / 60_000);
  const duration =
    minutes >= 1440
      ? `${Math.floor(minutes / 1440)}d`
      : `${Math.floor(minutes / 60)}h${minutes % 60 || ""}`;
  const color = colors[(event.kind ?? "").toLowerCase().replaceAll(" ", "_")] ?? theme.teal;
  return (
    <View style={[s.card, { borderColor: color }]}>
      <View style={[s.date, { backgroundColor: color }]}>
        <Text style={s.dateText}>{start.toLocaleDateString("en-GB", { weekday: "short" })}</Text>
        <Text style={s.day}>{start.getDate()}</Text>
        <Text style={s.month}>{start.toLocaleDateString("en-GB", { month: "long" })}</Text>
      </View>
      <View style={s.details}>
        <Text style={[s.kind, { color: theme.tealText }]}>
          {(event.kind ?? "Event").replaceAll("_", " ")}
        </Text>
        <Text style={s.name}>{event.name}</Text>
        <Text style={s.meta}>
          {start.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
          {minutes > 0 ? ` · ${duration}` : ""}
          {event.location ? ` · ${event.location}` : ""}
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 5,
    overflow: "hidden",
    minHeight: 100,
  },
  date: { width: 72, paddingVertical: 12, alignItems: "center", justifyContent: "center", gap: 3 },
  dateText: { fontSize: 14, color: "#15252a" },
  day: { fontSize: 23, fontWeight: "800", color: "#15252a" },
  month: { fontSize: 12, color: "#15252a" },
  details: { flex: 1, padding: 12, gap: 5 },
  kind: { fontSize: 18, fontWeight: "800", textTransform: "capitalize" },
  name: { fontSize: 16, color: theme.ink },
  meta: { fontSize: 13, color: theme.muted, lineHeight: 19 },
});
