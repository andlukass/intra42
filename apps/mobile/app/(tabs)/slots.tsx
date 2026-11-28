import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  type LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { api, type Slot, useIntraQuery, useProfile } from "../../src/api";
import { ProfileSelector } from "../../src/home/ProfileSelector";
import { ModalFooter } from "../../src/ModalFooter";
import { useSession } from "../../src/session";
import { slotBookingError } from "../../src/slots/bookingWindow";
import { calendarDate, parseCalendarInput, utcISOString } from "../../src/slots/calendarTime";
import { DayScheduleSkeleton, overlapsSlot, slotTimelineHeight } from "../../src/slots/DaySchedule";
import { DaySchedulePager } from "../../src/slots/DaySchedulePager";
import { SlotStartPicker } from "../../src/slots/SlotStartPicker";
import { slotWeekPath } from "../../src/slots/slotWeek";
import { weekLabel } from "../../src/slots/weekLabel";
import { theme } from "../../src/theme";
import { Button, QueryMessage, SkeletonBlock, styles, Toast, useToast } from "../../src/ui";

function localInput(date: Date) {
  const part = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())} ${part(date.getHours())}:${part(date.getMinutes())}`;
}
function addDays(date: Date, days: number) {
  const next = calendarDate(date);
  next.setDate(next.getDate() + days);
  return next;
}
function midnight(date: Date) {
  const next = calendarDate(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours
    ? `${hours} ${hours === 1 ? "hour" : "hours"}${rest ? ` ${rest} min` : ""}`
    : `${minutes} min`;
}
const durationOptions = Array.from({ length: 31 }, (_, index) => {
  const minutes = 30 + index * 15;
  return { id: minutes, label: durationLabel(minutes) };
});

export default function Slots() {
  const { token, loading } = useSession();
  const profile = useProfile();
  const id = profile.data?.id;
  const primaryCampus = profile.data?.campus_users?.find((campus) => campus.is_primary)?.campus_id;
  const timeZone = (
    profile.data?.campus?.find((campus) => campus.id === primaryCampus) ?? profile.data?.campus?.[0]
  )?.time_zone;
  function parse(value: string) {
    return parseCalendarInput(value, timeZone ?? "UTC");
  }
  const [day, setDay] = useState(() => midnight(new Date()));
  useEffect(() => {
    if (timeZone) setDay(midnight(calendarDate(Date.now(), timeZone)));
  }, [timeZone]);
  const [draft, setDraft] = useState<{ start: string; end: string } | null>(null);
  const [duration, setDuration] = useState(30);
  const [error, setError] = useState("");
  const { toast, showToast, hideToast } = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const { bottom } = useSafeAreaInsets();
  const [timelineHeight, setTimelineHeight] = useState(0);
  function measureTimeline({ nativeEvent }: LayoutChangeEvent) {
    setTimelineHeight(
      Math.min(slotTimelineHeight, Math.max(0, Math.floor(nativeEvent.layout.height) - 2)),
    );
  }
  const savingSlot = useRef(false);

  function showInvalidTime() {
    showToast("Invalid time", true);
  }

  const client = useQueryClient();
  const week = addDays(day, -((day.getDay() + 6) % 7));
  const slots = useIntraQuery<Slot[]>(id && timeZone ? slotWeekPath(day) : undefined);

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      if (id) await slots.refetch({ cancelRefetch: false });
      else await profile.refetch({ cancelRefetch: false });
    } finally {
      setRefreshing(false);
    }
  }

  const days = Array.from({ length: 7 }, (_, index) => addDays(week, index));
  const selectedDay = (day.getDay() + 6) % 7;
  const isToday = day.toDateString() === calendarDate(Date.now(), timeZone).toDateString();
  const mutation = useMutation({
    retry: false,
    mutationFn: ({ start, end }: { start: Date; end: Date }) => {
      if (!token || !id) throw new Error("Sign in to open a slot.");
      const bookingError = slotBookingError(start, end);
      if (bookingError) throw new Error(bookingError);
      if (
        !Number.isFinite(start.getTime()) ||
        !Number.isFinite(end.getTime()) ||
        start <= new Date() ||
        end <= start ||
        start.getMinutes() % 15 ||
        end.getMinutes() % 15
      )
        throw new Error("Choose a future interval in 15-minute increments.");
      if (slots.data?.some((slot) => slot.id !== -1 && overlapsSlot(slot, start, end)))
        throw new Error("This interval overlaps an existing slot.");
      return api(token.accessToken, "/slots", undefined, {
        slot: { user_id: id, begin_at: utcISOString(start), end_at: utcISOString(end) },
      });
    },
    onMutate: async ({ start, end }) => {
      hideToast();
      const key = ["42", slotWeekPath(start)] as const;
      await client.cancelQueries({ queryKey: key, exact: true });
      const previous = client.getQueryData<Slot[]>(key);
      client.setQueryData<Slot[]>(key, [
        ...(previous ?? []),
        { id: -1, begin_at: utcISOString(start), end_at: utcISOString(end), scale_team_id: null },
      ]);
      return { key, previous };
    },
    onError: (error, _variables, context) => {
      if (context) {
        client.setQueryData(context.key, context.previous ?? []);
        void client.invalidateQueries({ queryKey: context.key, exact: true });
      }
      showToast(error.message, true);
    },
    onSettled: () => {
      savingSlot.current = false;
    },
    onSuccess: async (_, { start }) => {
      setDay(midnight(start));
      setDraft(null);
      showToast("Slot opened.");
      await client.invalidateQueries({
        queryKey: ["42"],
        predicate: (query) => String(query.queryKey[1]).includes("/slots"),
      });
    },
  });

  function open(selectedStart?: Date, selectedEnd?: Date) {
    if (savingSlot.current || mutation.isPending) return;
    mutation.reset();
    setError("");
    hideToast();
    const baseline = calendarDate(day);
    baseline.setHours(9);
    const start =
      selectedStart ??
      calendarDate(
        Math.max(baseline.getTime(), Math.ceil((Date.now() + 30 * 60000) / 900000) * 900000),
        timeZone,
      );
    setDuration(30);
    setDraft({
      start: localInput(start),
      end: localInput(selectedEnd ?? calendarDate(start.getTime() + 30 * 60000, timeZone)),
    });
  }

  const cancellation = useMutation({
    retry: false,
    mutationFn: (slot: Slot) => {
      if (!token || !id) throw new Error("Sign in to cancel a slot.");
      if (slot.scale_team_id || Date.parse(slot.end_at) <= Date.now())
        throw new Error("This slot cannot be canceled.");
      return api(token.accessToken, "/slots/cancel", undefined, {
        slot: {
          user_id: id,
          begin_at: new Date(slot.begin_at).toISOString(),
          end_at: new Date(slot.end_at).toISOString(),
        },
      });
    },
    onMutate: async (slot) => {
      hideToast();
      const queries = {
        queryKey: ["42"],
        predicate: (query: { queryKey: readonly unknown[] }) =>
          String(query.queryKey[1]).startsWith("/me/slots?"),
      };
      await client.cancelQueries(queries);
      const previous = client.getQueriesData<Slot[]>(queries);
      for (const [key, data] of previous) {
        if (!data) continue;
        client.setQueryData<Slot[]>(
          key,
          data.filter(
            (item) =>
              Date.parse(item.begin_at) !== Date.parse(slot.begin_at) ||
              Date.parse(item.end_at) !== Date.parse(slot.end_at),
          ),
        );
      }
      return { previous };
    },
    onError: (error, _slot, context) => {
      for (const [key, data] of context?.previous ?? []) {
        if (data) client.setQueryData(key, data);
      }
      showToast(error.message, true);
    },
    onSuccess: async () => {
      showToast("Slot canceled.");
      await client.invalidateQueries({
        queryKey: ["42"],
        predicate: (query) => String(query.queryKey[1]).includes("/slots"),
      });
    },
    onSettled: () => {
      savingSlot.current = false;
    },
  });

  function cancelSlot(slot: Slot) {
    if (savingSlot.current || mutation.isPending || cancellation.isPending) return;
    savingSlot.current = true;
    cancellation.mutate(slot);
  }

  function saveDraggedSlot(start: Date, end: Date) {
    if (savingSlot.current || mutation.isPending) return;
    savingSlot.current = true;
    mutation.mutate({ start, end });
  }

  function submit() {
    if (!draft || mutation.isPending || savingSlot.current) return;
    const start = parse(draft.start),
      end = parse(draft.end);
    if (
      localInput(start) !== draft.start ||
      localInput(end) !== draft.end ||
      start <= new Date() ||
      end <= start ||
      start.getMinutes() % 15 ||
      end.getMinutes() % 15
    ) {
      setError("Enter a future interval in 15-minute increments using YYYY-MM-DD HH:MM.");
      return;
    }
    const bookingError = slotBookingError(start, end);
    if (bookingError) {
      showToast(bookingError, true);
      return;
    }
    if (slots.data?.some((slot) => overlapsSlot(slot, start, end))) {
      setError("This interval overlaps an existing slot.");
      return;
    }
    mutation.mutate({ start, end });
  }
  function updateStart(start: string, minutes = duration) {
    if (!draft) return;
    setError("");
    mutation.reset();
    const date = parse(start);
    const bookingError = slotBookingError(
      date,
      calendarDate(date.getTime() + minutes * 60000, timeZone),
    );
    if (bookingError) {
      showToast(bookingError, true);
      return;
    }
    setDuration(minutes);
    setDraft({
      start,
      end: Number.isFinite(date.getTime())
        ? localInput(calendarDate(date.getTime() + minutes * 60000, timeZone))
        : "",
    });
  }
  const end = draft ? parse(draft.end) : null;
  const validEnd = end && Number.isFinite(end.getTime());
  const nextDay = validEnd && draft && end.toDateString() !== parse(draft.start).toDateString();
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.screen}>
      <View style={[slotStyles.page, { paddingBottom: bottom + 60 }]}>
        {loading ? (
          <View
            accessible
            accessibilityLabel="Loading slot calendar"
            accessibilityState={{ busy: true }}
            style={[styles.card, slotStyles.calendarCard]}
          >
            <View style={slotStyles.toolbar}>
              <View style={slotStyles.actions}>
                {[
                  { key: "today", width: 68 },
                  { key: "previous", width: 44 },
                  { key: "next", width: 44 },
                  { key: "new", width: 92 },
                ].map(({ key, width }) => (
                  <SkeletonBlock key={key} width={width} height={44} radius={2} />
                ))}
              </View>
              <View style={{ alignItems: "center", minHeight: 28, justifyContent: "center" }}>
                <SkeletonBlock width="65%" height={23} radius={4} />
              </View>
            </View>
            <View style={slotStyles.calendarBody}>
              <View style={slotStyles.dayPicker}>
                {days.map((date) => (
                  <View key={date.toISOString()} style={slotStyles.day}>
                    <SkeletonBlock width={24} height={10} radius={3} />
                    <SkeletonBlock width={18} height={15} radius={3} />
                  </View>
                ))}
              </View>
              <View style={slotStyles.calendarBody} onLayout={measureTimeline}>
                {timelineHeight > 0 && <DayScheduleSkeleton height={timelineHeight} />}
              </View>
            </View>
          </View>
        ) : !token ? (
          <Text style={styles.muted}>Sign in from Home to manage evaluation slots.</Text>
        ) : (
          <View style={[styles.card, slotStyles.calendarCard]}>
            <View style={slotStyles.toolbar}>
              <View style={slotStyles.actions}>
                {[
                  {
                    title: "Today",
                    label: "Today",
                    onPress: () => setDay(midnight(calendarDate(Date.now(), timeZone))),
                  },
                  { title: "‹", label: "Previous week", onPress: () => setDay(addDays(day, -7)) },
                  { title: "›", label: "Next week", onPress: () => setDay(addDays(day, 7)) },
                ].map((action) => (
                  <Pressable
                    key={action.label}
                    accessibilityRole="button"
                    accessibilityLabel={action.label}
                    disabled={action.label === "Today" && isToday}
                    accessibilityState={{ disabled: action.label === "Today" && isToday }}
                    onPress={action.onPress}
                    style={[
                      slotStyles.toolbarButton,
                      action.label === "Today" && slotStyles.today,
                      action.label === "Today" && isToday && slotStyles.todayDisabled,
                    ]}
                  >
                    <Text
                      style={[
                        slotStyles.buttonText,
                        action.label === "Today" && slotStyles.todayText,
                      ]}
                    >
                      {action.title}
                    </Text>
                  </Pressable>
                ))}
                <Pressable
                  accessibilityRole="button"
                  disabled={!id || !timeZone}
                  onPress={() => open()}
                  style={[slotStyles.toolbarButton, slotStyles.primary, !id && { opacity: 0.5 }]}
                >
                  <Text style={slotStyles.primaryText}>New slot</Text>
                </Pressable>
              </View>
              <Text style={slotStyles.week}>{weekLabel(week, addDays(week, 6))}</Text>
            </View>
            <View style={slotStyles.calendarBody}>
              <View style={slotStyles.dayPicker}>
                {days.map((date, index) => {
                  const selected = index === selectedDay;
                  return (
                    <Pressable
                      key={date.toISOString()}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={date.toDateString()}
                      onPress={() => setDay(date)}
                      style={[slotStyles.day, selected && slotStyles.selectedDay]}
                    >
                      <Text style={[slotStyles.dayText, selected && slotStyles.selectedDayText]}>
                        {date.toLocaleDateString("en", { weekday: "short" })}
                      </Text>
                      <Text style={[slotStyles.dayNumber, selected && slotStyles.selectedDayText]}>
                        {date.getDate()}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={slotStyles.calendarBody} onLayout={measureTimeline}>
                {timelineHeight > 0 &&
                  (slots.data ? (
                    <DaySchedulePager
                      day={day}
                      slots={slots.data}
                      onSelect={open}
                      onDragSelect={saveDraggedSlot}
                      onCancel={cancelSlot}
                      saving={mutation.isPending || cancellation.isPending}
                      height={timelineHeight}
                      refreshControl={
                        <RefreshControl
                          refreshing={refreshing}
                          onRefresh={() => void refresh()}
                          tintColor={theme.tealText}
                          colors={[theme.tealText]}
                        />
                      }
                      onInvalidTime={showInvalidTime}
                      onChangeDay={(offset) => setDay((current) => addDays(current, offset))}
                    />
                  ) : (
                    <QueryMessage
                      pending={profile.isPending || slots.isPending}
                      error={profile.error ?? slots.error}
                      empty="Could not load the calendar."
                      skeleton={<DayScheduleSkeleton height={timelineHeight} />}
                    />
                  ))}
              </View>
            </View>
          </View>
        )}
      </View>
      {toast && <Toast {...toast} />}
      <Modal
        visible={!!draft}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          if (!mutation.isPending) setDraft(null);
        }}
      >
        <SafeAreaView
          style={slotStyles.sheet}
          edges={Platform.OS === "ios" ? ["left", "right"] : ["top", "left", "right"]}
        >
          <ScrollView
            style={slotStyles.modalScroll}
            contentContainerStyle={slotStyles.modalContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text accessibilityRole="header" style={slotStyles.modalTitle}>
              Open an evaluation slot
            </Text>
            {draft && (
              <>
                <View style={slotStyles.formSection}>
                  <Text style={slotStyles.formLabel}>Starts</Text>
                  <SlotStartPicker
                    value={parse(draft.start)}
                    disabled={mutation.isPending}
                    onChange={(date) => updateStart(localInput(date))}
                  />
                </View>
                <View style={slotStyles.formSection}>
                  <Text style={slotStyles.formLabel}>Duration</Text>
                  <ProfileSelector
                    name="duration"
                    label={durationLabel(duration)}
                    options={durationOptions}
                    selectedId={duration}
                    disabled={mutation.isPending}
                    style={slotStyles.durationSelect}
                    textStyle={slotStyles.durationText}
                    iconColor={theme.tealText}
                    onChange={(minutes) => {
                      updateStart(draft.start, minutes);
                    }}
                  />
                </View>
                <View style={slotStyles.endSummary}>
                  <Text style={slotStyles.formLabel}>Ends</Text>
                  <Text style={slotStyles.endTime}>
                    {validEnd
                      ? `${end.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · ${end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase()}`
                      : "—"}
                  </Text>
                  {nextDay && <Text style={slotStyles.nextDay}>Next day</Text>}
                </View>
              </>
            )}
            {(error || mutation.error) && (
              <Text accessibilityRole="alert">{error || mutation.error?.message}</Text>
            )}
          </ScrollView>
          <ModalFooter onClose={() => setDraft(null)} disabled={mutation.isPending}>
            <Button
              title={mutation.isPending ? "Opening…" : "Open slot"}
              disabled={mutation.isPending}
              onPress={submit}
            />
          </ModalFooter>
          {toast && <Toast {...toast} bottom={100} />}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const slotStyles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: theme.surface },
  modalScroll: { flex: 1 },
  modalContent: { padding: 20, gap: 16 },
  modalTitle: { fontSize: 22, fontWeight: "700", color: theme.ink, marginBottom: 4 },
  formSection: { gap: 8 },
  formLabel: { fontSize: 16, fontWeight: "700", color: theme.ink },
  durationSelect: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    justifyContent: "space-between",
  },
  durationText: { fontSize: 16, fontWeight: "600", color: theme.ink },
  endSummary: { padding: 16, gap: 8, borderRadius: 8, backgroundColor: "#e0f6f6" },
  endTime: { fontSize: 18, fontWeight: "700", color: theme.ink },
  nextDay: {
    alignSelf: "flex-start",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: theme.tealText,
    color: "#fff",
    fontWeight: "600",
  },

  page: { flex: 1, padding: 12 },
  calendarCard: { flex: 1, maxHeight: slotTimelineHeight + 176, padding: 12, gap: 12 },
  calendarBody: { flex: 1 },
  toolbar: { gap: 12 },
  week: { color: "#00babc", fontSize: 23, lineHeight: 28, fontWeight: "600", textAlign: "center" },
  actions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 6 },
  toolbarButton: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 12,
    borderRadius: 2,
    backgroundColor: "#eee",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: "#777", fontSize: 16, fontWeight: "600" },
  today: { backgroundColor: "#00babc" },
  todayDisabled: { backgroundColor: "#7bd5d7" },
  todayText: { color: "#fff" },
  primary: { backgroundColor: "#00babc" },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  dayPicker: { flexDirection: "row", borderWidth: 1, borderBottomWidth: 0, borderColor: "#ddd" },
  day: {
    flex: 1,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 3,
    borderColor: "transparent",
    gap: 2,
  },
  selectedDay: { backgroundColor: "#e0f6f6", borderColor: "#00babc" },
  dayText: { fontSize: 12, color: "#00a8ab", fontWeight: "700" },
  dayNumber: { fontSize: 15, fontWeight: "700", color: "#00a8ab" },
  selectedDayText: { color: "#007d80" },
});
