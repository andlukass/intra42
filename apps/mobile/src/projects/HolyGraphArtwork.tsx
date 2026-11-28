import { memo } from "react";
import Animated from "react-native-reanimated";
import Svg, { Circle, G, Path, Rect, Text as SvgText } from "react-native-svg";
import graph from "./holy-graph.json";

export type GraphNode = (typeof graph.nodes)[number];
const AnimatedGroup = Animated.createAnimatedComponent(G<{ matrix?: number[] }>);
const edges = graph.edges.map(([x1, y1, x2, y2]) => `M${x1} ${y1}L${x2} ${y2}`).join(" ");
const rings = [166, 333, 500, 666, 833, 1000];

export const HolyGraphArtwork = memo(function HolyGraphArtwork({
  viewBox,
  animatedProps,
  selectedId,
  progress,
  onSelect,
}: {
  viewBox: string;
  animatedProps: Partial<{ matrix: number[] }>;
  selectedId?: number;
  progress: Map<number, "Completed" | "In progress">;
  onSelect: (node: GraphNode) => void;
}) {
  return (
    <Svg width="100%" height="100%" viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
      <AnimatedGroup animatedProps={animatedProps}>
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
          const active = selectedId === node.id;
          const fill =
            status === "Completed" ? "#00bcba" : status === "In progress" ? "#245d67" : "#263942";
          const stroke = active ? "#fff" : status ? "#00bcba" : "#a3b7c0";
          const box = node.kind === "exam" || node.kind === "piscine";
          return (
            <G
              key={node.id}
              onPress={() => onSelect(node)}
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
              <SvgText
                x={node.x}
                y={node.y + 6}
                fill="#fff"
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
