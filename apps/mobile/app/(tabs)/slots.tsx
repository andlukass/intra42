import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { api, type Slot, useIntraQuery, useProfile } from "../../src/api";
import { useSession } from "../../src/session";
import { DaySchedule, DayScheduleSkeleton, overlapsSlot } from "../../src/slots/DaySchedule";
import { theme } from "../../src/theme";
import { Button, QueryMessage, Screen, SkeletonBlock, styles } from "../../src/ui";

const weekDate = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function localInput(date: Date) {
  const part = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())} ${part(date.getHours())}:${part(date.getMinutes())}`;
}
function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
function midnight(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}
function parse(value: string) {
  return new Date(value.replace(" ", "T"));
}

export default function Slots() {
  const { token, loading } = useSession();
  const profile = useProfile();
  const id = profile.data?.id;
  const [day, setDay] = useState(() => midnight(new Date()));
  const [draft, setDraft] = useState<{ start: string; end: string } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [invalidTime, setInvalidTime] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { bottom } = useSafeAreaInsets();
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  function showInvalidTime() {
    clearTimeout(toastTimer.current);
    setInvalidTime(true);
    AccessibilityInfo.announceForAccessibility("Invalid time");
    toastTimer.current = setTimeout(() => setInvalidTime(false), 2500);
  }

  const client = useQueryClient();
  const week = addDays(day, -((day.getDay() + 6) % 7));
  const dateRange = new URLSearchParams({
    "range[begin_at]": `${week.toISOString()},${addDays(week, 7).toISOString()}`,
    "page[size]": "100",
    sort: "begin_at",
  });
  const slots = useIntraQuery<Slot[]>(id ? `/me/slots?${dateRange}` : undefined);

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
  const mutation = useMutation({
    mutationFn: ({ start, end }: { start: Date; end: Date }) => {
      if (!token || !id) throw new Error("Sign in to open a slot.");
      return api(token.accessToken, "/slots", undefined, {
        slot: { user_id: id, begin_at: start.toISOString(), end_at: end.toISOString() },
      });
    },
    onSuccess: (_, { start }) => {
      setDay(midnight(start));
      setDraft(null);
      setNotice("Slot opened.");
      void client.invalidateQueries({
        queryKey: ["42"],
        predicate: (query) => String(query.queryKey[1]).includes("/slots"),
      });
    },
  });

  function open(selectedStart?: Date, selectedEnd?: Date) {
    mutation.reset();
    setError("");
    setNotice("");
    const baseline = new Date(day);
    baseline.setHours(9);
    const start =
      selectedStart ??
      new Date(
        Math.max(baseline.getTime(), Math.ceil((Date.now() + 30 * 60000) / 900000) * 900000),
      );
    setDraft({
      start: localInput(start),
      end: localInput(selectedEnd ?? new Date(start.getTime() + 30 * 60000)),
    });
  }

  function submit() {
    if (!draft || mutation.isPending) return;
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
    if (slots.data?.some((slot) => overlapsSlot(slot, start, end))) {
      setError("This interval overlaps an existing slot.");
      return;
    }
    mutation.mutate({ start, end });
  }
  const elapsed = draft ? (parse(draft.end).getTime() - parse(draft.start).getTime()) / 60000 : 0;
  return (
    <Screen
      refreshControl={
        token ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={theme.tealText}
            colors={[theme.tealText]}
          />
        ) : undefined
      }
      overlay={
        invalidTime ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              bottom: Platform.OS === "ios" ? bottom + 68 : 12,
              alignSelf: "center",
              maxWidth: "92%",
              borderRadius: 12,
              backgroundColor: "#333",
              paddingHorizontal: 18,
              paddingVertical: 12,
            }}
          >
            <Text style={{ color: "white", fontSize: 16 }}>Invalid time</Text>
          </View>
        ) : null
      }
    >
      {loading ? (
        <QueryMessage
          pending
          error={null}
          empty=""
          skeleton={
            <View style={slotStyles.panel}>
              <View style={slotStyles.toolbar}>
                <SkeletonBlock width="52%" height={21} />
                <View style={slotStyles.actions}>
                  <SkeletonBlock width={68} height={44} />
                  <SkeletonBlock width={44} height={44} />
                  <SkeletonBlock width={44} height={44} />
                  <SkeletonBlock width={92} height={44} />
                </View>
              </View>
              <View style={slotStyles.dayPicker}>
                {days.map((date) => (
                  <View key={date.toISOString()} style={slotStyles.day}>
                    <SkeletonBlock width="63%" height={27} />
                  </View>
                ))}
              </View>
              <DayScheduleSkeleton />
            </View>
          }
        />
      ) : !token ? (
        <Text style={styles.muted}>Sign in from Home to manage evaluation slots.</Text>
      ) : (
        <View style={slotStyles.panel}>
          <View style={slotStyles.toolbar}>
            <View>
              <Text style={slotStyles.week}>
                {weekDate.format(week)} – {weekDate.format(addDays(week, 6))}
              </Text>
            </View>
            <View style={slotStyles.actions}>
              {[
                { title: "Today", label: "Today", onPress: () => setDay(midnight(new Date())) },
                { title: "‹", label: "Previous week", onPress: () => setDay(addDays(day, -7)) },
                { title: "›", label: "Next week", onPress: () => setDay(addDays(day, 7)) },
              ].map((action) => (
                <Pressable
                  key={action.label}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  onPress={action.onPress}
                  style={slotStyles.toolbarButton}
                >
                  <Text style={slotStyles.buttonText}>{action.title}</Text>
                </Pressable>
              ))}
              <Pressable
                accessibilityRole="button"
                disabled={!id}
                onPress={() => open()}
                style={[slotStyles.toolbarButton, slotStyles.primary, !id && { opacity: 0.5 }]}
              >
                <Text style={slotStyles.primaryText}>New slot</Text>
              </Pressable>
            </View>
          </View>
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

          {notice && <Text accessibilityRole="alert">{notice}</Text>}
          {slots.data ? (
            <DaySchedule
              key={day.toISOString()}
              day={day}
              slots={slots.data}
              onSelect={open}
              onInvalidTime={showInvalidTime}
            />
          ) : (
            <QueryMessage
              pending={profile.isPending || slots.isPending}
              error={profile.error ?? slots.error}
              empty="Could not load the calendar."
              skeleton={<DayScheduleSkeleton />}
            />
          )}
        </View>
      )}
      <Modal
        visible={!!draft}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          if (!mutation.isPending) setDraft(null);
        }}
      >
        <SafeAreaView style={{ flex: 1, padding: 20, gap: 16, backgroundColor: "#fff" }}>
          <Text style={styles.section}>Open an evaluation slot</Text>
          {draft && (
            <View style={slotStyles.timeRange}>
              {(["start", "end"] as const).map((field) => (
                <View key={field} style={slotStyles.timeFields}>
                  <View style={slotStyles.marker} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={slotStyles.fieldLabel}>
                      {field === "start" ? "Starts" : "Ends"}
                    </Text>
                    <TextInput
                      accessibilityLabel={field === "start" ? "Start date" : "End date"}
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!mutation.isPending}
                      style={slotStyles.dateInput}
                      value={draft[field].slice(0, 10)}
                      placeholder="YYYY-MM-DD"
                      onChangeText={(value) => {
                        setError("");
                        mutation.reset();
                        setDraft({ ...draft, [field]: `${value} ${draft[field].slice(11)}` });
                      }}
                    />
                  </View>
                  <TextInput
                    accessibilityLabel={field === "start" ? "Start time" : "End time"}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!mutation.isPending}
                    style={slotStyles.timeInput}
                    value={draft[field].slice(11)}
                    placeholder="HH:MM"
                    onChangeText={(value) => {
                      setError("");
                      mutation.reset();
                      setDraft({ ...draft, [field]: `${draft[field].slice(0, 10)} ${value}` });
                    }}
                  />
                </View>
              ))}
            </View>
          )}
          <Text style={styles.muted}>
            {elapsed > 0 ? `${elapsed} min · ` : ""}
            {Intl.DateTimeFormat().resolvedOptions().timeZone}
          </Text>
          {(error || mutation.error) && (
            <Text accessibilityRole="alert">{error || mutation.error?.message}</Text>
          )}
          <Button
            title={mutation.isPending ? "Opening…" : "Open slot"}
            disabled={mutation.isPending}
            onPress={submit}
          />
          <Button title="Cancel" disabled={mutation.isPending} onPress={() => setDraft(null)} />
        </SafeAreaView>
      </Modal>
    </Screen>
  );
}

const slotStyles = StyleSheet.create({
  timeRange: { padding: 12, gap: 12, borderRadius: 16, backgroundColor: "#f3f1ee" },
  timeFields: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 64 },
  marker: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#007d80" },
  fieldLabel: { fontSize: 14, fontWeight: "600", color: "#596461" },
  dateInput: { fontSize: 16, fontWeight: "700", minHeight: 32, color: "#151515" },
  timeInput: {
    width: 100,
    minHeight: 44,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#d8d4d1",
    borderRadius: 10,
    backgroundColor: "#fff9",
    fontSize: 20,
    fontWeight: "700",
    color: "#151515",
  },

  panel: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e8e8e8",
    borderRadius: 6,
    padding: 10,
    gap: 10,
  },
  toolbar: { gap: 12, marginBottom: 8 },
  week: { color: "#007d80", fontSize: 15, marginTop: 3 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  toolbarButton: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 12,
    borderRadius: 5,
    backgroundColor: "#eee",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: "#151515", fontSize: 16 },
  primary: { backgroundColor: "#00878b" },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  dayPicker: { flexDirection: "row", gap: 2 },
  day: {
    flex: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#ddd",
    gap: 2,
  },
  selectedDay: { backgroundColor: "#00878b", borderColor: "#00878b" },
  dayText: { fontSize: 12, color: "#151515" },
  dayNumber: { fontSize: 14, fontWeight: "700", color: "#151515" },
  selectedDayText: { color: "#fff" },
});
