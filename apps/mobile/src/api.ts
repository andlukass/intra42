import {
  type QueryFilters,
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { isAvatarUri, loadSmallAvatar } from "./avatarCache";
import {
  lisboaMaps,
  normalizeCluster,
  verifiedCampusMaps,
  type Workstation,
} from "./clusters/maps";
import type { Event, EventAction } from "./events";
import { type Coalition, type CoalitionBloc, coalitionsByCourse } from "./home/coalition";
import { loadCachedImage } from "./imageCache";
import { broker, demo, useSession } from "./session";

export type Campus = { id: number; name: string; country?: string; time_zone?: string };
export type SearchResults = {
  users: { login: string; cdn_uri?: string }[];
  projects: { id: number; name: string; slug: string }[];
};
export type Achievement = {
  id: number;
  name: string;
  description: string;
  image?: string | null;
  kind?: string;
  tier?: string;
  nbr_of_success?: number | null;
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
  alumnized_at?: string | null;
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
export type ProjectListItem = Omit<ProjectDetails, "id"> & {
  id: number | string;
  parent?: string;
  duration?: string;
  xp?: number;
  recommendation?: string;
  registration?: string;
  result?: string;
  resultSuccess?: boolean;
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
export type ProjectSort = "name" | "duration" | "recommendation" | "registration" | "recent" | "xp";
export type { Event } from "./events";
export type PendingEvaluation = {
  id: number;
  user: string | null;
  kind: string;
  project_name: string;
  begin_at: string;
};
export type Evaluation = {
  id: number;
  begin_at: string;
  filled_at?: string;
  scale?: { name?: string };
};
export type EvaluationPoint = {
  scale_team_id?: number | null;
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
export type CompletedEvaluation = Evaluation & {
  flag?: { name: string; positive: boolean } | null;
  corrector?: { id: number; login: string } | null;
  correcteds?: { id: number; login: string }[];
  team?: {
    name: string;
    project_id: number;
    users?: { id: number; login: string; leader?: boolean }[];
  } | null;
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
  titles: [
    { id: 1, name: "Mastermind %login" },
    { id: 2, name: "%login the Explorer" },
  ],
  titles_users: [
    { title_id: 1, selected: true },
    { title_id: 2, selected: false },
  ],
  campus: [{ id: 38, name: "Lisboa", time_zone: "Europe/Lisbon" }],
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
const serviceQueues = new Map<string, { pending: Promise<void>; nextAt: number }>();

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function waitForRequestTurn(signal?: AbortSignal, service?: string) {
  if (service) {
    let queue = serviceQueues.get(service);
    if (!queue) {
      queue = { pending: Promise.resolve(), nextAt: 0 };
      serviceQueues.set(service, queue);
    }
    const state = queue;
    const turn = state.pending.then(async () => {
      while (state.nextAt > Date.now() && !signal?.aborted) await wait(state.nextAt - Date.now());
      if (signal?.aborted) throw new Error("Request canceled.");
      state.nextAt = Date.now() + requestSpacingMs;
    });
    state.pending = turn.catch(() => {});
    return turn;
  }
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
    if (path === "/me/title" && body && "titleId" in body) {
      fixtures.titles_users = fixtures.titles_users?.map((title) => ({
        ...title,
        selected: title.title_id === body.titleId,
      }));
      return { titleId: body.titleId } as T;
    }
    if (body && "slot" in body) {
      const slot = body.slot as Omit<Slot, "id">;
      if (path === "/slots/cancel") {
        demoSlots = demoSlots.filter(
          (item) => item.begin_at !== slot.begin_at || item.end_at !== slot.end_at,
        );
        return { saved: true } as T;
      }
      demoSlots = [...demoSlots, { ...slot, id: Date.now() }];
      return demoSlots.at(-1) as T;
    }
    const now = Date.now();
    if (path === "/me") return fixtures as T;
    if (path.startsWith("/search?")) {
      const query = new URLSearchParams(path.split("?")[1]).get("query")?.toLowerCase() ?? "";
      return {
        users: [fixtures]
          .filter((user) => user.login.toLowerCase().includes(query))
          .map(({ login }) => ({ login })),
        projects: [demoProject].filter((project) => project.name.toLowerCase().includes(query)),
      } as T;
    }
    if (path.startsWith("/users/by-login/")) return fixtures as T;
    if (/^\/campus\/\d+\/achievements\?/.test(path)) {
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
    if (/^\/users\/\d+\/scale_teams\/as_corrector\?/.test(path)) {
      const date = new Date(now - 86_400_000).toISOString();
      const item: CompletedEvaluation = {
        id: 1,
        begin_at: date,
        filled_at: date,
        scale: { name: "Web infrastructure" },
        flag: { name: "Ok", positive: true },
        corrector: { id: 1, login: fixtures.login },
        correcteds: [{ id: 2, login: "campus-peer" }],
        team: { name: "campus-peer's group", project_id: 1 },
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
  if (!broker) throw new Error("Configure the HTTPS sign-in service URL.");
  return requestIntraJson<T>(`${broker}/api${path}`, token, signal, body);
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
  // These portal resources use independent upstream services, not the public API quota.
  const service = /\/api\/users\/[1-9]\d*\/(pace|attendance|alumnization)$/.exec(url)?.[1];
  for (let attempt = 0; ; attempt++) {
    await waitForRequestTurn(signal, service);
    const response = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal,
    }).catch((error: unknown) => {
      if (signal?.aborted) throw error;
      throw new ApiError("Could not connect to Intra42. Check your connection and try again.", 0);
    });
    if (response.ok) return response;
    if (response.status === 429) {
      const delay = rateLimitDelay(response.headers.get("Retry-After"));
      if (delay <= 15_000) {
        const queue = service && serviceQueues.get(service);
        if (queue) queue.nextAt = Math.max(queue.nextAt, Date.now() + delay);
        else nextRequestAt = Math.max(nextRequestAt, Date.now() + delay);
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

export function useIntraQuery<T>(path?: string, options?: { retry?: number | false }) {
  const { token } = useSession();
  return useQuery({
    queryKey: ["42", path],
    enabled: !!token && !!path,
    staleTime: 60000,
    retry: options?.retry ?? false,
    queryFn: ({ signal }) => {
      if (!token || !path) throw new Error("Sign in to 42 first.");
      return api<T>(token.accessToken, path, signal);
    },
  });
}

export function useProjectList(
  search: string,
  sort: ProjectSort,
  cursusId?: number,
  cursusName?: string,
  recommended = false,
) {
  const { token } = useSession();
  return useInfiniteQuery({
    queryKey: ["42", "official-project-list", search, sort, cursusId, cursusName, recommended],
    enabled: !!token,
    staleTime: 60_000,
    retry: false,
    initialPageParam: 1,
    queryFn: async ({
      pageParam,
      signal,
    }): Promise<{ items: ProjectListItem[]; hasMore: boolean }> => {
      if (!token) throw new Error("Sign in to 42 first.");
      if (demo && token.accessToken === "demo") {
        const matches =
          (!cursusId || cursusId === 21) &&
          demoProject.name.toLowerCase().includes(search.toLowerCase());
        return { items: matches ? [demoProject] : [], hasMore: false };
      }
      const params = new URLSearchParams({ page: String(pageParam), sort });
      if (recommended) params.set("recommended", "true");
      if (search) params.set("search", search);
      if (cursusName) params.set("cursus", cursusName);
      return api<{ items: ProjectListItem[]; hasMore: boolean }>(
        token.accessToken,
        `/me/project-list?${params}`,
        signal,
      );
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

const demoEvents: Event[] = demoEventNames.map((name, index) => {
  const begin = Date.now() + (index + 1) * 86_400_000;
  return {
    id: index + 1,
    name,
    begin_at: new Date(begin).toISOString(),
    end_at: new Date(begin + 3_600_000).toISOString(),
    kind: index === 0 ? "exam" : "event",
    description: "Meet your peers and take part in campus activities.",
    location: "Campus",
    max_subscribers: 40,
    nbr_subscribers: 7,
    is_subscribed: false,
  };
});

function eventsOptions(token: string) {
  return queryOptions({
    queryKey: ["42", "events"],
    staleTime: 60_000,
    retry: false,
    queryFn: ({ signal }) =>
      demo && token === "demo"
        ? Promise.resolve(demoEvents)
        : api<Event[]>(token, "/me/events", signal),
  });
}

export function useEventDetails() {
  const { token } = useSession();
  return useQuery({ ...eventsOptions(token?.accessToken ?? ""), enabled: !!token, staleTime: 0 });
}

export function useEventRegistration(eventId: number) {
  const { token } = useSession();
  const client = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (action: EventAction) => {
      if (!token) throw new Error("Sign in to 42 first.");
      if (demo && token.accessToken === "demo") {
        const event = demoEvents.find((item) => item.id === eventId);
        if (!event) throw new Error("Event not found.");
        event.is_subscribed = action === "subscribe";
        event.nbr_subscribers = (event.nbr_subscribers ?? 0) + (action === "subscribe" ? 1 : -1);
        return;
      }
      await api(token.accessToken, `/events/${eventId}/subscription`, undefined, { action });
    },
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: ["42", "events"] });
      await client.invalidateQueries({ queryKey: ["42", "agenda"] });
    },
  });
}

export function useAgenda(campusId?: number) {
  const { token } = useSession();
  const client = useQueryClient();
  return useInfiniteQuery({
    queryKey: ["42", "agenda", campusId],
    enabled: !!token && !!campusId,
    staleTime: 60_000,
    retry: false,
    initialPageParam: 1,
    queryFn: async ({ pageParam, signal }) => {
      if (!token || !campusId) throw new Error("A campus is required to view the agenda.");
      if (signal.aborted) throw new Error("Request canceled.");
      const all = await client.fetchQuery(eventsOptions(token.accessToken));
      const end = pageParam * agendaPageSize;
      return { items: all.slice(end - agendaPageSize, end), hasMore: end < all.length };
    },
    getNextPageParam: (lastPage, _pages, lastPageNumber) =>
      lastPage.hasMore ? lastPageNumber + 1 : undefined,
  });
}

const feedbackPageSize = 30;

export function useFeedbackLogs(userId?: number) {
  const { token } = useSession();
  return useInfiniteQuery({
    queryKey: ["42", "feedback-logs", userId],
    enabled: !!token && !!userId,
    staleTime: 60_000,
    retry: false,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => {
      if (!token || !userId) throw new Error("A user is required to view feedback logs.");
      const params = new URLSearchParams({
        "filter[filled]": "true",
        sort: "-begin_at,-id",
        "page[size]": String(feedbackPageSize),
        "page[number]": String(pageParam),
      });
      return api<CompletedEvaluation[]>(
        token.accessToken,
        `/users/${userId}/scale_teams/as_corrector?${params}`,
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

export function useAchievementCatalog(campusId?: number) {
  return useIntraList<Achievement>(
    campusId ? `/campus/${campusId}/achievements?filter[visible]=true&sort=id` : undefined,
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
      return loadCachedImage({
        directoryName: "achievement-icons-v1",
        source: path,
        signal,
        isValid: (uri): uri is string =>
          typeof uri === "string" && /^data:image\/(svg\+xml|png|jpeg|webp);base64,/.test(uri),
        download: async () => {
          // Image downloads must not wait behind rate-limited API reads.
          const response = await fetch(
            `${broker}/achievement-icon?${new URLSearchParams({ path })}`,
            {
              headers: { Authorization: `Bearer ${token.accessToken}` },
              signal,
            },
          );
          const data = await response.json();
          if (!response.ok)
            throw new ApiError(
              typeof data?.error === "string" ? data.error : "Could not load achievement icon.",
              response.status,
            );
          return data?.uri;
        },
      });
    },
  });
}

export function useSearchPhoto(source?: string) {
  const { token } = useSession();
  return useQuery({
    queryKey: ["42", "search-photo-v1", source],
    enabled: !!(token && broker && source && !demo),
    staleTime: 30 * 60_000,
    retry: (failures, error) =>
      failures < 2 && (!(error instanceof ApiError) || error.status >= 500),
    queryFn: async ({ signal }) => {
      if (!token || !broker || !source) throw new Error("Search photo unavailable.");
      return loadCachedImage({
        directoryName: "search-photos-v1",
        source,
        signal,
        isValid: isAvatarUri,
        download: async () => {
          const response = await fetch(
            `${broker}/search-photo?${new URLSearchParams({ source })}`,
            {
              headers: { Authorization: `Bearer ${token.accessToken}` },
              signal,
            },
          );
          const data = await response.json();
          if (!response.ok) throw new ApiError("Could not load search photo.", response.status);
          if (data.source !== source) throw new Error("Invalid search photo response.");
          return data.uri;
        },
      });
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
    queryKey: ["42", "clusters", campusId, "official-maps-v2"],
    select: (clusters: unknown[]) => clusters.map((cluster) => normalizeCluster(cluster, campusId)),
    enabled: !!token && !!campusId,
    staleTime: 30 * 60_000,
    retry: false,
    queryFn: async ({ signal }) => {
      if (!token || !campusId) throw new Error("Sign in to view your campus clusters.");
      const verified = verifiedCampusMaps(campusId);
      if (verified.length) return verified;
      return api<unknown[]>(token, `/campus/${campusId}/maps`, signal);
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

export const useProfile = (userId?: number | string) =>
  useIntraQuery<Profile>(
    userId === undefined
      ? "/me"
      : typeof userId === "string"
        ? `/users/by-login/${encodeURIComponent(userId)}`
        : `/users/${userId}`,
  );

export function useSelectTitle(userId?: number) {
  const { token } = useSession();
  const client = useQueryClient();
  const profiles = {
    queryKey: ["42"],
    predicate: (query) => query.queryKey[1] === "/me" || query.queryKey[1] === `/users/${userId}`,
  } satisfies QueryFilters;
  function select(titleId: number) {
    client.setQueriesData<Profile>(profiles, (previous) =>
      previous && previous.id === userId
        ? {
            ...previous,
            titles_users: previous.titles?.map((entry) => ({
              title_id: entry.id,
              selected: entry.id === titleId,
            })),
          }
        : previous,
    );
  }
  return useMutation({
    retry: false,
    onMutate: async (titleId: number) => {
      await client.cancelQueries(profiles);
      const previous = client.getQueriesData<Profile>(profiles);
      select(titleId);
      return previous;
    },
    mutationFn: async (titleId: number) => {
      if (!token || !userId) throw new Error("Sign in to change your title.");
      const owner = userId;
      const saved = await api<{ titleId: number }>(token.accessToken, "/me/title", undefined, {
        titleId,
      });
      if (saved.titleId !== titleId) throw new Error("42 returned a different title selection.");
      return { userId: owner, titleId };
    },
    onSuccess: async ({ titleId }) => {
      // A profile read started during the save must not restore the old selection.
      await client.cancelQueries(profiles);
      select(titleId);
    },
    onError: async (_error, _titleId, previous) => {
      await client.cancelQueries(profiles);
      for (const [key, profile] of previous ?? []) {
        client.setQueryData<Profile>(key, (current) =>
          current && current.id === userId
            ? { ...current, titles_users: profile?.titles_users }
            : current,
        );
      }
    },
  });
}

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
