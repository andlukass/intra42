import { File, Paths } from "expo-file-system";
import type { SearchResults } from "./api";

export type RecentSearch =
  | ({ kind: "user" } & SearchResults["users"][number])
  | ({ kind: "project" } & SearchResults["projects"][number]);

const limit = 20;
const historyFile = () => new File(Paths.document, "recent-searches.json");
export const recentSearchKey = (item: RecentSearch) =>
  item.kind === "user" ? `user:${item.login}` : `project:${item.id}`;

function validItem(value: unknown): value is RecentSearch {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<RecentSearch>;
  if (item.kind === "user")
    return (
      typeof item.login === "string" &&
      /^[a-z0-9][a-z0-9_-]{0,31}$/.test(item.login) &&
      (item.cdn_uri === undefined ||
        (typeof item.cdn_uri === "string" && item.cdn_uri.length < 2048))
    );
  return (
    item.kind === "project" &&
    Number.isSafeInteger(item.id) &&
    (item.id ?? 0) > 0 &&
    typeof item.name === "string" &&
    item.name.length > 0 &&
    item.name.length <= 200 &&
    typeof item.slug === "string" &&
    /^[a-z0-9][a-z0-9_-]{0,127}$/.test(item.slug)
  );
}

export function rememberSearch(history: RecentSearch[], item: RecentSearch) {
  return [
    item,
    ...history.filter((entry) => recentSearchKey(entry) !== recentSearchKey(item)),
  ].slice(0, limit);
}

export function readRecentSearches(): RecentSearch[] {
  try {
    const file = historyFile();
    if (!file.exists) return [];
    const data: unknown = JSON.parse(file.textSync());
    if (!Array.isArray(data)) return [];
    const seen = new Set<string>();
    return data
      .filter(validItem)
      .filter((item) => {
        const key = recentSearchKey(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, limit);
  } catch {
    return [];
  }
}

export function saveRecentSearches(history: RecentSearch[]) {
  try {
    historyFile().write(JSON.stringify(history.slice(0, limit)));
    return true;
  } catch {
    return false;
  }
}
