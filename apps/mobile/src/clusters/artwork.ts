import { parse } from "react-native-svg";
import { hideOccupiedPlaceholders } from "./maps";

export function clusterArtworkOptions(
  image: string | undefined,
  xml: string | undefined,
  occupiedHosts: string[],
) {
  const hosts = [...new Set(occupiedHosts)].sort();
  return {
    queryKey: ["cluster-artwork", image, hosts],
    enabled: xml !== undefined,
    staleTime: Infinity,
    retry: false as const,
    // SVG ASTs contain React elements and parent links, not plain JSON.
    structuralSharing: false as const,
    queryFn: () => {
      if (!xml) throw new Error("The cluster map is not ready.");
      const ast = parse(hideOccupiedPlaceholders(xml, hosts));
      if (!ast) throw new Error("Could not read the cluster map.");
      return ast;
    },
  };
}
