import { useLocalSearchParams } from "expo-router";
import { Text } from "react-native";
import { ProfileScreen } from "../../src/home/ProfileScreen";
import { Screen, styles } from "../../src/ui";

export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = Number(id);
  if (!/^[1-9]\d*$/.test(id ?? "") || !Number.isSafeInteger(userId)) {
    return (
      <Screen>
        <Text style={styles.muted}>Invalid user profile.</Text>
      </Screen>
    );
  }
  return <ProfileScreen key={userId} userId={userId} />;
}
