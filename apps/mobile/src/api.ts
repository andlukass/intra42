import { useQuery } from "@tanstack/react-query";
import { demo, useSession } from "./session";

export type Profile = {
  id: number;
  login: string;
  displayname: string;
  email: string;
  phone?: string;
  location?: string;
  wallet?: number;
  correction_point?: number;
  alumni?: boolean;
  image?: { link?: string; versions?: { small?: string } };
  campus?: { id: number; name: string }[];
  campus_users?: { campus_id: number; is_primary: boolean }[];
  cursus_users?: { level: number; grade?: string; cursus: { name: string } }[];
  achievements?: { id: number; name: string; description: string }[];
  projects_users?: { id: number; status: string; project: { name: string } }[];
};
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
export type Location = { id: number; begin_at: string; end_at: string | null };
export type Slot = { id: number; begin_at: string; end_at: string; scale_team_id?: number | null };

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
  campus: [{ id: 1, name: "Lisboa" }],
  cursus_users: [{ level: 11.78, grade: "Transcender", cursus: { name: "42cursus" } }],
  achievements: [
    { id: 1, name: "Campus Contributor", description: "Completed a campus activity." },
  ],
  projects_users: [{ id: 1, status: "in_progress", project: { name: "Web infrastructure" } }],
};
let demoSlots: Slot[] = [];

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
    if (path.includes("/events"))
      return [
        {
          id: 1,
          name: "Campus Meetup",
          kind: "Meet up",
          location: "Lounge",
          begin_at: new Date(now + 7200000).toISOString(),
          end_at: new Date(now + 10800000).toISOString(),
        },
      ] as T;
    if (path.includes("/slots")) return demoSlots as T;
    return [] as T;
  }
  const response = await fetch(`https://api.intra.42.fr/v2${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(
      typeof data?.error === "string" ? data.error : `42 returned HTTP ${response.status}.`,
    );
  }
  return response.json();
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
export const useProfile = () => useIntraQuery<Profile>("/me");
