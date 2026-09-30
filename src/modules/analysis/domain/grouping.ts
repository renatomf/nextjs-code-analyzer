import { SEVERITY_ORDER, sortFindings, type Finding, type Occurrence } from "./finding";
import { DETERMINISTIC_RULES } from "./rules";

const RULE_GROUPS = new Map(DETERMINISTIC_RULES.map((rule) => [rule.id, rule.group]));

/**
 * One finding per problem (ADR-010): repetitions of the same deterministic
 * rule, or LLM findings with the same title in the same category, become a
 * single finding listing every occurrence (most severe first). A problem
 * found once is returned as is.
 */
export function groupFindings(findings: Finding[]): Finding[] {
  const groups = new Map<string, Finding[]>();
  for (const finding of findings) {
    const key = finding.rule
      ? `rule:${finding.rule}`
      : `llm:${finding.category}:${finding.title.trim().toLowerCase()}`;
    const group = groups.get(key);
    if (group) group.push(finding);
    else groups.set(key, [finding]);
  }

  return [...groups.values()].map((group) => {
    if (group.length === 1) return group[0];

    const occurrences: Occurrence[] = [...group]
      .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
      .map(({ filePath, severity, title, description }) => ({ filePath, severity, title, description }));
    const [first] = group;
    const worst = occurrences[0];
    const rule = first.rule ? RULE_GROUPS.get(first.rule) : undefined;

    return {
      title: `${rule?.title ?? first.title} (${group.length})`,
      description: rule?.description ?? first.description,
      severity: worst.severity,
      category: first.category,
      filePath: worst.filePath,
      ...(first.rule ? { rule: first.rule } : {}),
      occurrences,
    };
  });
}

/** The findings a report shows and scores: grouped, most severe first. */
export function buildReportFindings(deterministic: Finding[], llm: Finding[]): Finding[] {
  return sortFindings(groupFindings([...deterministic, ...llm]));
}
