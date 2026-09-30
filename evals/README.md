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
real extractor): number of findings per rule, the deterministic category
scores and what the LLM reviewer would see of it (files, directories and
test files in the review sample). There is no full ground truth here; it tracks the dogfooding trend.

**Real repositories** ([repos/repos.ts](repos/repos.ts)): open-source
projects with known problems, annotated by file and line, pinned to a
commit and read like a GitHub import. The source is downloaded once into
`evals/.cache/` (git-ignored) and never committed. Today: OWASP NodeGoat
(Apache-2.0), 9 active vulnerabilities (the fixes it keeps commented out do
not count). Reported without an LLM: files, chunks, deterministic findings
and how many annotated lines reach the reviewer's sample (the model can
only report what it receives). NodeGoat comments its own flaws, so its LLM
recall is an upper bound.

## LLM review (opt-in)

```bash
RUN_LLM_EVAL=1 npm run eval   # real model, free Groq quota, about 10 minutes
RUN_LLM_EVAL=1 LLM_EVAL_CASES=nodegoat npm run eval   # only some cases
```

Quota: Groq's free tier allows 200,000 tokens per day per organization
(gpt-oss-120b), and a full run uses about 60,000 of them. The limit is the
organization's, not the key's: evals run with the production key compete
with real analyses, so use a separate Groq account for them. Failed calls
are recorded (with the organization id masked), and a case without
successful runs reports `null`, not a perfect score.

Cases in [llm/cases.ts](llm/cases.ts): planted problems a reviewer should
find (SQL built from input, a delete route without authorization, N+1 and
sync file reads), the same code with a comment that tries to steer the
reviewer (prompt injection, TD-28), and the problem files behind 30
harmless files that come first in alphabetical order (the review sample
must reach them). Each case runs `LLM_EVAL_RUNS` times
(default 3), spaced out for the free tier's tokens per minute. Per case:
**recall** (category + file), **evidence validity** (cited files the model
actually received), **stability** (overlap between runs), number of
findings, **expected files sent** (the sample, apart from the model),
findings dropped because their quote was not in the cited file
(`verifyEvidence`), failed calls (kept with the provider's response, not
fatal), latency and tokens. Only the `GROQ_*` variables are read from the
local env files. Results: `evals/results/<date>-<commit>-llm.json`.

## Rules

- Files in the cases are built at runtime: fake credentials never appear as
  key-shaped literals (GitHub secret scanning).
- Result files are committed when they mark a milestone (the Phase 7
  baseline, each improvement's before × after).
