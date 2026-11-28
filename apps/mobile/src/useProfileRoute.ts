import { useLocalSearchParams } from "expo-router";
import { type Profile, useIntraQuery } from "./api";

const invalidProfile = new Error("Invalid user profile.");

export function useProfileRoute() {
  const { userId } = useLocalSearchParams<{ userId?: string }>();
  const invalid = userId !== undefined && !/^[1-9]\d{0,9}$/.test(userId);
  const profile = useIntraQuery<Profile>(
    invalid ? undefined : userId === undefined ? "/me" : `/users/${userId}`,
  );
  return {
    ...profile,
    isPending: !invalid && profile.isPending,
    error: invalid ? invalidProfile : profile.error,
  };
}
