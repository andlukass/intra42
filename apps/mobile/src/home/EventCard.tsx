import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Event } from "../api";
import { eventDuration } from "../events";
import { theme } from "../theme";
import { SkeletonBlock } from "../ui";
import { Detail, EventDetails } from "./EventDetails";

const colors: Record<string, string> = {
  association: "#a2b3e5",
  exam: "#ed8179",
  piscine: "#ed8179",
  pedago: "#ed8179",
  ruch: "#ed8179",
  partnership: "#ed8179",
  speedworking: "#39d88f",
  other: "#c0c0c0",
  extern: "#c0c0c0",
  workshop: "#39d88f",
  challenge: "#39d88f",
  hackathon: "#39d88f",
};

export function eventColor(kind?: string) {
  return colors[(kind ?? "").toLowerCase().replaceAll(" ", "_")] ?? theme.teal;
}

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
  const [open, setOpen] = useState(false);
  const start = new Date(event.begin_at);
  const color = eventColor(event.kind);
  const days = Math.round((start.getTime() - Date.now()) / 86_400_000);
  const relative =
    days === 0
      ? "today"
      : days === 1
        ? "tomorrow"
        : days > 0
          ? `in ${days} days`
          : `${Math.abs(days)} days ago`;
  const kind = (event.kind ?? "Event").replaceAll("_", " ");
  const examSummary =
    event.kind === "exam"
      ? event.description?.replace("This session concerns only the following exams", "For")
      : undefined;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View event: ${event.name}`}
        onPress={() => setOpen(true)}
        style={[s.card, { borderColor: color }]}
      >
        <View style={[s.date, { backgroundColor: color }]}>
          <Text style={s.dateText}>{start.toLocaleDateString("en-GB", { weekday: "short" })}</Text>
          <Text style={s.day}>{start.getDate()}</Text>
          <Text style={s.month}>{start.toLocaleDateString("en-GB", { month: "long" })}</Text>
        </View>
        <View style={s.details}>
          <View style={s.heading}>
            <Text style={[s.kind, { color }]}>{kind.charAt(0).toUpperCase() + kind.slice(1)}</Text>
            <Text style={s.name} numberOfLines={2}>
              {event.name}
            </Text>
          </View>
          {!!examSummary && (
            <Text style={s.summary} numberOfLines={1}>
              {examSummary}
            </Text>
          )}
          <View style={s.metadata}>
            <Detail icon="calendar" value={eventDuration(event)} color={color} />
            <Detail icon="clock" value={relative} color={color} />
            {!!event.location && <Detail icon="location" value={event.location} color={color} />}
            {!!event.max_subscribers && (
              <Detail
                icon="people"
                value={`${event.nbr_subscribers ?? 0}/${event.max_subscribers}`}
                color={color}
              />
            )}
          </View>
          {event.is_subscribed && <Text style={s.subscribed}>Subscribed</Text>}
        </View>
      </Pressable>
      {open && <EventDetails event={event} color={color} onClose={() => setOpen(false)} />}
    </>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 5,
    overflow: "hidden",
    minHeight: 110,
  },
  date: { width: 72, paddingVertical: 12, alignItems: "center", justifyContent: "center", gap: 7 },
  dateText: { fontSize: 14, color: "#fff" },
  day: { fontSize: 23, fontWeight: "800", color: "#fff" },
  month: { fontSize: 12, color: "#fff" },
  details: { flex: 1, padding: 12, gap: 8, justifyContent: "center" },
  kind: { fontSize: 20, fontWeight: "800" },
  name: { fontSize: 15, color: theme.ink },
  heading: { gap: 4 },
  summary: { fontSize: 14, color: theme.ink },
  metadata: { flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 8 },
  subscribed: { color: theme.tealText, fontSize: 13, fontWeight: "600" },
});
