import { Stack, useLocalSearchParams } from "expo-router";
import { Platform, Text } from "react-native";
import { ProfileScreen } from "../../src/home/ProfileScreen";
import { Screen, styles } from "../../src/ui";

export default function UserProfile() {
  return (
    <>
      <Stack.Screen
        options={{
          headerTransparent: Platform.OS === "ios",
          headerBlurEffect: "systemMaterial",
          headerShadowVisible: false,
        }}
      />
      <UserProfileContent />
    </>
  );
}

function UserProfileContent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = Number(id);
  if (/^[a-z0-9][a-z0-9_-]{0,31}$/.test(id ?? "") && !/^\d+$/.test(id))
    return <ProfileScreen key={id} userId={id} />;
  if (!/^[1-9]\d*$/.test(id ?? "") || !Number.isSafeInteger(userId)) {
    return (
      <Screen underHeader>
        <Text style={styles.muted}>Invalid user profile.</Text>
      </Screen>
    );
  }
  return <ProfileScreen key={userId} userId={userId} />;
}
