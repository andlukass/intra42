import { useRef, useState } from "react";
import { Linking, Pressable, StatusBar, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, {
  ClipPath,
  Defs,
  FeColorMatrix,
  FeComposite,
  Filter,
  Image,
  Path,
  Polygon,
  Rect,
} from "react-native-svg";
import { useSession } from "./session";

const appIcon = require("../assets/app-icon.png");

export function SignIn() {
  const { signIn } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  async function submit() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await signIn();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign-in failed.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <View style={styles.main}>
        <View style={styles.logo} accessibilityRole="image" accessibilityLabel="42go">
          <Svg width="100%" height="100%" viewBox="150 450 1100 540" accessible={false}>
            <Defs>
              <Filter id="logoInk">
                {/* Derive transparency from the bright lettering in the source artwork. */}
                <FeColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1 1 1 0 -1.5" />
                <FeComposite in2="SourceAlpha" operator="in" />
              </Filter>
              <ClipPath id="goSuffix">
                <Rect x={800} y={450} width={450} height={540} />
              </ClipPath>
            </Defs>
            <Image href={appIcon} x={32} y={199} width={850} height={850} filter="url(#logoInk)" />
            <Image
              href={require("../assets/42go-reference.png")}
              width={1422}
              height={1378}
              filter="url(#logoInk)"
              clipPath="url(#goSuffix)"
            />
          </Svg>
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void submit()}
          style={[styles.button, busy && styles.disabled]}
        >
          <Svg width={35} height={25} viewBox="0 0 137.6 96.6" fill="#101828" accessible={false}>
            <Polygon points="0,71.2 50.7,71.2 50.7,96.6 76,96.6 76,50.7 25.4,50.7 76,0 50.7,0 0,50.7" />
            <Polygon points="86.9,25.4 112.2,0 86.9,0" />
            <Polygon points="112.2,25.4 86.9,50.7 86.9,76 112.2,76 112.2,50.7 137.6,25.4 137.6,0 112.2,0" />
            <Polygon points="137.6,50.7 112.2,76 137.6,76" />
          </Svg>
          <Text style={styles.buttonText}>{busy ? "Signing in…" : "Sign in to 42 intra"}</Text>
        </Pressable>
        {!!error && (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        )}
      </View>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Open project on GitHub"
        style={styles.github}
        onPress={() =>
          void Linking.openURL("https://github.com/andlukass/42go").catch(() =>
            setError("Could not open GitHub."),
          )
        }
      >
        <Svg width={28} height={28} viewBox="0 0 24 24" fill="white" accessible={false}>
          <Path d="M12 .7a11.3 11.3 0 0 0-3.57 22.02c.56.1.77-.24.77-.54v-2.1c-3.15.68-3.82-1.33-3.82-1.33-.51-1.31-1.25-1.66-1.25-1.66-1.03-.7.08-.69.08-.69 1.14.08 1.74 1.17 1.74 1.17 1.01 1.74 2.66 1.24 3.31.95.1-.74.4-1.24.72-1.52-2.52-.29-5.17-1.26-5.17-5.59 0-1.24.44-2.25 1.16-3.04-.11-.29-.5-1.44.11-3 0 0 .95-.3 3.11 1.16a10.83 10.83 0 0 1 5.66 0c2.16-1.46 3.1-1.16 3.1-1.16.62 1.56.23 2.71.12 3 .72.79 1.16 1.8 1.16 3.04 0 4.34-2.65 5.3-5.18 5.58.41.35.77 1.04.77 2.1v3.09c0 .3.2.65.78.54A11.3 11.3 0 0 0 12 .7Z" />
        </Svg>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#1b2230", paddingHorizontal: 28 },
  main: { flex: 1, justifyContent: "center", alignItems: "center", gap: 48 },
  logo: { width: "80%", maxWidth: 260, aspectRatio: 1100 / 540, overflow: "hidden" },
  button: {
    width: "100%",
    maxWidth: 360,
    minHeight: 60,
    borderRadius: 30,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 18,
  },
  disabled: { opacity: 0.6 },
  buttonText: { color: "#101828", fontSize: 18, fontWeight: "600", flexShrink: 1 },
  error: { color: "#fff", textAlign: "center" },
  github: {
    alignSelf: "center",
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
});
