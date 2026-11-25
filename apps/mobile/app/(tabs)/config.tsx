import { useState } from "react";
import { Text } from "react-native";
import { useProfile } from "../../src/api";
import { useSession } from "../../src/session";
import { Button, Card, Screen, styles } from "../../src/ui";

export default function Config() {
  const { token, logout } = useSession();
  const { data } = useProfile();
  const [error, setError] = useState("");
  return (
    <Screen>
      <Text style={styles.title}>Config</Text>
      <Card title="Account">
        <Text style={styles.text}>{data?.login ?? "Sign in from Home to see your account."}</Text>
        {data?.email && <Text style={styles.muted}>{data.email}</Text>}
      </Card>
      {token && (
        <Button
          title="Logout"
          onPress={() => {
            void logout().catch(() => setError("Could not clear the stored session."));
          }}
        />
      )}
      {error && <Text accessibilityRole="alert">{error}</Text>}
    </Screen>
  );
}
