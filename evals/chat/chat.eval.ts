import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { generateText } from "ai";
import { expect, it } from "vitest";

import { getLanguageModel } from "@/lib/ai/llm";
import { buildChatSystemPrompt, CHAT_PROMPT_VERSION } from "@/modules/chat";
import { newDataBoundary } from "@/shared/prompt-data";

import { assertEvalKey, describeError, sleep } from "../llm/provider";
import { RETRIEVAL_CASES } from "../retrieval/questions";
import { buildIndex, filesOf } from "../retrieval/retrieve";
import { abstains, citations, refersTo } from "./grounding";

// Chat groundedness eval (opt-in: real model, uses the eval Groq quota):
//   RUN_LLM_EVAL=1 npm run eval
// The chat as production runs it (same retrieval, prompt and model), checked
// without a second model: deterministic checks on the answer.
// - citation validity: project files the answer cites must be among the
//   snippets it received (a real file it never saw is an ungrounded claim);
//   names that exist nowhere in the project are reported apart: a check
//   cannot tell an invented path from a suggestion ("look for schema.js");
// - cites the answer: when an expected file was retrieved, the answer cites it;
// - abstention: on a question the project cannot answer (a subject absent
//   from it, checked by search), the answer says the sources fall short.
// Writes evals/results/<date>-<commit>-chat.json.

const enabled = process.env.RUN_LLM_EVAL === "1";
// Keeps a run within the free tier's daily tokens (~4.5k per question).
const PER_REPO = Number(process.env.CHAT_EVAL_QUESTIONS_PER_REPO ?? 3);
const PAUSE_MS = Number(process.env.LLM_EVAL_PAUSE_MS ?? 40_000);
// Comma-separated repositories, to spend less of the daily quota.
const ONLY = process.env.LLM_EVAL_CASES?.split(",").map((name) => name.trim());

/** Subjects absent from each repository (no file mentions them). */
const UNANSWERABLE: Record<string, string> = {
  nodegoat: "How are the GraphQL resolvers implemented?",
  "juice-shop": "How are messages published to Kafka?",
  "this-repository": "How are SMS messages sent with Twilio?",
};

type Answer = {
  question: string;
  answerable: boolean;
  expectedFiles: string[];
  retrievedFiles: string[];
  expectedRetrieved: boolean;
  cited: Array<{ as: string; kind: "retrieved" | "unseen" | "unknown" }>;
  citationValidity: number;
  citesExpected: boolean | null;
  abstains: boolean;
  answer: string;
  latencyMs: number;
  usage: { inputTokens?: number; outputTokens?: number };
};

it.skipIf(!enabled)(
  "measures the chat's groundedness",
  async () => {
    assertEvalKey();
    const repos = [];
    let first = true;

    const selected = RETRIEVAL_CASES.filter((c) => !ONLY || ONLY.includes(c.repo));
    if (selected.length === 0) throw new Error(`No repository named ${ONLY?.join(", ")}`);
    for (const retrievalCase of selected) {
      const search = await buildIndex(await filesOf(retrievalCase.repo));
      const questions = [
        ...retrievalCase.questions.slice(0, PER_REPO).map((q) => ({ ...q, answerable: true })),
        { question: UNANSWERABLE[retrievalCase.repo], expectedFiles: [], answerable: false },
      ];
      const answers: Answer[] = [];
      const failures = [];

      for (const q of questions) {
        if (!first) await sleep(PAUSE_MS);
        first = false;
        const top = await search.search(q.question);
        const retrieved = top.map(({ chunk }) => chunk);
        const retrievedFiles = [...new Set(retrieved.map((c) => c.filePath))];
        const started = Date.now();
        let result;
        try {
          // As the chat route does (src/app/api/chat/route.ts), without streaming.
          result = await generateText({
            model: getLanguageModel(),
            instructions: buildChatSystemPrompt({
              projectName: retrievalCase.repo,
              framework: null,
              chunks: retrieved,
              boundary: newDataBoundary(),
            }),
            prompt: q.question,
            abortSignal: AbortSignal.timeout(120_000),
          });
        } catch (error) {
          failures.push({ question: q.question, ...describeError(error) });
          continue;
        }

        const cited = citations(result.text).map((as) => {
          if (refersTo(as, retrievedFiles)) return { as, kind: "retrieved" as const };
          if (refersTo(as, search.paths)) return { as, kind: "unseen" as const };
          return { as, kind: "unknown" as const };
        });
        const expectedRetrieved = q.expectedFiles.some((f) => retrievedFiles.includes(f));
        answers.push({
          question: q.question,
          answerable: q.answerable,
          expectedFiles: q.expectedFiles,
          retrievedFiles,
          expectedRetrieved,
          cited,
          citationValidity: (() => {
            const projectFiles = cited.filter((c) => c.kind !== "unknown");
            return projectFiles.length === 0
              ? 1
              : projectFiles.filter((c) => c.kind === "retrieved").length / projectFiles.length;
          })(),
          citesExpected: expectedRetrieved
            ? cited.some((c) => refersTo(c.as, q.expectedFiles))
            : null,
          abstains: abstains(result.text),
          answer: result.text,
          latencyMs: Date.now() - started,
          usage: { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens },
        });
      }

      const mean = (values: number[]) =>
        values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;
      const answerable = answers.filter((a) => a.answerable);
      const withExpected = answerable.filter((a) => a.citesExpected !== null);
      repos.push({
        repo: retrievalCase.repo,
        answered: answers.length,
        failed: failures.length,
        citationValidity: mean(answers.map((a) => a.citationValidity)),
        unseenCitations: answers.flatMap((a) => a.cited.filter((c) => c.kind === "unseen").map((c) => c.as)),
        unknownNames: answers.flatMap((a) => a.cited.filter((c) => c.kind === "unknown").map((c) => c.as)),
        citesExpected: mean(withExpected.map((a) => (a.citesExpected ? 1 : 0))),
        expectedRetrieved: `${withExpected.length}/${answerable.length}`,
        abstainsWhenUnanswerable: answers.filter((a) => !a.answerable).map((a) => a.abstains),
        meanInputTokens: mean(answers.map((a) => a.usage.inputTokens ?? 0)),
        answers,
        failures,
      });
    }

    const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"]).toString().trim();
    const date = new Date().toISOString();
    const result = {
      date,
      commit,
      model: process.env.GROQ_MODEL ?? "openai/gpt-oss-120b",
      promptVersions: { chat: CHAT_PROMPT_VERSION },
      chat: { repos },
    };
    const dir = join(process.cwd(), "evals", "results");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${date.slice(0, 10)}-${commit}-chat.json`);
    writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);

    const fmt = (v: number | null) => (v === null ? "n/a" : v.toFixed(2));
    console.log(
      [
        `chat eval @ ${commit} (${result.model}) → ${file}`,
        ...repos.map(
          (r) =>
            `  ${r.repo}: ${r.answered} answered, ${r.failed} failed; citation validity ${fmt(r.citationValidity)}` +
            ` (unseen: ${r.unseenCitations.join(", ") || "none"}; names not in the project: ${r.unknownNames.join(", ") || "none"});` +
            ` cites the answer ${fmt(r.citesExpected)} when retrieved (${r.expectedRetrieved});` +
            ` abstains when unanswerable: ${r.abstainsWhenUnanswerable.join(",") || "n/a"}`,
        ),
      ].join("\n"),
    );

    expect(repos).toHaveLength(selected.length);
  },
  60 * 60_000,
);
