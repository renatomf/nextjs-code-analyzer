import type { IssueCategory } from "@/lib/analysis/report-types";

export type ScoreTone = "good" | "ok" | "poor" | "neutral";

export function scoreTone(score: number | null | undefined): ScoreTone {
  if (score == null || Number.isNaN(score)) return "neutral";
  if (score >= 75) return "good";
  if (score >= 50) return "ok";
  return "poor";
}

export function scoreTextClass(tone: ScoreTone): string {
  switch (tone) {
    case "good":
      return "text-(--ca-green-deep)";
    case "ok":
      return "text-amber-600 dark:text-amber-400";
    case "poor":
      return "text-red-600 dark:text-red-400";
    default:
      return "text-(--ca-muted)";
  }
}

export function scoreBarClass(tone: ScoreTone): string {
  switch (tone) {
    case "good":
      return "bg-(--ca-green-deep)";
    case "ok":
      return "bg-amber-500";
    case "poor":
      return "bg-red-500";
    default:
      return "bg-(--ca-line)";
  }
}

export function scoreChipClass(tone: ScoreTone): string {
  switch (tone) {
    case "good":
      return "border-(--ca-green-deep)/25 bg-(--ca-green-deep)/10 text-(--ca-green-deep)";
    case "ok":
      return "border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-300";
    case "poor":
      return "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300";
    default:
      return "border-(--ca-line) bg-(--ca-card) text-(--ca-muted)";
  }
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

// Kudos is monochrome: categories share one accent; the label tells them apart.
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
