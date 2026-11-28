import DateTimePicker from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { ProfileSelector } from "../home/ProfileSelector";
import { theme } from "../theme";
import { slotBookingDeadline, slotStartTimes } from "./bookingWindow";
import { calendarDate, calendarTimeZone } from "./calendarTime";

export function SlotStartPicker({
  value,
  disabled,
  onChange,
}: {
  value: Date;
  disabled: boolean;
  onChange: (date: Date) => void;
}) {
  const [now, setNow] = useState(() => new Date());
  const timeZone = calendarTimeZone(value);
  const deadline = slotBookingDeadline(now);
  const today = calendarDate(now, timeZone);
  today.setHours(0, 0, 0, 0);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const times = slotStartTimes(value, now);
  const [dateFieldWidth, setDateFieldWidth] = useState(0);
  const [nativeDateSize, setNativeDateSize] = useState({ width: 0, height: 0 });
  function selectDate(date: Date) {
    const next = calendarDate(value);
    const selectedDate = calendarDate(date, timeZone);
    next.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
    const available = slotStartTimes(next);
    const selected = available.find((time) => time >= next) ?? available.at(-1);
    if (selected) onChange(selected);
    setShowDatePicker(false);
    setNow(new Date());
  }
  return (
    <View style={s.container}>
      <View style={s.row}>
        {Platform.OS === "ios" ? (
          <View
            style={[s.field, { flex: 1, overflow: "hidden", paddingRight: 40 }]}
            onLayout={({ nativeEvent }) => setDateFieldWidth(nativeEvent.layout.width)}
          >
            <Text accessible={false} pointerEvents="none" style={s.label}>
              {value.toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </Text>
            <Svg
              width={14}
              height={14}
              viewBox="0 0 24 24"
              style={{ position: "absolute", right: 16 }}
              pointerEvents="none"
              accessible={false}
            >
              <Path
                d="m9 5 7 7-7 7"
                fill="none"
                stroke={theme.tealText}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
            <DateTimePicker
              accessibilityLabel="Choose start date"
              value={value}
              mode="date"
              timeZoneName={timeZone}
              minimumDate={today}
              maximumDate={deadline}
              display="compact"
              disabled={disabled}
              themeVariant="light"
              onLayout={({ nativeEvent }) => {
                const { width, height } = nativeEvent.layout;
                setNativeDateSize({ width, height });
              }}
              style={[
                s.nativeDateButton,
                {
                  transform: [
                    { scaleX: nativeDateSize.width ? dateFieldWidth / nativeDateSize.width : 1 },
                    { scaleY: nativeDateSize.height ? 48 / nativeDateSize.height : 1 },
                  ],
                },
              ]}
              onValueChange={(_, date) => selectDate(date)}
            />
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose start date"
            accessibilityState={{ expanded: showDatePicker, disabled }}
            disabled={disabled}
            style={[s.field, { flex: 1, paddingRight: 40 }]}
            onPress={() => {
              setNow(new Date());
              setShowDatePicker(!showDatePicker);
            }}
          >
            <Text style={s.label}>
              {value.toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </Text>
            <Svg
              width={14}
              height={14}
              viewBox="0 0 24 24"
              style={{ position: "absolute", right: 16 }}
              pointerEvents="none"
              accessible={false}
            >
              <Path
                d="m9 5 7 7-7 7"
                fill="none"
                stroke={theme.tealText}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Pressable>
        )}
        <ProfileSelector
          name="start time"
          label={value
            .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
            .toLowerCase()}
          options={times.map((time) => ({
            id: time.getTime(),
            label: time
              .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
              .toLowerCase(),
          }))}
          selectedId={value.getTime()}
          disabled={disabled}
          onOpen={() => setNow(new Date())}
          onChange={(timestamp) => onChange(calendarDate(timestamp, timeZone))}
          style={[s.field, { flexDirection: "row", gap: 12 }]}
          textStyle={s.label}
          iconColor={theme.tealText}
        />
      </View>
      {showDatePicker && Platform.OS === "android" && (
        <DateTimePicker
          accessibilityLabel="Start date"
          value={value}
          mode="date"
          timeZoneName={timeZone}
          minimumDate={today}
          maximumDate={deadline}
          disabled={disabled}
          onDismiss={() => setShowDatePicker(false)}
          onValueChange={(_, date) => selectDate(date)}
        />
      )}
    </View>
  );
}
const s = StyleSheet.create({
  container: { gap: 8 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  field: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    justifyContent: "center",
  },
  // Scale the compact control's intrinsic touch target to cover the entire visible field.
  nativeDateButton: {
    position: "absolute",
    right: 0,
    opacity: 0.02,
    transformOrigin: "right center",
  },
  label: { fontSize: 16, color: theme.ink },
});
