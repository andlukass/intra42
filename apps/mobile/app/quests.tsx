import { FlatList, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useProfile, useQuests } from "../src/api";
import { useSession } from "../src/session";
import { theme } from "../src/theme";
import {
  Button,
  Card,
  QueryMessage,
  stackScreenEdges,
  styles,
  useStackScrollInsets,
} from "../src/ui";

export default function Quests() {
  const scrollInsets = useStackScrollInsets();
  const { token, loading } = useSession();
  const profile = useProfile();
  const quests = useQuests(token ? profile.data?.id : undefined);
  const error = profile.error ?? quests.error;

  return (
    <SafeAreaView edges={stackScreenEdges} style={styles.screen}>
      <FlatList
        {...scrollInsets}
        data={token ? quests.data : undefined}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={s.content}
        ListHeaderComponent={
          <Text accessibilityRole="header" style={styles.title}>
            Quest list
          </Text>
        }
        ListEmptyComponent={
          <>
            <QueryMessage
              pending={loading || (!!token && quests.isPending)}
              error={error}
              empty={token ? "No quests to show." : "Sign in to view quests."}
            />
            {token && error && (
              <Button
                title="Try again"
                onPress={() => void (profile.error ? profile.refetch() : quests.refetch())}
              />
            )}
          </>
        }
        renderItem={({ item }) => {
          const ended = item.end_at && Date.parse(item.end_at) <= Date.now();
          return (
            <Card title={item.quest.name}>
              {item.quest.description?.trim() ? (
                <Text style={styles.text}>{item.quest.description}</Text>
              ) : null}
              <Text style={item.validated_at ? s.complete : styles.muted}>
                {item.validated_at
                  ? `Completed · ${new Date(item.validated_at).toLocaleDateString()}`
                  : ended
                    ? "Ended"
                    : "In progress"}
              </Text>
            </Card>
          );
        }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  content: { padding: theme.spacing, gap: theme.spacing },
  complete: { ...styles.muted, color: theme.tealText, fontWeight: "700" },
});
