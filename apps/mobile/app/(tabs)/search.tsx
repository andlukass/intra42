import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  InteractionManager,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { type SearchResults, useIntraQuery, useProfile, useSearchPhoto } from "../../src/api";
import {
  type RecentSearch,
  readRecentSearches,
  recentSearchKey,
  rememberSearch,
  saveRecentSearches,
} from "../../src/recent-searches";
import { useSession } from "../../src/session";
import { theme } from "../../src/theme";
import { Button, Screen, styles } from "../../src/ui";

function Match({ text, query }: { text: string; query: string }) {
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  return (
    <Text style={s.resultText}>
      {index < 0 ? (
        text
      ) : (
        <>
          {text.slice(0, index)}
          <Text style={s.match}>{text.slice(index, index + query.length)}</Text>
          {text.slice(index + query.length)}
        </>
      )}
    </Text>
  );
}

function StudentPhoto({ user }: { user: SearchResults["users"][number] }) {
  const { data: uri } = useSearchPhoto(user.cdn_uri);
  const [failedUri, setFailedUri] = useState<string>();
  return (
    <View style={s.avatar}>
      {uri && uri !== failedUri ? (
        <Image source={uri} style={s.photo} onError={() => setFailedUri(uri)} accessible={false} />
      ) : (
        <Text style={s.initials}>{user.login.slice(0, 2).toUpperCase()}</Text>
      )}
    </View>
  );
}

export default function Search() {
  const { token } = useSession();
  const profile = useProfile();
  const accountId = token ? profile.data?.id : undefined;
  return <AccountSearch key={accountId ?? "no-account"} accountId={accountId} />;
}

function AccountSearch({ accountId }: { accountId?: number }) {
  const router = useRouter();
  const { token } = useSession();
  const inputRef = useRef<TextInput>(null);
  const focusedOnce = useRef(false);
  const [inputLaidOut, setInputLaidOut] = useState(false);
  useFocusEffect(
    useCallback(() => {
      if (!token || !inputLaidOut || focusedOnce.current) return;
      let frame: number | undefined;
      // Let the first layout and navigation interactions finish before opening the keyboard.
      const task = InteractionManager.runAfterInteractions(() => {
        frame = requestAnimationFrame(() => {
          if (!inputRef.current) return;
          inputRef.current.focus();
          focusedOnce.current = true;
        });
      });
      return () => {
        task.cancel();
        if (frame !== undefined) cancelAnimationFrame(frame);
      };
    }, [token, inputLaidOut]),
  );
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState(() => (accountId ? readRecentSearches(accountId) : []));
  function updateRecent(next: RecentSearch[]) {
    if (!accountId) return;
    setRecent(next);
    if (!saveRecentSearches(accountId, next))
      Alert.alert(
        "Could not save recent searches",
        "Changes will only last while this screen is open.",
      );
  }
  function openResult(item: RecentSearch) {
    updateRecent(rememberSearch(recent, item));
    if (item.kind === "user")
      router.push({ pathname: "/profile/[id]", params: { id: item.login } });
    else router.push({ pathname: "/project/[slug]", params: { slug: item.slug } });
  }
  const term = input.trim();
  useEffect(() => {
    const timer = setTimeout(() => setQuery(term), 500);
    return () => clearTimeout(timer);
  }, [term]);
  const results = useIntraQuery<SearchResults>(
    term && term === query ? `/search?${new URLSearchParams({ query })}` : undefined,
  );
  const pending = !!token && !!term && (term !== query || results.isPending);
  const data = !pending && term && term === query ? results.data : undefined;
  return (
    <Screen>
      {!token ? (
        <Text style={styles.muted}>Sign in from Home to search students and projects.</Text>
      ) : (
        <>
          <View style={s.searchBar}>
            <Svg width={20} height={20} viewBox="0 0 24 24" accessible={false}>
              <Circle
                cx={10.5}
                cy={10.5}
                r={7.5}
                fill="none"
                stroke={theme.muted}
                strokeWidth={1.8}
              />
              <Path d="m16 16 5 5" stroke={theme.muted} strokeWidth={1.8} strokeLinecap="round" />
            </Svg>
            <TextInput
              ref={inputRef}
              onLayout={() => setInputLaidOut(true)}
              accessibilityLabel="Search students and projects"
              placeholder="Search students and projects…"
              placeholderTextColor={theme.muted}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={() => setQuery(term)}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={100}
              style={s.input}
            />
            {!!input && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                hitSlop={8}
                onPress={() => {
                  setInput("");
                  setQuery("");
                }}
                style={s.clear}
              >
                <Text style={s.clearText}>×</Text>
              </Pressable>
            )}
          </View>
          {!term &&
            (recent.length ? (
              <View style={s.group}>
                <Text accessibilityRole="header" style={s.heading}>
                  Recently searched
                </Text>
                <View style={s.results}>
                  {recent.map((item) => {
                    const label = item.kind === "user" ? item.login : item.name;
                    return (
                      <View key={recentSearchKey(item)} style={s.recentRow}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={
                            item.kind === "user"
                              ? `Open ${item.login}'s profile`
                              : `Open project ${item.name}`
                          }
                          onPress={() => openResult(item)}
                          style={({ pressed }) => [s.result, s.recentLink, pressed && s.pressed]}
                        >
                          {item.kind === "user" && <StudentPhoto user={item} />}
                          <Match text={label} query="" />
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${label} from recent searches`}
                          onPress={() =>
                            updateRecent(
                              recent.filter(
                                (entry) => recentSearchKey(entry) !== recentSearchKey(item),
                              ),
                            )
                          }
                          style={({ pressed }) => [s.remove, pressed && s.pressed]}
                        >
                          <Text accessible={false} style={s.clearText}>
                            ×
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : (
              <Text style={styles.muted}>Search for a student login or project name.</Text>
            ))}
          {pending && (
            <View
              style={s.message}
              accessible
              accessibilityLabel="Searching"
              accessibilityState={{ busy: true }}
            >
              <ActivityIndicator color={theme.tealText} />
              <Text style={styles.muted}>Searching…</Text>
            </View>
          )}
          {!!term && !pending && term === query && results.isError && (
            <View style={s.message}>
              <Text accessibilityRole="alert" style={styles.muted}>
                {results.error.message}
              </Text>
              <Button title="Try again" onPress={() => void results.refetch()} />
            </View>
          )}
          {data && !data.users.length && !data.projects.length && (
            <Text accessibilityLiveRegion="polite" style={styles.muted}>
              No results.
            </Text>
          )}
          {!!data?.users.length && (
            <View style={s.group}>
              <Text accessibilityRole="header" style={s.heading}>
                Students
              </Text>
              <View style={s.results}>
                {data.users.map((user) => (
                  <Pressable
                    key={user.login}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${user.login}'s profile`}
                    onPress={() => openResult({ kind: "user", ...user })}
                    style={({ pressed }) => [s.result, pressed && s.pressed]}
                  >
                    <StudentPhoto key={`${user.login}:${user.cdn_uri}`} user={user} />
                    <Match text={user.login} query={query} />
                    <Text accessible={false} style={s.chevron}>
                      ›
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
          {!!data?.projects.length && (
            <View style={s.group}>
              <Text accessibilityRole="header" style={s.heading}>
                Projects
              </Text>
              <View style={s.results}>
                {data.projects.map((project) => (
                  <Pressable
                    key={project.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Open project ${project.name}`}
                    onPress={() => openResult({ kind: "project", ...project })}
                    style={({ pressed }) => [s.result, pressed && s.pressed]}
                  >
                    <Match text={project.name} query={query} />
                    <Text accessible={false} style={s.chevron}>
                      ›
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  searchBar: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    backgroundColor: theme.surface,
  },
  input: { flex: 1, minHeight: 50, fontSize: 16, color: theme.ink, paddingVertical: 10 },
  clear: { minWidth: 28, minHeight: 36, alignItems: "center", justifyContent: "center" },
  clearText: { color: theme.muted, fontSize: 26 },
  group: { gap: 8 },
  heading: { color: theme.slate, fontSize: 16, fontWeight: "500" },
  results: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: "hidden",
  },
  result: { minHeight: 54, padding: 12, gap: 12, flexDirection: "row", alignItems: "center" },
  recentRow: { flexDirection: "row", alignItems: "stretch" },
  recentLink: { flex: 1 },
  remove: { minWidth: 44, minHeight: 44, justifyContent: "center", alignItems: "center" },
  resultText: { flex: 1, color: theme.tealText, fontSize: 16 },
  match: { fontWeight: "700" },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#e8f7f7",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  photo: { width: 36, height: 36 },
  initials: { color: theme.tealText, fontSize: 12, fontWeight: "700" },
  chevron: { color: theme.muted, fontSize: 24 },
  pressed: { backgroundColor: "#e8f7f7" },
  message: { gap: 12, alignItems: "center", paddingVertical: 18 },
});
