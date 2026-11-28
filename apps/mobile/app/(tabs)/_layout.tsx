import { Tabs } from "expo-router";
import { useState } from "react";
import { type ColorValue, Image, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useProfileAvatar } from "../../src/api";
import { SignIn } from "../../src/SignIn";
import { useSession } from "../../src/session";
import { teal } from "../../src/ui";
export default function AndroidTabs() {
  const avatar = useProfileAvatar();
  const { token, loading } = useSession();
  if (loading) return null;
  if (!token) return <SignIn />;
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
            <Svg
              width={size}
              height={size}
              viewBox="0 0 24 24"
              fill="none"
              stroke={color}
              strokeWidth={1.8}
            >
              <Path
                d="M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z M3 9h18 M8 2v4 M16 2v4 M7 13h.01 M12 13h.01 M17 13h.01 M7 17h.01 M12 17h.01 M17 17h.01"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          ),
        }}
      />
      <Tabs.Screen
        name="clusters"
        options={{
          title: "Clusters",
          tabBarIcon: ({ color, size }) => (
            <Svg
              width={size}
              height={size}
              viewBox="0 0 24 24"
              fill="none"
              stroke={color}
              strokeWidth={1.8}
            >
              <Path
                d="m2 6 6-3 8 3 6-3v15l-6 3-8-3-6 3V6Z M8 3v15 M16 6v15"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
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
