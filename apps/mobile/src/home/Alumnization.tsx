import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "../theme";
import { SkeletonBlock } from "../ui";
import { type AlumniCountdown, alumnizationInfo } from "./alumnization-info";
import type { ProfilePalette } from "./coalition";

export function Alumnization({
  countdown,
  alumnizedAt,
  palette,
  pending = false,
}: {
  countdown?: AlumniCountdown | null;
  alumnizedAt?: string | null;
  palette: ProfilePalette;
  pending?: boolean;
}) {
  if (pending)
    return (
      <View
        style={s.panel}
        accessible
        accessibilityLabel="Loading alumnization"
        accessibilityState={{ busy: true }}
      >
        <SkeletonBlock color={palette.skeleton} width="45%" height={25} />
        <SkeletonBlock color={palette.skeleton} width="58%" height={40} />
        <SkeletonBlock color={palette.skeleton} width="78%" height={18} />
        <View style={s.buttonSkeleton}>
          <SkeletonBlock color={palette.skeleton} height={48} radius={12} />
        </View>
      </View>
    );
  const info = alumnizationInfo(countdown, alumnizedAt);
  if (!info) return null;
  return (
    <View style={s.panel}>
      <Text accessibilityRole="header" style={s.title}>
        Alumnization
      </Text>
      <Text style={[s.date, { color: palette.contact }]}>{info.date}</Text>
      <Text style={s.caption}>{info.caption}</Text>
      <Pressable
        accessibilityRole="link"
        style={({ pressed }) => [s.button, pressed && { opacity: 0.7 }]}
        onPress={() => {
          void Linking.openURL("https://meta.intra.42.fr/articles/alumni").catch(() =>
            Alert.alert("Could not open alumni benefits", "Try again later."),
          );
        }}
      >
        <Text style={s.buttonText}>Learn more about benefits</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  panel: {
    borderWidth: 1,
    borderColor: "#ffffff40",
    borderRadius: 14,
    backgroundColor: "#33333380",
    padding: 20,
    alignItems: "center",
    gap: 16,
  },
  title: { color: "#fff", fontSize: 23, fontWeight: "800" },
  date: { fontSize: 36, fontWeight: "400", textAlign: "center" },
  caption: { color: "#c5c7cd", fontSize: 16, textAlign: "center" },
  button: {
    backgroundColor: theme.teal,
    borderRadius: 12,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "stretch",
    paddingHorizontal: 12,
    marginTop: 12,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600", textAlign: "center" },
  buttonSkeleton: { alignSelf: "stretch", marginTop: 12 },
});
