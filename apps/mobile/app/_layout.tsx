import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { SessionProvider } from "../src/session";

const client = new QueryClient();
export default function Root() {
  return (
    <QueryClientProvider client={client}>
      <SessionProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </SessionProvider>
    </QueryClientProvider>
  );
}
