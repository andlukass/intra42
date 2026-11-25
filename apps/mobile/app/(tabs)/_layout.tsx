import { Tabs } from "expo-router";
import { Image, Text } from "react-native";
import { useProfile } from "../../src/api";
import { teal } from "../../src/ui";
export default function AndroidTabs() {
  const image = useProfile().data?.image;
  const avatar = image?.versions?.small ?? image?.link;
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: teal }}>
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Text style={{ color: color ?? undefined, fontSize: size }}>⌂</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="slots"
        options={{
          title: "Slots",
          tabBarIcon: ({ color, size }) => (
            <Text style={{ color: color ?? undefined, fontSize: size }}>▦</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="config"
        options={{
          title: "Config",
          tabBarIcon: ({ color, size }) =>
            avatar ? (
              <Image
                source={{ uri: avatar }}
                style={{ width: size, height: size, borderRadius: size / 2 }}
              />
            ) : (
              <Text style={{ color: color ?? undefined, fontSize: size }}>⚙</Text>
            ),
        }}
      />
    </Tabs>
  );
}
