import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useState } from "react";
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
import { SvgXml } from "react-native-svg";
import { theme } from "../theme";
import { Button, QueryMessage, SkeletonBlock } from "../ui";
import { useDecodedAvatar } from "../useDecodedAvatar";
import {
  type Cluster,
  hideOccupiedPlaceholders,
  hostId,
  mapViewport,
  parseMap,
  type Workstation,
} from "./maps";
import { PhotoSkeleton } from "./PhotoSkeleton";
import { SeatTooltip, type SelectedOccupant } from "./SeatTooltip";

export function ClusterMapSkeleton() {
  const { height } = useWindowDimensions();
  return (
    <View style={s.content}>
      <SkeletonBlock width="58%" height={18} />
      <View style={s.skeletonHint}>
        <SkeletonBlock width="96%" height={14} />
        <SkeletonBlock width="44%" height={14} />
      </View>
      <SkeletonBlock height={Math.max(160, height - 260)} />
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
  if (!map.data)
    return (
      <ScrollView refreshControl={refreshControl} contentContainerStyle={[s.content, s.details]}>
        <QueryMessage
          pending={map.isPending}
          error={map.error}
          empty="No map available."
          skeleton={<ClusterMapSkeleton />}
        />
        {map.isError && <Button title="Retry map" onPress={() => void map.refetch()} />}
      </ScrollView>
    );
  const { box, seats, xml } = map.data;
  const viewport = mapViewport(box, seats);
  const scale = Math.max(1200, box[2] * 1.875) / box[2];
  const width = viewport[2] * scale;
  const height = viewport[3] * scale;
  const occupied = new Map(
    occupancy.filter((item) => !item.end_at).map((item) => [hostId(item.host), item]),
  );
  const knownHosts = new Set(seats.map((seat) => seat.id));
  const occupiedCount = [...occupied.keys()].filter((key) => knownHosts.has(key)).length;

  const mapContent = (
    <View style={{ width, height }}>
      <SvgXml
        xml={hideOccupiedPlaceholders(xml, occupied.keys())}
        viewBox={viewport.join(" ")}
        width={width}
        height={height}
      />
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
        <Text style={s.summary}>
          {occupiedCount} occupied · {seats.length - occupiedCount} available
        </Text>
        <Text style={s.hint}>Drag to move around the map. Tap a workstation for details.</Text>
      </View>
      <ScrollView
        refreshControl={refreshControl}
        nestedScrollEnabled
        pinchGestureEnabled
        maximumZoomScale={3}
        minimumZoomScale={0.28}
        alwaysBounceVertical
        contentInsetAdjustmentBehavior="never"
        contentInset={mapInsets}
        scrollIndicatorInsets={mapInsets}
        style={s.scroll}
      >
        {Platform.OS === "android" ? (
          <ScrollView horizontal nestedScrollEnabled>
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
  map: { flex: 1 },
  content: { gap: 10 },
  details: { padding: theme.spacing },
  skeletonHint: { gap: 4 },
  summary: { color: theme.tealText, fontSize: 15, fontWeight: "600" },
  hint: { color: theme.muted, fontSize: 13 },
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
