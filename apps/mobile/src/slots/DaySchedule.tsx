import { useRef, useState } from "react";
import {
  PanResponder,
  Pressable,
  ScrollView,
  type ScrollViewProps,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { Slot } from "../api";
import { SkeletonBlock } from "../ui";
import { calendarDate, calendarTimeZone } from "./calendarTime";

const rowHeight = 30;
export const slotTimelineHeight = 500;

export function DayScheduleSkeleton({ height = slotTimelineHeight }: { height?: number } = {}) {
  return (
    <View
      accessibilityLabel="Loading slot calendar"
      accessibilityState={{ busy: true }}
      style={schedule.card}
    >
      <View style={{ height, overflow: "hidden" }}>
        {times.slice(0, Math.ceil(height / rowHeight)).map((time, index) => (
          <View
            key={time}
            style={[
              schedule.row,
              { flexDirection: "row", borderBottomWidth: 1, borderColor: "#e6e6e6" },
            ]}
          >
            <View style={schedule.timeColumn}>
              {index % 2 === 0 && <SkeletonBlock width={50} height={12} radius={3} />}
            </View>
            <View
              style={{
                flex: 1,
                backgroundColor: "#fafafa",
                paddingHorizontal: 12,
                justifyContent: "center",
              }}
            >
              <SkeletonBlock
                width={index % 3 === 0 ? "65%" : index % 3 === 1 ? "45%" : "55%"}
                height={12}
                radius={3}
              />
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
function formatClock(date: Date, hour12 = false) {
  return date.toLocaleTimeString(hour12 ? "en-US" : "en-GB", {
    hour: hour12 ? "numeric" : "2-digit",
    minute: "2-digit",
    hour12,
  });
}

export function overlapsSlot(slot: Slot, start: Date, end: Date) {
  return Date.parse(slot.begin_at) < end.getTime() && Date.parse(slot.end_at) > start.getTime();
}

export function openSlotBlocks(slots: Slot[], day: Date) {
  const startOfDay = calendarDate(day);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = calendarDate(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);
  return slots.flatMap((slot) => {
    if (slot.scale_team_id) return [];
    const begin = Date.parse(slot.begin_at);
    const end = Date.parse(slot.end_at);
    const visibleStart = Math.max(begin, startOfDay.getTime());
    const visibleEnd = Math.min(end, endOfDay.getTime());
    if (
      !Number.isFinite(visibleStart) ||
      !Number.isFinite(visibleEnd) ||
      visibleEnd <= visibleStart
    )
      return [];
    return [
      {
        id: slot.id,
        slot,
        top: ((visibleStart - startOfDay.getTime()) / slotMs) * rowHeight,
        height: ((visibleEnd - visibleStart) / slotMs) * rowHeight,
        label: `${formatClock(calendarDate(begin, calendarTimeZone(day))).replace(/^0/, "")} - ${formatClock(calendarDate(end, calendarTimeZone(day))).replace(/^0/, "")}`,
      },
    ];
  });
}

export function DaySchedule({
  day,
  slots,
  onSelect,
  onDragSelect,
  onInvalidTime,
  onSelectionChange,
  onCancel,
  height = slotTimelineHeight,
  refreshControl,
  saving = false,
}: {
  day: Date;
  slots: Slot[];
  onSelect: (start: Date, end: Date) => void;
  onDragSelect: (start: Date, end: Date) => void;
  onInvalidTime: () => void;
  onSelectionChange: (selecting: boolean) => void;
  onCancel: (slot: Slot) => void;
  height?: number;
  refreshControl?: ScrollViewProps["refreshControl"];
  saving?: boolean;
}) {
  const scroll = useRef<ScrollView>(null);
  const positioned = useRef(false);
  const ignorePress = useRef(false);
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
    const start = calendarDate(day);
    start.setHours(0, minutes, 0, 0);
    if (start.getHours() * 60 + start.getMinutes() !== minutes) return [];
    const end = calendarDate(start.getTime() + slotMs, calendarTimeZone(day));
    const existing = slots.find((slot) => overlapsSlot(slot, start, end));
    return [{ minutes, start, end, existing, past: start <= now }];
  });
  const firstAvailable = rows.findIndex(({ existing, past }) => !existing && !past);
  const firstRow =
    firstAvailable >= 0
      ? Math.max(0, firstAvailable - 2)
      : Math.max(
          0,
          rows.findIndex(({ existing }) => !!existing),
        );
  const selectedRange = selection
    ? `${formatClock(rows[selection[0]].start, true).toLowerCase()} – ${formatClock(rows[selection[1]].end, true).toLowerCase()}`
    : null;

  function resetSelection() {
    touch.current = null;
    setSelection(null);
    onSelectionChange(false);
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

  function finishSelection() {
    const active = touch.current;
    resetSelection();
    if (!active?.held) return;
    const start = rows[Math.min(active.index, active.end)].start;
    const end = rows[Math.max(active.index, active.end)].end;
    if (start.getTime() > Date.now()) onDragSelect(start, end);
  }

  const pan = PanResponder.create({
    // Once held, claim the first movement before an ancestor can start scrolling.
    onMoveShouldSetPanResponderCapture: () => !!touch.current?.held,
    onPanResponderTerminationRequest: () => !touch.current?.held,
    onPanResponderGrant: ({ nativeEvent }) => {
      if (touch.current) touch.current.dragging = true;
      moveSelection(nativeEvent.pageY);
    },
    onPanResponderMove: ({ nativeEvent }) => moveSelection(nativeEvent.pageY),
    onPanResponderRelease: finishSelection,
    onPanResponderTerminate: resetSelection,
  });

  return (
    <View style={schedule.card} {...pan.panHandlers}>
      <ScrollView
        ref={scroll}
        nestedScrollEnabled
        scrollEnabled={!selection}
        style={{ height }}
        refreshControl={refreshControl}
        onContentSizeChange={() => {
          if (positioned.current) return;
          positioned.current = true;
          scroll.current?.scrollTo({ y: firstRow * rowHeight, animated: false });
        }}
      >
        <View
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
            if (touch.current?.dragging) return;
            if (touch.current?.held) finishSelection();
            else resetSelection();
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
            const time = `${formatClock(start)}–${formatClock(end)}`;
            const selected = selection && selection[0] <= index && index <= selection[1];
            return (
              <View key={minutes} style={schedule.row}>
                <Pressable
                  accessibilityRole="button"
                  disabled={!!existing && !past}
                  delayLongPress={holdMs}
                  onPress={() => {
                    if (ignorePress.current) {
                      ignorePress.current = false;
                      return;
                    }
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
                          ignorePress.current = true;
                          onSelectionChange(true);
                          setSelection([index, index]);
                        }
                  }
                  accessibilityLabel={`${time}, ${status || "available"}`}
                  style={[
                    schedule.cell,
                    existing
                      ? existing.scale_team_id
                        ? schedule.booked
                        : undefined
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
                          ignorePress.current = false;
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
                  <View pointerEvents="none" style={schedule.timeColumn}>
                    <Text style={schedule.time}>
                      {minutes % 60 === 0 ? formatClock(start, true).toLowerCase() : ""}
                    </Text>
                  </View>
                </Pressable>
              </View>
            );
          })}
          {selection && (
            <View
              pointerEvents="none"
              style={[
                schedule.selectionRange,
                {
                  top: selection[0] * rowHeight,
                  height: (selection[1] - selection[0] + 1) * rowHeight,
                },
              ]}
            >
              <Text style={schedule.selectionLabel}>{selectedRange}</Text>
            </View>
          )}
          {openSlotBlocks(slots, day).map((block) => (
            <View
              key={block.id}
              style={[schedule.openSlot, { top: block.top, height: block.height }]}
            >
              <Text numberOfLines={1} style={[schedule.slotTime, { paddingRight: 28 }]}>
                {block.label}
              </Text>
              <Text numberOfLines={1} style={schedule.slotTitle}>
                Available
              </Text>
              {Date.parse(block.slot.end_at) > now.getTime() && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Cancel slot ${block.label}`}
                  disabled={saving}
                  accessibilityState={{ disabled: saving }}
                  onPress={() => onCancel(block.slot)}
                  style={schedule.cancelSlot}
                >
                  <Text style={schedule.cancelText}>×</Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const schedule = StyleSheet.create({
  card: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#ddd", overflow: "hidden" },
  selectionRange: {
    position: "absolute",
    left: 88,
    right: 0,
    borderWidth: 2,
    borderColor: "#00a8ab",
    backgroundColor: "#aee8e4",
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  selectionLabel: { color: "#00656a", fontSize: 12, fontWeight: "700" },
  row: { height: rowHeight },
  time: { color: "#00a8ab", fontSize: 15, fontVariant: ["tabular-nums"] },
  timeColumn: {
    width: 88,
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    borderRightWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fff",
  },
  cell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    paddingRight: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderColor: "#e6e6e6",
  },
  openSlot: {
    position: "absolute",
    left: 88,
    right: 0,
    overflow: "hidden",
    backgroundColor: "#d7f1ef",
    borderColor: "#00babc",
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  slotTime: { color: "#00a8ab", fontSize: 12, lineHeight: 16 },
  slotTitle: { color: "#00a8ab", fontSize: 14, lineHeight: 18, fontWeight: "700" },
  cancelSlot: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  cancelText: { color: "#00a8ab", fontSize: 22 },
  booked: { backgroundColor: "#eee" },
  past: { backgroundColor: "#fafafa" },
  selected: { backgroundColor: "#aee8e4" },
});
