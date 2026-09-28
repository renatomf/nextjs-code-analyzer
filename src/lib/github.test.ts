import { createHmac } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createGitHubOAuthState,
  fullNameSchema,
  refSchema,
  verifyGitHubOAuthState,
} from "@/lib/github";

const SECRET = "test-auth-secret";
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const TTL_MS = 10 * 60 * 1000;

function encodePayload(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function sign(payload: string, prefix = "github-oauth-state:v1."): string {
  return createHmac("sha256", SECRET)
    .update(`${prefix}${payload}`)
    .digest("base64url");
}

describe("GitHub OAuth state", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_SECRET", SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("accepts a fresh state for the same user and nonce", () => {
    const { state, nonce } = createGitHubOAuthState(USER_A);
    expect(
      verifyGitHubOAuthState(state, { sessionUserId: USER_A, nonce }),
    ).toBe(true);
  });

  it("rejects a state issued to another user", () => {
    const { state, nonce } = createGitHubOAuthState(USER_A);
    expect(
      verifyGitHubOAuthState(state, { sessionUserId: USER_B, nonce }),
    ).toBe(false);
  });

  it("rejects a missing or different nonce cookie", () => {
    const { state } = createGitHubOAuthState(USER_A);
    const other = createGitHubOAuthState(USER_A).nonce;
    expect(
      verifyGitHubOAuthState(state, { sessionUserId: USER_A, nonce: undefined }),
    ).toBe(false);
    expect(
      verifyGitHubOAuthState(state, { sessionUserId: USER_A, nonce: other }),
    ).toBe(false);
  });

  it("expires after 10 minutes", () => {
    vi.useFakeTimers();
    const { state, nonce } = createGitHubOAuthState(USER_A);

    vi.advanceTimersByTime(TTL_MS);
    expect(
      verifyGitHubOAuthState(state, { sessionUserId: USER_A, nonce }),
    ).toBe(true);

    vi.advanceTimersByTime(1);
    expect(
      verifyGitHubOAuthState(state, { sessionUserId: USER_A, nonce }),
    ).toBe(false);
  });

  it("rejects a state issued in the future", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 60_000);
    const { state, nonce } = createGitHubOAuthState(USER_A);

    vi.setSystemTime(Date.now() - 60_000);
    expect(
      verifyGitHubOAuthState(state, { sessionUserId: USER_A, nonce }),
    ).toBe(false);
  });

  it("rejects a payload swapped under the original signature", () => {
    const { state, nonce } = createGitHubOAuthState(USER_A);
    const [, signature] = state.split(".");
    const forged = encodePayload({ userId: USER_B, nonce, ts: Date.now() });
    expect(
      verifyGitHubOAuthState(`${forged}.${signature}`, {
        sessionUserId: USER_B,
        nonce,
      }),
    ).toBe(false);
  });

  it("rejects a tampered signature or extra segments", () => {
    const { state, nonce } = createGitHubOAuthState(USER_A);
    const [payload, signature] = state.split(".");
    const tampered = `${payload}.${signature.slice(0, -1)}${signature.endsWith("A") ? "B" : "A"}`;
    const expected = { sessionUserId: USER_A, nonce };

    expect(verifyGitHubOAuthState(tampered, expected)).toBe(false);
    expect(verifyGitHubOAuthState(`${state}.extra`, expected)).toBe(false);
    expect(verifyGitHubOAuthState(payload, expected)).toBe(false);
    expect(verifyGitHubOAuthState("", expected)).toBe(false);
  });

  it("rejects a state signed with another secret", () => {
    const { state, nonce } = createGitHubOAuthState(USER_A);
    vi.stubEnv("AUTH_SECRET", "another-secret");
    expect(
      verifyGitHubOAuthState(state, { sessionUserId: USER_A, nonce }),
    ).toBe(false);
  });

  it("rejects an HMAC of AUTH_SECRET made for another purpose", () => {
    const nonce = "n".repeat(22);
    const payload = encodePayload({ userId: USER_A, nonce, ts: Date.now() });
    expect(
      verifyGitHubOAuthState(`${payload}.${sign(payload, "")}`, {
        sessionUserId: USER_A,
        nonce,
      }),
    ).toBe(false);
  });

  it("rejects correctly signed payloads that fail validation", () => {
    const nonce = "n".repeat(22);
    const invalid = [
      "not json",
      JSON.stringify({ userId: "not-a-uuid", nonce, ts: Date.now() }),
      JSON.stringify({ userId: USER_A, nonce: "short", ts: Date.now() }),
      JSON.stringify({ userId: USER_A, nonce }),
    ];
    for (const raw of invalid) {
      const payload = Buffer.from(raw, "utf8").toString("base64url");
      expect(
        verifyGitHubOAuthState(`${payload}.${sign(payload)}`, {
          sessionUserId: USER_A,
          nonce,
        }),
      ).toBe(false);
    }
  });
});

describe("fullNameSchema", () => {
  it("accepts owner/repo names", () => {
    for (const value of ["vercel/next.js", "a/b", "my-org/repo_name-1"]) {
      expect(fullNameSchema.safeParse(value).success).toBe(true);
    }
  });

  it("rejects traversal and anything that could change the API URL", () => {
    for (const value of [
      "owner/..",
      "owner/.",
      "../repo",
      "owner/repo/extra",
      "owner/repo?x=1",
      "owner/repo#x",
      "-owner/repo",
      "owner",
      "owner/",
      "",
    ]) {
      expect(fullNameSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe("refSchema", () => {
  it("accepts branch and tag names", () => {
    for (const value of ["main", "feature/x-1", "v1.2.3"]) {
      expect(refSchema.safeParse(value).success).toBe(true);
    }
  });

  it("rejects traversal, git-invalid characters and oversized refs", () => {
    for (const value of [
      "",
      "..",
      "feature/../main",
      "has space",
      "a~1",
      "a^",
      "a:b",
      "a?",
      "a*",
      "a[",
      "a\\b",
      "x".repeat(256),
    ]) {
      expect(refSchema.safeParse(value).success).toBe(false);
    }
  });
});
