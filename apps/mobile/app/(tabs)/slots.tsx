import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, type Slot, useIntraQuery, useProfile } from "../../src/api";
import { useSession } from "../../src/session";
import { Button, Card, QueryMessage, Screen, styles, teal } from "../../src/ui";

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
  const { token } = useSession();
  const profile = useProfile();
  const id = profile.data?.id;
  const [day, setDay] = useState(() => midnight(new Date()));
  const [draft, setDraft] = useState<{ start: string; end: string } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const client = useQueryClient();
  const week = addDays(day, -((day.getDay() + 6) % 7));
  const dateRange = new URLSearchParams({
    "range[begin_at]": `${week.toISOString()},${addDays(week, 7).toISOString()}`,
    "page[size]": "100",
    sort: "begin_at",
  });
  const slots = useIntraQuery<Slot[]>(id ? `/users/${id}/slots?${dateRange}` : undefined);
  const daySlots = slots.data?.filter(
    (slot) =>
      Date.parse(slot.end_at) > day.getTime() &&
      Date.parse(slot.begin_at) < addDays(day, 1).getTime(),
  );
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

  function open() {
    mutation.reset();
    setError("");
    setNotice("");
    const baseline = new Date(day);
    baseline.setHours(9);
    const start = new Date(
      Math.max(baseline.getTime(), Math.ceil((Date.now() + 30 * 60000) / 900000) * 900000),
    );
    setDraft({ start: localInput(start), end: localInput(new Date(start.getTime() + 30 * 60000)) });
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
    mutation.mutate({ start, end });
  }
  const elapsed = draft ? (parse(draft.end).getTime() - parse(draft.start).getTime()) / 60000 : 0;
  return (
    <Screen>
      <Text style={styles.title}>Manage slots</Text>
      {!token ? (
        <Text style={styles.muted}>Sign in from Home to manage evaluation slots.</Text>
      ) : (
        <>
          <Card title={`${week.toLocaleDateString()} – ${addDays(week, 6).toLocaleDateString()}`}>
            <View style={styles.row}>
              <Button title="Previous" onPress={() => setDay(addDays(day, -7))} />
              <Button title="Today" onPress={() => setDay(midnight(new Date()))} />
              <Button title="Next" onPress={() => setDay(addDays(day, 7))} />
            </View>
            <View style={[styles.row, { justifyContent: "space-between", gap: 4 }]}>
              {Array.from({ length: 7 }, (_, index) => {
                const date = addDays(week, index),
                  selected = date.getTime() === day.getTime();
                return (
                  <Pressable
                    key={date.toISOString()}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={date.toDateString()}
                    onPress={() => setDay(date)}
                    style={{
                      flex: 1,
                      alignItems: "center",
                      paddingVertical: 9,
                      borderRadius: 8,
                      backgroundColor: selected ? teal : "#eff3f1",
                    }}
                  >
                    <Text style={{ color: selected ? "white" : "#18221e" }}>
                      {date.toLocaleDateString("en", { weekday: "short" })}
                    </Text>
                    <Text style={{ color: selected ? "white" : "#18221e", fontWeight: "700" }}>
                      {date.getDate()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>
          <Button title="New slot" disabled={!id} onPress={open} />
          {notice && <Text accessibilityRole="alert">{notice}</Text>}
          <Card
            title={day.toLocaleDateString("en", {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          >
            {daySlots?.length ? (
              daySlots.map((slot) => (
                <Text key={slot.id} style={styles.text}>
                  {new Date(slot.begin_at).toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  –{" "}
                  {new Date(slot.end_at).toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  · {slot.scale_team_id ? "Booked" : "Open"}
                </Text>
              ))
            ) : (
              <QueryMessage
                pending={profile.isPending || slots.isPending}
                error={profile.error ?? slots.error}
                empty="No slots for this day."
              />
            )}
          </Card>
        </>
      )}
      <Modal
        visible={!!draft}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          if (!mutation.isPending) setDraft(null);
        }}
      >
        <SafeAreaView style={{ flex: 1, padding: 20, gap: 16, backgroundColor: "#f3f5f4" }}>
          <Text style={styles.section}>Open an evaluation slot</Text>
          {draft &&
            (["start", "end"] as const).map((field) => (
              <Card key={field} title={field === "start" ? "Starts" : "Ends"}>
                <TextInput
                  accessibilityLabel={
                    field === "start" ? "Start date and time" : "End date and time"
                  }
                  autoCapitalize="none"
                  editable={!mutation.isPending}
                  style={[
                    styles.text,
                    { borderWidth: 1, borderColor: "#c4cdca", borderRadius: 8, padding: 10 },
                  ]}
                  value={draft[field]}
                  placeholder="YYYY-MM-DD HH:MM"
                  onChangeText={(value) => {
                    setError("");
                    mutation.reset();
                    setDraft({ ...draft, [field]: value });
                  }}
                />
              </Card>
            ))}
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
