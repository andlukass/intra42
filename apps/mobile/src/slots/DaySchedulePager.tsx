import { useLayoutEffect, useRef, useState } from "react";
import { ScrollView, type ScrollViewProps, View } from "react-native";
import { type Slot, useIntraQuery } from "../api";
import { QueryMessage } from "../ui";
import { calendarDate } from "./calendarTime";
import { DaySchedule, DayScheduleSkeleton } from "./DaySchedule";
import { slotWeekPath } from "./slotWeek";

export function DaySchedulePager({
  day,
  slots,
  onChangeDay,
  onSelect,
  onDragSelect,
  onInvalidTime,
  onSelectionChange,
  onCancel,
  saving,
  height,
  refreshControl,
}: {
  day: Date;
  slots: Slot[];
  onChangeDay: (offset: number) => void;
  onSelect: (start: Date, end: Date) => void;
  onDragSelect: (start: Date, end: Date) => void;
  onInvalidTime: () => void;
  onSelectionChange?: (selecting: boolean) => void;
  onCancel: (slot: Slot) => void;
  saving?: boolean;
  height?: number;
  refreshControl?: ScrollViewProps["refreshControl"];
}) {
  const pager = useRef<ScrollView>(null);
  const changingDay = useRef(false);
  const [width, setWidth] = useState(0);
  const [selecting, setSelecting] = useState(false);
  const dayKey = day.toDateString();

  useLayoutEffect(() => {
    // Rebase the three-page window only after the native slide has settled.
    if (dayKey && width) pager.current?.scrollTo({ x: width, animated: false });
    changingDay.current = false;
    setSelecting(false);
    onSelectionChange?.(false);
    return () => onSelectionChange?.(false);
  }, [dayKey, width, onSelectionChange]);

  function changeSelection(active: boolean) {
    setSelecting(active);
    onSelectionChange?.(active);
  }

  return (
    <View
      onLayout={({ nativeEvent: { layout } }) => setWidth(layout.width)}
      style={{ overflow: "hidden" }}
    >
      {width > 0 ? (
        <ScrollView
          key={width}
          ref={pager}
          horizontal
          pagingEnabled
          directionalLockEnabled
          disableIntervalMomentum
          decelerationRate="fast"
          scrollEnabled={!selecting}
          contentOffset={{ x: width, y: 0 }}
          showsHorizontalScrollIndicator={false}
          automaticallyAdjustContentInsets={false}
          onMomentumScrollEnd={({ nativeEvent: { contentOffset } }) => {
            const offset = Math.max(-1, Math.min(1, Math.round(contentOffset.x / width) - 1));
            if (!offset || changingDay.current) return;
            changingDay.current = true;
            onChangeDay(offset);
          }}
        >
          {[-1, 0, 1].map((offset) => {
            const pageDay = calendarDate(day);
            pageDay.setDate(pageDay.getDate() + offset);
            return (
              <View
                key={offset}
                style={{ width }}
                accessibilityElementsHidden={offset !== 0}
                importantForAccessibility={offset === 0 ? "auto" : "no-hide-descendants"}
              >
                <SchedulePage
                  key={pageDay.toDateString()}
                  loadedWeek={slotWeekPath(day)}
                  day={pageDay}
                  slots={slots}
                  onSelect={onSelect}
                  onDragSelect={onDragSelect}
                  onInvalidTime={onInvalidTime}
                  onSelectionChange={changeSelection}
                  onCancel={onCancel}
                  saving={saving}
                  height={height}
                  refreshControl={offset === 0 ? refreshControl : undefined}
                />
              </View>
            );
          })}
        </ScrollView>
      ) : (
        <DayScheduleSkeleton height={height} />
      )}
    </View>
  );
}

function SchedulePage({
  loadedWeek,
  ...props
}: Parameters<typeof DaySchedule>[0] & { loadedWeek: string }) {
  const path = slotWeekPath(props.day);
  const neighbor = useIntraQuery<Slot[]>(path !== loadedWeek ? path : undefined);
  if (path === loadedWeek) return <DaySchedule {...props} />;
  if (neighbor.data) return <DaySchedule {...props} slots={neighbor.data} />;
  return (
    <QueryMessage
      pending={neighbor.isPending}
      error={neighbor.error}
      empty="Could not load the calendar."
      skeleton={<DayScheduleSkeleton height={props.height} />}
    />
  );
}
