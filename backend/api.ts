import "server-only";
import { timingSafeEqual } from "node:crypto";
import {
  changeMasterPassword,
  isVaultInitialized,
  setupVault,
  unlockVault,
} from "./auth";
import * as db from "./db";
import { Vault } from "./vault";

const apiToken = process.env.KEYBOX_API_TOKEN;
const runtimeState = globalThis as typeof globalThis & {
  keyboxSessionKey?: Uint8Array | null;
  keyboxAutoLockTimer?: ReturnType<typeof setTimeout> | null;
};
runtimeState.keyboxSessionKey ??= null;
runtimeState.keyboxAutoLockTimer ??= null;

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function json(status: number, value: unknown): Response {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 1_048_576)
    throw new ApiError(413, "Request body is too large.");
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > 1_048_576)
    throw new ApiError(413, "Request body is too large.");
  if (!text) return {};
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new ApiError(400, "Request body must be valid JSON.");
  }
}

function requiredString(body: Record<string, unknown>, key: string): string {
  if (typeof body[key] !== "string")
    throw new ApiError(422, `Field '${key}' must be a string.`);
  return body[key] as string;
}

function entryInput(body: Record<string, unknown>) {
  return {
    website: requiredString(body, "website"),
    username: requiredString(body, "username"),
    password: requiredString(body, "password"),
    profile:
      body.profile === undefined ? "Default" : requiredString(body, "profile"),
    icon:
      body.icon === undefined || body.icon === null
        ? null
        : requiredString(body, "icon"),
  };
}
function seedPhraseInput(body: Record<string, unknown>) {
  return {
    name: requiredString(body, "name").trim(),
    phrase: requiredString(body, "phrase").trim(),
    profile:
      body.profile === undefined ? "Default" : requiredString(body, "profile"),
  };
}

function getVault(): Vault {
  if (!runtimeState.keyboxSessionKey)
    throw new ApiError(401, "Vault is locked");
  return new Vault(runtimeState.keyboxSessionKey);
}

function clearAutoLockTimer(): void {
  if (runtimeState.keyboxAutoLockTimer) {
    clearTimeout(runtimeState.keyboxAutoLockTimer);
    runtimeState.keyboxAutoLockTimer = null;
  }
}

function resetAutoLockTimer(): void {
  clearAutoLockTimer();
  if (!runtimeState.keyboxSessionKey) return;
  const settings = db.getAppSettings();
  if (settings.autoLock === "never") return;
  const ms = Number(settings.autoLock) * 60_000;
  runtimeState.keyboxAutoLockTimer = setTimeout(() => {
    runtimeState.keyboxSessionKey?.fill(0);
    runtimeState.keyboxSessionKey = null;
    runtimeState.keyboxAutoLockTimer = null;
  }, ms);
}

function setSessionKey(key: Uint8Array | null): void {
  clearAutoLockTimer();
  runtimeState.keyboxSessionKey?.fill(0);
  runtimeState.keyboxSessionKey = key;
  if (key) resetAutoLockTimer();
}

function isAuthorized(request: Request): boolean {
  const supplied = request.headers.get("x-keybox-token");
  if (!apiToken || !supplied) return false;
  const actualBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(apiToken);
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}

async function dispatch(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const path = url.pathname;
  const body =
    method === "GET" || method === "DELETE" ? {} : await readBody(request);

  if (method === "GET" && path === "/api/settings")
    return json(200, db.getAppSettings());
  if (method === "PUT" && path === "/api/settings") {
    const current = db.getAppSettings();
    const theme = body.theme ?? current.theme;
    const autoLock = body.autoLock ?? current.autoLock;
    if (!(theme === "dark" || theme === "light" || theme === "system"))
      throw new ApiError(422, "theme must be dark, light, or system.");
    if (
      !(
        autoLock === "5" ||
        autoLock === "15" ||
        autoLock === "60" ||
        autoLock === "never"
      )
    )
      throw new ApiError(422, "autoLock must be 5, 15, 60, or never.");
    db.saveAppSettings({ theme, autoLock });
    return json(200, { status: "updated" });
  }

  if (method === "GET" && path === "/api/status") {
    const database_found = await db.statusDatabaseFound();
    return json(200, {
      initialized: database_found ? await isVaultInitialized() : false,
      database_found,
    });
  }
  if (method === "POST" && path === "/api/init") {
    try {
      const password = requiredString(body, "password");
      if (password.length < 12)
        throw new ApiError(
          422,
          "Master password must be at least 12 characters.",
        );
      await setupVault(password);
      setSessionKey(await unlockVault(password));
      return json(200, { status: "success" });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        error instanceof Error &&
          error.message === "Vault is already initialized."
          ? 400
          : 500,
        error instanceof Error ? error.message : "Unable to initialize vault.",
      );
    }
  }
  if (method === "POST" && path === "/api/unlock") {
    try {
      setSessionKey(null);
      setSessionKey(await unlockVault(requiredString(body, "password")));
      return json(200, { status: "success" });
    } catch (error) {
      throw new ApiError(
        401,
        error instanceof Error ? error.message : "Unable to unlock vault.",
      );
    }
  }
  if (method === "POST" && path === "/api/lock") {
    setSessionKey(null);
    return json(200, { status: "locked" });
  }
  if (method === "POST" && path === "/api/change-password") {
    try {
      const newPassword = requiredString(body, "new_password");
      if (newPassword.length < 12)
        throw new ApiError(
          422,
          "New password must be at least 12 characters.",
        );
      await changeMasterPassword(
        requiredString(body, "old_password"),
        newPassword,
      );
      setSessionKey(await unlockVault(newPassword));
      return json(200, { status: "success" });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        401,
        error instanceof Error ? error.message : "Unable to change password.",
      );
    }
  }
  if (method === "GET" && path === "/api/entries")
    return json(200, await getVault().listEntries());
  if (method === "GET" && path === "/api/seed-phrases")
    return json(200, await getVault().listSeedPhrases());
  if (method === "POST" && path === "/api/seed-phrases") {
    const data = seedPhraseInput(body);
    if (!data.name || !data.phrase)
      throw new ApiError(422, "Wallet name and seed phrase are required.");
    return json(200, {
      id: await getVault().saveSeedPhrase(data),
      status: "created",
    });
  }
  if (method === "POST" && path === "/api/entries") {
    return json(200, {
      id: await getVault().addEntry(entryInput(body)),
      status: "created",
    });
  }
  if (method === "PUT" && path === "/api/entries/order") {
    getVault();
    if (
      !Array.isArray(body.entry_ids) ||
      !body.entry_ids.every(Number.isSafeInteger)
    ) {
      throw new ApiError(422, "entry_ids must be an array of integers.");
    }
    try {
      await db.reorderPasswords(body.entry_ids as number[]);
    } catch (error) {
      throw new ApiError(
        409,
        error instanceof Error ? error.message : "Unable to reorder entries.",
      );
    }
    return json(200, { status: "updated" });
  }
  if (method === "PUT" && path === "/api/seed-phrases/order") {
    getVault();
    if (
      !Array.isArray(body.phrase_ids) ||
      !body.phrase_ids.every(Number.isSafeInteger)
    ) {
      throw new ApiError(422, "phrase_ids must be an array of integers.");
    }
    try {
      await db.reorderSeedPhrases(body.phrase_ids as number[]);
    } catch (error) {
      throw new ApiError(
        409,
        error instanceof Error ? error.message : "Unable to reorder phrases.",
      );
    }
    return json(200, { status: "updated" });
  }
  if (path === "/api/vault-order" && method === "GET") {
    getVault();
    const saved = await db.getDbMetadata("vault_order");
    try {
      return json(200, saved ? JSON.parse(Buffer.from(saved).toString("utf8")) : []);
    } catch {
      return json(200, []);
    }
  }
  if (path === "/api/vault-order" && method === "PUT") {
    getVault();
    if (!Array.isArray(body.item_order) || !body.item_order.every((item) =>
      typeof item === "string" && /^(pass|phrase):\d+$/.test(item),
    )) throw new ApiError(422, "item_order must contain typed row IDs.");
    await db.saveDbMetadata("vault_order", Buffer.from(JSON.stringify(body.item_order)));
    return json(200, { status: "updated" });
  }
  if (method === "GET" && path === "/api/profile-order") {
    getVault();
    const saved = await db.getMetadata("profile_order");
    try {
      return json(
        200,
        saved ? JSON.parse(Buffer.from(saved).toString("utf8")) : [],
      );
    } catch {
      return json(200, []);
    }
  }
  if (method === "PUT" && path === "/api/profile-order") {
    getVault();
    if (
      !Array.isArray(body.profile_names) ||
      !body.profile_names.every((name) => typeof name === "string")
    ) {
      throw new ApiError(422, "profile_names must be an array of strings.");
    }
    if (new Set(body.profile_names).size !== body.profile_names.length)
      throw new ApiError(400, "Profile names must be unique.");
    await db.saveMetadata(
      "profile_order",
      Buffer.from(JSON.stringify(body.profile_names)),
    );
    return json(200, { status: "updated" });
  }

  const entryMatch = path.match(/^\/api\/entries\/(\d+)$/);
  if (entryMatch) {
    const id = Number(entryMatch[1]);
    if (!Number.isSafeInteger(id) || id < 1)
      throw new ApiError(404, "Entry not found.");
    if (method === "GET") {
      try {
        return json(200, await getVault().getEntry(id));
      } catch (error) {
        throw new ApiError(
          404,
          error instanceof Error ? error.message : "Entry not found.",
        );
      }
    }
    if (method === "PUT") {
      try {
        await getVault().updateEntry(id, entryInput(body));
      } catch (error) {
        throw new ApiError(
          404,
          error instanceof Error ? error.message : "Entry not found.",
        );
      }
      return json(200, { status: "updated" });
    }
    if (method === "DELETE") {
      await getVault().deleteEntry(id);
      return json(200, { status: "deleted" });
    }
  }
  const seedMatch = path.match(/^\/api\/seed-phrases\/(\d+)$/);
  if (seedMatch) {
    const id = Number(seedMatch[1]);
    if (!Number.isSafeInteger(id) || id < 1)
      throw new ApiError(404, "Seed phrase not found.");
    if (method === "GET") {
      const vault = getVault();
      try {
        return json(200, await vault.getSeedPhrase(id));
      } catch (error) {
        throw new ApiError(
          404,
          error instanceof Error ? error.message : "Seed phrase not found.",
        );
      }
    }
    if (method === "PUT") {
      const vault = getVault();
      const data = seedPhraseInput(body);
      if (!data.name || !data.phrase)
        throw new ApiError(422, "Wallet name and seed phrase are required.");
      try {
        await vault.saveSeedPhrase(data, id);
      } catch (error) {
        throw new ApiError(
          404,
          error instanceof Error ? error.message : "Seed phrase not found.",
        );
      }
      return json(200, { status: "updated" });
    }
    if (method === "DELETE") {
      await getVault().deleteSeedPhrase(id);
      return json(200, { status: "deleted" });
    }
  }
  if (method === "GET" && path === "/api/db-location")
    return json(200, { path: db.DB_PATH });
  if (method === "POST" && path === "/api/db-location") {
    try {
      await db.changeDbLocation(requiredString(body, "new_path"));
      return json(200, { status: "success", path: db.DB_PATH });
    } catch (error) {
      throw new ApiError(
        500,
        error instanceof Error
          ? error.message
          : "Unable to change database location.",
      );
    }
  }
  if (method === "POST" && path === "/api/db-location/locate") {
    if (typeof body.path !== "string" || !body.path)
      throw new ApiError(400, "No database was selected.");
    try {
      await db.selectDatabaseFile(body.path);
      return json(200, { status: "success", path: db.DB_PATH });
    } catch (error) {
      throw new ApiError(
        400,
        error instanceof Error ? error.message : "Unable to open database.",
      );
    }
  }
  throw new ApiError(404, "Not found.");
}

export async function handleApiRequest(request: Request): Promise<Response> {
  if (!apiToken)
    return json(503, { detail: "The Keybox session is not initialized." });
  if (!isAuthorized(request))
    return json(401, {
      detail: "This local service only accepts requests from Keybox.",
    });
  // Reset the server-side auto-lock timer on every authenticated request
  if (runtimeState.keyboxSessionKey) resetAutoLockTimer();
  try {
    return await dispatch(request);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    if (status >= 500) console.error("[Backend] Request failed:", error);
    return json(status, {
      detail: error instanceof Error ? error.message : "Internal server error.",
    });
  }
}
