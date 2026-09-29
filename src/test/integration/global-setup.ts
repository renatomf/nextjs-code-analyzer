import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

// Integration tests create and delete rows freely, so they must never reach a
// real database: only a local, disposable Postgres is accepted.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "postgres"]);

export function assertLocalDatabase(url: string | undefined): string {
  if (!url) {
    throw new Error("DATABASE_URL is required for integration tests.");
  }
  const { hostname } = new URL(url);
  if (!LOCAL_HOSTS.has(hostname)) {
    throw new Error(
      `Refusing to run integration tests against "${hostname}": use a local Postgres.`,
    );
  }
  return url;
}

/** Applies the real Drizzle migrations to a fresh database before the suite. */
export default async function setup() {
  const url = assertLocalDatabase(process.env.DATABASE_URL);
  const pool = new Pool({ connectionString: url, ssl: false, max: 1 });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder: "drizzle" });
  } finally {
    await pool.end();
  }
}
