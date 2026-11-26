import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { type Campus, useClusterMaps, useClusterOccupancy, useProfile } from "../../src/api";
import { CampusClusterPicker } from "../../src/clusters/CampusClusterPicker";
import { ClusterMap, ClusterMapSkeleton } from "../../src/clusters/ClusterMap";
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
            <SkeletonBlock width="30%" height={19} />
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
            <SkeletonBlock width={84} height={44} />
            <SkeletonBlock width={84} height={44} />
          </View>
        </View>
      )}
      {ready && (
        <View style={[s.selector, s.header]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={s.tabs}>
              {maps.data?.map((map) => (
                <Pressable
                  key={map.id}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: current?.id === map.id }}
                  onPress={() => setSelected(map.id)}
                  style={[s.tab, current?.id === map.id && s.active]}
                >
                  <Text style={s.label}>{map.name}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
      )}
      {ready && occupancy.isError && occupancy.data && (
        <Text accessibilityRole="alert" style={[styles.muted, s.header]}>
          Refresh failed. Showing the previous occupancy.
        </Text>
      )}
      {ready && current && occupancy.data ? (
        <ClusterMap
          key={current.id}
          cluster={current}
          occupancy={occupancy.data}
          photoAttempt={photoAttempt}
          refreshControl={refreshControl}
        />
      ) : (
        <ScrollView refreshControl={refreshControl} contentContainerStyle={s.loading}>
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
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCampuses(false)}
      >
        {showCampuses && user && (
          <SafeAreaView style={styles.screen}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.loading}>
              <Button title="Close" onPress={() => setShowCampuses(false)} />
              <CampusClusterPicker
                selectedCampusId={campus?.id}
                selectedMapId={current?.id}
                onSelect={(nextCampus, mapId) => {
                  setSelectedCampus({ userId: user.id, campus: nextCampus });
                  setSelected(mapId);
                  setShowCampuses(false);
                }}
              />
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
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
  tabs: { flexDirection: "row", gap: 8 },
  tab: { minHeight: 44, padding: 12, borderBottomWidth: 2, borderColor: "transparent" },
  active: { borderColor: theme.teal },
  label: { color: theme.tealText, fontSize: 16 },
});
