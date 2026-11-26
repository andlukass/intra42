import { Image, type ImageRef } from "expo-image";
import { useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import type { Profile } from "../api";
import { theme } from "../theme";
import { SkeletonBlock } from "../ui";
import type { ProfilePalette } from "./coalition";
import { ProfilePhotoViewer } from "./ProfilePhotoViewer";

export function ProfileCardSkeleton({ palette }: { palette: ProfilePalette }) {
  const color = palette.skeleton;
  return (
    <View style={[s.banner, { backgroundColor: palette.background }]}>
      <View style={s.card}>
        <View style={s.skeletonStatus}>
          <SkeletonBlock color={color} width={94} height={24} radius={12} />
        </View>
        <View style={s.identity}>
          <SkeletonBlock
            color={color}
            width={s.avatar.width}
            height={s.avatar.height}
            radius={38}
          />
          <View style={s.name}>
            <SkeletonBlock color={color} width="92%" height={22} />
            <SkeletonBlock color={color} width="65%" height={22} />
            <SkeletonBlock color={color} width="55%" height={18} />
          </View>
        </View>
        <View style={s.level}>
          <SkeletonBlock color={color} width={30} height={36} />
          <View style={s.levelDetail}>
            <View style={s.labels}>
              <SkeletonBlock color={color} width="20%" height={14} />
              <SkeletonBlock color={color} width="56%" height={14} />
            </View>
            <SkeletonBlock color={color} height={10} />
          </View>
        </View>
        <View style={s.stats}>
          <SkeletonBlock color={color} width="24%" height={20} />
          <SkeletonBlock color={color} width="24%" height={20} />
        </View>
      </View>
      <View style={s.contact}>
        {(["42%", "77%", "35%", "48%"] as const).map((width) => (
          <View key={width} style={s.contactRow}>
            <SkeletonBlock color={color} width={19} height={19} />
            <SkeletonBlock color={color} width={width} height={19} />
          </View>
        ))}
      </View>
    </View>
  );
}

function cursusLabel({ grade, cursus }: NonNullable<Profile["cursus_users"]>[number]) {
  return grade ? `${grade} at ${cursus.name}` : cursus.name;
}

function contactValue(value?: string | null) {
  const text = value?.trim();
  return text && text.toLowerCase() !== "hidden" ? text : "-";
}

function ProfileContact({
  user,
  campus,
  accentColor,
}: {
  user: Profile;
  campus?: string;
  accentColor: string;
}) {
  const date = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/.exec(user.anonymize_date ?? "");
  const rows = [
    {
      label: "Phone",
      value: contactValue(user.phone),
      path: "M7 3H5a2 2 0 0 0-2 2 16 16 0 0 0 16 16 2 2 0 0 0 2-2v-2l-5-2-2 2a12 12 0 0 1-7-7l2-2-2-5Z",
      accent: true,
    },
    {
      label: "Email",
      value: contactValue(user.email),
      path: "M3 5h18v14H3zM3 6l9 7 9-7",
      accent: true,
    },
    {
      label: "Campus",
      value: contactValue(campus),
      path: "M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 0 1 16 0Zm-5 0a3 3 0 1 0-6 0 3 3 0 0 0 6 0Z",
    },
    {
      label: "Data erasure date",
      value: date ? `${date[3]}/${date[2]}/${date[1]}` : "-",
      path: "M4 21V10a8 8 0 0 1 16 0v11l-4-3-4 3-4-3-4 3ZM9 10h.01M15 10h.01",
    },
  ];

  return (
    <View style={s.contact}>
      {rows.map(({ label, value, path, accent }) => (
        <View key={label} style={s.contactRow}>
          <Svg width={19} height={19} viewBox="0 0 24 24" accessible={false}>
            <Path
              d={path}
              fill="none"
              stroke="#fff"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
          <Text
            selectable
            accessibilityLabel={`${label}: ${value}`}
            style={[s.contactText, accent && value !== "-" && { color: accentColor }]}
          >
            {value}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function ProfileCard({
  user,
  avatar,
  campus,
  course: current,
  palette,
  onCourseChange,
}: {
  user: Profile;
  avatar?: ImageRef | null;
  campus?: string;
  course?: NonNullable<Profile["cursus_users"]>[number];
  palette: ProfilePalette;
  onCourseChange: (id: number) => void;
}) {
  const [photoVisible, setPhotoVisible] = useState(false);
  const cursusButton = useRef<View>(null);
  const [cursusAnchor, setCursusAnchor] = useState<{
    right: number;
    top: number;
    bottom: number;
  }>();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const selectedTitleId = user.titles_users?.find((entry) => entry.selected)?.title_id;
  const titleTemplate = user.titles?.find((title) => title.id === selectedTitleId)?.name;
  const title = titleTemplate?.replaceAll("%login", user.login) || user.login;
  const courses = user.cursus_users ?? [];
  const avatarStyle = [s.avatar, { borderColor: palette.accent }];
  const menuWidth = Math.min(280, window.width - insets.left - insets.right - 16);
  const menuHeight = Math.min(courses.length * 44, 264);
  const spaceBelow = cursusAnchor ? window.height - insets.bottom - cursusAnchor.bottom - 16 : 0;
  const spaceAbove = cursusAnchor ? cursusAnchor.top - insets.top - 16 : 0;
  const opensAbove = spaceBelow < menuHeight && spaceAbove > spaceBelow;
  const menuMaxHeight = Math.max(0, Math.min(264, opensAbove ? spaceAbove : spaceBelow));

  const level = current?.level ?? 0;
  const progress = Math.min(99, Math.round((level % 1) * 100));
  const initials = (user.displayname || user.login)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((name) => name.charAt(0))
    .join("")
    .toUpperCase();
  return (
    <View style={[s.banner, { backgroundColor: palette.background }]}>
      <View style={s.card}>
        <View style={s.availability}>
          <View style={s.dot} />
          <Text style={s.status}>{user.location || "unavailable"}</Text>
        </View>
        <View style={s.identity}>
          {avatar ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open ${user.login}'s profile photo`}
              accessibilityHint="Opens the photo in full screen"
              onPress={() => setPhotoVisible(true)}
            >
              <Image
                source={avatar}
                style={avatarStyle}
                accessible={false}
                accessibilityIgnoresInvertColors
              />
            </Pressable>
          ) : (
            <View style={[avatarStyle, s.fallback]}>
              <Text style={s.initials}>{initials}</Text>
            </View>
          )}
          <View style={s.name}>
            <Text accessibilityRole="header" style={s.heading}>
              {user.displayname || user.login}
            </Text>
            <Text style={s.profileTitle}>{title}</Text>
          </View>
        </View>
        {current && (
          <View style={s.level}>
            <Text style={s.levelNumber}>{Math.floor(level)}</Text>
            <View style={s.levelDetail}>
              <View style={s.labels}>
                <Text style={s.label}>{progress}%</Text>
                {courses.length > 1 ? (
                  <Pressable
                    ref={cursusButton}
                    accessibilityRole="button"
                    accessibilityLabel={`Choose course. Current course: ${cursusLabel(current)}`}
                    accessibilityState={{ expanded: !!cursusAnchor }}
                    hitSlop={6}
                    onPress={() => {
                      cursusButton.current?.measureInWindow((x, y, width, height) => {
                        setCursusAnchor({ right: x + width, top: y, bottom: y + height });
                      });
                    }}
                    style={s.cursusButton}
                  >
                    <Text style={[s.label, s.cursus]}>{cursusLabel(current)}</Text>
                    <Svg width={14} height={14} viewBox="0 0 24 24" accessible={false}>
                      <Path
                        d={cursusAnchor ? "m5 15 7-7 7 7" : "m5 9 7 7 7-7"}
                        fill="none"
                        stroke="#fff"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </Svg>
                  </Pressable>
                ) : (
                  <Text style={[s.label, s.cursus]}>{cursusLabel(current)}</Text>
                )}
              </View>
              <View
                accessibilityRole="progressbar"
                accessibilityLabel="Level progress"
                accessibilityValue={{ min: 0, max: 100, now: progress }}
                style={s.track}
              >
                <View
                  style={[s.progress, { width: `${progress}%`, backgroundColor: palette.accent }]}
                />
              </View>
            </View>
          </View>
        )}
        <View style={s.stats}>
          <Text style={s.white}>
            <Text style={s.statLabel}>₳ </Text>
            {user.wallet ?? 0}
          </Text>
          <Text style={s.white}>
            <Text style={s.statLabel}>Ev.P </Text>
            {user.correction_point ?? 0}
          </Text>
          {user.alumni && <Text style={s.statLabel}>Alumni</Text>}
        </View>
      </View>
      <ProfileContact user={user} campus={campus} accentColor={palette.contact} />
      {photoVisible && avatar && (
        <ProfilePhotoViewer
          key={user.id}
          user={user}
          preview={avatar}
          onClose={() => setPhotoVisible(false)}
        />
      )}
      {current && courses.length > 1 && cursusAnchor && (
        <Modal
          transparent
          visible
          animationType="fade"
          statusBarTranslucent
          navigationBarTranslucent
          onRequestClose={() => setCursusAnchor(undefined)}
        >
          <View style={s.cursusOverlay} accessibilityViewIsModal>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close course selector"
              style={StyleSheet.absoluteFill}
              onPress={() => setCursusAnchor(undefined)}
            />
            <View
              style={[
                s.cursusOptions,
                {
                  width: menuWidth,
                  left: Math.max(
                    insets.left + 8,
                    Math.min(cursusAnchor.right, window.width - insets.right - 8) - menuWidth,
                  ),
                  ...(opensAbove
                    ? { bottom: window.height - cursusAnchor.top + 8 }
                    : { top: cursusAnchor.bottom + 8 }),
                },
              ]}
            >
              <ScrollView style={[s.cursusList, { maxHeight: menuMaxHeight }]}>
                {courses.map((course) => {
                  const selected = course.cursus.id === current.cursus.id;
                  return (
                    <Pressable
                      key={course.cursus.id}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      onPress={() => {
                        onCourseChange(course.cursus.id);
                        setCursusAnchor(undefined);
                      }}
                      style={({ pressed }) => [
                        s.cursusOption,
                        (selected || pressed) && s.activeCursus,
                      ]}
                    >
                      <Text style={s.cursusOptionLabel}>{cursusLabel(course)}</Text>
                      {selected && (
                        <Text accessible={false} style={s.cursusCheck}>
                          ✓
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  skeletonStatus: { alignSelf: "flex-end", marginTop: 8, marginRight: 12 },
  banner: { padding: 12, gap: 12, borderRadius: 13 },
  card: {
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#5b5d4c",
    backgroundColor: "#33333380",
    overflow: "hidden",
  },
  availability: {
    alignSelf: "flex-end",
    marginTop: 8,
    marginRight: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#666",
    backgroundColor: "#333",
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#ffb733" },
  status: { color: "#eee", fontSize: 13, fontStyle: "italic" },
  identity: { flexDirection: "row", gap: 12, padding: 16, alignItems: "center" },
  avatar: { width: 76, height: 76, borderRadius: 38, borderWidth: 2 },
  fallback: { alignItems: "center", justifyContent: "center", backgroundColor: "#938e96" },
  initials: { fontSize: 25, color: "#fff", fontWeight: "700" },
  name: { flex: 1, gap: 4 },
  heading: { fontSize: 22, lineHeight: 27, fontWeight: "800", color: "#fff" },
  white: { fontSize: 15, color: "#fff" },
  profileTitle: { fontSize: 15, lineHeight: 20, color: "#fff" },
  level: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 18,
    paddingTop: 12,
  },
  levelNumber: { fontSize: 34, lineHeight: 36, fontWeight: "800", color: "#fff" },
  levelDetail: { flex: 1, gap: 3 },
  labels: {
    minHeight: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    alignItems: "center",
  },
  label: { color: "#fff", fontSize: 13, lineHeight: 18, fontWeight: "700" },
  cursus: { flex: 1, textAlign: "right" },
  cursusButton: { flex: 1, minHeight: 32, flexDirection: "row", alignItems: "center", gap: 6 },
  cursusOverlay: { flex: 1 },
  cursusOptions: {
    position: "absolute",
    borderRadius: 8,
    backgroundColor: theme.surface,
    boxShadow: "0px 4px 16px rgba(0, 0, 0, 0.24)",
  },
  cursusList: { borderRadius: 8 },
  cursusOption: {
    minHeight: 44,
    padding: 10,
    gap: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  activeCursus: { backgroundColor: "#e6f8f8" },
  cursusOptionLabel: { flex: 1, color: theme.ink, fontSize: 14, fontWeight: "600" },
  cursusCheck: { color: theme.tealText, fontWeight: "700" },
  track: { height: 10, backgroundColor: "#eef2f6", borderRadius: 4, overflow: "hidden" },
  progress: { height: "100%" },
  stats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    justifyContent: "space-around",
    backgroundColor: "#333",
    borderTopWidth: 1,
    borderTopColor: "#656565",
    padding: 12,
  },
  statLabel: { color: "#fff", fontSize: 17, fontWeight: "800" },
  contact: {
    borderRadius: 13,
    padding: 16,
    gap: 14,
    backgroundColor: "#33333380",
    borderWidth: 1,
    borderColor: "#5b5d4c",
  },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  contactText: { color: "#fff", fontSize: 16, flex: 1 },
});
