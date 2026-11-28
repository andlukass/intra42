import { useEffect } from "react";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { theme } from "./theme";

export function CircularLoader({ label }: { label: string }) {
  const rotation = useSharedValue(0);
  const reducedMotion = useReducedMotion();
  const animation = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.get()}deg` }] }));
  useEffect(() => {
    if (reducedMotion) return;
    rotation.set(withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1));
    return () => cancelAnimation(rotation);
  }, [rotation, reducedMotion]);
  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      style={[
        {
          width: 20,
          height: 20,
          borderRadius: 10,
          borderWidth: 2,
          borderColor: theme.border,
          borderTopColor: theme.tealText,
          borderRightColor: theme.tealText,
        },
        animation,
      ]}
    />
  );
}
