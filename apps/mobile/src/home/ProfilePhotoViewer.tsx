import { Image, type ImageRef } from "expo-image";
import { useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { type Profile, useUserAvatarState } from "../api";
import { SkeletonBlock } from "../ui";

export function ProfilePhotoViewer({
  user,
  preview,
  onClose,
}: {
  user: Profile;
  preview: ImageRef;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const isIOS = Platform.OS === "ios";
  const photo = useUserAvatarState(user, "full");
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [failedUri, setFailedUri] = useState<string>();
  const uri = photo.uri !== failedUri ? photo.uri : undefined;
  const failed = !!photo.error || (!!photo.uri && photo.uri === failedUri);

  return (
    <Modal visible presentationStyle="fullScreen" animationType="fade" onRequestClose={onClose}>
      <StatusBar barStyle="light-content" />
      <View
        style={[s.screen, { paddingTop: insets.top, paddingBottom: isIOS ? 0 : insets.bottom }]}
        accessibilityViewIsModal
      >
        <View style={s.header}>
          <Text accessibilityRole="header" numberOfLines={1} style={s.title}>
            {user.login}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close photo"
            onPress={onClose}
            style={({ pressed }) => [s.close, pressed && s.pressed]}
          >
            <Svg width={20} height={20} viewBox="0 0 24 24" accessible={false}>
              <Path d="m6 6 12 12M6 18 18 6" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
            </Svg>
          </Pressable>
        </View>
        <View
          style={s.canvas}
          onLayout={({ nativeEvent: { layout } }) =>
            setViewport({ width: layout.width, height: layout.height })
          }
        >
          {viewport.width > 0 && (
            <ScrollView
              key={`${viewport.width}:${viewport.height}`}
              style={s.canvas}
              contentContainerStyle={s.imageContainer}
              centerContent
              pinchGestureEnabled
              minimumZoomScale={1}
              maximumZoomScale={4}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
            >
              <Image
                source={uri ? { uri } : preview}
                style={viewport}
                contentFit="contain"
                allowDownscaling={false}
                placeholder={preview}
                placeholderContentFit="contain"
                accessibilityLabel={`Profile photo of ${user.displayname || user.login}`}
                accessibilityIgnoresInvertColors
                onError={() => setFailedUri(uri)}
              />
            </ScrollView>
          )}
        </View>
        {(photo.loading || failed) && (
          <View style={[s.footer, isIOS && { paddingBottom: insets.bottom }]}>
            {photo.loading ? (
              <View
                accessible
                accessibilityLabel="Loading full-size photo"
                accessibilityState={{ busy: true }}
              >
                <SkeletonBlock width={96} height={10} />
              </View>
            ) : failed ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retry full-size photo"
                onPress={() => {
                  setFailedUri(undefined);
                  void photo.refetch();
                }}
                style={s.retry}
              >
                <Text style={s.hint}>Couldn’t load the full-size photo. Tap to retry.</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  title: { flex: 1, color: "#fff", fontSize: 17, fontWeight: "600" },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#ffffff26",
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.6 },
  canvas: { flex: 1 },
  imageContainer: { flexGrow: 1, justifyContent: "center", alignItems: "center" },
  footer: { minHeight: 52, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  hint: { color: "#aaa", fontSize: 13, textAlign: "center" },
  retry: { minHeight: 44, justifyContent: "center" },
});
