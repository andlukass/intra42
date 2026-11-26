import { Tabs } from "expo-router";
import { Image, Text } from "react-native";
import { useProfileAvatar } from "../../src/api";
import { teal } from "../../src/ui";
export default function AndroidTabs() {
  const avatar = useProfileAvatar();
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: teal }}>
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) =>
            avatar ? (
              <Image
                source={{ uri: avatar }}
                style={{ width: size, height: size, borderRadius: size / 2 }}
              />
            ) : (
              <Text style={{ color: color ?? undefined, fontSize: size }}>⌂</Text>
            ),
        }}
      />
      <Tabs.Screen
        name="projects"
        options={{
          title: "Projects",
          tabBarIcon: ({ color, size }) => (
            <Image
              source={require("../../assets/projects-tab.png")}
              style={{ width: size, height: size, tintColor: color }}
            />
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
        name="clusters"
        options={{
          title: "Clusters",
          tabBarIcon: ({ color, size }) => (
            <Text style={{ color: color ?? undefined, fontSize: size }}>▤</Text>
          ),
        }}
      />
    </Tabs>
  );
}
