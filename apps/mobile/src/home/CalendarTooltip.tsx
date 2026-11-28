import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";

type TooltipAnchor = { x: number; y: number; width: number; height: number };

export function CalendarTooltip({
  anchor,
  text,
  onClose,
  closeLabel,
  width = 124,
  height = 44,
}: {
  anchor?: TooltipAnchor;
  text: string;
  onClose: () => void;
  closeLabel: string;
  width?: number;
  height?: number;
}) {
  const window = useWindowDimensions();
  if (!anchor) return null;
  const tooltipWidth = Math.min(width, window.width - 16);
  const left = Math.max(
    8,
    Math.min(anchor.x + anchor.width / 2 - tooltipWidth / 2, window.width - tooltipWidth - 8),
  );
  const above = anchor.y > height + 20;
  const top = above ? anchor.y - height - 8 : anchor.y + anchor.height + 8;
  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={s.overlay} accessibilityViewIsModal>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          onPress={onClose}
        />
        <View pointerEvents="none" style={[s.tooltip, { left, top, width: tooltipWidth, height }]}>
          <Text accessibilityLiveRegion="polite" style={s.tooltipText}>
            {text}
          </Text>
          <View
            style={[
              s.arrow,
              above ? s.arrowDown : s.arrowUp,
              {
                left: Math.max(
                  8,
                  Math.min(tooltipWidth - 20, anchor.x + anchor.width / 2 - left - 6),
                ),
              },
            ]}
          />
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1 },
  tooltip: {
    position: "absolute",
    backgroundColor: "#333",
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  tooltipText: { color: "#fff", fontSize: 15, fontWeight: "600", textAlign: "center" },
  arrow: {
    position: "absolute",
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  arrowDown: { bottom: -6, borderTopWidth: 6, borderTopColor: "#333" },
  arrowUp: { top: -6, borderBottomWidth: 6, borderBottomColor: "#333" },
});
