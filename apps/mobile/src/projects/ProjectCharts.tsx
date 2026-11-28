import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { ProfileSelector } from "../home/ProfileSelector";
import { theme } from "../theme";
import { styles } from "../ui";
import type { ProjectOutcomes, ProjectStatistics } from "./overview";

const palette = ["#00babc", "#D84869", "#5CB85C", "#E6B291", "#B378E6", "#0583F2", "#3F4351"];
const outcomes = (data: ProjectOutcomes) => [
  { name: "No grade yet", value: data.none, color: "#ccc" },
  { name: "Success", value: data.true, color: "#00babc" },
  { name: "Fail", value: data.false, color: "#D8636F" },
];
type Slice = { name: string; value: number; color: string };
function Pie({ title, data }: { title: string; data: Slice[] }) {
  const [selected, setSelected] = useState<string>();
  const total = data.reduce((sum, item) => sum + item.value, 0);
  let angle = -Math.PI / 2;
  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={s.heading}>
        {title}
      </Text>
      <Svg width="100%" height={190} viewBox="0 0 320 190" accessibilityLabel={title}>
        {data
          .filter((item) => item.value > 0)
          .map((item) => {
            const start = angle;
            angle += (item.value / total) * Math.PI * 2;
            const end = angle;
            const label = `${item.name}: ${((item.value / total) * 100).toFixed(1)}% (${item.value})`;
            return item.value === total ? (
              <Circle
                key={item.name}
                cx={160}
                cy={95}
                r={80}
                fill={item.color}
                onPress={() => setSelected(label)}
              />
            ) : (
              <Path
                key={item.name}
                d={`M160 95 L${160 + 80 * Math.cos(start)} ${95 + 80 * Math.sin(start)} A80 80 0 ${end - start > Math.PI ? 1 : 0} 1 ${160 + 80 * Math.cos(end)} ${95 + 80 * Math.sin(end)} Z`}
                fill={item.color}
                stroke="#fff"
                strokeWidth={1}
                onPress={() => setSelected(label)}
              />
            );
          })}
      </Svg>
      {data.map((item) => (
        <Pressable
          key={item.name}
          accessibilityRole="button"
          onPress={() => setSelected(`${item.name}: ${item.value}`)}
          style={s.legend}
        >
          <View style={[s.dot, { backgroundColor: item.color }]} />
          <Text style={s.copy}>{item.name}</Text>
          <Text style={s.value}>{total ? ((item.value / total) * 100).toFixed(1) : "0"}%</Text>
        </Pressable>
      ))}
      {selected && (
        <Text accessibilityLiveRegion="polite" style={s.detail}>
          {selected}
        </Text>
      )}
    </View>
  );
}
function Lifespan({ data }: { data: ProjectOutcomes }) {
  const items = outcomes(data);
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={s.heading}>
        Average team lifespan
      </Text>
      <Svg
        width="100%"
        height={175}
        viewBox="0 0 340 175"
        accessibilityLabel={items.map((item) => `${item.name}: ${item.value} days`).join(", ")}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <Line key={i} x1={96 + i * 52} x2={96 + i * 52} y1={10} y2={140} stroke={theme.border} />
        ))}
        {items.map((item, index) => (
          <ChartBar
            key={item.name}
            item={item}
            y={28 + index * 46}
            width={(item.value / max) * 198}
          />
        ))}
        {[0, 2, 4].map((i) => (
          <SvgText
            key={i}
            x={96 + i * 52}
            y={160}
            fill={theme.muted}
            fontSize={10}
            textAnchor="middle"
          >
            {Math.round((max * i) / 4)}
          </SvgText>
        ))}
      </Svg>
      <Text style={s.detail}>Days between team lock and team close</Text>
    </View>
  );
}
function ChartBar({ item, y, width }: { item: Slice; y: number; width: number }) {
  return (
    <>
      <SvgText x={88} y={y + 4} textAnchor="end" fill={theme.muted} fontSize={11}>
        {item.name}
      </SvgText>
      <Rect x={96} y={y - 9} width={width} height={18} fill={item.color} />
      <SvgText x={100 + width} y={y + 4} fill={theme.ink} fontSize={10}>
        {item.value}
      </SvgText>
    </>
  );
}
function CampusMarks({ series }: { series: ProjectStatistics["final_mark_by_campus"] }) {
  const [campus, setCampus] = useState(-1);
  const [point, setPoint] = useState<string>();
  const available = series.filter((item) => item.data.length);
  const chosen = campus === -1 ? available : available.filter((_, index) => index === campus);
  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={s.heading}>
        Marks by campus
      </Text>
      <ProfileSelector
        name="chart campus"
        label={available[campus]?.name ?? "All campuses"}
        options={[
          { id: -1, label: "All campuses" },
          ...available.map((item, id) => ({ id, label: item.name })),
        ]}
        selectedId={campus}
        onChange={(id) => {
          setCampus(id);
          setPoint(undefined);
        }}
        style={s.selector}
        textStyle={s.copy}
        iconColor={theme.tealText}
      />
      <Svg
        width="100%"
        height={240}
        viewBox="0 0 340 240"
        accessibilityLabel="Grade distribution by campus. Tap a point for details."
      >
        {[0, 50, 100].map((value) => (
          <G key={value}>
            <Line
              key={`line-${value}`}
              x1={36}
              x2={326}
              y1={194 - value * 1.7}
              y2={194 - value * 1.7}
              stroke={theme.border}
            />
            <SvgText
              key={`label-${value}`}
              x={29}
              y={198 - value * 1.7}
              fill={theme.muted}
              textAnchor="end"
              fontSize={10}
            >
              {value}%
            </SvgText>
          </G>
        ))}
        {chosen.map((item) => {
          const color = palette[series.indexOf(item) % palette.length];
          const points = Array.from({ length: 13 }, (_, index) => [
            index * 10,
            item.data.find(([grade]) => grade === index * 10)?.[1] ?? 0,
          ]);
          const lastGrade = item.data.find(([grade]) => grade === 125);
          if (lastGrade) points.push([125, lastGrade[1]]);
          const path = points
            .map(
              ([x, y], index) =>
                `${index ? "L" : "M"}${36 + (x / 125) * 290} ${194 - Math.min(y, 100) * 1.7}`,
            )
            .join(" ");
          return (
            <G key={item.name}>
              <Path
                key={`${item.name}-area`}
                d={`${path} L326 194 L36 194 Z`}
                fill={color}
                fillOpacity={campus === -1 ? 0.08 : 0.2}
              />
              <Path
                key={`${item.name}-line`}
                d={path}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
              />
              {points.map(([grade, percent]) => (
                <Circle
                  key={`${item.name}-${grade}`}
                  cx={36 + (grade / 125) * 290}
                  cy={194 - percent * 1.7}
                  r={3}
                  fill={color}
                  onPress={() => setPoint(`${item.name} · Grade ~${grade}: ${percent.toFixed(1)}%`)}
                />
              ))}
            </G>
          );
        })}
        {[0, 50, 100, 125].map((grade) => (
          <SvgText
            key={grade}
            x={36 + (grade / 125) * 290}
            y={212}
            textAnchor="middle"
            fill={theme.muted}
            fontSize={10}
          >
            {grade}
          </SvgText>
        ))}
        <SvgText x={180} y={232} textAnchor="middle" fill={theme.muted} fontSize={11}>
          Grade
        </SvgText>
      </Svg>
      {point && (
        <Text accessibilityLiveRegion="polite" style={s.detail}>
          {point}
        </Text>
      )}
      <View style={s.campusLegend}>
        {chosen.map((item) => (
          <View key={item.name} style={s.legend}>
            <View
              style={[s.dot, { backgroundColor: palette[series.indexOf(item) % palette.length] }]}
            />
            <Text style={s.detail}>{item.name}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
export function ProjectCharts({ statistics }: { statistics: ProjectStatistics }) {
  return (
    <>
      {(statistics.success.true > 0 || statistics.success.false > 0) && (
        <Pie title="Success rate" data={outcomes(statistics.success)} />
      )}
      {Object.values(statistics.average_team_lifespan).some((n) => n > 0) && (
        <Lifespan data={statistics.average_team_lifespan} />
      )}
      {statistics.final_mark_by_campus.some((item) => item.data.length) && (
        <CampusMarks series={statistics.final_mark_by_campus} />
      )}
      {statistics.flags.length > 1 && (
        <Pie
          title="Evaluation flags"
          data={statistics.flags.map((item) => ({
            name: item.name,
            value: item.y,
            color: /^(ok|outstanding project)$/i.test(item.name) ? theme.teal : "#D84869",
          }))}
        />
      )}
    </>
  );
}
const s = StyleSheet.create({
  heading: { fontSize: 18, fontWeight: "700", color: theme.ink },
  copy: { color: theme.ink, fontSize: 14, flex: 1 },
  detail: { color: theme.muted, fontSize: 12, lineHeight: 18 },
  value: { color: theme.ink, fontWeight: "600", fontSize: 14 },
  legend: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 30 },
  dot: { width: 10, height: 10, borderRadius: 2 },
  campusLegend: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  selector: { padding: 10, borderWidth: 1, borderColor: theme.border, borderRadius: 6 },
});
