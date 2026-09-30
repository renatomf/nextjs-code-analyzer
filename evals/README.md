# Evals

Measure the analysis before changing it (roadmap Phase 7): every change to
the heuristics, the score, the prompts or the retrieval shows its effect as a
number, before × after.

```bash
npm run eval   # writes evals/results/<date>-<commit>.json and prints a summary
```

No LLM, no network and no cost so far: this part measures the deterministic
analysis.

## What is measured

**Annotated cases** ([analysis/cases.ts](analysis/cases.ts)): small synthetic
projects whose every expected finding is listed, so anything else they
produce is a false positive.

| Case | Purpose |
|---|---|
| `well-tested-lib` | healthy project: nothing should be flagged |
| `planted-problems` | one real problem per heuristic: recall |
| `false-positive-traps` | known traps (long JSX component, an icon path containing "auth", UI copy with "token") and the Phase 3 fixes as regression guards: precision |

Per case and in total: **precision** (found findings that were expected),
**recall** (expected findings that were found), the false positives and the
missed ones. A finding matches an expectation by category, file and title;
each expectation matches once.

**This repository**, read like a GitHub import (the committed tree through the
real extractor): number of findings per rule and the deterministic category
scores. There is no full ground truth here; it tracks the dogfooding trend.

## Rules

- Files in the cases are built at runtime: fake credentials never appear as
  key-shaped literals (GitHub secret scanning).
- Result files are committed when they mark a milestone (the Phase 7
  baseline, each improvement's before × after).
