import { useEffect } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { theme } from "../theme";

export function PhotoSkeleton({
  style,
  dark = false,
}: {
  style: StyleProp<ViewStyle>;
  dark?: boolean;
}) {
  const base = dark ? "#555" : theme.border;
  const highlight = dark ? "#777" : "#f7f7f7";
  const reducedMotion = useReducedMotion();
  const color = useSharedValue(base);
  const pulse = useAnimatedStyle(() => ({ backgroundColor: color.get() }));

  useEffect(() => {
    color.set(base);
    if (reducedMotion) return;
    color.set(withRepeat(withTiming(highlight, { duration: 720 }), -1, true));
    return () => cancelAnimation(color);
  }, [base, color, highlight, reducedMotion]);

  return <Animated.View style={[style, pulse]} accessible={false} />;
}
