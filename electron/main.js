/* eslint-disable @typescript-eslint/no-require-imports -- Electron's main entry is CommonJS. */
const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

const APP_HOST = "127.0.0.1";
const BACKEND_PORT = 8000;
const FRONTEND_PORT = 3000;
const STARTUP_TIMEOUT_MS = 45_000;
const isPackaged = app.isPackaged;
const resourcesPath = isPackaged ? process.resourcesPath : path.resolve(__dirname, "..");
const backendPath = isPackaged
  ? path.join(resourcesPath, "keybox-backend", "keybox-backend.exe")
  : path.join(resourcesPath, "dist", "backend", "keybox-backend", "keybox-backend.exe");
const nextAppDir = isPackaged
  ? path.join(resourcesPath, "app")
  : resourcesPath;
const serverPath = path.join(nextAppDir, "server.js");
const nextCliPath = path.join(resourcesPath, "node_modules", "next", "dist", "bin", "next");
const backendScriptPath = path.join(resourcesPath, "backend", "main.py");
const userDataPath = app.getPath("userData");
const configPath = path.join(userDataPath, "config.json");
const backendToken = crypto.randomBytes(32).toString("hex");

let mainWindow = null;
let backendProcess = null;
let nextProcess = null;
let isQuitting = false;

function logChildOutput(name, child) {
  child.stdout?.on("data", (chunk) => {
    for (const line of chunk.toString().trimEnd().split(/\r?\n/)) {
      if (line) console.log(`[${name}] ${line}`);
    }
  });
  child.stderr?.on("data", (chunk) => {
    for (const line of chunk.toString().trimEnd().split(/\r?\n/)) {
      if (line) console.error(`[${name}] ${line}`);
    }
  });
}

function requestIsReady(url, headers = {}) {
  return new Promise((resolve) => {
    const request = http.get(url, { headers }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.setTimeout(1_000, () => request.destroy());
    request.once("error", () => resolve(false));
  });
}

async function waitForService(child, url, label, headers = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < STARTUP_TIMEOUT_MS) {
    if (child.spawnError) {
      throw new Error(`${label} could not start: ${child.spawnError.message}`);
    }
    if (child.exitCode !== null || child.killed) {
      throw new Error(`${label} stopped before it became ready.`);
    }
    if (await requestIsReady(url, headers)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${label} did not become ready at ${url}.`);
}

function startChild(executable, args, options, label) {
  const child = spawn(executable, args, {
    ...options,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  logChildOutput(label, child);
  child.once("error", (error) => {
    child.spawnError = error;
    console.error(`[Electron] ${label} process error:`, error);
  });
  child.once("exit", (code, signal) => {
    console.log(`[Electron] ${label} exited (code=${code}, signal=${signal}).`);
    if (!isQuitting && mainWindow && !mainWindow.isDestroyed()) {
      dialog.showErrorBox(
        `${label} stopped`,
        `The ${label} service stopped unexpectedly. Restart Keybox to continue.`,
      );
      app.quit();
    }
  });
  return child;
}

async function startBackend() {
  if (isPackaged && !fs.existsSync(backendPath)) {
    throw new Error(`Backend executable is missing: ${backendPath}`);
  }
  if (!isPackaged && !fs.existsSync(backendScriptPath)) {
    throw new Error(`Backend source is missing: ${backendScriptPath}`);
  }
  fs.mkdirSync(userDataPath, { recursive: true });

  const env = { ...process.env };
  if (isPackaged) {
    env.KEYBOX_DATA_DIR = userDataPath;
    env.KEYBOX_CONFIG_PATH = configPath;
  }
  env.KEYBOX_API_TOKEN = backendToken;

  const backendCommand = isPackaged
    ? backendPath
    : (process.env.KEYBOX_PYTHON || (process.platform === "win32" ? "python" : "python3"));
  const backendArgs = isPackaged ? [] : [backendScriptPath];
  const backendCwd = isPackaged ? resourcesPath : path.join(resourcesPath, "backend");
  backendProcess = startChild(
    backendCommand,
    backendArgs,
    { cwd: backendCwd, env },
    "Backend",
  );
  await waitForService(
    backendProcess,
    `http://${APP_HOST}:${BACKEND_PORT}/api/status`,
    "Backend",
    { "X-Keybox-Token": backendToken },
  );
}

async function startNextServer() {
  const nextEntry = isPackaged ? serverPath : nextCliPath;
  if (!fs.existsSync(nextEntry)) {
    throw new Error(`Next.js entry point is missing: ${nextEntry}`);
  }

  const env = {
    ...process.env,
    PORT: String(FRONTEND_PORT),
    HOSTNAME: APP_HOST,
    NODE_ENV: isPackaged ? "production" : "development",
  };
  env.ELECTRON_RUN_AS_NODE = "1";

  const nextArgs = isPackaged
    ? [serverPath]
    : [nextCliPath, "dev", "--hostname", APP_HOST, "--port", String(FRONTEND_PORT)];

  nextProcess = startChild(
    process.execPath,
    nextArgs,
    { cwd: nextAppDir, env },
    "Next.js",
  );
  await waitForService(
    nextProcess,
    `http://${APP_HOST}:${FRONTEND_PORT}/`,
    "Next.js",
  );
}

function publishWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("window-state-changed", {
    maximized: mainWindow.isMaximized(),
    fullscreen: mainWindow.isFullScreen(),
  });
}

function assertTrustedRenderer(event) {
  const frameUrl = event.senderFrame?.url;
  if (!frameUrl || new URL(frameUrl).origin !== `http://${APP_HOST}:${FRONTEND_PORT}`) {
    throw new Error("This operation is only available to the Keybox window.");
  }
}

function registerIpcHandlers() {
  ipcMain.handle("window-minimize", (event) => {
    assertTrustedRenderer(event);
    mainWindow?.minimize();
  });
  ipcMain.handle("window-toggle-maximize", (event) => {
    assertTrustedRenderer(event);
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return mainWindow.isMaximized();
  });
  ipcMain.handle("window-close", (event) => {
    assertTrustedRenderer(event);
    mainWindow?.close();
  });
  ipcMain.handle("window-is-maximized", (event) => {
    assertTrustedRenderer(event);
    return Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isMaximized());
  });
  ipcMain.handle("api-request", async (event, request) => {
    assertTrustedRenderer(event);

    if (!request || typeof request.url !== "string") {
      throw new Error("Invalid API request.");
    }
    const targetUrl = new URL(request.url, `http://${APP_HOST}:${FRONTEND_PORT}`);
    if (targetUrl.origin !== `http://${APP_HOST}:${FRONTEND_PORT}` || !targetUrl.pathname.startsWith("/api/")) {
      throw new Error("Only Keybox API routes are allowed.");
    }

    const options = request.options || {};
    const method = String(options.method || "GET").toUpperCase();
    if (!["GET", "POST", "PUT", "DELETE"].includes(method)) {
      throw new Error("Unsupported API method.");
    }

    const headers = new Headers(options.headers || {});
    headers.set("X-Keybox-Token", backendToken);
    const body = typeof options.body === "string" ? options.body : undefined;

    try {
      const response = await fetch(`http://${APP_HOST}:${BACKEND_PORT}${targetUrl.pathname}${targetUrl.search}`, {
        method,
        headers,
        body: method === "GET" ? undefined : body,
      });
      return {
        status: response.status,
        contentType: response.headers.get("content-type") || "",
        body: await response.text(),
      };
    } catch (error) {
      console.error("[Electron] Backend request failed:", error);
      return {
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "The local Keybox backend is unavailable." }),
      };
    }
  });
  ipcMain.handle("database-locate", async (event) => {
    assertTrustedRenderer(event);
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Locate your Keybox database",
      buttonLabel: "Use this database",
      properties: ["openFile"],
      filters: [{ name: "Keybox database", extensions: ["db"] }],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
}

function createWindow() {
  const iconPath = path.join(resourcesPath, ...(isPackaged ? ["app"] : []), "public", "logo.png");
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "Keybox",
    frame: false,
    backgroundColor: "#090c13",
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.on("maximize", publishWindowState);
  mainWindow.on("unmaximize", publishWindowState);
  mainWindow.on("enter-full-screen", publishWindowState);
  mainWindow.on("leave-full-screen", publishWindowState);
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.webContents.on("did-fail-load", (_event, code, description) => {
    console.error(`[Electron] Page load failed (${code}): ${description}`);
  });
  mainWindow.webContents.on("will-navigate", (event, targetUrl) => {
    if (new URL(targetUrl).origin !== `http://${APP_HOST}:${FRONTEND_PORT}`) {
      event.preventDefault();
    }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.loadURL(`http://${APP_HOST}:${FRONTEND_PORT}`);
}

function stopChild(child, label) {
  if (!child || child.exitCode !== null || child.killed) return;
  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      windowsHide: true,
      stdio: "ignore",
    });
    killer.once("error", () => child.kill());
  } else {
    child.kill("SIGTERM");
  }
  console.log(`[Electron] Stopping ${label}.`);
}

const hasSingleInstance = app.requestSingleInstanceLock();
if (!hasSingleInstance) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  registerIpcHandlers();
  app.on("before-quit", () => {
    isQuitting = true;
    stopChild(nextProcess, "Next.js");
    stopChild(backendProcess, "Backend");
  });
  app.on("window-all-closed", () => app.quit());

  app.whenReady().then(async () => {
    try {
      await startBackend();
      await startNextServer();
      createWindow();
    } catch (error) {
      console.error("[Electron] Startup failed:", error);
      dialog.showErrorBox(
        "Keybox startup error",
        `Keybox could not start its local services.\n\n${error.message}`,
      );
      app.quit();
    }
  });
}
