import { describe, expect, it } from "vitest";

import { isShareActive, redactForPublic, shareExpiresAt } from "./report-share";

const NOW = new Date("2026-09-29T12:00:00Z");

describe("shareExpiresAt", () => {
  it("expires after 7 or 30 days, or never", () => {
    expect(shareExpiresAt("7d", NOW)).toEqual(new Date("2026-10-06T12:00:00Z"));
    expect(shareExpiresAt("30d", NOW)).toEqual(new Date("2026-10-29T12:00:00Z"));
    expect(shareExpiresAt("never", NOW)).toBeNull();
  });
});

describe("isShareActive", () => {
  const later = new Date("2026-10-01T00:00:00Z");
  const earlier = new Date("2026-09-01T00:00:00Z");

  it("is active until it expires", () => {
    expect(isShareActive({ expiresAt: later, revokedAt: null }, NOW)).toBe(true);
    expect(isShareActive({ expiresAt: earlier, revokedAt: null }, NOW)).toBe(false);
    expect(isShareActive({ expiresAt: NOW, revokedAt: null }, NOW)).toBe(false);
  });

  it("never expires without an expiry date, but can be revoked", () => {
    expect(isShareActive({ expiresAt: null, revokedAt: null }, NOW)).toBe(true);
    expect(isShareActive({ expiresAt: null, revokedAt: earlier }, NOW)).toBe(false);
  });
});

describe("redactForPublic", () => {
  it.each([
    ["Hardcoded key sk_live_abc123 in config", "Hardcoded key [REDACTED] in config"],
    ["AWS key AKIAABCDEFGHIJKLMNOP committed", "AWS key [REDACTED] committed"],
    ["OpenAI key sk-proj-abcdefghijklmnopqrstuv found", "OpenAI key [REDACTED] found"],
    ["Google key AIzaSyA1234567890abcdefghijklmnopqrstuv", "Google key [REDACTED]"],
    ["token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk1234", "token [REDACTED]"],
    ['password = "hunter2hunter2" in db.ts', 'password = "[REDACTED]" in db.ts'],
    ["apiKey: 'abcd1234efgh' is exposed", "apiKey: '[REDACTED]' is exposed"],
    [
      "key -----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY----- here",
      "key [REDACTED] here",
    ],
  ])("hides a secret: %j", (input, expected) => {
    expect(redactForPublic(input)).toBe(expected);
  });

  it("keeps ordinary review text as is", () => {
    const text = "The `getUser` handler in src/api/user.ts lacks input validation (token check).";
    expect(redactForPublic(text)).toBe(text);
  });
});
