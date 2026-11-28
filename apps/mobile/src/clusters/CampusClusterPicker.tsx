import { useState } from "react";
import { Keyboard, Pressable, StyleSheet, Text, View } from "react-native";
import { type Campus, useCampuses } from "../api";
import { SearchField } from "../SearchField";
import { theme } from "../theme";
import { Button, QueryMessage, styles } from "../ui";
import { countryFlag } from "./countryFlag";
import { verifiedCampusMaps } from "./maps";

export function CampusClusterPicker({
  selectedCampusId,
  onSelect,
}: {
  selectedCampusId?: number;
  onSelect: (campus: Campus, mapId: number) => void;
}) {
  const campuses = useCampuses();
  const [search, setSearch] = useState("");
  const matches =
    campuses.data?.filter(
      (campus) =>
        verifiedCampusMaps(campus.id).length > 0 &&
        campus.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
    ) ?? [];
  return (
    <View style={s.content}>
      <Text accessibilityRole="header" style={s.title}>
        Choose campus
      </Text>
      <Text style={styles.muted}>Choose a campus to see its available maps.</Text>
      <SearchField
        label="Search campuses"
        placeholder="Search campuses…"
        value={search}
        onChangeText={(value) => {
          setSearch(value);
        }}
        onSubmit={() => Keyboard.dismiss()}
      />
      {matches.map((campus) => (
        <Pressable
          key={campus.id}
          accessibilityRole="button"
          accessibilityLabel={campus.country ? `${campus.name}, ${campus.country}` : campus.name}
          accessibilityState={{ selected: selectedCampusId === campus.id }}
          onPress={() => {
            const first = verifiedCampusMaps(campus.id)[0];
            if (first) onSelect(campus, first.id);
          }}
          style={({ pressed }) => [
            s.option,
            (pressed || selectedCampusId === campus.id) && s.selected,
          ]}
        >
          <Text style={s.name}>
            {[countryFlag(campus.country), campus.name].filter(Boolean).join("  ")}
          </Text>
          <Text accessible={false} style={s.name}>
            ›
          </Text>
        </Pressable>
      ))}
      {!matches.length && (
        <QueryMessage
          pending={campuses.isPending}
          error={campuses.error}
          empty={
            search.trim()
              ? "No campuses with available maps match your search."
              : "No campuses with available maps."
          }
        />
      )}
      {campuses.isError && (
        <Button title="Retry campuses" onPress={() => void campuses.refetch()} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  content: { gap: 16 },
  title: { fontSize: 22, fontWeight: "700", color: theme.ink, marginBottom: 4 },
  option: {
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  selected: { backgroundColor: "#e6f8f8", borderColor: theme.tealText },
  name: { color: theme.tealText, fontSize: 16, flexShrink: 1 },
});
