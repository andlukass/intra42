export class SessionError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function requestSession(
  broker: string | undefined,
  path: string,
  token?: string,
  credentials?: URLSearchParams,
): Promise<unknown> {
  if (!broker) throw new Error("Configure the HTTPS sign-in service URL.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), path === "login" ? 50_000 : 15_000);
  try {
    const response = await fetch(`${broker}/session/${path}`, {
      method: "POST",
      headers: {
        ...(credentials ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: credentials?.toString(),
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new SessionError(
        typeof data?.error === "string"
          ? data.error
          : `42 sign-in returned HTTP ${response.status}.`,
        response.status,
      );
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}
