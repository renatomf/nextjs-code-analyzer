/**
 * Chat retrieval eval (roadmap Phase 7): questions a user would ask about a
 * project, and the files that hold the answer. Written before the first
 * measurement; a change to the retriever must not edit them to pass. A hit
 * is any retrieved chunk from one of the expected files.
 */

export type RetrievalQuestion = {
  question: string;
  /** Any of these files answers the question. */
  expectedFiles: string[];
};

export type RetrievalCase = {
  /** "nodegoat" / "juice-shop" (evals/repos) or "this-repository". */
  repo: string;
  questions: RetrievalQuestion[];
};

export const RETRIEVAL_CASES: RetrievalCase[] = [
  {
    repo: "nodegoat",
    questions: [
      {
        question: "How are user passwords checked at login?",
        expectedFiles: ["app/data/user-dao.js", "app/routes/session.js"],
      },
      {
        question: "Where are the pre-tax, after-tax and roth contributions parsed from the form?",
        expectedFiles: ["app/routes/contributions.js"],
      },
      {
        question: "How are allocations filtered by the stock threshold?",
        expectedFiles: ["app/data/allocations-dao.js"],
      },
      {
        question: "Where is the redirect for the learning resources link handled?",
        expectedFiles: ["app/routes/index.js"],
      },
      {
        question: "How does the research page fetch stock data from another server?",
        expectedFiles: ["app/routes/research.js"],
      },
      {
        question: "Where is the session cookie configured?",
        expectedFiles: ["server.js"],
      },
      {
        question: "How is the user's social security number saved in the profile?",
        expectedFiles: ["app/data/profile-dao.js"],
      },
    ],
  },
  {
    repo: "juice-shop",
    questions: [
      {
        question: "How does the product search query the database?",
        expectedFiles: ["routes/search.ts"],
      },
      {
        question: "How is a user authenticated at login?",
        expectedFiles: ["routes/login.ts"],
      },
      {
        question: "How are product reviews updated?",
        expectedFiles: ["routes/updateProductReviews.ts"],
      },
      {
        question: "How is a redirect URL checked against the allowlist?",
        expectedFiles: ["lib/insecurity.ts", "routes/redirect.ts"],
      },
      {
        question: "How are passwords hashed before they are stored?",
        expectedFiles: ["models/user.ts", "lib/insecurity.ts"],
      },
      {
        question: "How does the chatbot generate discount coupons?",
        expectedFiles: ["routes/chat.ts"],
      },
      {
        question: "Where is the rate limit for password resets configured?",
        expectedFiles: ["server.ts"],
      },
    ],
  },
  {
    repo: "this-repository",
    questions: [
      {
        question: "How is the plan quota enforced when a project is created?",
        expectedFiles: ["src/modules/billing/server.ts"],
      },
      {
        question: "How is the Stripe webhook signature verified?",
        expectedFiles: [
          "src/modules/billing/infrastructure/stripe/webhook.ts",
          "src/app/api/stripe/webhook/route.ts",
        ],
      },
      {
        question: "How are public report links created and revoked?",
        expectedFiles: ["src/modules/projects/infrastructure/drizzle-report-shares.ts"],
      },
      {
        question: "How is repository code kept from acting as instructions in the prompt?",
        expectedFiles: ["src/shared/prompt-data.ts"],
      },
      {
        question: "How are the LLM's findings checked against the code they quote?",
        expectedFiles: ["src/modules/analysis/domain/evidence.ts"],
      },
      {
        question: "How is the GitHub access token encrypted before it is stored?",
        expectedFiles: [
          "src/lib/encryption.ts",
          "src/modules/identity/infrastructure/drizzle-github-connection.ts",
        ],
      },
      {
        question: "Which code chunks does the LLM reviewer receive?",
        expectedFiles: ["src/modules/analysis/domain/sampling.ts"],
      },
    ],
  },
];
