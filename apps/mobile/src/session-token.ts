export type Token = { accessToken: string; refreshToken?: string; expiresAt: number };

export function validToken(value: unknown): value is Token {
  if (!value || typeof value !== "object") return false;
  const token = value as Partial<Token>;
  return (
    typeof token.accessToken === "string" &&
    /^portal_[a-f0-9]{64}$/.test(token.accessToken) &&
    typeof token.expiresAt === "number" &&
    Number.isFinite(token.expiresAt) &&
    token.expiresAt > 0 &&
    (token.refreshToken === undefined || token.refreshToken === token.accessToken)
  );
}
