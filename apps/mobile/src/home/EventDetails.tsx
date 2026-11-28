import { useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { type Event, useEventDetails, useEventRegistration } from "../api";
import { type EventAction, eventAction, eventDuration } from "../events";
import { ModalFooter } from "../ModalFooter";
import { theme } from "../theme";
import { Button, Toast, useToast } from "../ui";
import { EventDescription } from "./EventDescription";

const labels: Record<EventAction, string> = {
  subscribe: "Subscribe",
  unsubscribe: "Unsubscribe",
  "join-waitlist": "Subscribe to Waitlist",
  "leave-waitlist": "Unsubscribe from Waitlist",
};
const paths = {
  calendar: "M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z",
  clock: "M12 8v5l4 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  location: "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  people:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-4M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm3-4a4 4 0 0 1 0 8",
};
export function Detail({
  icon,
  value,
  color = "#fff",
}: {
  icon: keyof typeof paths;
  value: string;
  color?: string;
}) {
  return (
    <View style={s.detail}>
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8}>
        <Path d={paths[icon]} />
      </Svg>
      <Text style={[s.white, { color }]}>{value}</Text>
    </View>
  );
}

export function EventDetails({
  event: initial,
  color,
  onClose,
}: {
  event: Event;
  color: string;
  onClose: () => void;
}) {
  const details = useEventDetails();
  const registration = useEventRegistration(initial.id);
  const submitting = useRef(false);
  const sharing = useRef(false);
  const { toast, showToast, hideToast } = useToast();
  const event = details.data?.find((item) => item.id === initial.id) ?? initial;
  const missing = details.isSuccess && !details.data.some((item) => item.id === initial.id);
  const action = eventAction(event);
  const disabled = registration.isPending || details.isFetching || !!details.error || missing;
  const start = new Date(event.begin_at);
  const days = Math.round((start.getTime() - Date.now()) / 86_400_000);
  const relative =
    days === 0
      ? "today"
      : days === 1
        ? "tomorrow"
        : days === -1
          ? "yesterday"
          : days > 0
            ? `in ${days} days`
            : `${Math.abs(days)} days ago`;
  const close = () => {
    if (!submitting.current && !registration.isPending) onClose();
  };
  const share = async () => {
    if (sharing.current) return;
    sharing.current = true;
    const url = `https://profile.intra.42.fr/${event.kind === "exam" ? "exams" : "events"}/${event.id}`;
    try {
      await Share.share(Platform.OS === "ios" ? { url } : { message: url }, {
        dialogTitle: "Share event",
      });
    } catch {
      Alert.alert("Could not share event", "Please try again.");
    } finally {
      sharing.current = false;
    }
  };
  const submit = async () => {
    if (!action || disabled || submitting.current) return;
    submitting.current = true;
    hideToast();
    try {
      await registration.mutateAsync(action);
      showToast(
        action === "subscribe"
          ? "Subscribed"
          : action === "unsubscribe"
            ? "Unsubscribed"
            : action === "join-waitlist"
              ? "Subscribed to Waitlist"
              : "Unsubscribed from Waitlist",
      );
    } catch {
      showToast("Could not update registration. Try again.", true);
    } finally {
      submitting.current = false;
    }
  };
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
      allowSwipeDismissal={!registration.isPending}
      onRequestClose={close}
    >
      <SafeAreaView
        edges={Platform.OS === "ios" ? ["left", "right"] : ["top", "left", "right"]}
        style={s.sheet}
      >
        <View style={[s.scrollArea, { backgroundColor: color }]}>
          <View pointerEvents="none" style={s.scrollBottomBackground} />
          <ScrollView contentContainerStyle={s.content}>
            <View style={[s.header, { backgroundColor: color }]}>
              <Text style={s.kind}>{(event.kind ?? "Event").replaceAll("_", " ")}</Text>
              <Text accessibilityRole="header" style={s.title}>
                {event.name}
              </Text>
              <Text style={[s.white, s.date]}>
                {start.toLocaleString("en-GB", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
            </View>
            <View style={[s.metadata, { backgroundColor: color }]}>
              <View style={s.shade} />
              <Detail icon="calendar" value={eventDuration(event)} />
              <Detail icon="clock" value={relative} />
              {!!event.location && <Detail icon="location" value={event.location} />}
              <Detail
                icon="people"
                value={`${event.nbr_subscribers ?? 0}${event.max_subscribers ? `/${event.max_subscribers}` : " registered"}`}
              />
            </View>
            <View style={s.body}>
              <EventDescription description={event.description ?? ""} />
              {event.kind === "exam" && (
                <Text style={s.warning}>
                  Please control that you are registered to both the event and the project in order
                  to attend an exam.
                </Text>
              )}
              {!!event.unsubscription_delay && (
                <Text style={s.notice}>
                  Cancellation closes {event.unsubscription_delay} hours before the event starts.
                </Text>
              )}
              {details.isFetching && (
                <ActivityIndicator accessibilityLabel="Refreshing event" color={theme.tealText} />
              )}
              {(details.error || registration.error || missing) && (
                <Text accessibilityRole="alert" style={s.error}>
                  {missing
                    ? "This event is no longer available in your agenda."
                    : (details.error?.message ?? registration.error?.message)}
                </Text>
              )}
              {details.error && (
                <Button
                  title="Try again"
                  onPress={() => {
                    void details.refetch();
                  }}
                />
              )}
              {event.is_subscribed && (
                <Text style={s.notice}>You are subscribed to this event.</Text>
              )}
              {event.is_waitlisted && <Text style={s.notice}>You are on the waiting list.</Text>}
              {!action && !missing && (
                <Text style={s.notice}>
                  {event.is_subscribed
                    ? "Cancellation is closed."
                    : Date.parse(event.begin_at) <= Date.now()
                      ? "Registration is closed."
                      : "This event is full."}
                </Text>
              )}
              <View style={s.share}>
                <Button
                  title="Share event"
                  variant="outline"
                  onPress={() => {
                    void share();
                  }}
                  icon={
                    <Svg
                      width={22}
                      height={24}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={theme.tealText}
                      strokeWidth={1.7}
                    >
                      <Path d="M12 16V2m-5 5 5-5 5 5M8 10H4v12h16V10h-4" />
                    </Svg>
                  }
                />
              </View>
            </View>
          </ScrollView>
        </View>
        <ModalFooter onClose={close} disabled={registration.isPending}>
          {action && (
            <Button
              title={registration.isPending ? "Saving…" : labels[action]}
              variant={
                action === "unsubscribe" || action === "leave-waitlist" ? "danger" : "primary"
              }
              disabled={disabled}
              onPress={() => {
                void submit();
              }}
            />
          )}
        </ModalFooter>
        {toast && <Toast {...toast} bottom={100} />}
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: theme.surface },
  content: { flexGrow: 1 },
  scrollArea: { flex: 1 },
  scrollBottomBackground: {
    position: "absolute",
    top: "50%",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.surface,
  },
  header: { padding: 24, gap: 18, alignItems: "center" },
  kind: { color: "#ffffffbb", fontSize: 17, textTransform: "uppercase" },
  title: { fontSize: 24, color: "#fff", textTransform: "uppercase", textAlign: "center" },
  white: { color: "#fff", fontSize: 15 },
  date: { textAlign: "center", lineHeight: 23 },
  metadata: {
    padding: 16,
    gap: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  shade: { ...StyleSheet.absoluteFill, backgroundColor: "#00000020" },
  detail: { flexDirection: "row", alignItems: "center", gap: 6 },
  body: { flexGrow: 1, backgroundColor: theme.surface, padding: 20, gap: 16 },
  warning: { fontSize: 18, lineHeight: 27, fontWeight: "700", color: theme.ink },
  notice: { color: theme.muted, fontSize: 14, lineHeight: 21 },
  error: { color: "#a82929", fontSize: 15, lineHeight: 22 },
  share: { alignSelf: "flex-start", marginTop: 8 },
});
