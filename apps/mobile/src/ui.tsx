import { BlurTargetView, BlurView } from "expo-blur";
import { type ReactNode, type Ref, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
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

export function useToast() {
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  function hideToast() {
    clearTimeout(timer.current);
    setToast(null);
  }
  function showToast(message: string, error = false) {
    clearTimeout(timer.current);
    setToast({ message, error });
    AccessibilityInfo.announceForAccessibility(message);
    timer.current = setTimeout(() => setToast(null), 3000);
  }
  return { toast, showToast, hideToast };
}

export function Toast({
  message,
  error = false,
  bottom,
}: {
  message: string;
  error?: boolean;
  bottom?: number;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="none"
      accessibilityRole="alert"
      style={{
        position: "absolute",
        bottom: bottom ?? (Platform.OS === "ios" ? insets.bottom + 8 : 8),
        alignSelf: "center",
        width: "92%",
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#fff",
        boxShadow: "0px 4px 16px rgba(0, 0, 0, 0.15)",
        backgroundColor: error ? "#b42318" : theme.teal,
        paddingHorizontal: 18,
        paddingVertical: 16,
      }}
    >
      <Text style={{ color: "#fff", fontSize: 16 }}>{message}</Text>
    </View>
  );
}

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
  scrollEnabled = true,
}: {
  children: ReactNode;
  overlay?: ReactNode;
  refreshControl?: ScrollViewProps["refreshControl"];
  stickyHeaderIndices?: ScrollViewProps["stickyHeaderIndices"];
  scrollRef?: Ref<ScrollView>;
  scrollUnderStatusBar?: boolean;
  underHeader?: boolean;
  scrollEnabled?: boolean;
}) {
  const { top } = useSafeAreaInsets();
  const blurTarget = useRef<View>(null);
  const content = (
    <ScrollView
      scrollEnabled={scrollEnabled}
      ref={scrollRef}
      contentContainerStyle={[
        styles.content,
        scrollUnderStatusBar && { paddingTop: top + theme.spacing },
      ]}
      contentInsetAdjustmentBehavior={
        scrollUnderStatusBar ? "never" : underHeader ? "automatic" : undefined
      }
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
  variant = "primary",
  icon,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "outline" | "danger";
  icon?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.button,
        (variant === "secondary" || variant === "outline") && styles.secondaryButton,
        variant === "danger" && styles.dangerButton,
        disabled && { opacity: 0.5 },
      ]}
    >
      {icon}
      <Text
        style={[
          styles.action,
          variant === "secondary" && styles.secondaryAction,
          variant === "outline" && { color: theme.tealText },
        ]}
      >
        {title}
      </Text>
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
    flexDirection: "row",
    gap: 8,
    backgroundColor: theme.teal,
    borderRadius: 11,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  action: { fontWeight: "700", color: "#fff", fontSize: 16 },
  dangerButton: { backgroundColor: "#d7636f" },
  secondaryButton: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 16,
  },
  secondaryAction: { color: theme.ink, fontWeight: "400" },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
});
