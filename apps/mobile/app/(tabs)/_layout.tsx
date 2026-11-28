import { Tabs } from "expo-router";
import { useState } from "react";
import { type ColorValue, Image, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
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
          tabBarIcon: ({ color, size }) => <HomeIcon avatar={avatar} color={color} size={size} />,
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
      <Tabs.Screen
        name="search"
        options={{
          title: "Search",
          tabBarIcon: ({ color, size }) => (
            <Svg width={size} height={size} viewBox="0 0 24 24">
              <Circle cx={10.5} cy={10.5} r={7.5} fill="none" stroke={color} strokeWidth={1.8} />
              <Path d="m16 16 5 5" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
            </Svg>
          ),
        }}
      />
    </Tabs>
  );
}

function HomeIcon({ avatar, color, size }: { avatar?: string; color: ColorValue; size: number }) {
  const [loaded, setLoaded] = useState<string>();
  const ready = !!avatar && loaded === avatar;
  return (
    <View style={{ width: size, height: size }}>
      {!ready && (
        <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
          <Circle cx={12} cy={12} r={10} fill="none" stroke={color} strokeWidth={1.8} />
          <Circle cx={12} cy={9} r={3} fill="none" stroke={color} strokeWidth={1.8} />
          <Path d="M5 19a7 7 0 0 1 14 0" fill="none" stroke={color} strokeWidth={1.8} />
        </Svg>
      )}
      {avatar && (
        <Image
          key={avatar}
          source={{ uri: avatar }}
          onLoad={() => setLoaded(avatar)}
          onError={() => setLoaded(undefined)}
          style={{
            position: "absolute",
            width: size,
            height: size,
            borderRadius: size / 2,
            opacity: ready ? 1 : 0,
          }}
        />
      )}
    </View>
  );
}
