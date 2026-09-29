import type { IssueCategory } from "@/lib/analysis/report-types";

export type ScoreTone = "good" | "ok" | "poor" | "neutral";

export function scoreTone(score: number | null | undefined): ScoreTone {
  if (score == null || Number.isNaN(score)) return "neutral";
  if (score >= 75) return "good";
  if (score >= 50) return "ok";
  return "poor";
}

// Colors live in one place: the `.ca-tone-*` classes in globals.css set
// `--ca-tone` per tone (and per theme); number, bar and chip only read it.
export function scoreTextClass(tone: ScoreTone): string {
  return `ca-tone-${tone} text-(--ca-tone)`;
}

export function scoreBarClass(tone: ScoreTone): string {
  return `ca-tone-${tone} bg-(--ca-tone)`;
}

export function scoreChipClass(tone: ScoreTone): string {
  return `ca-tone-${tone} border-(--ca-tone)/25 bg-(--ca-tone)/10 text-(--ca-tone)`;
}

export function scoreLabel(tone: ScoreTone): string {
  switch (tone) {
    case "good":
      return "Healthy";
    case "ok":
      return "Needs attention";
    case "poor":
      return "At risk";
    default:
      return "Unknown";
  }
}

// The UI is monochrome: categories share one accent; the label tells them apart.
const CATEGORY_STYLE = {
  bar: "bg-(--ca-ink)",
  soft: "border-(--ca-line) bg-(--ca-card)",
};

export const CATEGORY_ACCENT: Record<
  IssueCategory,
  { bar: string; soft: string }
> = {
  architecture: CATEGORY_STYLE,
  security: CATEGORY_STYLE,
  performance: CATEGORY_STYLE,
  codeQuality: CATEGORY_STYLE,
  testing: CATEGORY_STYLE,
};
