const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const net = require("net");

// ── Paths ──────────────────────────────────────────────────────
// In development the resources sit relative to the project root.
// After packaging, electron-builder copies them into `resources/`.
const isProd = app.isPackaged;

const resourcesPath = isProd
  ? path.join(process.resourcesPath)
  : path.join(__dirname, "..");

const backendExePath = isProd
  ? path.join(resourcesPath, "keybox-backend.exe")
  : path.join(resourcesPath, "dist-backend", "keybox-backend.exe");

const nextAppDir = isProd
  ? path.join(resourcesPath, "app")
  : path.join(resourcesPath, ".next", "standalone");

// ── User data directory for the database ──────────────────────
// When packaged, the backend should store its DB in a persistent
// user-data folder, not next to the exe (which is read-only).
const userDataPath = app.getPath("userData");

// ── Child-process handles ────────────────────────────────────
let backendProcess = null;
let nextProcess = null;

// ── Port probing helper ──────────────────────────────────────
function waitForPort(port, host = "127.0.0.1", timeoutMs = 30_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function tryConnect() {
      if (Date.now() - start > timeoutMs) {
        return reject(new Error(`Timeout waiting for ${host}:${port}`));
      }
      const sock = new net.Socket();
      sock.setTimeout(500);
      sock
        .once("connect", () => {
          sock.destroy();
          resolve();
        })
        .once("error", () => {
          sock.destroy();
          setTimeout(tryConnect, 300);
        })
        .once("timeout", () => {
          sock.destroy();
          setTimeout(tryConnect, 300);
        })
        .connect(port, host);
    }
    tryConnect();
  });
}

// ── Start backend exe ────────────────────────────────────────
function startBackend() {
  return new Promise((resolve, reject) => {
    console.log("[Electron] Starting backend:", backendExePath);

    const env = { ...process.env };
    // Tell the backend where to store its database when packaged
    if (isProd) {
      env.KEYBOX_DATA_DIR = userDataPath;
    }

    backendProcess = spawn(backendExePath, [], {
      cwd: isProd ? userDataPath : path.join(resourcesPath),
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    backendProcess.stdout.on("data", (d) =>
      console.log("[Backend]", d.toString().trim())
    );
    backendProcess.stderr.on("data", (d) =>
      console.error("[Backend]", d.toString().trim())
    );

    backendProcess.once("error", (err) => {
      console.error("[Electron] Failed to start backend:", err);
      reject(err);
    });

    backendProcess.once("exit", (code) => {
      console.log("[Electron] Backend exited with code", code);
      backendProcess = null;
    });

    // Wait until the backend is listening on port 8000
    waitForPort(8000, "127.0.0.1", 30_000).then(resolve).catch(reject);
  });
}

// ── Start Next.js standalone server ──────────────────────────
function startNextServer() {
  return new Promise((resolve, reject) => {
    const serverJs = path.join(nextAppDir, "server.js");
    console.log("[Electron] Starting Next.js server:", serverJs);

    const env = {
      ...process.env,
      PORT: "3000",
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
    };

    // In the packaged app, process.execPath is the Electron binary.
    // Set ELECTRON_RUN_AS_NODE=1 so it acts as a plain Node runtime
    // for the standalone Next.js server.js script.
    if (isProd) {
      env.ELECTRON_RUN_AS_NODE = "1";
    }

    nextProcess = spawn(process.execPath, [serverJs], {
      cwd: nextAppDir,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    nextProcess.stdout.on("data", (d) =>
      console.log("[Next.js]", d.toString().trim())
    );
    nextProcess.stderr.on("data", (d) =>
      console.error("[Next.js]", d.toString().trim())
    );

    nextProcess.once("error", (err) => {
      console.error("[Electron] Failed to start Next.js:", err);
      reject(err);
    });

    nextProcess.once("exit", (code) => {
      console.log("[Electron] Next.js exited with code", code);
      nextProcess = null;
    });

    waitForPort(3000, "127.0.0.1", 30_000).then(resolve).catch(reject);
  });
}

// ── Kill helpers ─────────────────────────────────────────────
function killProcess(proc, name) {
  if (!proc || proc.killed) return;
  console.log(`[Electron] Stopping ${name}…`);
  try {
    // On Windows, child_process.kill() sends SIGTERM which doesn't
    // work for non-Node processes.  Use taskkill instead.
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(proc.pid), "/f", "/t"], {
        windowsHide: true,
      });
    } else {
      proc.kill("SIGTERM");
    }
  } catch {
    /* already dead */
  }
}

// ── IPC handlers for frameless window controls ───────────────
ipcMain.on("window-minimize", () => mainWindow?.minimize());
ipcMain.on("window-maximize", () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.on("window-close", () => mainWindow?.close());
ipcMain.handle("window-is-maximized", () => mainWindow?.isMaximized() ?? false);

// ── Create BrowserWindow ─────────────────────────────────────
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "Keybox",
    frame: false,
    backgroundColor: "#090c13",
    icon: path.join(resourcesPath, isProd ? "app" : "", "public", "logo.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
    autoHideMenuBar: true,
  });

  mainWindow.loadURL("http://127.0.0.1:3000");

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ── App lifecycle ────────────────────────────────────────────
app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  killProcess(nextProcess, "Next.js");
  killProcess(backendProcess, "Backend");
});

app.whenReady().then(async () => {
  try {
    await startBackend();
    console.log("[Electron] Backend is ready on :8000");

    await startNextServer();
    console.log("[Electron] Next.js is ready on :3000");

    createWindow();
  } catch (err) {
    console.error("[Electron] Startup failed:", err);
    dialog.showErrorBox(
      "Keybox – Startup Error",
      `Failed to start Keybox services:\n\n${err.message}\n\nThe application will now close.`
    );
    app.quit();
  }
});
