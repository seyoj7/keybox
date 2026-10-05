import os
import secrets
import string
import argon2.low_level
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

def generate_password(length: int = 16, use_uppercase=True, use_digits=True, use_special=True) -> str:
    chars = string.ascii_lowercase
    if use_uppercase:
        chars += string.ascii_uppercase
    if use_digits:
        chars += string.digits
    if use_special:
        chars += "!@#$%^&*()_+-=[]{}|;:,.<>?"
        
    if not chars:
        raise ValueError("At least one character set must be selected.")
        
    while True:
        password = ''.join(secrets.choice(chars) for _ in range(length))
        
        # Verify conditions are met
        if use_uppercase and not any(c.isupper() for c in password): continue
        if use_digits and not any(c.isdigit() for c in password): continue
        if use_special and not any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?" for c in password): continue
        
        return password

def generate_salt(length: int = 16) -> bytes:
    return secrets.token_bytes(length)

def derive_key(master_password: str, salt: bytes) -> bytes:
    return argon2.low_level.hash_secret_raw(
        secret=master_password.encode('utf-8'),
        salt=salt,
        time_cost=3,          # Number of iterations
        memory_cost=65536,    # 64 MB
        parallelism=4,        # 4 threads
        hash_len=32,          # 256 bits for AES-256
        type=argon2.low_level.Type.ID
    )

def encrypt(key: bytes, plaintext: bytes, associated_data: bytes | None = None) -> tuple[bytes, bytes]:
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)  # 96-bit nonce for GCM
    # Encrypt appends the 16-byte auth tag to the ciphertext
    ciphertext = aesgcm.encrypt(nonce, plaintext, associated_data)
    return ciphertext, nonce

def decrypt(key: bytes, nonce: bytes, ciphertext: bytes, associated_data: bytes | None = None) -> bytes:
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ciphertext, associated_data)
