import sqlite3
import os
from datetime import datetime

DB_DIR = os.environ.get(
    'KEYBOX_DATA_DIR',
    os.path.join(os.path.dirname(os.path.dirname(__file__)), 'database')
)
os.makedirs(DB_DIR, exist_ok=True)
DB_PATH = os.path.join(DB_DIR, 'keybox.db')

def get_connection():
    return sqlite3.connect(DB_PATH)

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

def get_metadata(key: str) -> bytes:
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
        return cursor.lastrowid

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