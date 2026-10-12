import "server-only";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import initSqlJs, { type Database, type SqlJsStatic, type SqlValue } from "sql.js";

type Config = { db_dir?: string; [key: string]: unknown };
const defaultDataDir =
  process.env.APPDATA && process.platform === "win32"
    ? path.join(process.env.APPDATA, "keybox")
    : process.platform === "darwin"
      ? path.join(os.homedir(), "Library", "Application Support", "keybox")
      : path.join(
          process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"),
          "keybox",
        );
export const CONFIG_FILE =
  process.env.KEYBOX_CONFIG_PATH || path.join(__dirname, "config.json");

function loadConfig(): Config {
  try {
    const value: unknown = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Config)
      : {};
  } catch {
    return {};
  }
}

function saveConfig(config: Config): void {
  const dir = path.dirname(CONFIG_FILE);
  fs.mkdirSync(dir, { recursive: true });
  const temp = path.join(dir, `keybox-config-${process.pid}-${Date.now()}.tmp`);
  try {
    const fd = fs.openSync(temp, "w");
    try {
      fs.writeFileSync(fd, JSON.stringify(config));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temp, CONFIG_FILE);
  } finally {
    if (fs.existsSync(temp)) fs.rmSync(temp);
  }
}

let config = loadConfig();
export let DB_DIR = path.resolve(
  config.db_dir || process.env.KEYBOX_DATA_DIR || defaultDataDir,
);
export let DB_PATH = path.join(DB_DIR, "keybox.db");
if (!config.db_dir) {
  config.db_dir = DB_DIR;
  saveConfig(config);
}

let SQL: SqlJsStatic | undefined;
let database: Database;
let initialized: Promise<void> | undefined;

async function openDatabase(): Promise<void> {
  if (database) return;
  SQL ??= await initSqlJs({
    locateFile: (file) => require.resolve(`sql.js/dist/${file}`),
  });
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  database = new SQL.Database(
    fs.existsSync(DB_PATH) ? new Uint8Array(fs.readFileSync(DB_PATH)) : undefined,
  );
}

export async function ensureDatabase(): Promise<void> {
  initialized ??= openDatabase().then(() => {
    database.run(
      "CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value BLOB NOT NULL)",
    );
    database.run(
      "CREATE TABLE IF NOT EXISTS passwords (id INTEGER PRIMARY KEY AUTOINCREMENT, encrypted_data BLOB NOT NULL, nonce BLOB NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, order_index INTEGER NOT NULL DEFAULT 0)",
    );
    const columns = database.exec("PRAGMA table_info(passwords)")[0]?.values ?? [];
    if (!columns.some((row) => row[1] === "order_index")) {
      database.run(
        "ALTER TABLE passwords ADD COLUMN order_index INTEGER NOT NULL DEFAULT 0",
      );
      database.run("UPDATE passwords SET order_index = id");
      persist();
    }
    persist();
  });
  await initialized;
}

function persist(): void {
  const temp = `${DB_PATH}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(temp, Buffer.from(database.export()));
  fs.renameSync(temp, DB_PATH);
}

export async function getMetadata(key: string): Promise<Uint8Array | null> {
  await ensureDatabase();
  const stmt = database.prepare("SELECT value FROM metadata WHERE key = ?");
  try {
    stmt.bind([key]);
    return stmt.step() ? (stmt.get()[0] as Uint8Array) : null;
  } finally {
    stmt.free();
  }
}

export async function saveMetadata(key: string, value: Uint8Array): Promise<void> {
  await ensureDatabase();
  database.run("INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)", [
    key,
    value,
  ]);
  persist();
}

type PasswordRow = {
  id: number;
  encrypted_data: Uint8Array;
  nonce: Uint8Array;
  created_at: string;
  updated_at: string;
};
function rows(sql: string, values: SqlValue[] = []): unknown[][] {
  const result = database.prepare(sql);
  try {
    result.bind(values);
    const output: unknown[][] = [];
    while (result.step()) output.push(result.get());
    return output;
  } finally {
    result.free();
  }
}

export async function listPasswordRows(): Promise<PasswordRow[]> {
  await ensureDatabase();
  return rows(
    "SELECT id, encrypted_data, nonce, created_at, updated_at FROM passwords ORDER BY order_index, id",
  ).map(([id, encrypted_data, nonce, created_at, updated_at]) => ({
    id: Number(id),
    encrypted_data: encrypted_data as Uint8Array,
    nonce: nonce as Uint8Array,
    created_at: String(created_at),
    updated_at: String(updated_at),
  }));
}

export async function getPasswordRow(id: number): Promise<PasswordRow | null> {
  await ensureDatabase();
  const row = rows(
    "SELECT id, encrypted_data, nonce, created_at, updated_at FROM passwords WHERE id = ?",
    [id],
  )[0];
  return row
    ? {
        id: Number(row[0]),
        encrypted_data: row[1] as Uint8Array,
        nonce: row[2] as Uint8Array,
        created_at: String(row[3]),
        updated_at: String(row[4]),
      }
    : null;
}

export async function addPasswordRow(
  encrypted: Uint8Array,
  nonce: Uint8Array,
): Promise<number> {
  await ensureDatabase();
  const now = new Date().toISOString().replace(/Z$/, "");
  database.run(
    "INSERT INTO passwords (encrypted_data, nonce, created_at, updated_at, order_index) VALUES (?, ?, ?, ?, COALESCE((SELECT MAX(order_index) + 1 FROM passwords), 0))",
    [encrypted, nonce, now, now],
  );
  const id = Number(database.exec("SELECT last_insert_rowid()")[0].values[0][0]);
  persist();
  return id;
}

export async function updatePasswordRow(
  id: number,
  encrypted: Uint8Array,
  nonce: Uint8Array,
): Promise<void> {
  await ensureDatabase();
  database.run(
    "UPDATE passwords SET encrypted_data = ?, nonce = ?, updated_at = ? WHERE id = ?",
    [encrypted, nonce, new Date().toISOString().replace(/Z$/, ""), id],
  );
  persist();
}

export async function deletePasswordRow(id: number): Promise<void> {
  await ensureDatabase();
  database.run("DELETE FROM passwords WHERE id = ?", [id]);
  persist();
}

export async function reorderPasswords(ids: number[]): Promise<void> {
  await ensureDatabase();
  const current = rows("SELECT id FROM passwords").map((row) => Number(row[0]));
  if (
    ids.length !== current.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !current.includes(id))
  )
    throw new Error("The vault entries changed. Refresh and try again.");
  database.run("BEGIN");
  try {
    ids.forEach((id, index) =>
      database.run("UPDATE passwords SET order_index = ? WHERE id = ?", [index, id]),
    );
    database.run("COMMIT");
    persist();
  } catch (error) {
    database.run("ROLLBACK");
    throw error;
  }
}

export async function getDbMetadata(key: string): Promise<Uint8Array | null> {
  return getMetadata(key);
}

export async function saveDbMetadata(key: string, value: Uint8Array): Promise<void> {
  return saveMetadata(key, value);
}

export async function statusDatabaseFound(): Promise<boolean> {
  return fs.existsSync(DB_PATH);
}

export async function changeDbLocation(newDir: string): Promise<void> {
  const resolved = path.resolve(newDir);
  fs.mkdirSync(resolved, { recursive: true });
  const nextPath = path.join(resolved, "keybox.db");
  if (DB_PATH !== nextPath && fs.existsSync(nextPath))
    throw new Error(`A keybox.db already exists in the selected folder: ${resolved}`);
  await ensureDatabase();
  const previousPath = DB_PATH;
  const nextConfig = { ...loadConfig(), db_dir: resolved };
  saveConfig(nextConfig);
  DB_DIR = resolved;
  DB_PATH = nextPath;
  config = nextConfig;
  persist();
  if (previousPath !== nextPath && fs.existsSync(previousPath)) fs.rmSync(previousPath);
}

export async function selectDatabaseFile(filePath: string): Promise<void> {
  const selected = path.resolve(filePath);
  if (path.basename(selected).toLowerCase() !== "keybox.db" || !fs.existsSync(selected))
    throw new Error("Select an existing Keybox database file named keybox.db.");
  await ensureDatabase();
  const candidate = new SQL!.Database(new Uint8Array(fs.readFileSync(selected)));
  try {
    const integrity = candidate.exec("PRAGMA quick_check")[0]?.values[0]?.[0];
    const tables =
      candidate
        .exec("SELECT name FROM sqlite_master WHERE type = 'table'")[0]
        ?.values.flat() ?? [];
    if (integrity !== "ok")
      throw new Error("The selected database failed its integrity check.");
    if (!tables.includes("metadata") || !tables.includes("passwords"))
      throw new Error("The selected database is not a Keybox vault.");
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("The selected database"))
      throw error;
    throw new Error("The selected file is not a readable Keybox database.");
  } finally {
    candidate.close();
  }
  config = { ...loadConfig(), db_dir: path.dirname(selected) };
  saveConfig(config);
  database.close();
  database = new SQL!.Database(new Uint8Array(fs.readFileSync(selected)));
  DB_PATH = selected;
  DB_DIR = path.dirname(selected);
  initialized = undefined;
  await ensureDatabase();
}
