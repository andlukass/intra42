import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFeedbackLogs } from "../src/api";
import { useSession } from "../src/session";
import { theme } from "../src/theme";
import {
  Button,
  Card,
  QueryMessage,
  SkeletonList,
  stackScreenEdges,
  styles,
  useStackScrollInsets,
} from "../src/ui";

export default function FeedbackLogs() {
  const scrollInsets = useStackScrollInsets();
  const { token, loading } = useSession();
  const feedback = useFeedbackLogs();
  const entries = token ? feedback.data?.pages.flat() : undefined;
  const pending = loading || (!!token && feedback.isPending);

  return (
    <SafeAreaView edges={stackScreenEdges} style={styles.screen}>
      <FlatList
        {...scrollInsets}
        data={entries}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={feedbackStyles.content}
        ListHeaderComponent={
          <Text accessibilityRole="header" style={styles.section}>
            Feedbacks you made
          </Text>
        }
        ListEmptyComponent={
          <>
            <QueryMessage
              pending={pending}
              error={feedback.error}
              empty={token ? "No completed evaluations." : "Sign in to view feedback logs."}
              skeleton={<SkeletonList cardHeight={138} />}
            />
            {token && feedback.isError && (
              <Button title="Try again" onPress={() => void feedback.refetch()} />
            )}
          </>
        }
        renderItem={({ item }) => (
          <Card title={item.scale?.name ?? "Evaluation"}>
            <View style={feedbackStyles.summary}>
              <Text style={styles.muted}>{new Date(item.begin_at).toLocaleDateString()}</Text>
              {item.final_mark != null && (
                <Text style={feedbackStyles.mark}>Final mark {item.final_mark}</Text>
              )}
            </View>
            {item.comment ? <Text style={styles.text}>{item.comment}</Text> : null}
            {item.feedbacks?.length ? (
              item.feedbacks.map((entry) => (
                <View key={entry.id} style={feedbackStyles.feedback}>
                  <Text style={styles.section}>Feedback</Text>
                  {entry.rating != null && <Text style={styles.muted}>Rating {entry.rating}</Text>}
                  {entry.comment ? <Text style={styles.text}>{entry.comment}</Text> : null}
                </View>
              ))
            ) : item.feedback || item.feedback_rating != null ? (
              <View style={feedbackStyles.feedback}>
                <Text style={styles.section}>Feedback</Text>
                {item.feedback_rating != null && (
                  <Text style={styles.muted}>Rating {item.feedback_rating}</Text>
                )}
                {item.feedback ? <Text style={styles.text}>{item.feedback}</Text> : null}
              </View>
            ) : null}
          </Card>
        )}
        ListFooterComponent={
          feedback.isFetchingNextPage ? (
            <SkeletonList cardHeight={138} />
          ) : feedback.hasNextPage ? (
            <View style={feedbackStyles.feedback}>
              {feedback.isFetchNextPageError && (
                <Text accessibilityRole="alert" style={styles.muted}>
                  {feedback.error.message}
                </Text>
              )}
              <Button
                title="Load more"
                disabled={feedback.isFetching}
                onPress={() => void feedback.fetchNextPage()}
              />
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const feedbackStyles = StyleSheet.create({
  content: { padding: theme.spacing, gap: theme.spacing },
  summary: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8 },
  mark: { color: theme.tealText, fontSize: 15, fontWeight: "700" },
  feedback: { gap: 6 },
});
