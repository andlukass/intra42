import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { type Campus, useCampuses, useClusterMaps } from "../api";
import { theme } from "../theme";
import { Button, Card, QueryMessage, styles } from "../ui";

function CampusMaps({
  campus,
  selectedMapId,
  onSelect,
}: {
  campus: Campus;
  selectedMapId?: number;
  onSelect: (campus: Campus, mapId: number) => void;
}) {
  const query = useClusterMaps(campus.id);
  return (
    <View style={s.maps}>
      {query.data?.length ? (
        query.data.map((map) => {
          const selected = map.id === selectedMapId;
          return (
            <Pressable
              key={map.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${campus.name}, ${map.name}`}
              onPress={() => onSelect(campus, map.id)}
              style={({ pressed }) => [s.option, (selected || pressed) && s.selected]}
            >
              <Text style={s.name}>{map.name}</Text>
              <Text accessible={false} style={s.name}>
                {selected ? "✓" : "›"}
              </Text>
            </Pressable>
          );
        })
      ) : (
        <QueryMessage
          pending={query.isPending}
          error={query.error}
          empty="No maps available for this campus."
        />
      )}
      {query.isError && <Button title="Try again" onPress={() => void query.refetch()} />}
    </View>
  );
}

export function CampusClusterPicker({
  selectedCampusId,
  selectedMapId,
  onSelect,
}: {
  selectedCampusId?: number;
  selectedMapId?: number;
  onSelect: (campus: Campus, mapId: number) => void;
}) {
  const campuses = useCampuses();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<number>();
  const [limit, setLimit] = useState(12);
  const matches =
    campuses.data?.filter((campus) =>
      campus.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
    ) ?? [];
  return (
    <Card title="Other campuses">
      <Text style={styles.muted}>Choose a campus to see its available maps.</Text>
      <TextInput
        accessibilityLabel="Search campuses"
        placeholder="Search campuses"
        placeholderTextColor={theme.muted}
        value={search}
        onChangeText={(value) => {
          setSearch(value);
          setLimit(12);
          setExpanded(undefined);
        }}
        clearButtonMode="while-editing"
        autoCorrect={false}
        autoCapitalize="none"
        style={s.search}
      />
      {matches.slice(0, limit).map((campus) => (
        <View key={campus.id} style={s.group}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={campus.name}
            accessibilityState={{
              expanded: expanded === campus.id,
              selected: selectedCampusId === campus.id,
            }}
            onPress={() =>
              setExpanded((current) => (current === campus.id ? undefined : campus.id))
            }
            style={({ pressed }) => [s.option, (pressed || expanded === campus.id) && s.selected]}
          >
            <Text style={s.name}>{campus.name}</Text>
            <Text accessible={false} style={s.name}>
              {expanded === campus.id ? "⌃" : "›"}
            </Text>
          </Pressable>
          {expanded === campus.id && (
            <CampusMaps campus={campus} selectedMapId={selectedMapId} onSelect={onSelect} />
          )}
        </View>
      ))}
      {!matches.length && (
        <QueryMessage
          pending={campuses.isPending}
          error={campuses.error}
          empty={search.trim() ? "No campuses match your search." : "No campuses available."}
        />
      )}
      {campuses.isError && (
        <Button title="Retry campuses" onPress={() => void campuses.refetch()} />
      )}
      {matches.length > limit && (
        <Button title="Load more campuses" onPress={() => setLimit((current) => current + 12)} />
      )}
    </Card>
  );
}

const s = StyleSheet.create({
  group: { gap: 8 },
  maps: { gap: 8, paddingLeft: 12 },
  search: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    color: theme.ink,
    fontSize: 16,
  },
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
