import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { type Campus, useClusterMaps, useClusterOccupancy, useProfile } from "../../src/api";
import { CampusClusterPicker } from "../../src/clusters/CampusClusterPicker";
import { ClusterMap, ClusterMapSkeleton } from "../../src/clusters/ClusterMap";
import { useSettledCluster } from "../../src/clusters/useSettledCluster";
import { ModalFooter } from "../../src/ModalFooter";
import { useSession } from "../../src/session";
import { theme } from "../../src/theme";
import { Button, QueryMessage, SkeletonBlock, styles } from "../../src/ui";

export default function Clusters() {
  const { token, loading } = useSession();
  const client = useQueryClient();
  const profile = useProfile();
  const user = profile.data;
  const [selectedCampus, setSelectedCampus] = useState<{ userId: number; campus: Campus }>();
  const [showCampuses, setShowCampuses] = useState(false);
  const campus =
    (user && selectedCampus?.userId === user.id ? selectedCampus.campus : undefined) ??
    user?.campus?.find(
      (item) => item.id === user.campus_users?.find((entry) => entry.is_primary)?.campus_id,
    ) ??
    user?.campus?.[0];
  const maps = useClusterMaps(campus?.id);
  const occupancy = useClusterOccupancy(campus?.id);
  const [selected, setSelected] = useState<number>();
  const [refreshing, setRefreshing] = useState(false);
  const [photoAttempt, setPhotoAttempt] = useState(0);
  const current = maps.data?.find((map) => map.id === selected) ?? maps.data?.[0];
  const mapTransition = useSettledCluster(current?.id);
  const selector = useRef<ScrollView>(null);
  const [selectorWidth, setSelectorWidth] = useState(0);
  const selectorMetrics = useRef({ width: 0, contentWidth: 0, offset: 0 });
  const [scrollEdges, setScrollEdges] = useState({ left: false, right: false });
  function updateScrollEdges() {
    const { width, contentWidth, offset } = selectorMetrics.current;
    const left = offset > 1;
    const right = width > 0 && contentWidth - width - offset > 1;
    setScrollEdges((previous) =>
      previous.left === left && previous.right === right ? previous : { left, right },
    );
  }
  const [tabLayouts, setTabLayouts] = useState<Record<number, { x: number; width: number }>>({});
  const activeTab = current ? tabLayouts[current.id] : undefined;
  useEffect(() => {
    if (!activeTab || !selectorWidth) return;
    selector.current?.scrollTo({
      x: Math.max(0, activeTab.x + activeTab.width / 2 - selectorWidth / 2),
      animated: true,
    });
  }, [activeTab, selectorWidth]);

  const ready = !loading && !!token && !!campus && !!maps.data?.length && !maps.isError;
  const waitingForMaps = loading || (!!token && (campus ? maps.isPending : profile.isPending));

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const [, locations] = await Promise.all([
        client.refetchQueries({ queryKey: ["42", "clusters"], type: "active" }),
        occupancy.refetch(),
        client.refetchQueries({ queryKey: ["42", "campuses"], type: "active" }),
      ]);
      const occupants = new Set(locations.data?.map((location) => location.user.id));
      await client.refetchQueries({
        type: "all",
        predicate: (query) =>
          query.queryKey[0] === "42" &&
          query.queryKey[1] === "avatar-v3" &&
          occupants.has(query.queryKey[2] as number) &&
          query.state.status === "error",
      });
      setPhotoAttempt((attempt) => attempt + 1);
    } finally {
      setRefreshing(false);
    }
  }

  const refreshControl =
    token && campus ? (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        tintColor={theme.tealText}
        colors={[theme.tealText]}
      />
    ) : undefined;

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.screen}>
      <View style={s.header}>
        {waitingForMaps ? (
          <View style={styles.card}>
            <View style={[styles.row, s.campus, { minHeight: 44 }]}>
              <SkeletonBlock width="35%" height={20} />
              <SkeletonBlock width={108} height={16} />
            </View>
          </View>
        ) : !token ? (
          <Text style={styles.muted}>Sign in from Home to view your campus clusters.</Text>
        ) : !campus ? (
          <View style={s.loading}>
            <QueryMessage
              pending={profile.isPending}
              error={profile.error}
              empty="No campus associated with your account."
            />
            {user && <Button title="Change campus" onPress={() => setShowCampuses(true)} />}
          </View>
        ) : (
          <View style={styles.card}>
            <View style={[styles.row, s.campus]}>
              <Text
                accessibilityRole="header"
                numberOfLines={1}
                style={[styles.section, s.campusName]}
              >
                {campus.name}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowCampuses(true)}
                style={s.campusAction}
              >
                <Text style={s.label}>Change campus</Text>
              </Pressable>
            </View>
            {!ready && !waitingForMaps && (
              <QueryMessage
                pending={maps.isPending}
                error={maps.error}
                empty="No cluster maps available for this campus."
              />
            )}
          </View>
        )}
      </View>
      {waitingForMaps && (
        <View style={[s.selector, s.header]}>
          <View style={s.tabs}>
            {[80, 96, 72].map((width, index) => (
              <View key={width} style={[s.tab, { justifyContent: "center", gap: 8 }]}>
                <SkeletonBlock width={width} height={16} />
                {index === 0 && <SkeletonBlock width={width} height={2} />}
              </View>
            ))}
          </View>
        </View>
      )}
      {ready && (
        <View style={[s.selector, s.header]}>
          <ScrollView
            ref={selector}
            horizontal
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={mapTransition.onSettled}
            scrollEventThrottle={16}
            onScroll={({ nativeEvent }) => {
              selectorMetrics.current = {
                width: nativeEvent.layoutMeasurement.width,
                contentWidth: nativeEvent.contentSize.width,
                offset: nativeEvent.contentOffset.x,
              };
              updateScrollEdges();
            }}
            onContentSizeChange={(width) => {
              selectorMetrics.current.contentWidth = width;
              updateScrollEdges();
            }}
            onLayout={({ nativeEvent: { layout } }) => {
              setSelectorWidth(layout.width);
              selectorMetrics.current.width = layout.width;
              updateScrollEdges();
            }}
          >
            <View style={s.tabs}>
              {maps.data?.map((map) => (
                <Pressable
                  key={map.id}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: current?.id === map.id }}
                  onLayout={({ nativeEvent: { layout } }) => {
                    setTabLayouts((current) => {
                      if (
                        current[map.id]?.x === layout.x &&
                        current[map.id]?.width === layout.width
                      )
                        return current;
                      return { ...current, [map.id]: { x: layout.x, width: layout.width } };
                    });
                  }}
                  onPress={() => setSelected(map.id)}
                  style={[s.tab, current?.id === map.id && s.active]}
                >
                  <Text style={s.label}>{map.name}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
          {scrollEdges.left && (
            <View
              pointerEvents="none"
              accessible={false}
              style={[
                s.scrollEdge,
                {
                  left: 16,
                  experimental_backgroundImage:
                    "linear-gradient(to right, #ffffff, rgba(255, 255, 255, 0))",
                },
              ]}
            />
          )}
          {scrollEdges.right && (
            <View
              pointerEvents="none"
              accessible={false}
              style={[
                s.scrollEdge,
                {
                  right: 16,
                  experimental_backgroundImage:
                    "linear-gradient(to left, #ffffff, rgba(255, 255, 255, 0))",
                },
              ]}
            />
          )}
        </View>
      )}
      {ready && occupancy.isError && occupancy.data && (
        <Text accessibilityRole="alert" style={[styles.muted, s.header]}>
          Refresh failed. Showing the previous occupancy.
        </Text>
      )}
      {ready && current && occupancy.data ? (
        mapTransition.ready ? (
          <ClusterMap
            key={current.id}
            cluster={current}
            occupancy={occupancy.data}
            photoAttempt={photoAttempt}
            refreshControl={refreshControl}
          />
        ) : (
          <View style={{ flex: 1 }}>
            <ClusterMapSkeleton />
          </View>
        )
      ) : (
        <ScrollView
          refreshControl={refreshControl}
          contentContainerStyle={waitingForMaps || ready ? { flexGrow: 1 } : s.loading}
        >
          {(waitingForMaps || ready) && (
            <QueryMessage
              pending={waitingForMaps || occupancy.isPending}
              error={waitingForMaps ? null : occupancy.error}
              empty="No occupancy data available."
              skeleton={<ClusterMapSkeleton />}
            />
          )}
        </ScrollView>
      )}
      <Modal
        visible={showCampuses && !!user}
        animationType="slide"
        presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
        onRequestClose={() => setShowCampuses(false)}
      >
        {showCampuses && user && (
          <SafeAreaView
            style={s.sheet}
            edges={Platform.OS === "ios" ? ["left", "right"] : ["top", "left", "right"]}
          >
            <ScrollView
              style={{ flex: 1 }}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={s.modalContent}
            >
              <CampusClusterPicker
                selectedCampusId={campus?.id}
                onSelect={(nextCampus, mapId) => {
                  setSelectedCampus({ userId: user.id, campus: nextCampus });
                  setSelected(mapId);
                  setShowCampuses(false);
                }}
              />
            </ScrollView>
            <ModalFooter onClose={() => setShowCampuses(false)} />
          </SafeAreaView>
        )}
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: theme.surface },
  modalContent: { padding: 20 },
  header: { marginHorizontal: theme.spacing, marginTop: theme.spacing },
  loading: { padding: theme.spacing, gap: theme.spacing },
  campus: { justifyContent: "space-between" },
  campusName: { flexShrink: 1 },
  campusAction: { minHeight: 44, justifyContent: "center" },
  selector: {
    backgroundColor: theme.surface,
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: 9,
    zIndex: 1,
  },
  scrollEdge: {
    position: "absolute",
    top: 4,
    bottom: 4,
    width: 24,
    overflow: "hidden",
  },
  tabs: { flexDirection: "row", gap: 8 },
  tab: { minHeight: 44, padding: 12, borderBottomWidth: 2, borderColor: "transparent" },
  active: { borderColor: theme.teal },
  label: { color: theme.tealText, fontSize: 16 },
});
