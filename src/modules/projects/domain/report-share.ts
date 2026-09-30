import { REDACTED, redactSecrets } from "@/shared/redact";

/**
 * Public, read-only link to a project's report. Rules: one link per project,
 * revocable at any time, and an expiry the owner picks (7 days by default;
 * "never" only by an explicit choice, for a demo report linked from a README).
 */

export const SHARE_EXPIRY_OPTIONS = ["7d", "30d", "never"] as const;
export type ShareExpiry = (typeof SHARE_EXPIRY_OPTIONS)[number];
export const DEFAULT_SHARE_EXPIRY: ShareExpiry = "7d";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Null = no expiry. */
export function shareExpiresAt(expiry: ShareExpiry, now: Date): Date | null {
  if (expiry === "never") return null;
  return new Date(now.getTime() + (expiry === "7d" ? 7 : 30) * DAY_MS);
}

export function isShareActive(
  share: { expiresAt: Date | null; revokedAt: Date | null },
  now: Date,
): boolean {
  if (share.revokedAt) return false;
  return share.expiresAt === null || share.expiresAt.getTime() > now.getTime();
}

// Beyond the logger's patterns: formats an LLM may quote from scanned code.
const PUBLIC_SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, REDACTED],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, REDACTED], // AWS access key id
  [/\bsk-[A-Za-z0-9_-]{20,}/g, REDACTED], // OpenAI / Anthropic style keys
  [/\bAIza[0-9A-Za-z_-]{35}\b/g, REDACTED], // Google API key
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/g, REDACTED], // Slack token
  [/\beyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}/g, REDACTED], // JWT
  // `password = "..."`, `apiKey: '...'`: keep the name, hide the value.
  [
    /\b([\w.-]*(?:pass(?:word)?|secret|token|api[-_]?key|private[-_]?key|credential)[\w.-]*)(["'`]?\s*[:=]\s*)(["'`])[^"'`\n]{4,}\3/gi,
    `$1$2$3${REDACTED}$3`,
  ],
];

/**
 * Text written by the analysis (summaries, issue descriptions) may quote a
 * secret found in the code. Everything shown on the public page goes through
 * this first.
 */
export function redactForPublic(text: string): string {
  let out = redactSecrets(text);
  for (const [pattern, replacement] of PUBLIC_SECRET_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}
