import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { Platform } from "react-native";
import { ScreenshotReady } from "../src/ScreenshotReady";
import { demo, SessionProvider } from "../src/session";

const client = new QueryClient();
export default function Root() {
  return (
    <QueryClientProvider client={client}>
      <SessionProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen
            name="feedbacks"
            options={{
              headerShown: true,
              title: "Feedbacks you made",
              headerBackButtonDisplayMode: "minimal",
            }}
          />
          <Stack.Screen
            name="evaluation-logs"
            options={{
              headerShown: true,
              title: "Evaluation logs",
              headerBackButtonDisplayMode: "minimal",
            }}
          />
          <Stack.Screen
            name="quests"
            options={{
              headerShown: true,
              title: "Quest list",
              headerBackButtonDisplayMode: "minimal",
            }}
          />
          <Stack.Screen
            name="marks"
            options={{ headerShown: true, title: "Marks", headerBackButtonDisplayMode: "minimal" }}
          />
          <Stack.Screen
            name="achievements"
            options={{
              headerShown: true,
              title: "Achievements",
              headerBackButtonDisplayMode: "minimal",
            }}
          />
          <Stack.Screen
            name="holy-graph"
            options={{
              headerShown: true,
              title: "Holy Graph",
              headerBackButtonDisplayMode: "minimal",
              headerTransparent: true,
              headerBlurEffect: Platform.OS === "ios" ? "systemUltraThinMaterial" : undefined,
              headerStyle:
                Platform.OS === "android" ? { backgroundColor: "transparent" } : undefined,
              headerShadowVisible: false,
            }}
          />
          <Stack.Screen
            name="project-students"
            options={{
              headerShown: true,
              title: "Project students",
              headerBackButtonDisplayMode: "minimal",
            }}
          />
          <Stack.Screen
            name="project-list"
            options={{
              headerShown: true,
              title: "Project list",
              headerBackButtonDisplayMode: "minimal",
            }}
          />
          <Stack.Screen
            name="project/[slug]"
            options={{
              headerShown: true,
              title: "",
              headerBackButtonDisplayMode: "minimal",
            }}
          />
          <Stack.Screen
            name="profile/[id]"
            options={{ headerShown: true, title: "", headerBackButtonDisplayMode: "minimal" }}
          />
        </Stack>
        {demo && Platform.OS === "ios" && process.env.EXPO_PUBLIC_INTRA42_SCREENSHOTS === "1" && (
          <ScreenshotReady />
        )}
      </SessionProvider>
    </QueryClientProvider>
  );
}
