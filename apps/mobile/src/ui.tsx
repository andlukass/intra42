import { BlurTargetView, BlurView } from "expo-blur";
import { type ReactNode, type Ref, useRef } from "react";
import {
  type DimensionValue,
  Platform,
  Pressable,
  ScrollView,
  type ScrollViewProps,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { type Edge, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { theme } from "./theme";

export const teal = theme.tealText;
export const stackScreenEdges: Edge[] =
  Platform.OS === "ios" ? ["left", "right"] : ["left", "right", "bottom"];

export function useStackScrollInsets() {
  const { bottom } = useSafeAreaInsets();
  if (Platform.OS !== "ios") return undefined;
  return {
    automaticallyAdjustContentInsets: false,
    automaticallyAdjustsScrollIndicatorInsets: false,
    contentInsetAdjustmentBehavior: "never",
    contentInset: { bottom },
    scrollIndicatorInsets: { bottom },
  } satisfies ScrollViewProps;
}

export function Screen({
  children,
  overlay,
  refreshControl,
  stickyHeaderIndices,
  scrollRef,
  scrollUnderStatusBar = false,
  underHeader = false,
}: {
  children: ReactNode;
  overlay?: ReactNode;
  refreshControl?: ScrollViewProps["refreshControl"];
  stickyHeaderIndices?: ScrollViewProps["stickyHeaderIndices"];
  scrollRef?: Ref<ScrollView>;
  scrollUnderStatusBar?: boolean;
  underHeader?: boolean;
}) {
  const { top } = useSafeAreaInsets();
  const blurTarget = useRef<View>(null);
  const content = (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={[
        styles.content,
        scrollUnderStatusBar && { paddingTop: top + theme.spacing },
      ]}
      contentInsetAdjustmentBehavior={scrollUnderStatusBar ? "never" : undefined}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
      stickyHeaderIndices={stickyHeaderIndices}
    >
      {children}
    </ScrollView>
  );
  return (
    <SafeAreaView
      edges={scrollUnderStatusBar || underHeader ? ["left", "right"] : ["top", "left", "right"]}
      style={styles.screen}
    >
      {scrollUnderStatusBar ? (
        <>
          <BlurTargetView ref={blurTarget} style={styles.screen}>
            {content}
          </BlurTargetView>
          {top > 0 && (
            <BlurView
              pointerEvents="none"
              tint="light"
              intensity={40}
              blurMethod="dimezisBlurViewSdk31Plus"
              blurTarget={blurTarget}
              style={[styles.statusBarBlur, { height: top }]}
            />
          )}
        </>
      ) : (
        content
      )}
      {overlay}
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
  skeleton,
}: {
  pending: boolean;
  error: Error | null;
  empty: string;
  skeleton?: ReactNode;
}) {
  if (pending && !error) {
    return (
      <View accessible accessibilityLabel="Loading" accessibilityState={{ busy: true }}>
        {skeleton ?? <SkeletonList />}
      </View>
    );
  }
  return <Text style={styles.muted}>{error?.message ?? empty}</Text>;
}

export function SkeletonBlock({
  width = "100%",
  height,
  radius = 5,
  color = theme.border,
}: {
  width?: DimensionValue;
  height: number;
  radius?: number;
  color?: string;
}) {
  return <View style={{ width, height, borderRadius: radius, backgroundColor: color }} />;
}

export function SkeletonList({ cardHeight = 90 }: { cardHeight?: number }) {
  return (
    <View style={{ gap: theme.spacing }}>
      {[1, 2, 3].map((row) => (
        <View key={row} style={[styles.card, { minHeight: cardHeight }]}>
          <SkeletonBlock width="55%" height={16} />
          <SkeletonBlock width="80%" height={12} />
        </View>
      ))}
    </View>
  );
}
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  statusBarBlur: { position: "absolute", top: 0, left: 0, right: 0 },
  content: { padding: theme.spacing, gap: theme.spacing, paddingBottom: 110 },
  title: { fontSize: 28, fontWeight: "800", color: theme.slate },
  section: { fontSize: 16, fontWeight: "800", color: theme.ink, textTransform: "uppercase" },
  muted: { color: theme.muted, fontSize: 15 },
  text: { color: theme.ink, fontSize: 16 },
  card: {
    backgroundColor: theme.surface,
    borderRadius: 9,
    padding: 16,
    gap: 16,
    boxShadow: "0px 3px 7px rgba(0, 0, 0, 0.12)",
  },
  button: {
    backgroundColor: theme.teal,
    borderRadius: 11,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  action: { fontWeight: "700", color: "#092d31", fontSize: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
});
