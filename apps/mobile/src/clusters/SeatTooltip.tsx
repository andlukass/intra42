import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useDecodedAvatar } from "../useDecodedAvatar";
import type { Workstation } from "./maps";
import { PhotoSkeleton } from "./PhotoSkeleton";

export type SelectedOccupant = {
  host: string;
  user: Workstation["user"];
  x: number;
  y: number;
  width: number;
  height: number;
};

export function SeatTooltip({
  occupant,
  onClose,
}: {
  occupant: SelectedOccupant;
  onClose: () => void;
}) {
  const router = useRouter();
  const { image, loading } = useDecodedAvatar(occupant.user);
  const window = useWindowDimensions();
  const width = Math.min(260, window.width - 16);
  const height = 112;
  const left = Math.max(
    8,
    Math.min(occupant.x + occupant.width / 2 - width / 2, window.width - width - 8),
  );
  const above = occupant.y > height + 20;
  const top = Math.max(
    8,
    Math.min(
      above ? occupant.y - height - 8 : occupant.y + occupant.height + 8,
      window.height - height - 8,
    ),
  );
  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={s.overlay} accessibilityViewIsModal>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel="Close user tooltip"
          onPress={onClose}
        />
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`View ${occupant.user.login}'s profile`}
          onPress={() => {
            onClose();
            router.push({ pathname: "/profile/[id]", params: { id: occupant.user.id } });
          }}
          style={[s.tooltip, { left, top, width, height }]}
        >
          <View style={s.identity}>
            {image ? (
              <Image source={image} style={s.avatar} accessible={false} />
            ) : loading ? (
              <PhotoSkeleton style={s.avatar} dark />
            ) : null}
            <View style={s.text}>
              <Text numberOfLines={1} style={s.login}>
                {occupant.user.login}
              </Text>
              <Text style={s.host}>{occupant.host}</Text>
              <Text style={s.link}>View profile →</Text>
            </View>
          </View>
          <View
            style={[
              s.arrow,
              above ? s.arrowDown : s.arrowUp,
              {
                left: Math.max(8, Math.min(width - 20, occupant.x + occupant.width / 2 - left - 6)),
              },
            ]}
          />
        </Pressable>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1 },
  tooltip: {
    position: "absolute",
    backgroundColor: "#333",
    borderRadius: 7,
    padding: 16,
    justifyContent: "center",
  },
  identity: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 52, height: 66, borderRadius: 3 },
  text: { flex: 1, gap: 4 },
  login: { color: "#fff", fontWeight: "700", fontSize: 17 },
  host: { color: "#ccc", fontSize: 14 },
  link: { color: "#8ce4e4", fontSize: 15 },
  arrow: {
    position: "absolute",
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  arrowDown: { bottom: -6, borderTopWidth: 6, borderTopColor: "#333" },
  arrowUp: { top: -6, borderBottomWidth: 6, borderBottomColor: "#333" },
});
