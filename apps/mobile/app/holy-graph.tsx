import { useMemo, useState } from "react";
import {
  Alert,
  Keyboard,
  Linking,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, G, Path, Rect, Text as SvgText } from "react-native-svg";
import { useProfile } from "../src/api";
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
const overview = { ...center, zoom: 1 };
const edges = graph.edges.map(([x1, y1, x2, y2]) => `M${x1} ${y1}L${x2} ${y2}`).join(" ");
const rings = [166, 333, 500, 666, 833, 1000];

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
  const [camera, setCamera] = useState(overview);
  const [selected, setSelected] = useState<Node>();
  const [search, setSearch] = useState("");
  const term = search.trim().toLowerCase();
  const matches = term
    ? graph.nodes.filter(({ name }) => name.toLowerCase().includes(term)).slice(0, 4)
    : [];
  const { width, height } = size;
  const scale =
    width && height ? Math.max(span.width / width, span.height / height) / camera.zoom : 1;
  const pan = useMemo(() => {
    let lastX = 0;
    let lastY = 0;
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_event, { dx, dy }) => Math.hypot(dx, dy) > 8,
      onPanResponderGrant: () => {
        lastX = 0;
        lastY = 0;
      },
      onPanResponderMove: (_event, { dx, dy }) => {
        const x = (lastX - dx) * scale;
        const y = (lastY - dy) * scale;
        lastX = dx;
        lastY = dy;
        setCamera((current) => ({ ...current, x: current.x + x, y: current.y + y }));
      },
    });
  }, [scale]);

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

  function select(node: Node) {
    setSelected(node);
    if (camera.zoom < 3) setCamera({ x: node.x, y: node.y, zoom: 3 });
  }

  function zoom(factor: number) {
    setCamera((current) => ({
      ...current,
      zoom: Math.min(12, Math.max(1, current.zoom * factor)),
    }));
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
      <View
        {...pan.panHandlers}
        onLayout={({ nativeEvent }) => {
          const { width, height } = nativeEvent.layout;
          setSize({ width, height });
        }}
        style={s.canvas}
      >
        {width > 0 && height > 0 && (
          <Svg
            width={width}
            height={height}
            viewBox={`${camera.x - (width * scale) / 2} ${camera.y - (height * scale) / 2} ${width * scale} ${height * scale}`}
          >
            {rings.map((radius) => (
              <Circle
                key={radius}
                cx={3000}
                cy={3000}
                r={radius}
                stroke="#08717b"
                strokeWidth={3}
                fill="none"
              />
            ))}
            <Path d={edges} stroke="#617b85" strokeWidth={4} fill="none" />
            {graph.nodes.map((node) => {
              const status = progress.get(node.id);
              const active = selected?.id === node.id;
              const fill =
                status === "Completed"
                  ? "#00bcba"
                  : status === "In progress"
                    ? "#245d67"
                    : "#263942";
              const stroke = active ? "#fff" : status ? "#00bcba" : "#a3b7c0";
              const box = node.kind === "exam" || node.kind === "piscine";
              const label = camera.zoom >= 2.5 || active;
              return (
                <G
                  key={node.id}
                  onPress={() => select(node)}
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel={status ? `${node.name}, ${status}` : node.name}
                >
                  {box ? (
                    <Rect
                      x={node.x - 48}
                      y={node.y - 23}
                      width={96}
                      height={46}
                      rx={12}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={5}
                    />
                  ) : (
                    <Circle
                      cx={node.x}
                      cy={node.y}
                      r={45}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={5}
                    />
                  )}
                  {label && (
                    <SvgText
                      x={node.x}
                      y={node.y + 6}
                      fill={status === "Completed" ? "#082428" : "#fff"}
                      fontSize={node.name.length > 10 ? 13 : 17}
                      fontWeight="700"
                      textAnchor="middle"
                    >
                      {node.name.length > 15 ? `${node.name.slice(0, 14)}…` : node.name}
                    </SvgText>
                  )}
                </G>
              );
            })}
          </Svg>
        )}
      </View>
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
              <Text style={s.cursus}>{selected.name}</Text>
              {progress.get(selected.id) && (
                <Text style={s.linkText}>{progress.get(selected.id)}</Text>
              )}
            </View>
            <Text style={s.linkText} accessible={false}>
              ›
            </Text>
          </Pressable>
        ) : (
          <Text style={styles.muted}>Drag to explore or tap a project.</Text>
        )}
        <View style={s.controls}>
          <Control
            label="Zoom out"
            text="−"
            onPress={() => zoom(2 / 3)}
            disabled={camera.zoom <= 1}
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
            disabled={camera.zoom >= 12}
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
  details: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8 },
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
