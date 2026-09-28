import { randomBytes } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const USER_A = "user-a";
const USER_B = "user-b";

// The key is cached per module instance, so each test loads a fresh copy.
async function loadEncryption(key: string | null = randomBytes(32).toString("base64")) {
  vi.resetModules();
  if (key === null) {
    vi.stubEnv("ENCRYPTION_KEY", "");
  } else {
    vi.stubEnv("ENCRYPTION_KEY", key);
  }
  return import("@/lib/encryption");
}

function replacePart(payload: string, index: number, value: string): string {
  const parts = payload.split(":");
  parts[index] = value;
  return parts.join(":");
}

function flipFirstByte(base64url: string): string {
  const bytes = Buffer.from(base64url, "base64url");
  bytes[0] ^= 0xff;
  return bytes.toString("base64url");
}

describe("encryption", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("with a valid key", () => {
    let enc: typeof import("@/lib/encryption");

    beforeEach(async () => {
      enc = await loadEncryption();
    });

    it("round-trips a token for the same owner", () => {
      const payload = enc.encryptToken("gho_secret", USER_A);
      expect(enc.decryptToken(payload, USER_A)).toBe("gho_secret");
    });

    it("uses the versioned v1:iv:tag:data format without the plain text", () => {
      const payload = enc.encryptToken("gho_secret", USER_A);
      expect(payload.split(":")).toHaveLength(4);
      expect(payload.startsWith("v1:")).toBe(true);
      expect(payload).not.toContain("gho_secret");
    });

    it("uses a random IV (same input, different ciphertext)", () => {
      const a = enc.encryptToken("gho_secret", USER_A);
      const b = enc.encryptToken("gho_secret", USER_A);
      expect(a).not.toBe(b);
    });

    it("fails for another owner (ciphertext copied to another row)", () => {
      const payload = enc.encryptToken("gho_secret", USER_A);
      expect(() => enc.decryptToken(payload, USER_B)).toThrow();
    });

    it("fails when the ciphertext is tampered with", () => {
      const payload = enc.encryptToken("gho_secret", USER_A);
      const data = payload.split(":")[3];
      expect(() =>
        enc.decryptToken(replacePart(payload, 3, flipFirstByte(data)), USER_A),
      ).toThrow();
    });

    it("fails when the auth tag is tampered with", () => {
      const payload = enc.encryptToken("gho_secret", USER_A);
      const tag = payload.split(":")[2];
      expect(() =>
        enc.decryptToken(replacePart(payload, 2, flipFirstByte(tag)), USER_A),
      ).toThrow();
    });

    it("rejects malformed payloads", () => {
      const payload = enc.encryptToken("gho_secret", USER_A);
      const malformed = [
        "",
        "gho_plain_token",
        replacePart(payload, 0, "v2"),
        payload.split(":").slice(0, 3).join(":"),
        `${payload}:extra`,
        replacePart(payload, 1, Buffer.alloc(8).toString("base64url")),
        replacePart(payload, 2, Buffer.alloc(8).toString("base64url")),
      ];
      for (const value of malformed) {
        expect(() => enc.decryptToken(value, USER_A)).toThrow();
      }
    });
  });

  it("cannot decrypt with a different key", async () => {
    const first = await loadEncryption();
    const payload = first.encryptToken("gho_secret", USER_A);

    const second = await loadEncryption();
    expect(() => second.decryptToken(payload, USER_A)).toThrow();
  });

  it("throws when ENCRYPTION_KEY is missing", async () => {
    const enc = await loadEncryption(null);
    expect(() => enc.encryptToken("x", USER_A)).toThrow("ENCRYPTION_KEY is not set");
  });

  it("throws when ENCRYPTION_KEY is not 32 bytes", async () => {
    const enc = await loadEncryption(randomBytes(16).toString("base64"));
    expect(() => enc.encryptToken("x", USER_A)).toThrow(/32 bytes/);
  });
});
