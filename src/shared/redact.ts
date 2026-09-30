export const REDACTED = "[REDACTED]";

// Credentials that may appear inside free text (error messages, stacks).
const SENSITIVE_TEXT: Array<[RegExp, string]> = [
  [/(postgres(?:ql)?:\/\/)[^\s@/]+@/gi, `$1${REDACTED}@`],
  [/\bBearer\s+[\w.~+/-]+=*/gi, `Bearer ${REDACTED}`],
  [/\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]+/g, REDACTED],
  [/\bwhsec_[A-Za-z0-9]+/g, REDACTED],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, REDACTED],
  [/\bgsk_[A-Za-z0-9]{20,}/g, REDACTED],
];

/** Replaces known credential formats (connection strings, API keys) in text. */
export function redactSecrets(text: string): string {
  let out = text;
  for (const [pattern, replacement] of SENSITIVE_TEXT) {
    out = out.replace(pattern, replacement);
  }
  return out;
}
