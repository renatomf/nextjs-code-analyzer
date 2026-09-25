@AGENTS.md

# Project context
- Following the tutorial https://github.com/AliSadeghi-dev/AI-Code-Analyzer, adapted: Prisma -> Drizzle ORM + Neon Postgres. Implement only the current tutorial step.
- Always apply security best practices for auth (NextAuth v5) and Postgres/Neon (verified TLS, parameterized queries, no secrets in plain text, least privilege).
- Always apply security best practices for API routes and server actions: check the session on the server in every handler, scope every query by the session's userId (no IDOR), validate all input with zod, return generic error messages (no stack traces or internals), rate-limit expensive endpoints, verify webhook signatures, and never trust client-sent ids/prices/plans.
- Never put business or security rules only in the frontend. Every rule (auth, permissions, plan limits, validation, pricing) must be enforced on the server; client-side checks are UX only and always duplicated on the backend.
- TODO when reaching the tutorial's `rate-limit.ts`: replace its in-memory Map with a shared store (Postgres table or Upstash) and also apply it to login/register in `src/lib/actions/auth.ts` (brute-force protection, keyed by IP + email).
- Translate every Prisma call from the tutorial to Drizzle (`@/lib/db`, schema in `@/db/schema`); never use `sql.raw` or string-built SQL with user input.
