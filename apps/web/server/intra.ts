import type { IncomingMessage, ServerResponse } from "node:http";

const internal = "https://intrapy.intra.42.fr/api/v1";
const routes = {
  summary: () => `${internal}/users/me/summary`,
  agenda: () => `${internal}/users/me/events`,
  evaluations: () => `${internal}/users/me/scale_teams`,
  feedback: () => `${internal}/users/me/events/unfeedbacked`,
  notifications: () => `${internal}/users/me/notifications/unread`,
  profile: () => `${internal}/users/me`,
  campus: (id: string) => `${internal}/users/${id}/campus`,
  cursus: (id: string) => `${internal}/users/${id}/cursus`,
  achievements: (id: string) => `${internal}/users/${id}/achievements`,
  alumni: (id: string) => `https://alumni-management.42.fr/api/v1/alumni_auto/${id}`,
  logtime: (id: string) => `https://translate.intra.42.fr/users/${id}/locations_stats/`,
  coalition: (id: string, cursus: string) =>
    `https://profile.intra.42.fr/users/${id}/coalitions?cursus=${cursus}`,
  projects: (id: string, cursus: string) =>
    `${internal}/users/${id}/projects/ongoing?cursus_id=${cursus}`,
};

export function isLocalPost(req: IncomingMessage) {
  return (
    req.method === "POST" &&
    req.headers.origin === `http://${req.headers.host}` &&
    ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress ?? "")
  );
}

export function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Cache-Control": "no-store", "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

export async function readIntra(req: IncomingMessage, res: ServerResponse) {
  if (!isLocalPost(req)) {
    json(res, 403, { error: "Local browser requests only." });
    return;
  }
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    json(res, 401, { error: "Missing token." });
    return;
  }

  const request = new URL(req.url ?? "/", "http://localhost");
  const resource = request.pathname.slice(1);
  const id = request.searchParams.get("id") ?? "";
  const cursus = request.searchParams.get("cursus") ?? "";
  if (!Object.hasOwn(routes, resource)) {
    json(res, 404, { error: "Unknown resource." });
    return;
  }
  const route = routes[resource as keyof typeof routes];
  if (
    (route.length >= 1 && !/^\d+$/.test(id)) ||
    (resource === "projects" && !/^\d+$/.test(cursus)) ||
    (resource === "coalition" && !/^[a-z0-9][a-z0-9_-]*$/i.test(cursus))
  ) {
    json(res, 400, { error: "Invalid user or cursus." });
    return;
  }

  try {
    const response = await fetch(route(id, cursus), {
      headers: { Authorization: authorization, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
    if (!response.ok) {
      json(res, response.status, { error: `42 returned HTTP ${response.status}.` });
      return;
    }
    json(res, response.status, await response.json());
  } catch {
    json(res, 502, { error: "Could not read this resource from 42." });
  }
}
