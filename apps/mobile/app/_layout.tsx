import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { SessionProvider } from "../src/session";

const client = new QueryClient();
export default function Root() {
  return (
    <QueryClientProvider client={client}>
      <SessionProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen
            name="feedbacks"
            options={{ headerShown: true, title: "", headerBackButtonDisplayMode: "minimal" }}
          />
          <Stack.Screen
            name="evaluation-logs"
            options={{ headerShown: true, title: "", headerBackButtonDisplayMode: "minimal" }}
          />
          <Stack.Screen
            name="quests"
            options={{ headerShown: true, title: "", headerBackButtonDisplayMode: "minimal" }}
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
              title: "Project",
              headerBackButtonDisplayMode: "minimal",
            }}
          />
          <Stack.Screen
            name="profile/[id]"
            options={{ headerShown: true, title: "", headerBackButtonDisplayMode: "minimal" }}
          />
        </Stack>
      </SessionProvider>
    </QueryClientProvider>
  );
}
