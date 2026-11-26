import Svg, { Circle, G, Path, Rect } from "react-native-svg";

const badges = {
  all: (
    <G>
      <Path d="M9 4h30v40L24 34 9 44Z" fill="#e5e5e5" stroke="#aaa" strokeWidth={1.3} />
      <Path
        d="M19 13h10v5a5 5 0 0 1-10 0v-5Zm0 1h-3v2a4 4 0 0 0 3.4 4m9.6-6h3v2a4 4 0 0 1-3.4 4M24 23v5m-4 0h8v2h-8Z"
        fill="#fff"
        stroke="#aaa"
        strokeWidth={0.55}
        strokeLinejoin="round"
      />
      <Path d="m24 15 .6 1.4 1.5.1-1.2 1 .4 1.4-1.3-.8-1.3.8.4-1.4-1.2-1 1.5-.1Z" fill="#aaa" />
    </G>
  ),
  project: (
    <G>
      <Circle cx={24} cy={24} r={19} fill="#b7a6ca" stroke="#896ba1" strokeWidth={2} />
      <Path d="m15 19 10 4 8-5m-8 5 7 7m-7-7-9 9m9-9v10" stroke="#896ba1" fill="none" />
      {[
        [15, 19, 1.5],
        [33, 18, 1.5],
        [32, 30, 1.5],
        [16, 32, 1.5],
        [25, 33, 1.5],
        [25, 23, 3.4],
      ].map(([cx, cy, r]) => (
        <Circle
          key={`${cx},${cy}`}
          cx={cx}
          cy={cy}
          r={r}
          fill="#fff"
          stroke="#896ba1"
          strokeWidth={0.6}
        />
      ))}
    </G>
  ),
  social: (
    <G>
      <Path
        d="M20 7q4-6 8 0 6-4 8 3 7-1 6 6 6 2 3 8 3 6-3 8 1 7-6 6-2 7-8 3-4 6-8 0-6 4-8-3-7 1-6-6-6-2-3-8-3-6 3-8-1-7 6-6 2-7 8-3Z"
        fill="#ffcb64"
        stroke="#f6a51b"
        strokeWidth={2}
      />
      <Path
        d="M34 24c0 4.7-4.4 8.5-10 8.5-1.5 0-2.8-.2-4-.7l-3.7 2 .9-4A8 8 0 0 1 14 24c0-4.7 4.4-8.5 10-8.5s10 3.8 10 8.5Z"
        fill="#fff"
        stroke="#f6a51b"
        strokeWidth={0.6}
      />
    </G>
  ),
  scolarity: (
    <G>
      <Path
        d="M8 5h32v11c0 13-6 22-16 27C14 38 8 29 8 16Z"
        fill="#f2aa9a"
        stroke="#de694f"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Path d="M9 10h30" stroke="#de694f" strokeWidth={2} />
      <Path d="m16 21 4 4 4-7 4 7 4-4-1 9H17Z" fill="#fff" stroke="#de694f" strokeWidth={0.7} />
      <Path d="M17 31h14" stroke="#fff" strokeWidth={1.2} />
      <Circle cx={16} cy={21} r={1.4} fill="#fff" stroke="#de694f" strokeWidth={0.7} />
      <Circle cx={24} cy={18} r={1.4} fill="#fff" stroke="#de694f" strokeWidth={0.7} />
      <Circle cx={32} cy={21} r={1.4} fill="#fff" stroke="#de694f" strokeWidth={0.7} />
    </G>
  ),
  pedagogy: (
    <G>
      <Rect
        x={4}
        y={4}
        width={40}
        height={40}
        rx={8}
        fill="#64bfc2"
        stroke="#25afb3"
        strokeWidth={2}
      />
      <Path
        d="M14 34v-2c0-3 3-5 6-5h8c3 0 6 2 6 5v2ZM19 20h10v4a5 5 0 0 1-10 0v-4Z"
        fill="#fff"
        stroke="#25afb3"
        strokeWidth={0.75}
      />
      <Path
        d="m13 17 11-3 11 3-11 3Zm5 2 6 2 6-2v4c-4 2-8 2-12 0Zm2 9 4 4 4-4M16 19v6"
        fill="#fff"
        stroke="#25afb3"
        strokeWidth={0.75}
        strokeLinejoin="round"
      />
    </G>
  ),
};

export function CategoryIcon({ category }: { category: keyof typeof badges }) {
  return (
    <Svg width={34} height={34} viewBox="0 0 48 48" accessible={false}>
      {badges[category]}
    </Svg>
  );
}
