import { useLayoutEffect, useRef } from "react";
import { View } from "react-native";
import Svg, { Circle, ClipPath, Defs, Image } from "react-native-svg";

export type TabAvatar = { source: string; uri: string };

// Native tab icons need a bitmap, so bake the circular mask into its transparent PNG.
export function CircularTabAvatar({
  uri,
  onReady,
}: {
  uri: string;
  onReady: (avatar: TabAvatar) => void;
}) {
  const svg = useRef<Svg>(null);
  const active = useRef(true);
  const frame = useRef<number | undefined>(undefined);
  useLayoutEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    };
  }, []);

  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      style={{ position: "absolute", width: 72, height: 72, opacity: 0 }}
    >
      <Svg ref={svg} width={72} height={72} viewBox="0 0 24 24">
        <Defs>
          <ClipPath id="avatarCircle">
            <Circle cx={12} cy={12} r={12} />
          </ClipPath>
        </Defs>
        <Image
          href={{ uri }}
          width={24}
          height={24}
          preserveAspectRatio="xMidYMid slice"
          clipPath="url(#avatarCircle)"
          onLoad={() => {
            frame.current = requestAnimationFrame(() =>
              svg.current?.toDataURL(
                (base64) => {
                  if (active.current)
                    onReady({ source: uri, uri: `data:image/png;base64,${base64}` });
                },
                { width: 72, height: 72 },
              ),
            );
          }}
        />
      </Svg>
    </View>
  );
}
