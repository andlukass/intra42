import { useRef, useState } from "react";
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Slot } from "../api";
import { SkeletonBlock } from "../ui";

const rowHeight = 46;
const timelineHeight = 400;

export function DayScheduleSkeleton() {
  return (
    <View style={schedule.card}>
      <View style={[schedule.header, { alignItems: "center" }]}>
        <SkeletonBlock width="52%" height={18} />
        <SkeletonBlock width="80%" height={15} />
      </View>
      <View style={[schedule.timeline, { overflow: "hidden" }]}>
        {times.slice(0, Math.ceil(timelineHeight / rowHeight)).map((time) => (
          <View key={time} style={schedule.row}>
            <View style={schedule.cell}>
              <SkeletonBlock width="30%" height={15} />
              <SkeletonBlock width="22%" height={13} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
const holdMs = 250;
const dragThreshold = 8;
const slotMs = 30 * 60_000;
const times = Array.from({ length: 48 }, (_, index) => index * 30);
const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const date = new Intl.DateTimeFormat("en", { weekday: "long", day: "numeric", month: "long" });

export function overlapsSlot(slot: Slot, start: Date, end: Date) {
  return Date.parse(slot.begin_at) < end.getTime() && Date.parse(slot.end_at) > start.getTime();
}

export function DaySchedule({
  day,
  slots,
  onSelect,
  onInvalidTime,
}: {
  day: Date;
  slots: Slot[];
  onSelect: (start: Date, end: Date) => void;
  onInvalidTime: () => void;
}) {
  const scroll = useRef<ScrollView>(null);
  const positioned = useRef(false);
  const touch = useRef<{
    index: number;
    y: number;
    offset: number;
    held: boolean;
    dragging: boolean;
    end: number;
  } | null>(null);
  const [selection, setSelection] = useState<[number, number] | null>(null);
  const now = new Date();
  const rows = times.flatMap((minutes) => {
    const start = new Date(day);
    start.setHours(0, minutes, 0, 0);
    if (start.getHours() * 60 + start.getMinutes() !== minutes) return [];
    const end = new Date(start.getTime() + slotMs);
    const existing = slots.find((slot) => overlapsSlot(slot, start, end));
    return [{ minutes, start, end, existing, past: start <= now }];
  });
  const firstAvailable = rows.findIndex(({ existing, past }) => !existing && !past);
  const firstRow =
    firstAvailable >= 0
      ? firstAvailable
      : Math.max(
          0,
          rows.findIndex(({ existing }) => !!existing),
        );
  const dayLabel = date.format(day);

  function resetSelection() {
    touch.current = null;
    setSelection(null);
  }

  function moveSelection(pageY: number) {
    const active = touch.current;
    if (!active) return;
    const target = Math.max(
      0,
      Math.min(
        rows.length - 1,
        active.index + Math.floor((active.offset + pageY - active.y) / rowHeight),
      ),
    );
    const direction = Math.sign(target - active.index);
    let end = active.index;
    while (end !== target && !rows[end + direction].existing && !rows[end + direction].past) {
      end += direction;
    }
    if (active.end === end) return;
    active.end = end;
    setSelection([Math.min(active.index, end), Math.max(active.index, end)]);
  }

  const pan = PanResponder.create({
    onMoveShouldSetPanResponderCapture: ({ nativeEvent }) =>
      !!touch.current?.held && Math.abs(nativeEvent.pageY - touch.current.y) >= dragThreshold,
    onPanResponderGrant: ({ nativeEvent }) => {
      if (touch.current) touch.current.dragging = true;
      moveSelection(nativeEvent.pageY);
    },
    onPanResponderMove: ({ nativeEvent }) => moveSelection(nativeEvent.pageY),
    onPanResponderRelease: () => {
      const active = touch.current;
      resetSelection();
      if (!active?.dragging) return;
      const start = rows[Math.min(active.index, active.end)].start;
      const end = rows[Math.max(active.index, active.end)].end;
      if (start.getTime() > Date.now()) onSelect(start, end);
    },
    onPanResponderTerminate: resetSelection,
  });

  return (
    <View style={schedule.card}>
      <View style={schedule.header}>
        <Text accessibilityRole="header" style={schedule.dayLabel}>
          {dayLabel}
        </Text>
        <Text style={schedule.help}>
          {firstAvailable >= 0
            ? "Tap a time or hold and drag to select a range."
            : "No available times on this day."}
        </Text>
      </View>
      <ScrollView
        ref={scroll}
        nestedScrollEnabled
        scrollEnabled={!selection}
        style={schedule.timeline}
        onContentSizeChange={() => {
          if (positioned.current) return;
          positioned.current = true;
          scroll.current?.scrollTo({ y: firstRow * rowHeight, animated: false });
        }}
      >
        <View
          {...pan.panHandlers}
          onTouchMove={(event) => {
            const active = touch.current;
            if (
              active &&
              !active.held &&
              Math.abs(event.nativeEvent.pageY - active.y) > dragThreshold
            ) {
              resetSelection();
            }
          }}
          onTouchEnd={() => {
            if (!touch.current?.dragging) resetSelection();
          }}
          onTouchCancel={() => {
            if (!touch.current?.dragging) resetSelection();
          }}
        >
          {rows.map(({ minutes, start, end, existing, past }, index) => {
            const status = existing
              ? existing.scale_team_id
                ? "Booked"
                : "Open"
              : past
                ? ""
                : "Available";
            const time = `${clock.format(start)}–${clock.format(end)}`;
            const selected = selection && selection[0] <= index && index <= selection[1];
            return (
              <View key={minutes} style={schedule.row}>
                <Pressable
                  accessibilityRole="button"
                  disabled={!!existing && !past}
                  delayLongPress={holdMs}
                  onPress={() => {
                    if (start.getTime() <= Date.now()) onInvalidTime();
                    else onSelect(start, end);
                  }}
                  onLongPress={
                    existing || past
                      ? undefined
                      : () => {
                          const active = touch.current;
                          if (!active || active.index !== index) return;
                          active.held = true;
                          setSelection([index, index]);
                        }
                  }
                  accessibilityLabel={`${time}, ${status || "available"}`}
                  style={[
                    schedule.cell,
                    existing
                      ? existing.scale_team_id
                        ? schedule.booked
                        : schedule.existing
                      : past
                        ? schedule.past
                        : undefined,
                    selected && schedule.selected,
                  ]}
                  onTouchStart={
                    existing || past
                      ? undefined
                      : (event) => {
                          resetSelection();
                          const { pageY, locationY } = event.nativeEvent;
                          const active = {
                            index,
                            y: pageY,
                            offset: locationY,
                            held: false,
                            dragging: false,
                            end: index,
                          };
                          touch.current = active;
                        }
                  }
                >
                  <Text pointerEvents="none" style={[schedule.time, past && schedule.muted]}>
                    {time}
                  </Text>
                  {status ? (
                    <Text pointerEvents="none" style={schedule.status}>
                      {status}
                    </Text>
                  ) : null}
                </Pressable>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const schedule = StyleSheet.create({
  card: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#ddd", overflow: "hidden" },
  header: { padding: 10, gap: 5, borderBottomWidth: 1, borderBottomColor: "#ddd" },
  dayLabel: { color: "#007d80", fontSize: 15, fontWeight: "700", textAlign: "center" },
  help: { color: "#676767", fontSize: 12, textAlign: "center" },
  timeline: { height: timelineHeight },
  row: { height: rowHeight },
  time: { color: "#151515", fontSize: 14, fontVariant: ["tabular-nums"] },
  cell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    paddingHorizontal: 9,
    borderBottomWidth: 1,
    borderColor: "#eee",
  },
  status: { color: "#00656a", fontSize: 13, flexShrink: 1 },
  muted: { color: "#676767" },
  existing: { backgroundColor: "#d7f1ef" },
  booked: { backgroundColor: "#eee" },
  past: { backgroundColor: "#fafafa" },
  selected: { backgroundColor: "#aee8e4" },
});
