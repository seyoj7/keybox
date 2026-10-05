import sqlite3
import os
import json
import shutil
import contextlib
from collections.abc import Iterator
from datetime import datetime
import tempfile
from typing import Any

from cryptography.exceptions import InvalidTag
from password_generator import decrypt, encrypt

CONFIG_FILE = os.environ.get(
    'KEYBOX_CONFIG_PATH',
    os.path.join(os.path.dirname(__file__), 'config.json'),
)

def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r') as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def save_config(config):
    config_dir = os.path.dirname(os.path.abspath(CONFIG_FILE))
    os.makedirs(config_dir, exist_ok=True)
    fd, temporary_path = tempfile.mkstemp(prefix='keybox-config-', suffix='.tmp', dir=config_dir)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(config, f)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temporary_path, CONFIG_FILE)
    except Exception:
        if os.path.exists(temporary_path):
            os.remove(temporary_path)
        raise

config = load_config()

DB_DIR = config.get('db_dir', os.environ.get(
    'KEYBOX_DATA_DIR',
    os.path.join(os.path.dirname(os.path.dirname(__file__)), 'database')
))
os.makedirs(DB_DIR, exist_ok=True)
DB_PATH = os.path.join(DB_DIR, 'keybox.db')

def change_db_location(new_dir: str):
    global DB_DIR, DB_PATH
    new_dir = os.path.abspath(new_dir)
    os.makedirs(new_dir, exist_ok=True)
    new_db_path = os.path.join(new_dir, 'keybox.db')
    old_db_path = DB_PATH
    if old_db_path != new_db_path and os.path.exists(new_db_path):
        raise FileExistsError(f'A keybox.db already exists in the selected folder: {new_dir}')

    copied_files = []
    if old_db_path != new_db_path and os.path.exists(old_db_path):
        for suffix in ['', '-wal', '-shm', '-journal']:
            source_path = old_db_path + suffix
            target_path = new_db_path + suffix
            if os.path.exists(source_path):
                shutil.copy2(source_path, target_path)
                copied_files.append(target_path)

    cfg = load_config()
    cfg['db_dir'] = new_dir
    try:
        save_config(cfg)
    except Exception:
        for copied_path in copied_files:
            if os.path.exists(copied_path):
                os.remove(copied_path)
        raise

    DB_DIR = new_dir
    DB_PATH = new_db_path

    # Remove the previous database only after the new location is persisted.
    if old_db_path != new_db_path:
        for suffix in ['', '-wal', '-shm', '-journal']:
            old_path = old_db_path + suffix
            if os.path.exists(old_path):
                os.remove(old_path)


@contextlib.contextmanager
def get_connection() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(DB_PATH)
    try:
        with conn:
            yield conn
    finally:
        conn.close()

def init_db():
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS metadata (
                key TEXT PRIMARY KEY,
                value BLOB NOT NULL
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS passwords (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                encrypted_data BLOB NOT NULL,
                nonce BLOB NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        conn.commit()

def save_metadata(key: str, value: bytes):
    with get_connection() as conn:
        conn.execute("INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)", (key, value))

def get_metadata(key: str) -> bytes | None:
    with get_connection() as conn:
        cursor = conn.execute("SELECT value FROM metadata WHERE key = ?", (key,))
        row = cursor.fetchone()
        return row[0] if row else None

def save_password(encrypted_data: bytes, nonce: bytes) -> int:
    now = datetime.utcnow().isoformat()
    with get_connection() as conn:
        cursor = conn.execute("""
            INSERT INTO passwords (encrypted_data, nonce, created_at, updated_at)
            VALUES (?, ?, ?, ?)
        """, (encrypted_data, nonce, now, now))
        entry_id = cursor.lastrowid
        if entry_id is None:
            raise RuntimeError("SQLite did not return an ID for the saved entry.")
        return entry_id

def update_password(password_id: int, encrypted_data: bytes, nonce: bytes):
    now = datetime.utcnow().isoformat()
    with get_connection() as conn:
        conn.execute("""
            UPDATE passwords 
            SET encrypted_data = ?, nonce = ?, updated_at = ?
            WHERE id = ?
        """, (encrypted_data, nonce, now, password_id))

def get_password(password_id: int):
    with get_connection() as conn:
        cursor = conn.execute("SELECT encrypted_data, nonce, created_at, updated_at FROM passwords WHERE id = ?", (password_id,))
        return cursor.fetchone()

def delete_password(password_id: int):
    with get_connection() as conn:
        conn.execute("DELETE FROM passwords WHERE id = ?", (password_id,))

def list_passwords():
    with get_connection() as conn:
        cursor = conn.execute("SELECT id, encrypted_data, nonce, created_at, updated_at FROM passwords")
        return cursor.fetchall()


class Vault:
    def __init__(self, key: bytes):
        self.key = key

    def add_entry(self, website, username, password, profile="Default", icon=None):
        payload = json.dumps({
            "website": website,
            "username": username,
            "password": password,
            "profile": profile,
            "icon": icon,
        }).encode("utf-8")

        ciphertext, nonce = encrypt(self.key, payload)
        return save_password(ciphertext, nonce)

    def get_entry(self, entry_id: int) -> dict[str, Any]:
        row = get_password(entry_id)
        if not row:
            raise ValueError(f"Entry {entry_id} not found.")

        encrypted_data, nonce, created_at, updated_at = row
        try:
            plaintext = decrypt(self.key, nonce, encrypted_data)
        except InvalidTag as exc:
            raise ValueError("Data tampering detected or incorrect key!") from exc

        data = json.loads(plaintext.decode("utf-8"))
        data["id"] = entry_id
        data["created_at"] = created_at
        data["updated_at"] = updated_at
        data.setdefault("profile", "Default")
        data.setdefault("icon", None)
        return data

    def update_entry(self, entry_id: int, website, username, password, profile="Default", icon=None):
        self.get_entry(entry_id)
        payload = json.dumps({
            "website": website,
            "username": username,
            "password": password,
            "profile": profile,
            "icon": icon,
        }).encode("utf-8")

        ciphertext, nonce = encrypt(self.key, payload)
        update_password(entry_id, ciphertext, nonce)

    def delete_entry(self, entry_id: int):
        delete_password(entry_id)

    def list_entries(self) -> list[dict[str, Any]]:
        results = []
        for row in list_passwords():
            entry_id, encrypted_data, nonce, created_at, updated_at = row
            try:
                plaintext = decrypt(self.key, nonce, encrypted_data)
                data = json.loads(plaintext.decode("utf-8"))
                results.append({
                    "id": entry_id,
                    "website": data.get("website"),
                    "username": data.get("username"),
                    "profile": data.get("profile", "Default"),
                    "icon": data.get("icon"),
                    "color": data.get("color"),
                    "created_at": created_at,
                    "updated_at": updated_at,
                })
            except InvalidTag:
                print(f"Warning: Entry {entry_id} is corrupted or tampered with.")
        return results
