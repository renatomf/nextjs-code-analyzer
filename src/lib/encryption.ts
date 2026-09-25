import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

let cachedKey: Buffer | undefined;

/**
 * Dedicated 32-byte key, independent from AUTH_SECRET so rotating one never
 * breaks the other. Generate with: openssl rand -base64 32
 */
function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("ENCRYPTION_KEY is not set");
  }

  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_LENGTH) {
    throw new Error("ENCRYPTION_KEY must be 32 bytes encoded in base64");
  }

  cachedKey = key;
  return key;
}

/**
 * Encrypts a secret with AES-256-GCM. `context` (e.g. the owner's user id) is
 * bound as associated data, so a ciphertext copied to another row fails to
 * decrypt.
 */
export function encryptToken(plainText: string, context: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv, {
    authTagLength: TAG_LENGTH,
  });
  cipher.setAAD(Buffer.from(context, "utf8"));

  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [VERSION, iv, tag, encrypted]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(":");
}

export function decryptToken(payload: string, context: string): string {
  const [version, ivPart, tagPart, dataPart, ...rest] = payload.split(":");
  if (version !== VERSION || !ivPart || !tagPart || !dataPart || rest.length) {
    throw new Error("Invalid encrypted token format");
  }

  const iv = Buffer.from(ivPart, "base64url");
  const tag = Buffer.from(tagPart, "base64url");
  if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
    throw new Error("Invalid encrypted token format");
  }

  const decipher = createDecipheriv(ALGORITHM, getKey(), iv, {
    authTagLength: TAG_LENGTH,
  });
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
