import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { type Profile, useUserAvatarState } from "./api";

export function useDecodedAvatar(user?: Pick<Profile, "id" | "image">) {
  const { uri, loading } = useUserAvatarState(user);
  const decoded = useQuery({
    queryKey: ["42", "decoded-avatar", user?.id, uri],
    queryFn: () => (uri ? Image.loadAsync(uri) : null),
    enabled: !!uri,
    staleTime: Infinity,
    retry: false,
  });
  return {
    image: decoded.data,
    loading: loading || (!!uri && !decoded.data && (decoded.isPending || decoded.isFetching)),
  };
}
