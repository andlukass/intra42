import { memo } from "react";
import Animated from "react-native-reanimated";
import Svg, { Circle, G, Path, Rect, Text as SvgText } from "react-native-svg";

export type GraphNode = {
  id: number;
  name: string;
  slug: string;
  x: number;
  y: number;
  kind: string;
  description?: string;
  duration?: string;
};
const AnimatedGroup = Animated.createAnimatedComponent(G<{ matrix?: number[] }>);
export type GraphData = {
  variant: "default" | "42next" | "piscine";
  nodes: GraphNode[];
  edges: number[][];
  rings: { x: number; y: number; radius: number; state: string }[];
};

export const graphStatus = {
  done: { label: "Completed", fill: "#00babc", stroke: "#00babc", text: "#fff", strokeWidth: 10 },
  in_progress: {
    label: "In progress",
    fill: "#46464c",
    stroke: "#00babc",
    text: "#00babc",
    strokeWidth: 3,
  },
  available: { label: "Available", fill: "#46464c", stroke: "#fff", text: "#fff", strokeWidth: 10 },
  unavailable: {
    label: "Unavailable",
    fill: "#46484c",
    stroke: "#6f7278",
    text: "#6f7278",
    strokeWidth: 3,
  },
  not_recommended: {
    label: "Not recommended",
    fill: "#46464c",
    stroke: "#e6b291",
    text: "#e6b291",
    strokeWidth: 10,
  },
  fail: { label: "Failed", fill: "#cc6256", stroke: "#cc6256", text: "#fff", strokeWidth: 3 },
};
export type GraphStatus = keyof typeof graphStatus;
const unknownColors = { fill: "#263942", stroke: "#a3b7c0", text: "#fff", strokeWidth: 5 };

export const HolyGraphArtwork = memo(function HolyGraphArtwork({
  data,
  viewBox,
  animatedProps,
  selectedId,
  progress,
  onSelect,
}: {
  data: GraphData;
  viewBox: string;
  animatedProps: Partial<{ matrix: number[] }>;
  selectedId?: number;
  progress: Map<number, GraphStatus>;
  onSelect: (node: GraphNode) => void;
}) {
  const edges = data.edges.map(([x1, y1, x2, y2]) => `M${x1} ${y1}L${x2} ${y2}`).join(" ");
  return (
    <Svg width="100%" height="100%" viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
      <AnimatedGroup animatedProps={animatedProps}>
        {data.rings.map(({ x, y, radius, state }) => {
          const style = Object.hasOwn(graphStatus, state)
            ? graphStatus[state as GraphStatus]
            : undefined;
          return (
            <Circle
              key={radius}
              cx={x}
              cy={y}
              r={radius}
              stroke={style?.stroke ?? "#08717b"}
              strokeWidth={style?.strokeWidth ?? 3}
              fill="none"
            />
          );
        })}
        <Path d={edges} stroke="#617b85" strokeWidth={4} fill="none" />
        {data.nodes.map((node) => {
          const state = progress.get(node.id);
          const status = state ? graphStatus[state] : undefined;
          const active = selectedId === node.id;
          const { fill, stroke, text, strokeWidth } = status ?? unknownColors;
          const outlineWidth = active ? strokeWidth + 4 : strokeWidth;
          const box = node.kind === "exam" || node.kind === "piscine";
          return (
            <G
              key={node.id}
              onPress={() => onSelect(node)}
              accessible
              accessibilityRole="button"
              accessibilityLabel={status ? `${node.name}, ${status.label}` : node.name}
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
                  strokeWidth={outlineWidth}
                />
              ) : (
                <Circle
                  cx={node.x}
                  cy={node.y}
                  r={node.kind === "satellite" ? 35 : node.kind === "large" ? 75 : 45}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={outlineWidth}
                />
              )}
              <SvgText
                x={node.x}
                y={node.y + 6}
                fill={text}
                fontSize={node.name.length > 10 ? 13 : 17}
                fontWeight="700"
                textAnchor="middle"
              >
                {node.name.length > 15 ? `${node.name.slice(0, 14)}…` : node.name}
              </SvgText>
            </G>
          );
        })}
      </AnimatedGroup>
    </Svg>
  );
});
