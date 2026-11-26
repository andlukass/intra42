import { useMemo, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import type { Location } from "../api";
import { theme } from "../theme";
import { SkeletonBlock } from "../ui";
import { dayKey, logtimeByDay } from "./logtime-data";

const lastMonthIndex = 3;
const columnCount = 7;
const dayGap = 4;
const gridGaps = (columnCount - 1) * dayGap;

export function LogtimeSkeleton() {
  const { width } = useWindowDimensions();
  const daySize = Math.max(
    0,
    Math.min(44, Math.floor((width - 2 * theme.spacing - 32 - gridGaps) / columnCount)),
  );
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).getDay();
  const days = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const rows = Math.ceil((firstDay + days) / columnCount);
  return (
    <View>
      <View style={s.skeletonNavigation}>
        <SkeletonBlock width={44} height={44} />
        <SkeletonBlock width="44%" height={20} />
        <SkeletonBlock width={44} height={44} />
      </View>
      <View style={[s.grid, { width: daySize * columnCount + gridGaps }]}>
        {Array.from({ length: rows * columnCount }, (_, index) => index + 1).map((day) => (
          <SkeletonBlock key={day} width={daySize} height={daySize} />
        ))}
      </View>
    </View>
  );
}
const activityShades = [
  { fromHours: 8, backgroundColor: "#2f8185", textColor: "#fff" },
  { fromHours: 5, backgroundColor: "#4cafb0", textColor: theme.ink },
  { fromHours: 3, backgroundColor: "#8fdad9", textColor: theme.ink },
  { fromHours: 1, backgroundColor: "#c9f0f0", textColor: theme.ink },
  { fromHours: 0, backgroundColor: "#edfafa", textColor: theme.ink },
];

export function Logtime({ locations, now }: { locations: Location[]; now: number }) {
  const [monthIndex, setMonthIndex] = useState(lastMonthIndex);
  const [calendarLayout, setCalendarLayout] = useState<{
    width: number;
    initialOffset: { x: number; y: number };
    monthHeights: Record<number, number>;
  }>();
  const calendar = useRef<ScrollView>(null);
  const [selected, setSelected] = useState<{
    key: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>();
  const window = useWindowDimensions();
  const tooltipWidth = 124;
  const tooltipHeight = 44;
  const left = selected
    ? Math.max(
        8,
        Math.min(
          selected.x + selected.width / 2 - tooltipWidth / 2,
          window.width - tooltipWidth - 8,
        ),
      )
    : 0;
  const above = selected ? selected.y > tooltipHeight + 20 : true;
  const top = selected
    ? above
      ? selected.y - tooltipHeight - 8
      : selected.y + selected.height + 8
    : 0;
  const totals = useMemo(() => logtimeByDay(locations, now), [locations, now]);
  const today = new Date(now);
  const months = Array.from(
    { length: lastMonthIndex + 1 },
    (_, index) => new Date(today.getFullYear(), today.getMonth() - lastMonthIndex + index, 1),
  );
  const navigation = [
    { label: "Previous month", arrow: "‹", offset: -1 },
    { label: "Next month", arrow: "›", offset: 1 },
  ];
  const daySize = Math.min(
    44,
    Math.floor(Math.max(0, (calendarLayout?.width ?? 0) - gridGaps) / columnCount),
  );
  const dayDimensions = { width: daySize, height: daySize };
  return (
    <View style={s.content}>
      <View
        style={s.calendarFrame}
        onLayout={({
          nativeEvent: {
            layout: { width },
          },
        }) => {
          if (width > 0) {
            setCalendarLayout((current) =>
              current?.width === width
                ? current
                : { width, initialOffset: { x: monthIndex * width, y: 0 }, monthHeights: {} },
            );
          }
        }}
      >
        <View pointerEvents="box-none" style={s.navigation}>
          {navigation.map(({ label, arrow, offset }) => {
            const target = monthIndex + offset;
            const disabled = !calendarLayout || target < 0 || target > lastMonthIndex;
            return (
              <Pressable
                key={label}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ disabled }}
                disabled={disabled}
                onPress={() => {
                  if (calendarLayout) {
                    calendar.current?.scrollTo({
                      x: target * calendarLayout.width,
                      animated: true,
                    });
                  }
                }}
                style={({ pressed }) => [s.navButton, (disabled || pressed) && s.navDimmed]}
              >
                <Text style={s.navArrow}>{arrow}</Text>
              </Pressable>
            );
          })}
        </View>
        {calendarLayout && (
          <ScrollView
            key={calendarLayout.width}
            ref={calendar}
            style={[s.calendar, { height: calendarLayout.monthHeights[monthIndex] }]}
            contentContainerStyle={s.calendarPages}
            horizontal
            directionalLockEnabled
            disableIntervalMomentum
            decelerationRate="fast"
            snapToInterval={calendarLayout.width}
            contentOffset={calendarLayout.initialOffset}
            showsHorizontalScrollIndicator={false}
            automaticallyAdjustContentInsets={false}
            scrollEventThrottle={32}
            onScroll={({ nativeEvent: { contentOffset } }) => {
              const index = Math.round(contentOffset.x / calendarLayout.width);
              setMonthIndex(Math.min(lastMonthIndex, Math.max(0, index)));
            }}
          >
            {months.map((month, monthPage) => {
              const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
              const offscreen = monthPage !== monthIndex;
              return (
                <View
                  key={dayKey(month)}
                  style={{ width: calendarLayout.width }}
                  onLayout={({
                    nativeEvent: {
                      layout: { height },
                    },
                  }) => {
                    setCalendarLayout((current) =>
                      height > 0 &&
                      current?.width === calendarLayout.width &&
                      current.monthHeights[monthPage] !== height
                        ? {
                            ...current,
                            monthHeights: { ...current.monthHeights, [monthPage]: height },
                          }
                        : current,
                    );
                  }}
                  accessibilityElementsHidden={offscreen}
                  importantForAccessibility={offscreen ? "no-hide-descendants" : "auto"}
                >
                  <View style={s.monthHeader}>
                    <Text accessibilityRole="header" style={s.title}>
                      {month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
                    </Text>
                  </View>
                  <View style={[s.grid, { width: columnCount * daySize + gridGaps }]}>
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri"]
                      .slice(0, month.getDay())
                      .map((weekday) => (
                        <View key={weekday} style={[s.cell, dayDimensions]} />
                      ))}
                    {Array.from({ length: days }, (_, index) => {
                      const date = new Date(month.getFullYear(), month.getMonth(), index + 1);
                      const key = dayKey(date);
                      const duration = totals[key] ?? 0;
                      const minutes = Math.round(duration / 60_000);
                      const shade =
                        duration > 0
                          ? activityShades.find(
                              ({ fromHours }) => duration >= fromHours * 3_600_000,
                            )
                          : undefined;
                      return (
                        <Pressable
                          key={key}
                          onPress={(event) => {
                            event.currentTarget.measureInWindow((x, y, width, height) => {
                              setSelected({ key, x, y, width, height });
                            });
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`${date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}, ${minutes} minutes`}
                          accessibilityState={{ selected: selected?.key === key }}
                          style={[
                            s.cell,
                            dayDimensions,
                            shade && { backgroundColor: shade.backgroundColor },
                            selected?.key === key && s.selected,
                          ]}
                        >
                          <Text style={[s.day, shade && { color: shade.textColor }]}>
                            {index + 1}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>
      <Modal
        transparent
        visible={!!selected}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setSelected(undefined)}
      >
        <View style={s.overlay} accessibilityViewIsModal>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Close logtime tooltip"
            onPress={() => setSelected(undefined)}
          />
          {selected && (
            <View
              pointerEvents="none"
              style={[s.tooltip, { left, top, width: tooltipWidth, height: tooltipHeight }]}
            >
              <Text accessibilityLiveRegion="polite" style={s.tooltipText}>
                {Math.floor((totals[selected.key] ?? 0) / 3_600_000)}h{" "}
                {Math.floor(((totals[selected.key] ?? 0) % 3_600_000) / 60_000)}m
              </Text>
              <View
                style={[
                  s.arrow,
                  above ? s.arrowDown : s.arrowUp,
                  {
                    left: Math.max(
                      8,
                      Math.min(tooltipWidth - 20, selected.x + selected.width / 2 - left - 6),
                    ),
                  },
                ]}
              />
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  skeletonNavigation: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  content: { gap: 12 },
  monthHeader: { minHeight: 44, justifyContent: "center", paddingHorizontal: 52 },
  title: { fontSize: 15, fontWeight: "800", color: theme.ink, textAlign: "center" },
  navigation: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  navButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    backgroundColor: theme.background,
  },
  navDimmed: { opacity: 0.4 },
  navArrow: { color: theme.tealText, fontSize: 24, fontWeight: "700" },
  calendarFrame: { minHeight: 44 },
  calendar: { flexGrow: 0 },
  calendarPages: { alignItems: "flex-start" },
  grid: {
    alignSelf: "center",
    marginTop: 8,
    gap: dayGap,
    alignContent: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
  },
  cell: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "transparent",
  },
  selected: { borderColor: theme.tealText },
  day: {
    fontSize: 13,
    lineHeight: 16,
    includeFontPadding: false,
    textAlign: "center",
    color: theme.ink,
    fontVariant: ["tabular-nums"],
  },
  overlay: { flex: 1 },
  tooltip: {
    position: "absolute",
    backgroundColor: "#333",
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  tooltipText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  arrow: {
    position: "absolute",
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  arrowDown: { bottom: -6, borderTopWidth: 6, borderTopColor: "#333" },
  arrowUp: { top: -6, borderBottomWidth: 6, borderBottomColor: "#333" },
});
