import { BlurTargetView, BlurView } from "expo-blur";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
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
import Animated, {
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";
import { type Profile, useIntraQuery, useProfile } from "../src/api";
import { ProfileSelector } from "../src/home/ProfileSelector";
import { type GraphCamera, graphDrawingMatrix, moveGraphCamera } from "../src/projects/graphCamera";
import {
  type GraphData,
  type GraphNode,
  type GraphStatus,
  graphStatus,
  HolyGraphArtwork,
} from "../src/projects/HolyGraphArtwork";
import graph from "../src/projects/holy-graph.json";
import type { OfficialProjectOverview } from "../src/projects/overview";
import { useSession } from "../src/session";
import { theme } from "../src/theme";
import { QueryMessage, SkeletonBlock, stackScreenEdges, styles } from "../src/ui";

type Node = GraphNode;
type CourseGraph = GraphData & { states: { id: number; state: string }[] };
const emptyNodes: Node[] = [];
const demoGraph: CourseGraph = {
  ...graph,
  variant: "default",
  rings: [166, 333, 500, 666, 833, 1000].map((radius) => ({ x: 3000, y: 3000, radius, state: "" })),
  states: [],
};
const skeletonViewBox = graphBounds(demoGraph).viewBox;
const skeletonEdges = demoGraph.edges
  .map(([x1, y1, x2, y2]) => `M${x1} ${y1}L${x2} ${y2}`)
  .join(" ");
const skeletonNodes = demoGraph.nodes
  .map(({ x, y }) => `M${x - 36} ${y}a36 36 0 1 0 72 0a36 36 0 1 0 -72 0Z`)
  .join(" ");

function GraphSkeleton() {
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(1);
  const pulse = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  useEffect(() => {
    opacity.set(1);
    if (reducedMotion) return;
    opacity.set(withRepeat(withTiming(0.4, { duration: 1400 }), -1, true));
    return () => cancelAnimation(opacity);
  }, [opacity, reducedMotion]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, pulse]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading course graph"
      accessibilityState={{ busy: true }}
    >
      <Svg width="100%" height="100%" viewBox={skeletonViewBox} accessible={false}>
        {demoGraph.rings.map(({ x, y, radius }) => (
          <Circle
            key={radius}
            cx={x}
            cy={y}
            r={radius}
            stroke="#384f5b"
            strokeWidth={5}
            fill="none"
          />
        ))}
        <Path d={skeletonEdges} stroke="#384f5b" strokeWidth={9} fill="none" />
        <Path d={skeletonNodes} fill="#58717e" />
      </Svg>
    </Animated.View>
  );
}

function graphBounds(data?: GraphData) {
  const xs = data?.nodes.map(({ x }) => x) ?? [];
  const ys = data?.nodes.map(({ y }) => y) ?? [];
  for (const { x, y, radius } of data?.rings ?? []) {
    xs.push(x - radius, x + radius);
    ys.push(y - radius, y + radius);
  }
  const minX = xs.length ? Math.min(...xs) : 0;
  const maxX = xs.length ? Math.max(...xs) : 0;
  const minY = ys.length ? Math.min(...ys) : 0;
  const maxY = ys.length ? Math.max(...ys) : 0;
  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  const span = { width: maxX - minX + 140, height: maxY - minY + 140 };
  return {
    center,
    span,
    overview: { ...center, zoom: 1 },
    viewBox: `${minX - 70} ${minY - 70} ${span.width} ${span.height}`,
  };
}

function GraphProjectCard({
  node,
  mark,
  success,
  onOpen,
  onClose,
}: {
  node: Node;
  mark?: number | null;
  success?: boolean | null;
  onOpen: () => void;
  onClose: () => void;
}) {
  const overviewPath =
    node.description && node.duration ? undefined : `/projects/${node.slug}/overview`;
  const overview = useIntraQuery<OfficialProjectOverview>(overviewPath);
  const duration =
    node.duration ||
    overview.data?.metadata
      .split(/\s+[–—]\s+/)
      .find((part) => /hours?|days?|weeks?|months?/i.test(part));
  const description = node.description || overview.data?.description;
  return (
    <View style={s.projectCard}>
      <View style={s.cardHeading}>
        <Pressable accessibilityRole="button" onPress={onOpen} style={{ flex: 1 }}>
          <Text style={s.projectName}>{node.name}</Text>
        </Pressable>
        {mark != null && (
          <Text style={[s.mark, { backgroundColor: success ? "#58b957" : "#d76170" }]}>{mark}</Text>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close project preview"
          onPress={onClose}
          hitSlop={8}
        >
          <Text style={s.close}>×</Text>
        </Pressable>
      </View>
      {duration && <Text style={s.duration}>{duration}</Text>}
      {description ? (
        <Text numberOfLines={7} style={s.description}>
          {description}
        </Text>
      ) : overviewPath && overview.isPending ? (
        <View
          accessibilityLabel="Loading project preview"
          accessibilityState={{ busy: true }}
          style={{ gap: 18 }}
        >
          {!duration && <SkeletonBlock width="42%" height={16} color="#31424a" />}
          <View style={{ gap: 10 }}>
            <SkeletonBlock height={14} color="#24353e" />
            <SkeletonBlock width="96%" height={14} color="#24353e" />
            <SkeletonBlock width="90%" height={14} color="#24353e" />
            <SkeletonBlock width="65%" height={14} color="#24353e" />
          </View>
        </View>
      ) : overview.error ? (
        <Pressable accessibilityRole="button" onPress={() => void overview.refetch()}>
          <Text style={s.description}>Could not load project details. Tap to retry.</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function HolyGraph() {
  const { token } = useSession();
  const profile = useProfile();
  const [cursus, setCursus] = useState(21);
  const login = profile.data?.login;
  const campus =
    profile.data?.campus_users?.find((membership) => membership.is_primary)?.campus_id ??
    profile.data?.campus?.[0]?.id;
  const isDemo = token?.accessToken === "demo";
  const graphPath =
    login && campus && !isDemo
      ? `/holy-graph?${new URLSearchParams({ login, campus: String(campus), cursus_id: String(cursus), layout: "1" })}`
      : undefined;
  const courseGraph = useIntraQuery<CourseGraph>(graphPath);
  const activeGraph =
    isDemo && cursus === 21 ? demoGraph : courseGraph.data?.nodes ? courseGraph.data : undefined;
  return (
    <HolyGraphView
      key={`${login}:${campus}:${cursus}:${activeGraph ? (activeGraph.variant ?? "loaded") : "pending"}`}
      profile={profile}
      signedIn={!!token}
      cursus={cursus}
      setCursus={setCursus}
      activeGraph={activeGraph}
      graphPending={!!graphPath && courseGraph.isPending}
      retryGraph={courseGraph.error ? () => void courseGraph.refetch() : undefined}
    />
  );
}

function HolyGraphView({
  profile,
  signedIn,
  cursus,
  setCursus,
  activeGraph,
  graphPending,
  retryGraph,
}: {
  profile: { data?: Profile; isPending: boolean; error: Error | null };
  signedIn: boolean;
  cursus: number;
  setCursus: (cursus: number) => void;
  activeGraph?: CourseGraph;
  graphPending: boolean;
  retryGraph?: () => void;
}) {
  const blurTarget = useRef<View | null>(null);
  const insets = useSafeAreaInsets();
  const header =
    Platform.OS === "android" ? (
      <Stack.Screen
        options={{
          headerBackground: () => (
            <BlurView
              pointerEvents="none"
              tint="light"
              intensity={25}
              blurMethod="dimezisBlurView"
              blurTarget={blurTarget}
              style={StyleSheet.absoluteFill}
            />
          ),
        }}
      />
    ) : null;

  const router = useRouter();
  const nodes = activeGraph?.nodes ?? emptyNodes;
  // Use the opening geometry for this camera; updating project states must not move it.
  const [bounds] = useState(() => graphBounds(activeGraph));
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [, setSettledCamera] = useState<GraphCamera>(bounds.overview);
  const camera = useSharedValue<GraphCamera>(bounds.overview);
  const pinching = useSharedValue(false);
  const moved = useSharedValue(false);
  const hadPinch = useSharedValue(false);
  const focal = useSharedValue<{ x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<Node>();
  const [search, setSearch] = useState("");
  const term = search.trim().toLowerCase();
  const matches = term
    ? nodes.filter(({ name }) => name.toLowerCase().includes(term)).slice(0, 4)
    : [];
  const { width, height } = size;
  const baseScale =
    width && height ? Math.max(bounds.span.width / width, bounds.span.height / height) : 1;
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
      for (const node of nodes) {
        const next = Math.hypot(node.x - worldX, node.y - worldY);
        if (next <= Math.max(48, 22 * scale) && next < distance) {
          closest = node;
          distance = next;
        }
      }
      if (closest) select(closest);
      else setSelected(undefined);
    },
    [baseScale, width, height, select, nodes],
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
        bounds.span,
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
    matrix: graphDrawingMatrix(camera.value, bounds.center),
  }));

  const progress = useMemo(() => {
    const states = new Map<number, GraphStatus>();
    for (const item of profile.data?.projects_users ?? []) {
      const id = item.project.id;
      if (!id || states.get(id) === "done") continue;
      if (item["validated?"]) states.set(id, "done");
      else if (!item.marked && item.status === "in_progress") states.set(id, "in_progress");
      else if (item["validated?"] === false && item.marked && !states.has(id))
        states.set(id, "fail");
    }
    for (const { id, state } of activeGraph?.states ?? []) {
      if (Object.hasOwn(graphStatus, state)) states.set(id, state as GraphStatus);
    }
    return states;
  }, [activeGraph?.states, profile.data?.projects_users]);
  const selectedResult = selected
    ? profile.data?.projects_users?.find((entry) => entry.project.id === selected.id)
    : undefined;

  if (!signedIn || !profile.data) {
    return (
      <SafeAreaView edges={stackScreenEdges} style={[styles.screen, s.message]}>
        {header}
        {signedIn ? (
          <QueryMessage pending={profile.isPending} error={profile.error} empty="No profile." />
        ) : (
          <Text style={styles.muted}>Sign in from Home to view the Holy Graph.</Text>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={stackScreenEdges} style={styles.screen}>
      {header}
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={s.canvas}>
          <BlurTargetView ref={blurTarget} style={s.canvas}>
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
                  {activeGraph && (
                    <HolyGraphArtwork
                      data={activeGraph}
                      viewBox={bounds.viewBox}
                      selectedId={selected?.id}
                      progress={progress}
                      onSelect={select}
                      animatedProps={drawingProps}
                    />
                  )}
                  {graphPending && <GraphSkeleton />}
                </View>
              </GestureDetector>
            </GestureHandlerRootView>
          </BlurTargetView>
          {selected && (
            <View style={[s.projectOverlay, { top: insets.top + 64 }]}>
              <GraphProjectCard
                key={selected.slug}
                node={selected}
                mark={selectedResult?.final_mark}
                success={selectedResult?.["validated?"]}
                onClose={() => setSelected(undefined)}
                onOpen={() =>
                  router.push({ pathname: "/project/[slug]", params: { slug: selected.slug } })
                }
              />
            </View>
          )}
          <View style={[s.floatingControls, { bottom: insets.bottom + 12 }]}>
            {!graphPending && !nodes.length && (
              <View style={s.matches}>
                <Text style={styles.muted}>
                  {retryGraph
                    ? "Could not load this course."
                    : "No graph available for this course."}
                </Text>
                {retryGraph && (
                  <Pressable onPress={retryGraph}>
                    <Text style={s.linkText}>Try again</Text>
                  </Pressable>
                )}
              </View>
            )}
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

            <View style={s.inputRow}>
              <BlurView
                tint="dark"
                intensity={25}
                blurTarget={blurTarget}
                blurMethod="dimezisBlurView"
                style={[s.glass, s.courseField]}
              >
                <ProfileSelector
                  name="graph course"
                  label={cursus === 21 ? "42 cursus" : "C Piscine"}
                  selectedId={cursus}
                  options={[
                    { id: 21, label: "42 cursus" },
                    { id: 9, label: "C Piscine" },
                  ]}
                  onOpen={() => {
                    setSelected(undefined);
                    Keyboard.dismiss();
                  }}
                  onChange={(id) => {
                    setCursus(id);
                    setSelected(undefined);
                    setSearch("");
                    Keyboard.dismiss();
                  }}
                  style={s.courseButton}
                  textStyle={s.glassText}
                  iconColor="#fff"
                />
              </BlurView>
              <BlurView
                tint="dark"
                intensity={25}
                blurTarget={blurTarget}
                blurMethod="dimezisBlurView"
                style={[s.glass, s.searchField]}
              >
                <Svg width={20} height={20} viewBox="0 0 24 24" accessible={false}>
                  <Path
                    d="M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0"
                    stroke="#e0e8eb"
                    strokeWidth={1.7}
                    fill="none"
                  />
                </Svg>
                <TextInput
                  accessibilityLabel="Find a project"
                  placeholder="Find a project"
                  placeholderTextColor="#c2cfd4"
                  style={s.search}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={search}
                  onFocus={() => setSelected(undefined)}
                  onChangeText={setSearch}
                />
              </BlurView>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  message: { padding: 16 },
  floatingControls: { position: "absolute", bottom: 12, left: 12, right: 12, gap: 8 },
  inputRow: { flexDirection: "row", gap: 8, alignItems: "stretch" },
  glass: {
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
    backgroundColor: "rgba(20,40,48,0.2)",
    overflow: "hidden",
    minHeight: 44,
  },
  courseField: { width: "38%", maxWidth: 170 },
  courseButton: { paddingHorizontal: 12, minHeight: 44, flex: 1 },
  glassText: { color: "#fff", fontSize: 15, fontWeight: "400" },
  searchField: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 8,
  },
  linkText: { color: theme.tealText, fontSize: 14, fontWeight: "600" },
  search: { flex: 1, minWidth: 0, minHeight: 44, padding: 0, color: "#fff", fontSize: 15 },
  matches: { paddingHorizontal: 16, paddingBottom: 8, backgroundColor: theme.surface },
  match: { minHeight: 44, justifyContent: "center" },
  canvas: { backgroundColor: "#081b25", flex: 1, overflow: "hidden" },
  projectOverlay: { position: "absolute", left: 12, right: 12 },
  projectCard: {
    backgroundColor: "rgba(5,17,23,0.96)",
    borderWidth: 1,
    borderColor: "#e0e7e9",
    borderRadius: 8,
    padding: 22,
    gap: 16,
  },
  cardHeading: { flexDirection: "row", alignItems: "center", gap: 12 },
  projectName: { color: "#00babc", fontSize: 17, lineHeight: 23 },
  mark: { color: "#fff", fontSize: 16, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 2 },
  close: { color: "#a1aaae", fontSize: 23 },
  duration: { color: "#fff", fontSize: 16, fontWeight: "600" },
  description: { color: "#969c9f", fontSize: 16, lineHeight: 25 },
});

import { Stack, useRouter } from "expo-router";
