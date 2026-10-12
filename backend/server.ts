import "server-only";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import {
  changeMasterPassword,
  isVaultInitialized,
  setupVault,
  unlockVault,
} from "./auth";
import * as db from "./db";
import { generatePassword } from "./password_generator";
import { Vault } from "./vault";

const host = "127.0.0.1";
const port = Number(process.env.KEYBOX_API_PORT || 8000);
const apiToken = process.env.KEYBOX_API_TOKEN;
let sessionKey: Uint8Array | null = null;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
function send(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(value));
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 1_048_576) throw new HttpError(413, "Request body is too large.");
    chunks.push(Buffer.from(chunk));
  }
  if (!length) return {};
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}

function requiredString(body: Record<string, unknown>, key: string): string {
  if (typeof body[key] !== "string")
    throw new HttpError(422, `Field '${key}' must be a string.`);
  return body[key] as string;
}
function optionalString(
  body: Record<string, unknown>,
  key: string,
  fallback: string,
): string {
  return body[key] === undefined ? fallback : requiredString(body, key);
}
function entryInput(body: Record<string, unknown>) {
  return {
    website: requiredString(body, "website"),
    username: requiredString(body, "username"),
    password: requiredString(body, "password"),
    profile: optionalString(body, "profile", "Default"),
    icon:
      body.icon === undefined || body.icon === null ? null : requiredString(body, "icon"),
  };
}
function vault(): Vault {
  if (!sessionKey) throw new HttpError(401, "Vault is locked");
  return new Vault(sessionKey);
}
function integerId(value: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(404, "Entry not found.");
  return id;
}
function authorized(request: IncomingMessage): boolean {
  const token = request.headers["x-keybox-token"];
  if (!apiToken || typeof token !== "string") return false;
  const a = Buffer.from(token);
  const b = Buffer.from(apiToken);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (!apiToken) {
    send(response, 503, { detail: "The Keybox session is not initialized." });
    return;
  }
  if (!authorized(request)) {
    send(response, 401, {
      detail: "This local service only accepts requests from Keybox.",
    });
    return;
  }
  const url = new URL(request.url || "/", `http://${host}:${port}`);
  const method = request.method || "GET";
  const body = method === "GET" || method === "DELETE" ? {} : await readBody(request);
  const path = url.pathname;

  if (method === "GET" && path === "/api/status") {
    const database_found = await db.statusDatabaseFound();
    send(response, 200, {
      initialized: database_found ? await isVaultInitialized() : false,
      database_found,
    });
    return;
  }
  if (method === "POST" && path === "/api/init") {
    try {
      const password = requiredString(body, "password");
      await setupVault(password);
      sessionKey?.fill(0);
      sessionKey = await unlockVault(password);
      send(response, 200, { status: "success" });
    } catch (error) {
      throw new HttpError(
        error instanceof Error && error.message === "Vault is already initialized."
          ? 400
          : 500,
        error instanceof Error ? error.message : "Unable to initialize vault.",
      );
    }
    return;
  }
  if (method === "POST" && path === "/api/unlock") {
    try {
      sessionKey?.fill(0);
      sessionKey = await unlockVault(requiredString(body, "password"));
      send(response, 200, { status: "success" });
    } catch (error) {
      throw new HttpError(
        401,
        error instanceof Error ? error.message : "Unable to unlock vault.",
      );
    }
    return;
  }
  if (method === "POST" && path === "/api/lock") {
    sessionKey?.fill(0);
    sessionKey = null;
    send(response, 200, { status: "locked" });
    return;
  }
  if (method === "POST" && path === "/api/change-password") {
    try {
      await changeMasterPassword(
        requiredString(body, "old_password"),
        requiredString(body, "new_password"),
      );
      sessionKey?.fill(0);
      sessionKey = await unlockVault(requiredString(body, "new_password"));
      send(response, 200, { status: "success" });
    } catch (error) {
      throw new HttpError(
        401,
        error instanceof Error ? error.message : "Unable to change password.",
      );
    }
    return;
  }
  if (method === "GET" && path === "/api/entries") {
    send(response, 200, await vault().listEntries());
    return;
  }
  if (method === "POST" && path === "/api/entries") {
    send(response, 200, {
      id: await vault().addEntry(entryInput(body)),
      status: "created",
    });
    return;
  }
  if (method === "PUT" && path === "/api/entries/order") {
    vault();
    if (!Array.isArray(body.entry_ids) || !body.entry_ids.every(Number.isSafeInteger))
      throw new HttpError(422, "entry_ids must be an array of integers.");
    try {
      await db.reorderPasswords(body.entry_ids as number[]);
    } catch (error) {
      throw new HttpError(
        409,
        error instanceof Error ? error.message : "Unable to reorder entries.",
      );
    }
    send(response, 200, { status: "updated" });
    return;
  }
  if (method === "GET" && path === "/api/profile-order") {
    vault();
    const saved = await db.getMetadata("profile_order");
    try {
      send(response, 200, saved ? JSON.parse(Buffer.from(saved).toString("utf8")) : []);
    } catch {
      send(response, 200, []);
    }
    return;
  }
  if (method === "PUT" && path === "/api/profile-order") {
    vault();
    if (
      !Array.isArray(body.profile_names) ||
      !body.profile_names.every((name) => typeof name === "string")
    )
      throw new HttpError(422, "profile_names must be an array of strings.");
    if (new Set(body.profile_names).size !== body.profile_names.length)
      throw new HttpError(400, "Profile names must be unique.");
    await db.saveMetadata(
      "profile_order",
      Buffer.from(JSON.stringify(body.profile_names)),
    );
    send(response, 200, { status: "updated" });
    return;
  }
  const entryMatch = path.match(/^\/api\/entries\/(\d+)$/);
  if (entryMatch) {
    const id = integerId(entryMatch[1]);
    if (method === "GET") {
      try {
        send(response, 200, await vault().getEntry(id));
      } catch (error) {
        throw new HttpError(
          404,
          error instanceof Error ? error.message : "Entry not found.",
        );
      }
      return;
    }
    if (method === "PUT") {
      try {
        await vault().updateEntry(id, entryInput(body));
      } catch (error) {
        throw new HttpError(
          404,
          error instanceof Error ? error.message : "Entry not found.",
        );
      }
      send(response, 200, { status: "updated" });
      return;
    }
    if (method === "DELETE") {
      await vault().deleteEntry(id);
      send(response, 200, { status: "deleted" });
      return;
    }
  }
  if (method === "POST" && path === "/api/generate-password") {
    const length = body.length === undefined ? 16 : body.length;
    if (!Number.isInteger(length)) throw new HttpError(422, "length must be an integer.");
    for (const key of ["use_uppercase", "use_digits", "use_special"])
      if (body[key] !== undefined && typeof body[key] !== "boolean")
        throw new HttpError(422, `${key} must be a boolean.`);
    try {
      send(response, 200, {
        password: generatePassword(
          length as number,
          (body.use_uppercase ?? true) as boolean,
          (body.use_digits ?? true) as boolean,
          (body.use_special ?? true) as boolean,
        ),
      });
    } catch (error) {
      throw new HttpError(
        400,
        error instanceof Error ? error.message : "Unable to generate password.",
      );
    }
    return;
  }
  if (method === "GET" && path === "/api/db-location") {
    send(response, 200, { path: db.DB_PATH });
    return;
  }
  if (method === "POST" && path === "/api/db-location") {
    try {
      await db.changeDbLocation(requiredString(body, "new_path"));
      send(response, 200, { status: "success", path: db.DB_PATH });
    } catch (error) {
      throw new HttpError(
        500,
        error instanceof Error ? error.message : "Unable to change database location.",
      );
    }
    return;
  }
  if (method === "POST" && path === "/api/db-location/locate") {
    const selected = body.path;
    if (typeof selected !== "string" || !selected)
      throw new HttpError(400, "No database was selected.");
    try {
      await db.selectDatabaseFile(selected);
      send(response, 200, { status: "success", path: db.DB_PATH });
    } catch (error) {
      throw new HttpError(
        400,
        error instanceof Error ? error.message : "Unable to open database.",
      );
    }
    return;
  }
  throw new HttpError(404, "Not found.");
}

const server = createServer((request, response) => {
  void handle(request, response).catch((error: unknown) => {
    if (response.headersSent) {
      response.destroy();
      return;
    }
    const status = error instanceof HttpError ? error.status : 500;
    send(response, status, {
      detail: error instanceof Error ? error.message : "Internal server error.",
    });
    if (status >= 500) console.error("[Backend] Request failed:", error);
  });
});
server.listen(port, host, () =>
  console.log(`[Backend] Listening on http://${host}:${port}`),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    sessionKey?.fill(0);
    sessionKey = null;
    server.close(() => process.exit(0));
  });
