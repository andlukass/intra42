import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Keyboard,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  GestureDetector,
  GestureHandlerRootView,
  useCompetingGestures,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
  useTapGesture,
} from "react-native-gesture-handler";
import { useAnimatedProps, useSharedValue } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { useProfile } from "../src/api";
import { type GraphCamera, graphDrawingMatrix, moveGraphCamera } from "../src/projects/graphCamera";
import { HolyGraphArtwork } from "../src/projects/HolyGraphArtwork";
import graph from "../src/projects/holy-graph.json";
import { useSession } from "../src/session";
import { theme } from "../src/theme";
import { QueryMessage, stackScreenEdges, styles } from "../src/ui";

type Node = (typeof graph.nodes)[number];
const center = {
  x: (Math.min(...graph.nodes.map(({ x }) => x)) + Math.max(...graph.nodes.map(({ x }) => x))) / 2,
  y: (Math.min(...graph.nodes.map(({ y }) => y)) + Math.max(...graph.nodes.map(({ y }) => y))) / 2,
};
const span = {
  width: Math.max(...graph.nodes.map(({ x }) => Math.abs(x - center.x))) * 2 + 140,
  height: Math.max(...graph.nodes.map(({ y }) => Math.abs(y - center.y))) * 2 + 140,
};
const viewBox = `${center.x - span.width / 2} ${center.y - span.height / 2} ${span.width} ${span.height}`;
const overview = { ...center, zoom: 1 };

function openPortal(path: string) {
  void Linking.openURL(`https://projects.intra.42.fr${path}`).catch(() =>
    Alert.alert("Could not open 42 Projects."),
  );
}

function Control({
  label,
  text,
  onPress,
  disabled,
}: {
  label: string;
  text: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [s.control, (pressed || disabled) && s.dimmed]}
    >
      <Text style={s.controlText}>{text}</Text>
    </Pressable>
  );
}

export default function HolyGraph() {
  const router = useRouter();
  const { token } = useSession();
  const profile = useProfile();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [settledCamera, setSettledCamera] = useState<GraphCamera>(overview);
  const camera = useSharedValue<GraphCamera>(overview);
  const pinching = useSharedValue(false);
  const moved = useSharedValue(false);
  const hadPinch = useSharedValue(false);
  const focal = useSharedValue<{ x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<Node>();
  const [search, setSearch] = useState("");
  const term = search.trim().toLowerCase();
  const matches = term
    ? graph.nodes.filter(({ name }) => name.toLowerCase().includes(term)).slice(0, 4)
    : [];
  const { width, height } = size;
  const baseScale = width && height ? Math.max(span.width / width, span.height / height) : 1;
  const setCamera = useCallback(
    (next: GraphCamera) => {
      camera.set(next);
      setSettledCamera(next);
    },
    [camera],
  );
  const select = useCallback(
    (node: Node) => {
      if (moved.get()) return;
      setSelected(node);
    },
    [moved],
  );
  const selectAt = useCallback(
    (x: number, y: number, current: GraphCamera) => {
      const scale = baseScale / current.zoom;
      const worldX = current.x + (x - width / 2) * scale;
      const worldY = current.y + (y - height / 2) * scale;
      let closest: Node | undefined;
      let distance = Infinity;
      for (const node of graph.nodes) {
        const next = Math.hypot(node.x - worldX, node.y - worldY);
        if (next <= Math.max(48, 22 * scale) && next < distance) {
          closest = node;
          distance = next;
        }
      }
      if (closest) select(closest);
    },
    [baseScale, width, height, select],
  );
  const pan = usePanGesture({
    minDistance: 5,
    averageTouches: true,
    onBegin: () => {
      "worklet";
      moved.value = false;
      hadPinch.value = false;
    },
    onActivate: () => {
      "worklet";
      moved.value = true;
    },
    onUpdate: (event) => {
      "worklet";
      if (pinching.value || hadPinch.value || event.numberOfPointers !== 1) return;
      const current = camera.value;
      const scale = baseScale / current.zoom;
      camera.value = {
        ...current,
        x: current.x - event.changeX * scale,
        y: current.y - event.changeY * scale,
      };
    },
    onFinalize: () => {
      "worklet";
      scheduleOnRN(setSettledCamera, camera.value);
    },
  });
  const pinch = usePinchGesture({
    onActivate: (event) => {
      "worklet";
      pinching.value = true;
      hadPinch.value = true;
      moved.value = true;
      focal.value = event.numberOfPointers === 2 ? { x: event.focalX, y: event.focalY } : null;
    },
    onUpdate: (event) => {
      "worklet";
      // The native focal point can jump when a finger leaves the screen.
      if (event.numberOfPointers !== 2) {
        focal.value = null;
        return;
      }
      const previous = focal.value;
      focal.value = { x: event.focalX, y: event.focalY };
      if (!previous) return;
      camera.value = moveGraphCamera(
        camera.value,
        { ...previous, distance: 1, count: 2 },
        { x: event.focalX, y: event.focalY, distance: event.scaleChange, count: 2 },
        { width, height, x: 0, y: 0 },
        span,
      );
    },
    onFinalize: () => {
      "worklet";
      pinching.value = false;
      scheduleOnRN(setSettledCamera, camera.value);
    },
  });
  const tap = useTapGesture({
    maxDistance: 5,
    onDeactivate: (event) => {
      "worklet";
      if (!event.canceled && !moved.value) scheduleOnRN(selectAt, event.x, event.y, camera.value);
    },
  });
  const movement = useSimultaneousGestures(pan, pinch);
  const gestures = useCompetingGestures(movement, tap);
  const drawingProps = useAnimatedProps(() => ({
    matrix: graphDrawingMatrix(camera.value, center),
  }));

  const progress = useMemo(() => {
    const states = new Map<number, "Completed" | "In progress">();
    for (const item of profile.data?.projects_users ?? []) {
      const id = item.project.id;
      if (!id || states.get(id) === "Completed") continue;
      if (item["validated?"]) states.set(id, "Completed");
      else if (!item.marked && item.status === "in_progress") states.set(id, "In progress");
    }
    return states;
  }, [profile.data?.projects_users]);

  function zoom(factor: number) {
    const current = camera.get();
    setCamera({ ...current, zoom: Math.min(12, Math.max(1, current.zoom * factor)) });
  }

  if (!token || !profile.data) {
    return (
      <SafeAreaView edges={stackScreenEdges} style={[styles.screen, s.message]}>
        {token ? (
          <QueryMessage pending={profile.isPending} error={profile.error} empty="No profile." />
        ) : (
          <Text style={styles.muted}>Sign in from Home to view the Holy Graph.</Text>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={stackScreenEdges} style={styles.screen}>
      <View style={s.toolbar}>
        <Text style={s.cursus}>42cursus</Text>
        <Pressable
          onPress={() => openPortal("/projects/graph")}
          accessibilityRole="link"
          style={s.link}
        >
          <Text style={s.linkText}>Open in 42 ↗</Text>
        </Pressable>
      </View>
      <TextInput
        accessibilityLabel="Find a project"
        placeholder="Find a project"
        placeholderTextColor={theme.muted}
        style={s.search}
        autoCapitalize="none"
        autoCorrect={false}
        value={search}
        onChangeText={setSearch}
      />
      {term ? (
        <View style={s.matches}>
          {matches.length ? (
            matches.map((node) => (
              <Pressable
                key={node.id}
                accessibilityRole="button"
                style={s.match}
                onPress={() => {
                  setSelected(node);
                  setCamera({ x: node.x, y: node.y, zoom: 5 });
                  setSearch("");
                  Keyboard.dismiss();
                }}
              >
                <Text style={styles.text}>{node.name}</Text>
              </Pressable>
            ))
          ) : (
            <Text style={styles.muted}>No matching projects.</Text>
          )}
        </View>
      ) : null}
      <GestureHandlerRootView style={s.canvas}>
        <GestureDetector gesture={gestures}>
          <View
            collapsable={false}
            onLayout={({ nativeEvent }) => {
              const { width, height } = nativeEvent.layout;
              setSize({ width, height });
            }}
            style={s.canvas}
          >
            <HolyGraphArtwork
              viewBox={viewBox}
              selectedId={selected?.id}
              progress={progress}
              onSelect={select}
              animatedProps={drawingProps}
            />
          </View>
        </GestureDetector>
      </GestureHandlerRootView>
      <SafeAreaView edges={Platform.OS === "ios" ? ["bottom"] : []} style={s.footer}>
        {selected ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${selected.name} details`}
            onPress={() =>
              router.push({ pathname: "/project/[slug]", params: { slug: selected.slug } })
            }
            style={s.details}
          >
            <View style={s.detailsCopy}>
              <Text numberOfLines={2} style={s.cursus}>
                {selected.name}
              </Text>
              {progress.get(selected.id) && (
                <Text style={s.linkText}>{progress.get(selected.id)}</Text>
              )}
            </View>
            <Text style={s.linkText} accessible={false}>
              ›
            </Text>
          </Pressable>
        ) : (
          <View style={s.details}>
            <Text style={styles.muted}>Drag to explore or tap a project.</Text>
          </View>
        )}
        <View style={s.controls}>
          <Control
            label="Zoom out"
            text="−"
            onPress={() => zoom(2 / 3)}
            disabled={settledCamera.zoom <= 1}
          />
          <Control
            label="Reset view"
            text="Reset view"
            onPress={() => {
              setCamera(overview);
              setSelected(undefined);
            }}
          />
          <Control
            label="Zoom in"
            text="+"
            onPress={() => zoom(1.5)}
            disabled={settledCamera.zoom >= 12}
          />
        </View>
      </SafeAreaView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  message: { padding: 16 },
  toolbar: {
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.surface,
  },
  cursus: { color: theme.ink, fontSize: 16, fontWeight: "700" },
  link: { minHeight: 44, justifyContent: "center" },
  linkText: { color: theme.tealText, fontSize: 14, fontWeight: "600" },
  search: {
    minHeight: 44,
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 9,
    backgroundColor: theme.surface,
    color: theme.ink,
    fontSize: 15,
  },
  matches: { paddingHorizontal: 16, paddingBottom: 8, backgroundColor: theme.surface },
  match: { minHeight: 44, justifyContent: "center" },
  canvas: { backgroundColor: "#081b25", flex: 1, overflow: "hidden" },
  footer: { padding: 12, gap: 8, backgroundColor: theme.surface },
  details: { height: 64, flexDirection: "row", alignItems: "center", gap: 8 },
  detailsCopy: { flex: 1, gap: 2 },
  controls: { flexDirection: "row", justifyContent: "center", gap: 8 },
  control: {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e8f7f7",
  },
  dimmed: { opacity: 0.45 },
  controlText: { color: theme.tealText, fontWeight: "700", fontSize: 15 },
});

import { useRouter } from "expo-router";
