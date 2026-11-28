import { useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  type TextStyle,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { theme } from "../theme";

export function ProfileSelector({
  name,
  label,
  options,
  selectedId,
  onChange,
  onOpen,
  disabled = false,
  style,
  textStyle,
  iconColor = "#fff",
}: {
  iconColor?: string;
  name: string;
  label: string;
  options: { id: number; label: string }[];
  selectedId: number;
  onChange: (id: number) => void;
  onOpen?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  const button = useRef<View>(null);
  const [anchor, setAnchor] = useState<{ right: number; top: number; bottom: number }>();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const menuWidth = Math.min(280, window.width - insets.left - insets.right - 16);
  const menuHeight = Math.min(options.length * 44, 264);
  const spaceBelow = anchor ? window.height - insets.bottom - anchor.bottom - 16 : 0;
  const spaceAbove = anchor ? anchor.top - insets.top - 16 : 0;
  const opensAbove = spaceBelow < menuHeight && spaceAbove > spaceBelow;
  const menuMaxHeight = Math.max(0, Math.min(264, opensAbove ? spaceAbove : spaceBelow));
  return (
    <>
      <Pressable
        ref={button}
        accessibilityRole="button"
        accessibilityLabel={`Choose ${name}. Current ${name}: ${label}`}
        accessibilityState={{ expanded: !!anchor, disabled, busy: disabled }}
        disabled={disabled}
        hitSlop={6}
        onPress={() => {
          onOpen?.();
          button.current?.measureInWindow((x, y, width, height) => {
            setAnchor({ right: x + width, top: y, bottom: y + height });
          });
        }}
        style={[s.button, style]}
      >
        <Text style={[s.label, textStyle]}>{label}</Text>
        <Svg width={14} height={14} viewBox="0 0 24 24" accessible={false}>
          <Path
            d={anchor ? "m5 15 7-7 7 7" : "m5 9 7 7 7-7"}
            fill="none"
            stroke={iconColor}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </Pressable>
      {anchor && (
        <Modal
          transparent
          visible
          animationType="fade"
          statusBarTranslucent
          navigationBarTranslucent
          onRequestClose={() => setAnchor(undefined)}
        >
          <View style={s.overlay} accessibilityViewIsModal>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Close ${name} selector`}
              style={StyleSheet.absoluteFill}
              onPress={() => setAnchor(undefined)}
            />
            <View
              style={[
                s.options,
                {
                  width: menuWidth,
                  left: Math.max(
                    insets.left + 8,
                    Math.min(anchor.right, window.width - insets.right - 8) - menuWidth,
                  ),
                  ...(opensAbove
                    ? { bottom: window.height - anchor.top + 8 }
                    : { top: anchor.bottom + 8 }),
                },
              ]}
            >
              <ScrollView style={[s.list, { maxHeight: menuMaxHeight }]}>
                {options.map((option) => {
                  const selected = option.id === selectedId;
                  return (
                    <Pressable
                      key={option.id}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      onPress={() => {
                        setAnchor(undefined);
                        if (!selected) onChange(option.id);
                      }}
                      style={({ pressed }) => [s.option, (selected || pressed) && s.active]}
                    >
                      <Text style={s.optionLabel}>{option.label}</Text>
                      {selected && (
                        <Text accessible={false} style={s.check}>
                          ✓
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

const s = StyleSheet.create({
  button: { minHeight: 32, flexDirection: "row", alignItems: "center", gap: 6 },
  label: { flexShrink: 1, color: "#fff", fontSize: 13, lineHeight: 18, fontWeight: "700" },
  overlay: { flex: 1 },
  options: {
    position: "absolute",
    borderRadius: 8,
    backgroundColor: theme.surface,
    boxShadow: "0px 4px 16px rgba(0, 0, 0, 0.24)",
  },
  list: { borderRadius: 8 },
  option: { minHeight: 44, padding: 10, gap: 8, flexDirection: "row", alignItems: "center" },
  active: { backgroundColor: "#e6f8f8" },
  optionLabel: { flex: 1, color: theme.ink, fontSize: 14, fontWeight: "600" },
  check: { color: theme.tealText, fontWeight: "700" },
});
