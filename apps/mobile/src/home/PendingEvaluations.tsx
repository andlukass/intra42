import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { type PendingEvaluation, useIntraQuery } from "../api";
import { PendingEvaluationRow } from "../slots/PendingEvaluationRow";
import { theme } from "../theme";
import { Card, QueryMessage, SkeletonBlock, styles } from "../ui";

const actions = [
  { label: "Feedback logs", href: "/feedbacks" },
  { label: "Manage slots", href: "/slots" },
] as const;

export function PendingEvaluationsSkeleton() {
  return (
    <View style={styles.card}>
      <SkeletonBlock width="48%" height={19} />
      <View style={s.actions}>
        <SkeletonBlock width={120} height={44} radius={0} />
        <SkeletonBlock width={120} height={44} radius={0} />
      </View>
      <SkeletonBlock width="68%" height={18} />
    </View>
  );
}

export function PendingEvaluations() {
  const router = useRouter();
  const evaluations = useIntraQuery<PendingEvaluation[]>("/me/evaluations");
  const upcoming = evaluations.data ?? [];
  return (
    <Card title="Pending evaluations">
      <View style={s.actions}>
        {actions.map(({ label, href }) => (
          <Pressable
            key={href}
            accessibilityRole="link"
            onPress={() => router.push(href)}
            style={({ pressed }) => [s.action, pressed && s.pressed]}
          >
            <Text style={s.label}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {upcoming.length ? (
        upcoming.map((item) => <PendingEvaluationRow key={item.id} evaluation={item} />)
      ) : (
        <QueryMessage
          pending={evaluations.isPending}
          error={evaluations.error}
          empty="No pending evaluations."
          skeleton={<SkeletonBlock width="68%" height={18} />}
        />
      )}
    </Card>
  );
}

const s = StyleSheet.create({
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  action: {
    borderWidth: 1,
    borderColor: theme.tealText,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  label: { color: theme.tealText, fontSize: 13, textTransform: "uppercase" },
  pressed: { backgroundColor: "#e6f8f8" },
});
