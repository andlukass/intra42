import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { theme } from "./theme";

export function SearchField({
  label,
  placeholder,
  value,
  onChangeText,
  onSubmit,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <View style={s.row}>
      <TextInput
        accessibilityLabel={label}
        placeholder={placeholder}
        placeholderTextColor={theme.muted}
        autoCapitalize="none"
        autoCorrect={false}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        returnKeyType="search"
        style={s.input}
      />
      <Pressable accessibilityRole="button" onPress={onSubmit} style={s.button}>
        <Text style={s.buttonText}>Search</Text>
      </Pressable>
    </View>
  );
}
const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  input: {
    flex: 1,
    minHeight: 48,
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 0,
    paddingHorizontal: 12,
    color: theme.ink,
    fontSize: 16,
  },
  button: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 14,
    backgroundColor: theme.teal,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
