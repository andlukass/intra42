import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export const teal = "#007d80";
export function Screen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.section}>
        {title}
      </Text>
      {children}
    </View>
  );
}
export function Button({
  title,
  onPress,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={[styles.button, disabled && { opacity: 0.5 }]}
    >
      <Text style={styles.action}>{title}</Text>
    </Pressable>
  );
}
export function QueryMessage({
  pending,
  error,
  empty,
}: {
  pending: boolean;
  error: Error | null;
  empty: string;
}) {
  return <Text style={styles.muted}>{error?.message ?? (pending ? "Loading…" : empty)}</Text>;
}
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f3f5f4" },
  content: { padding: 18, gap: 14, paddingBottom: 110 },
  title: { fontSize: 32, fontWeight: "800", color: "#18221e" },
  section: { fontSize: 19, fontWeight: "800", color: "#18221e" },
  muted: { color: "#52615b", fontSize: 15 },
  text: { color: "#18221e", fontSize: 16 },
  card: { backgroundColor: "#fff", borderRadius: 18, padding: 16, gap: 10 },
  button: {
    backgroundColor: teal,
    borderRadius: 12,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  action: { fontWeight: "700", color: "#fff", fontSize: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
});
