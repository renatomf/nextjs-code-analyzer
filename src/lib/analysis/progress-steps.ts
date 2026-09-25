export const ANALYSIS_STEPS = [
  { id: "reading", label: "Reading files", percent: 15 },
  { id: "framework", label: "Detecting framework", percent: 25 },
  { id: "knowledge", label: "Creating code knowledge", percent: 55 },
  { id: "analysis", label: "Running analysis", percent: 80 },
  { id: "report", label: "Generating report", percent: 95 },
  { id: "done", label: "Complete", percent: 100 },
] as const;

export type AnalysisStepId = (typeof ANALYSIS_STEPS)[number]["id"];
