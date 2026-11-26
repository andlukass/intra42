import { queryOptions, useInfiniteQuery, useQueries, useQuery } from "@tanstack/react-query";
import { isAvatarUri, loadSmallAvatar } from "./avatarCache";
import {
  lisboaMaps,
  normalizeCluster,
  verifiedCampusMaps,
  type Workstation,
} from "./clusters/maps";
import { type Coalition, type CoalitionBloc, coalitionsByCourse } from "./home/coalition";
import { broker, demo, useSession } from "./session";

export type Campus = { id: number; name: string };
export type Achievement = {
  id: number;
  name: string;
  description: string;
  image?: string | null;
  kind?: string;
  tier?: string;
};
export type AchievementAward = {
  achievement_id: number;
  created_at: string;
  updated_at?: string | null;
};
export type Profile = {
  id: number;
  login: string;
  displayname: string;
  email: string;
  phone?: string;
  anonymize_date?: string | null;
  location?: string;
  wallet?: number;
  correction_point?: number;
  alumni?: boolean;
  image?: { link?: string; versions?: { small?: string } };
  campus?: Campus[];
  campus_users?: { campus_id: number; is_primary: boolean }[];
  titles?: { id: number; name: string }[];
  titles_users?: { title_id: number; selected: boolean }[];
  cursus_users?: {
    level: number;
    grade?: string | null;
    cursus: { id: number; name: string; slug?: string };
  }[];
  achievements?: Achievement[];
  projects_users?: {
    id: number;
    status: string;
    marked?: boolean;
    final_mark?: number | null;
    "validated?"?: boolean | null;
    project: { id?: number; name: string; slug?: string };
  }[];
};
export type ProjectSession = {
  id: number;
  campus_id: number | null;
  cursus_id: number | null;
  solo: boolean;
  max_people?: number | null;
  estimate_time?: string | null;
  duration_days?: number | null;
  difficulty?: number | null;
  description?: string | null;
  objectives?: string[];
};
export type ProjectDetails = {
  id: number;
  name: string;
  slug: string;
  difficulty?: number | null;
  children?: { id: number; name: string; slug: string }[];
  project_sessions?: ProjectSession[];
};
export type ProjectEnrollment = {
  current_team_id: number | null;
  teams?: {
    id: number;
    name: string;
    locked_at: string | null;
    project_session_id: number;
  }[];
};
export type ProjectSort = "name" | "recent";
export type Event = {
  id: number;
  name: string;
  begin_at: string;
  end_at: string;
  location?: string;
  kind?: string;
};
export type Evaluation = {
  id: number;
  begin_at: string;
  filled_at?: string;
  scale?: { name?: string };
};
type EvaluationPoint = {
  id: number;
  reason: string | null;
  sum: number;
  total: number;
  created_at: string;
};
type QuestEnrollment = {
  id: number;
  validated_at: string | null;
  end_at: string | null;
  quest: { name: string; description?: string | null };
};
type CompletedEvaluation = Evaluation & {
  final_mark?: number | null;
  comment?: string | null;
  feedback?: string | null;
  feedback_rating?: number | null;
  feedbacks?: { id: number; comment?: string | null; rating?: number | null }[];
};
export type Location = { id: number; begin_at: string; end_at: string | null };
export type Slot = { id: number; begin_at: string; end_at: string; scale_team_id?: number | null };

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const demoCoalition: Coalition = { id: 520, name: "Logic League", color: "#a7a22d" };

const fixtures: Profile = {
  id: 1,
  login: "demo42",
  image: {
    link: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAIAAADYYG7QAAAAoklEQVR4nO3W0Q2AIAwEUEZxMT/czK2cwh30H0PLUaRtLun38dJAjrIdu6spywUEEURQVNB9nS5Ar6OeNaBPyjgLBIka2JQCpNRgJoLMQV0awBR/QwSZmoDkLCCNCYtN1Pa1zCQn74+RIGnW3yEvz95X2wOaXpMWBFN6WSqQiUZpCggy1GhMAshcI5oISgWapGmbQm2IoIigGab2cQG77GfQA3Zg4jR0CmgYAAAAAElFTkSuQmCC",
  },
  displayname: "Alex Silva",
  email: "demo@example.test",
  wallet: 680,
  correction_point: 4,
  titles: [{ id: 1, name: "Mastermind %login" }],
  titles_users: [{ title_id: 1, selected: true }],
  campus: [{ id: 38, name: "Lisboa" }],
  cursus_users: [
    { level: 7.42, grade: "Pisciner", cursus: { id: 9, name: "C Piscine" } },
    { level: 11.78, grade: "Transcender", cursus: { id: 21, name: "42cursus", slug: "42cursus" } },
    { level: 0, cursus: { id: 66, name: "C-Piscine-Reloaded" } },
  ],
  achievements: [
    { id: 1, name: "Campus Contributor", description: "Completed a campus activity." },
  ],
  projects_users: [
    {
      id: 1,
      status: "in_progress",
      project: { id: 1, name: "Web infrastructure", slug: "web-infrastructure" },
    },
  ],
};
let demoSlots: Slot[] = [];

const requestSpacingMs = 550;
let requestQueue = Promise.resolve();
let nextRequestAt = 0;

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function waitForRequestTurn(signal?: AbortSignal) {
  const turn = requestQueue.then(async () => {
    while (nextRequestAt > Date.now() && !signal?.aborted) {
      await wait(nextRequestAt - Date.now());
    }
    if (signal?.aborted) throw new Error("Request canceled.");
    nextRequestAt = Date.now() + requestSpacingMs;
  });
  requestQueue = turn.catch(() => {});
  return turn;
}

function rateLimitDelay(value: string | null) {
  if (!value) return 1_500;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds) ? seconds * 1_000 : Date.parse(value) - Date.now();
  return Number.isFinite(delay) ? Math.max(requestSpacingMs, delay) : 1_500;
}

const demoProject: ProjectDetails = {
  id: 1,
  name: "Web infrastructure",
  slug: "web-infrastructure",
  difficulty: 2500,
  project_sessions: [{ id: 1, campus_id: 38, cursus_id: 21, solo: true, estimate_time: "5 days" }],
};

export async function api<T>(
  token: string,
  path: string,
  signal?: AbortSignal,
  body?: object,
): Promise<T> {
  if (demo && token === "demo") {
    if (body && "slot" in body) {
      const slot = body.slot as Omit<Slot, "id">;
      demoSlots = [...demoSlots, { ...slot, id: Date.now() }];
      return demoSlots.at(-1) as T;
    }
    const now = Date.now();
    if (path === "/me") return fixtures as T;
    if (path.startsWith("/achievements?")) {
      return [
        ...(fixtures.achievements ?? []),
        {
          id: 2,
          name: "Code Explorer",
          description: "Validate 21 projects.",
          kind: "project",
          tier: "medium",
        },
      ] as T;
    }
    if (path.startsWith("/achievements_users?")) {
      return [{ achievement_id: 1, created_at: new Date(now - 86_400_000).toISOString() }] as T;
    }
    if (path === "/projects/web-infrastructure") return demoProject as T;
    if (path === "/projects_users/1") {
      const enrollment: ProjectEnrollment = {
        current_team_id: 1,
        teams: [{ id: 1, name: "Demo team", locked_at: null, project_session_id: 1 }],
      };
      return enrollment as T;
    }
    if (path.startsWith("/campus?")) return fixtures.campus as T;
    if (/^\/users\/\d+\/coalitions$/.test(path)) return [demoCoalition] as T;
    if (path.startsWith("/blocs?")) {
      return [{ campus_id: 38, cursus_id: 21, coalitions: [demoCoalition] }] as T;
    }
    if (/^\/users\/\d+$/.test(path)) {
      const id = Number(path.split("/").at(-1));
      return { ...fixtures, id, login: id === 1 ? fixtures.login : "campus-peer" } as T;
    }
    if (path.startsWith("/me/scale_teams/as_corrector?")) {
      const date = new Date(now - 86_400_000).toISOString();
      const item: CompletedEvaluation = {
        id: 1,
        begin_at: date,
        filled_at: date,
        scale: { name: "Web infrastructure" },
        final_mark: 100,
        comment: "The implementation passed the required checks.",
        feedbacks: [{ id: 1, rating: 5, comment: "Clear explanations during the review." }],
      };
      return [item] as T;
    }
    if (path.startsWith("/users/1/correction_point_historics?")) {
      const items: EvaluationPoint[] = [
        {
          id: 2,
          reason: "Earning after defense",
          sum: 1,
          total: 4,
          created_at: new Date(now - 86_400_000).toISOString(),
        },
        {
          id: 1,
          reason: "Defense scheduling",
          sum: -1,
          total: 3,
          created_at: new Date(now - 259_200_000).toISOString(),
        },
      ];
      return items as T;
    }
    if (path.startsWith("/users/1/quests_users?")) {
      const items: QuestEnrollment[] = [
        { id: 2, validated_at: null, end_at: null, quest: { name: "Common Core Rank 04" } },
        {
          id: 1,
          validated_at: new Date(now - 86_400_000).toISOString(),
          end_at: null,
          quest: { name: "Common Core Rank 03" },
        },
      ];
      return items as T;
    }
    if (path.startsWith("/clusters?")) return lisboaMaps as T;
    if (path.includes("/locations") && path.includes("filter[active]"))
      return [
        {
          id: 1,
          host: "c1r1s2",
          end_at: null,
          user: { id: 1, login: fixtures.login, image: fixtures.image },
        },
        { id: 2, host: "c2r2s4", end_at: null, user: { id: 2, login: "campus-peer" } },
      ] as T;
    if (path.includes("/slots")) return demoSlots as T;
    return [] as T;
  }
  try {
    return await requestIntraJson<T>(`https://api.intra.42.fr/v2${path}`, token, signal, body);
  } catch (error) {
    // User grants can be campus-restricted; the broker reads only public profile resources.
    if (
      !body &&
      broker &&
      error instanceof ApiError &&
      error.status === 403 &&
      /^\/users\/[1-9]\d{0,9}(?:\/(?:coalitions|locations))?(?:\?|$)/.test(path)
    ) {
      return requestIntraJson<T>(
        `${broker}${path.replace("/users/", "/profiles/")}`,
        token,
        signal,
      );
    }
    throw error;
  }
}

async function requestIntraJson<T>(
  url: string,
  token: string,
  signal?: AbortSignal,
  body?: object,
): Promise<T> {
  const response = await requestIntra(url, token, signal, body);
  return response.json();
}

async function requestIntra(url: string, token: string, signal?: AbortSignal, body?: object) {
  for (let attempt = 0; ; attempt++) {
    await waitForRequestTurn(signal);
    const response = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
    if (response.ok) return response;
    if (response.status === 429) {
      const delay = rateLimitDelay(response.headers.get("Retry-After"));
      if (delay <= 15_000) {
        nextRequestAt = Math.max(nextRequestAt, Date.now() + delay);
        if (!body && attempt < 2) continue;
      }
      throw new Error("42 is limiting requests. Wait a moment and try again.");
    }
    const data = await response.json().catch(() => null);
    throw new ApiError(
      typeof data?.error === "string" ? data.error : `42 returned HTTP ${response.status}.`,
      response.status,
    );
  }
}

export function useIntraQuery<T>(path?: string) {
  const { token } = useSession();
  return useQuery({
    queryKey: ["42", path],
    enabled: !!token && !!path,
    staleTime: 60000,
    retry: false,
    queryFn: ({ signal }) => {
      if (!token || !path) throw new Error("Sign in to 42 first.");
      return api<T>(token.accessToken, path, signal);
    },
  });
}

const projectPageSize = 20;

export function useProjectList(search: string, sort: ProjectSort, cursusId?: number) {
  const { token } = useSession();
  return useInfiniteQuery({
    queryKey: ["42", "project-list", search, sort, cursusId],
    enabled: !!token,
    staleTime: 60_000,
    retry: false,
    initialPageParam: 1,
    queryFn: async ({ pageParam, signal }) => {
      if (!token) throw new Error("Sign in to 42 first.");
      if (demo && token.accessToken === "demo") {
        const matches =
          (!cursusId || cursusId === 21) &&
          demoProject.name.toLowerCase().includes(search.toLowerCase());
        return { items: matches ? [demoProject] : [], hasMore: false };
      }
      const params = new URLSearchParams({
        "filter[visible]": "true",
        sort: sort === "recent" ? "-created_at,-id" : "name,id",
        "page[size]": String(projectPageSize),
        "page[number]": String(pageParam),
      });
      if (search) params.set("search[name]", search);
      const path = cursusId ? `/cursus/${cursusId}/projects` : "/projects";
      const response = await requestIntra(
        `https://api.intra.42.fr/v2${path}?${params}`,
        token.accessToken,
        signal,
      );
      const items: ProjectDetails[] = await response.json();
      const total = Number.parseInt(response.headers.get("X-Total") ?? "", 10);
      const hasMore =
        items.length === projectPageSize &&
        (!Number.isFinite(total) || pageParam * projectPageSize < total);
      return { items, hasMore };
    },
    getNextPageParam: (lastPage, _pages, page) => (lastPage.hasMore ? page + 1 : undefined),
  });
}

const agendaPageSize = 3;
const demoEventNames = [
  "Campus Meetup",
  "Peer Study Session",
  "Student Club Showcase",
  "Career Workshop",
  "Community Meeting",
  "Project Demo",
  "Campus Game Night",
];

export function useAgenda(campusId?: number) {
  const { token } = useSession();
  return useInfiniteQuery({
    queryKey: ["42", "agenda", campusId],
    enabled: !!token && !!campusId,
    staleTime: 60_000,
    retry: false,
    initialPageParam: 1,
    queryFn: async ({ pageParam, signal }) => {
      if (!token || !campusId) throw new Error("A campus is required to view the agenda.");
      const end = pageParam * agendaPageSize;
      if (demo && token.accessToken === "demo") {
        const start = end - agendaPageSize;
        const items = demoEventNames.slice(start, end).map((name, index): Event => {
          const id = start + index + 1;
          const begin = Date.now() + id * 86_400_000;
          return {
            id,
            name,
            begin_at: new Date(begin).toISOString(),
            end_at: new Date(begin + 3_600_000).toISOString(),
          };
        });
        return { items, hasMore: end < demoEventNames.length };
      }
      const params = new URLSearchParams({
        "filter[future]": "true",
        sort: "begin_at,id",
        "page[size]": String(agendaPageSize),
        "page[number]": String(pageParam),
      });
      const response = await requestIntra(
        `https://api.intra.42.fr/v2/campus/${campusId}/events?${params}`,
        token.accessToken,
        signal,
      );
      const items: Event[] = await response.json();
      const total = Number.parseInt(response.headers.get("X-Total") ?? "", 10);
      const hasMore = items.length === agendaPageSize && (!Number.isFinite(total) || end < total);
      return { items, hasMore };
    },
    getNextPageParam: (lastPage, _pages, lastPageNumber) =>
      lastPage.hasMore ? lastPageNumber + 1 : undefined,
  });
}

const feedbackPageSize = 30;

export function useFeedbackLogs() {
  const { token } = useSession();
  return useInfiniteQuery({
    queryKey: ["42", "feedback-logs"],
    enabled: !!token,
    staleTime: 60_000,
    retry: false,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => {
      if (!token) throw new Error("Sign in to view feedback logs.");
      const params = new URLSearchParams({
        "filter[filled]": "true",
        sort: "-begin_at,-id",
        "page[size]": String(feedbackPageSize),
        "page[number]": String(pageParam),
      });
      return api<CompletedEvaluation[]>(
        token.accessToken,
        `/me/scale_teams/as_corrector?${params}`,
        signal,
      );
    },
    getNextPageParam: (lastPage, _pages, lastPageNumber) =>
      lastPage.length === feedbackPageSize ? lastPageNumber + 1 : undefined,
  });
}
export function useLogtime(userId?: number) {
  const { token } = useSession();
  const month = new Date();
  const start = new Date(month.getFullYear(), month.getMonth() - 3, 1);
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  return useQuery({
    queryKey: ["42", "logtime", userId, start.toISOString()],
    enabled: !!token && !!userId,
    staleTime: 60_000,
    retry: false,
    queryFn: async ({ signal }) => {
      if (!token || !userId) throw new Error("Sign in to 42 first.");
      const locations: Location[] = [];
      let page = 1;
      while (true) {
        const params = new URLSearchParams({
          "range[begin_at]": `${start.toISOString()},${end.toISOString()}`,
          "page[size]": "100",
          "page[number]": String(page),
          sort: "begin_at,id",
        });
        const batch = await api<Location[]>(
          token.accessToken,
          `/users/${userId}/locations?${params}`,
          signal,
        );
        locations.push(...batch);
        if (batch.length < 100) return { locations, now: Date.now() };
        page += 1;
      }
    },
  });
}

async function readPages<T>(token: string, path: string, signal: AbortSignal) {
  const result: T[] = [];
  let page = 1;
  while (true) {
    const batch = await api<T[]>(token, `${path}&page[size]=100&page[number]=${page}`, signal);
    result.push(...batch);
    if (batch.length < 100) return result;
    page += 1;
  }
}

function useIntraList<T>(path?: string) {
  const { token } = useSession();
  return useQuery({
    queryKey: ["42", "list", path],
    enabled: !!token && !!path,
    staleTime: 60_000,
    retry: false,
    queryFn: ({ signal }) => {
      if (!token || !path) throw new Error("Sign in to 42 first.");
      return readPages<T>(token.accessToken, path, signal);
    },
  });
}

export function useEvaluationLogs(userId?: number) {
  return useIntraList<EvaluationPoint>(
    userId ? `/users/${userId}/correction_point_historics?sort=-created_at,-id` : undefined,
  );
}

export function useAchievementAwards(userId?: number) {
  return useIntraList<AchievementAward>(
    userId
      ? `/achievements_users?filter[user_id]=${userId}&filter[rewarded]=true&sort=-updated_at,-id`
      : undefined,
  );
}

export function useAchievementCatalog(enabled: boolean) {
  return useIntraList<Achievement>(
    enabled ? "/achievements?filter[visible]=true&sort=id" : undefined,
  );
}

export function useAchievementIcon(image?: string | null) {
  const { token } = useSession();
  const path = image?.replace(/^\/uploads(?=\/achievement\/image\/)/, "");
  return useQuery({
    queryKey: ["42", "achievement-icon", path],
    enabled: !!(token && broker && path && !demo),
    staleTime: Infinity,
    retry: (failures, error) =>
      failures < 2 && (!(error instanceof ApiError) || error.status === 429 || error.status >= 500),
    queryFn: async ({ signal }) => {
      if (!token || !broker || !path) throw new Error("Achievement icon unavailable.");
      const { uri } = await requestIntraJson<{ uri: unknown }>(
        `${broker}/achievement-icon?${new URLSearchParams({ path })}`,
        token.accessToken,
        signal,
      );
      if (typeof uri !== "string" || !/^data:image\/(svg\+xml|png|jpeg|webp);base64,/.test(uri)) {
        throw new Error("Invalid achievement icon.");
      }
      return uri;
    },
  });
}

export function useQuests(userId?: number) {
  return useIntraList<QuestEnrollment>(
    userId ? `/users/${userId}/quests_users?sort=-id` : undefined,
  );
}

function clusterMapOptions(token: string | undefined, campusId?: number) {
  return queryOptions({
    queryKey: ["42", "clusters", campusId, "official-maps-v1"],
    select: (clusters: unknown[]) => clusters.map((cluster) => normalizeCluster(cluster, campusId)),
    enabled: !!token && !!campusId,
    staleTime: 30 * 60_000,
    retry: false,
    queryFn: async ({ signal }) => {
      if (!token || !campusId) throw new Error("Sign in to view your campus clusters.");
      const verified = verifiedCampusMaps(campusId);
      if (verified.length) return verified;
      try {
        const clusters = await readPages<unknown>(
          token,
          `/clusters?filter[campus_id]=${campusId}&sort=id`,
          signal,
        );
        if (!clusters.length) {
          throw new Error("This campus's official map is not available in the app yet.");
        }
        return clusters;
      } catch (error) {
        if (error instanceof ApiError && error.status === 403) {
          throw new Error("42 did not allow access to this campus's maps.");
        }
        throw error;
      }
    },
  });
}

export function useClusterMaps(campusId?: number) {
  const { token } = useSession();
  return useQuery(clusterMapOptions(token?.accessToken, campusId));
}

export function useCampuses() {
  const { token } = useSession();
  return useQuery({
    queryKey: ["42", "campuses"],
    enabled: !!token,
    staleTime: 30 * 60_000,
    retry: false,
    queryFn: ({ signal }) => {
      if (!token) throw new Error("Sign in to browse campuses.");
      return readPages<Campus>(token.accessToken, "/campus?sort=name", signal);
    },
  });
}

export function useClusterOccupancy(campusId?: number) {
  const { token } = useSession();
  return useQuery({
    queryKey: ["42", "cluster-occupancy", campusId],
    enabled: !!token && !!campusId,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
    queryFn: async ({ signal }) => {
      if (!token || !campusId) throw new Error("Sign in to view cluster occupancy.");
      return readPages<Workstation>(
        token.accessToken,
        `/campus/${campusId}/locations?filter[active]=true&sort=id`,
        signal,
      );
    },
  });
}

export const useProfile = (userId?: number) =>
  useIntraQuery<Profile>(userId === undefined ? "/me" : `/users/${userId}`);

export function useProfileCoalitions(user?: Profile) {
  const { token } = useSession();
  const userId = user?.cursus_users?.length ? user.id : undefined;
  const memberships = useIntraQuery<Coalition[]>(
    userId ? `/users/${userId}/coalitions` : undefined,
  );
  const campuses = userId ? (user?.campus ?? []) : [];
  const primary = user?.campus_users?.find((campus) => campus.is_primary)?.campus_id;
  const campusIds = campuses
    .map(({ id }) => id)
    .sort((id, other) => Number(other === primary) - Number(id === primary));
  const blocs = useQueries({
    queries: campusIds.map((campusId) => ({
      queryKey: ["42", "coalition-blocs", campusId],
      enabled: !!token,
      staleTime: 30 * 60_000,
      retry: false,
      queryFn: ({ signal }: { signal: AbortSignal }) => {
        if (!token) throw new Error("Sign in to view coalitions.");
        return readPages<CoalitionBloc>(
          token.accessToken,
          `/blocs?filter[campus_id]=${campusId}`,
          signal,
        );
      },
    })),
  });
  return {
    byCourse: coalitionsByCourse(
      memberships.data ?? [],
      blocs.flatMap(
        (query, index) => query.data?.filter((bloc) => bloc.campus_id === campusIds[index]) ?? [],
      ),
    ),
    loading:
      !!token && !!userId && (memberships.isPending || blocs.some((query) => query.isPending)),
    refresh: userId ? memberships.refetch : undefined,
  };
}

export function useProfileAvatar() {
  const { data: profile } = useProfile();
  return useUserAvatar(profile);
}

export function useUserAvatar(user?: Pick<Profile, "id" | "image">) {
  return useUserAvatarState(user).uri;
}

export function useUserAvatarState(
  user?: Pick<Profile, "id" | "image">,
  size: "small" | "full" = "small",
) {
  const { token } = useSession();
  const source =
    size === "full" ? user?.image?.link : user?.image?.versions?.small || user?.image?.link;
  const enabled = !!(broker && token && user && source && !demo);
  const avatar = useQuery({
    queryKey: ["42", size === "full" ? "avatar-original-v2" : "avatar-v3", user?.id, source, size],
    enabled,
    staleTime: 30 * 60_000,
    retry: (failures, error) =>
      failures < 2 && !(error instanceof ApiError && [400, 401, 403, 404].includes(error.status)),
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
    queryFn: async ({ signal }) => {
      if (!broker || !token || !user) throw new Error("Sign in to view photos.");
      const download = async () => {
        const {
          uri,
          userId,
          size: receivedSize,
        } = await requestIntraJson<{ uri: unknown; userId: unknown; size: unknown }>(
          `${broker}/avatar?userId=${user.id}&size=${size}`,
          token.accessToken,
          signal,
        );
        if (userId !== user.id || receivedSize !== size || !isAvatarUri(uri)) {
          throw new Error("Invalid profile photo.");
        }
        return uri;
      };
      const thumbnail = size === "small" && user.image?.versions?.small;
      return thumbnail ? loadSmallAvatar(`${user.id}:${thumbnail}`, signal, download) : download();
    },
  });
  return {
    uri: demo ? source : enabled ? avatar.data : undefined,
    loading: enabled && !avatar.data && (avatar.isPending || avatar.isFetching),
    error: avatar.error,
    refetch: avatar.refetch,
  };
}
