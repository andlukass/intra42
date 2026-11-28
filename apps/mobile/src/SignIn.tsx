import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { review, useSession } from "./session";
import { Button, styles } from "./ui";

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
    <SafeAreaView style={[styles.screen, signInStyles.screen]}>
      <View style={signInStyles.content}>
        <Button
          title={busy ? "Signing in…" : review ? "Sign in" : "Sign in with 42"}
          disabled={busy}
          onPress={() => void submit()}
        />
        {!!error && (
          <Text accessibilityRole="alert" style={styles.text}>
            {error}
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}
const signInStyles = StyleSheet.create({
  screen: { justifyContent: "center", alignItems: "center", padding: 24 },
  content: { width: "100%", maxWidth: 360, gap: 16 },
});
