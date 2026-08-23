import { env } from "cloudflare:workers";

type QueryResult<T> = { results?: T[] };

interface D1StatementLike {
  bind(...values: unknown[]): D1StatementLike;
  run<T = unknown>(): Promise<QueryResult<T>>;
  all<T = unknown>(): Promise<QueryResult<T>>;
  first<T = unknown>(): Promise<T | null>;
}

interface D1Like {
  prepare(query: string): D1StatementLike;
  batch(statements: D1StatementLike[]): Promise<unknown>;
}

let schemaReady: Promise<void> | null = null;

export function getCareDb(): D1Like {
  const database = (env as unknown as { DB?: D1Like }).DB;
  if (!database) throw new Error("Care database is unavailable");
  return database;
}

export async function ensureCareSchema() {
  if (!schemaReady) {
    const db = getCareDb();
    schemaReady = db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS care_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL,
        record_date TEXT NOT NULL,
        completed TEXT NOT NULL DEFAULT '[]',
        soil TEXT NOT NULL DEFAULT 'unknown',
        leaves TEXT NOT NULL DEFAULT 'healthy',
        bloom TEXT NOT NULL DEFAULT 'unknown',
        note TEXT NOT NULL DEFAULT '',
        photo_key TEXT,
        fertilized INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
      db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS care_records_device_date_idx ON care_records(device_id, record_date)"),
    ]).then(() => undefined).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

export function isValidDeviceId(value: string | null): value is string {
  return Boolean(value && /^[a-zA-Z0-9-]{16,100}$/.test(value));
}
