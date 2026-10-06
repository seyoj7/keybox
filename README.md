# Keybox

Keybox is a local password manager with a Next.js interface, a Python/FastAPI vault service, and an Electron desktop wrapper. The desktop app starts the frontend and backend on the local machine; it does not require a Keybox account or hosted service.

## Features

- Store website, username, and password entries encrypted in a SQLite database.
- Derive vault keys from the master password with Argon2id and encrypt entry data with AES-256-GCM.
- Group entries by profile and generate passwords in the app.
- Keep the database in the default per-user data folder or move it to another directory.
- Choose a dark, light, or system theme.

Windows Hello is not currently a working vault-unlock method. The login screen may show its option, but biometric unlock is not implemented; use the master password.

## Requirements

- Node.js 20.9 or newer
- Python 3.10 or newer
- Windows for building the desktop installer

## Set up a development environment

Install the JavaScript dependencies and Python backend requirements:

```bash
npm install
cd backend
python -m venv .venv
```

Activate the virtual environment, then install the backend requirements:

```powershell
# Windows PowerShell
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

```bash
# macOS or Linux
source .venv/bin/activate
python -m pip install -r requirements.txt
```

To build the Windows desktop app, install PyInstaller in the same virtual environment:

```bash
python -m pip install pyinstaller
```

Return to the project root before running the npm scripts.

## Run locally

From the project root, launch the development desktop app:

```bash
npm run dev
```

Electron starts the Next.js development server and Python backend on loopback. API calls go from the renderer through Electron's IPC bridge; the backend rejects requests without the per-launch token. The development backend therefore must be started by `npm run dev`.

## Build the Windows app

From the project root, run:

```bash
npm run build:windows
```

The script builds the Python backend as a PyInstaller directory bundle, builds the Next.js standalone frontend, and packages them with Electron Builder as an NSIS installer. The directory bundle avoids the extra bootloader process used by PyInstaller's one-file mode. Electron Builder may need internet access to download the Electron runtime during packaging. The installer is written to `dist/app/`, normally as `Keybox Setup <version>.exe`. The unpacked application is also written to `dist/app/win-unpacked/`.

Electron includes the Chromium runtime, so the unpacked installation uses substantially more disk space than the compressed installer. Exact sizes vary with the Electron runtime and build contents. The desktop build targets Windows x64.

## Database and configuration

On Windows, the default database folder is `%APPDATA%\keybox`, which usually resolves to `C:\Users\<user>\AppData\Roaming\keybox`.

- Packaged app: the database is `keybox.db` in the configured database folder, and settings are saved in `%APPDATA%\keybox\config.json`.
- Development: the database folder is selected by `db_dir` in `backend/config.json`; if it is not set, the same per-user default is used. Development settings are saved in `backend/config.json`.

The `db_dir` setting names a folder, not a database file. Use **Settings -> Database Location -> Change Location** to move the database. On the welcome screen, choose **Locate existing database** to select an existing file named `keybox.db`. The selected location is remembered in the relevant config file.

## Security notes

- Entry data is encrypted in SQLite with AES-256-GCM. Key derivation uses Argon2id.
- The master password is submitted to the local backend for setup and unlock; it is not written to the config file or stored as a password in the database.
- The derived key remains in the backend process memory while the vault is unlocked. Locking the vault clears the backend's active key reference; Python does not guarantee immediate zeroization of the underlying memory.
- In both development and packaged desktop mode, the backend listens on `127.0.0.1`, so it is not exposed on the computer's network interfaces. It also requires a cryptographically random 256-bit token generated for each app launch. Electron's main process supplies the token to the backend and adds it to API requests; the renderer receives API results through a restricted IPC bridge and never receives the token. CORS is disabled, and the Electron window blocks navigation away from its local frontend.
- Other programs on the same computer can connect to the loopback port, but the backend rejects their requests unless they have the current Keybox session token. This is application-level access control, not operating-system process isolation; software running with sufficient access to the user's processes may be able to inspect them.
- Starting the backend directly without `KEYBOX_API_TOKEN` leaves its API unavailable. Use `npm run dev` to launch the development app and its backend together. Database backups and synchronization are the user's responsibility if the database is moved into a synced folder.

The project has not been independently security audited. Do not treat claims of zero-knowledge or air-gapped operation as a substitute for a review of the implementation.
