import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { theme } from "./theme";
import { Button } from "./ui";

export function ModalFooter({
  onClose,
  disabled,
  children,
}: {
  onClose: () => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <View style={s.footer}>
      <Button title="Close" variant="secondary" disabled={disabled} onPress={onClose} />
      {children && <View style={s.action}>{children}</View>}
    </View>
  );
}

const s = StyleSheet.create({
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 32,
    paddingVertical: 18,
    borderTopWidth: 1,
    borderColor: theme.border,
  },
  action: { flexShrink: 1 },
});
