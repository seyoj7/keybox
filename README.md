# Keybox

Keybox is a highly secure, completely local password manager engineered with a robust system architecture to guarantee maximum data protection. It ensures your credentials remain firmly under your control, leveraging state-of-the-art cryptographic standards and an offline-first, zero-trust design.

## ✨ Features

- **Zero-Knowledge Architecture:** Your master password is never stored or cached anywhere. It is securely hashed using Argon2 in memory during your active session.
- **Robust Encryption:** All your passwords and entries are encrypted using industry-standard ChaCha20-Poly1305 authenticated encryption.
- **Profiles:** Organize your accounts and passwords into distinct profiles (e.g., Work, Personal) with customizable icons and colors.
- **Customizable Database Location:** Keep your SQLite database wherever you want on your local system, making backups and synchronization through cloud drives (like OneDrive or Dropbox) easy.
- **Standalone Desktop Environment:** Packaged securely as a standalone application using Electron, minimizing external dependencies and attack surfaces.
- **Decoupled Architecture:** Employs a strict separation of concerns with a Next.js static frontend interacting with a Python-based cryptographic backend.

## 🚀 Tech Stack

- **Frontend:** Next.js (App Router), React, TypeScript, CSS Modules
- **Backend:** Python, FastAPI, SQLite, Cryptography (ChaCha20, Argon2)
- **Desktop Wrapper:** Electron, electron-builder

## 🛠️ Getting Started

### Prerequisites

You will need the following installed on your machine:
- [Node.js](https://nodejs.org/) (v18+)
- [Python](https://www.python.org/) (3.10+)

### Installation

1. **Clone the repository** (if applicable) and navigate to the project directory:
   ```bash
   cd keybox
   ```

2. **Install Node dependencies:**
   ```bash
   npm install
   ```

3. **Set up the Python backend:**
   ```bash
   cd backend
   python -m venv venv
   # On Windows:
   venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   pip install -r requirements.txt
   ```

### Running Locally (Development Mode)

Start the Next.js frontend and the FastAPI backend concurrently:

```bash
npm run dev
```

### Packaging for Desktop

To build the standalone Windows `.exe` application:

```bash
npm run build:windows
```
This script will:
1. Compile the Python backend into a standalone executable using PyInstaller.
2. Build the Next.js static frontend.
3. Package everything into a frameless Windows installer via `electron-builder`.

Your installer will be located in the `dist/app/` folder.

## 🔒 Security & Architecture

- **Air-Gapped Operation:** Keybox makes no network calls to external servers. Your encrypted vault is confined strictly to your local machine, eliminating the risk of remote data breaches.
- **Memory Safety & Ephemeral Keys:** The master password and derived cryptographic keys are held entirely in volatile application memory (RAM). They are immediately zeroed out and purged when you lock the vault or exit the application.
- **Authenticated Encryption:** Using a combination of random salts, nonces, and the Poly1305 authenticator tag guarantees that your database cannot be silently modified or tampered with by malicious actors.
- **Multi-layered Key Derivation:** Master passwords are run through Argon2, a memory-hard key derivation function, making brute-force and GPU-based dictionary attacks practically infeasible.
- **Isolated Backend:** Core cryptographic logic and database operations are executed in a separate Python process, reducing the risk of frontend vulnerabilities compromising the vault.

## 🗄️ Database Management

By default, the SQLite database (`keybox.db`) is stored in the `/database` folder in the project directory. 
You can easily move this database to another secure location on your system via the **Settings -> Database Location** menu inside the app. The backend will seamlessly migrate your data and remember the new location moving forward.
