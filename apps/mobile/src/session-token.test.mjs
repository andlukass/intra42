import assert from "node:assert/strict";
import test from "node:test";
import { validToken } from "./session-token.ts";

test("accepts only opaque broker sessions, including an expired session eligible for renewal", () => {
  const token = { accessToken: `portal_${"a".repeat(64)}`, expiresAt: 1 };
  assert.ok(validToken(token));
  assert.ok(validToken({ ...token, refreshToken: token.accessToken }));
  for (const invalid of [
    null,
    {},
    { ...token, accessToken: "old-oauth-token" },
    { ...token, expiresAt: Infinity },
    { ...token, expiresAt: "300" },
    { ...token, refreshToken: "upstream-refresh-token" },
  ])
    assert.equal(validToken(invalid), false);
});
