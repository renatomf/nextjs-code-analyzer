import "server-only";

import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "@/db/schema";

const globalForDb = globalThis as unknown as {
  pgPool: Pool | undefined;
};

function createPool() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const pool = new Pool({
    connectionString,
    // Fallback when the URL has no sslmode; certificates are always verified.
    ssl: true,
    max: 10,
  });
  attachDatabasePool(pool);

  return pool;
}

const pool = globalForDb.pgPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalForDb.pgPool = pool;
}

// Only the pool is cached: the drizzle instance is cheap and is recreated on
// every HMR reload so it always picks up the latest schema.
export const db = drizzle({ client: pool, schema });

export type Db = typeof db;
