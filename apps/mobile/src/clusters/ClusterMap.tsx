import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { memo, useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  type ScrollViewProps,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type JsxAST, SvgAst } from "react-native-svg";
import { theme } from "../theme";
import { Button, QueryMessage, SkeletonBlock } from "../ui";
import { useDecodedAvatar } from "../useDecodedAvatar";
import { clusterArtworkOptions } from "./artwork";
import {
  type Cluster,
  hostId,
  mapInitialOffset,
  mapViewport,
  parseMap,
  type Workstation,
} from "./maps";
import { PhotoSkeleton } from "./PhotoSkeleton";
import { SeatTooltip, type SelectedOccupant } from "./SeatTooltip";

const MapArtwork = memo(function MapArtwork({
  ast,
  viewBox,
  width,
  height,
}: {
  ast: JsxAST;
  viewBox: string;
  width: number;
  height: number;
}) {
  return <SvgAst ast={ast} override={{ viewBox, width, height }} />;
});

export function ClusterMapSkeleton() {
  const { height } = useWindowDimensions();
  return (
    <View
      accessibilityLabel="Loading cluster map"
      accessibilityState={{ busy: true }}
      style={s.map}
    >
      <View style={[s.details, s.summary]}>
        {[112, 100].map((width) => (
          <View key={width} style={s.legendItem}>
            <SkeletonBlock width={10} height={10} radius={5} />
            <SkeletonBlock width={width} height={16} />
          </View>
        ))}
      </View>
      <View style={[s.skeletonCanvas, { height: Math.max(280, height - 360) }]}>
        {[0, 1, 2, 3].map((row) => (
          <View key={row} style={s.skeletonRow}>
            {[0, 1, 2].map((desk) => (
              <View key={desk} style={s.skeletonDesk}>
                <SkeletonBlock height={30} radius={3} color="#eceeef" />
                <View style={s.skeletonSeats}>
                  <SkeletonBlock width={18} height={18} radius={3} color="#eceeef" />
                  <SkeletonBlock width={18} height={18} radius={3} color="#eceeef" />
                </View>
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

function SeatPhoto({ user }: { user: Workstation["user"] }) {
  const { image, loading } = useDecodedAvatar(user);
  if (image) return <Image source={image} style={StyleSheet.absoluteFill} accessible={false} />;
  if (loading) return <PhotoSkeleton style={StyleSheet.absoluteFill} />;
  return (
    <Text numberOfLines={1} style={s.initials}>
      {user.login.slice(0, 2).toUpperCase()}
    </Text>
  );
}

export function ClusterMap({
  cluster,
  occupancy,
  photoAttempt,
  refreshControl,
}: {
  cluster: Cluster;
  occupancy: Workstation[];
  photoAttempt: number;
  refreshControl: ScrollViewProps["refreshControl"];
}) {
  const [selected, setSelected] = useState<SelectedOccupant>();
  const { bottom } = useSafeAreaInsets();
  const mapInsets = Platform.OS === "ios" ? { bottom: bottom + 56 } : undefined;
  const map = useQuery({
    queryKey: ["cluster-svg", cluster.image, "comments-v2"],
    staleTime: Infinity,
    retry: false,
    queryFn: async ({ signal }) => {
      if (!cluster.image) throw new Error("42 did not provide a map URL for this cluster.");
      const url = new URL(cluster.image);
      if (url.origin !== "https://cdn.intra.42.fr" || !url.pathname.startsWith("/cluster/image/")) {
        throw new Error("Unsupported cluster map URL.");
      }
      const response = await fetch(url.href, { signal });
      if (!response.ok) throw new Error("Could not download the cluster map.");
      return parseMap(await response.text());
    },
  });
  const occupied = useMemo(
    () =>
      new Map(occupancy.filter((item) => !item.end_at).map((item) => [hostId(item.host), item])),
    [occupancy],
  );
  const occupiedHosts = useMemo(
    () => (map.data?.seats ?? []).filter((seat) => occupied.has(seat.id)).map((seat) => seat.id),
    [map.data, occupied],
  );
  const artwork = useQuery(clusterArtworkOptions(cluster.image, map.data?.xml, occupiedHosts));
  if (!map.data || !artwork.data)
    return (
      <ScrollView refreshControl={refreshControl} contentContainerStyle={[s.content, s.details]}>
        <QueryMessage
          pending={map.isPending || (!map.isError && artwork.isPending)}
          error={map.error ?? artwork.error}
          empty="No map available."
          skeleton={<ClusterMapSkeleton />}
        />
        {(map.isError || artwork.isError) && (
          <Button
            title="Retry map"
            onPress={() => void (map.data ? artwork.refetch() : map.refetch())}
          />
        )}
      </ScrollView>
    );
  const { box, seats } = map.data;
  const viewport = mapViewport(box, seats);
  const scale = Math.max(1200, box[2] * 1.875) / box[2];
  const width = viewport[2] * scale;
  const height = viewport[3] * scale;
  const initialOffset = mapInitialOffset(viewport, seats, scale);
  const knownHosts = new Set(seats.map((seat) => seat.id));
  const occupiedCount = [...occupied.keys()].filter((key) => knownHosts.has(key)).length;

  const mapContent = (
    <View style={{ width, height }}>
      <MapArtwork ast={artwork.data} viewBox={viewport.join(" ")} width={width} height={height} />
      {seats.map((seat) => {
        const location = occupied.get(seat.id);
        return (
          <Pressable
            key={`${seat.id}:${seat.x}:${seat.y}`}
            disabled={!location}
            onPress={(event) => {
              if (!location) return;
              event.currentTarget.measureInWindow((x, y, width, height) => {
                setSelected({ host: seat.id, user: location.user, x, y, width, height });
              });
            }}
            accessibilityRole="button"
            accessibilityLabel={`${seat.id}, ${location ? location.user.login : "available"}`}
            accessibilityState={{ selected: selected?.host === seat.id, disabled: !location }}
            style={[
              s.seat,
              {
                left: (seat.x - viewport[0]) * scale,
                top: (seat.y - viewport[1]) * scale,
                width: seat.width * scale,
                height: seat.height * scale,
              },
              location ? s.occupied : s.available,
            ]}
          >
            {location && (
              <SeatPhoto key={`${location.user.id}:${photoAttempt}`} user={location.user} />
            )}
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View style={s.map}>
      <View style={[s.content, s.details]}>
        <View style={s.summary}>
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: theme.teal }]} />
            <Text style={s.availableCount}>{seats.length - occupiedCount} available</Text>
          </View>
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: "#999" }]} />
            <Text style={s.occupiedCount}>{occupiedCount} occupied</Text>
          </View>
        </View>
      </View>
      <ScrollView
        contentOffset={Platform.OS === "ios" ? initialOffset : { x: 0, y: initialOffset.y }}
        refreshControl={refreshControl}
        nestedScrollEnabled
        pinchGestureEnabled
        maximumZoomScale={3}
        minimumZoomScale={0.28}
        // iOS needs the full canvas size on the scroll content to pan on both axes.
        contentContainerStyle={Platform.OS === "ios" ? { width, height } : undefined}
        directionalLockEnabled={false}
        alwaysBounceVertical
        contentInsetAdjustmentBehavior="never"
        contentInset={mapInsets}
        scrollIndicatorInsets={mapInsets}
        style={s.scroll}
      >
        {Platform.OS === "android" ? (
          <ScrollView horizontal nestedScrollEnabled contentOffset={{ x: initialOffset.x, y: 0 }}>
            {mapContent}
          </ScrollView>
        ) : (
          mapContent
        )}
      </ScrollView>
      {selected && <SeatTooltip occupant={selected} onClose={() => setSelected(undefined)} />}
    </View>
  );
}

const s = StyleSheet.create({
  skeletonCanvas: {
    backgroundColor: theme.surface,
    borderTopWidth: 1,
    borderColor: theme.border,
    padding: 24,
    gap: 36,
    overflow: "hidden",
  },
  skeletonRow: { flexDirection: "row", gap: 24 },
  skeletonDesk: { flex: 1, gap: 8 },
  skeletonSeats: { flexDirection: "row", justifyContent: "space-around" },
  map: { flex: 1 },
  content: { gap: 10 },
  details: { paddingVertical: theme.spacing, paddingHorizontal: theme.spacing + 16 },
  summary: { flexDirection: "row", flexWrap: "wrap", columnGap: 28, rowGap: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 9 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  availableCount: { color: theme.tealText, fontSize: 16, fontWeight: "600" },
  occupiedCount: { color: theme.muted, fontSize: 16 },
  scroll: { flex: 1, borderTopWidth: 1, borderColor: theme.border, backgroundColor: "#fff" },
  seat: {
    position: "absolute",
    overflow: "hidden",
  },
  available: {
    borderWidth: 1,
    borderColor: "#b2b2b2",
    backgroundColor: "#fff",
  },
  occupied: { backgroundColor: "#ccf2ee" },
  initials: { fontSize: 10, textAlign: "center", color: theme.tealText, marginTop: 3 },
});
