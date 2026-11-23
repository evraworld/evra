import path from "node:path";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema";

export type DB = PgliteDatabase<typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

// DATABASE_URL picks the driver: postgres://… for a real server (Supabase in production),
// memory:// for tests, unset for an embedded Postgres file under .data/ in local development.
async function open(): Promise<DB> {
  const url = process.env.DATABASE_URL ?? "";
  if (url.startsWith("postgres")) {
    const { default: postgres } = await import("postgres");
    const { drizzle: pgDrizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const db = pgDrizzle({ client: postgres(url, { max: 5 }), schema });
    await migrate(db, { migrationsFolder: MIGRATIONS });
    return db as unknown as DB;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  let client;
  if (url.startsWith("memory://")) client = new PGlite();
  else {
    const dir = path.join(process.cwd(), ".data");
    (await import("node:fs")).mkdirSync(dir, { recursive: true });
    client = new PGlite(path.join(dir, "pglite"));
  }
  const db = drizzle({ client, schema });
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

// Cached on globalThis so dev hot reloads reuse one embedded database instead of fighting over its lock.
const g = globalThis as unknown as { __evraDb?: Promise<DB> };

export function getDb(): Promise<DB> {
  g.__evraDb ??= open().catch((e) => {
    g.__evraDb = undefined;
    throw e;
  });
  return g.__evraDb;
}

export { schema };
