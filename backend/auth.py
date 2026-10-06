import json
import os
import vault_database as database
from password_generator import generate_salt, derive_key, encrypt, decrypt
from cryptography.exceptions import InvalidTag


def is_vault_initialized() -> bool:
    if not os.path.isfile(database.DB_PATH):
        return False
    try:
        return database.get_metadata("master_salt") is not None
    except Exception:
        return False

def setup_vault(master_password: str):
    database.init_db()
    if database.get_metadata("master_salt"):
        raise ValueError("Vault is already initialized.")
    
    salt = generate_salt()
    key = derive_key(master_password, salt)
    
    # Create a verification token to verify password without storing a hash
    ciphertext, nonce = encrypt(key, b"KeyboxVerification")
    
    database.save_metadata("master_salt", salt)
    database.save_metadata("verification_nonce", nonce)
    database.save_metadata("verification_token", ciphertext)

def unlock_vault(master_password: str) -> bytes:
    if not is_vault_initialized():
        raise ValueError("Vault is not initialized.")
    salt = database.get_metadata("master_salt")
    nonce = database.get_metadata("verification_nonce")
    token = database.get_metadata("verification_token")
    
    if not salt or not nonce or not token:
        raise ValueError("Vault is not initialized.")
        
    key = derive_key(master_password, salt)
    
    try:
        decrypted = decrypt(key, nonce, token)
        if decrypted != b"KeyboxVerification":
            raise ValueError("Invalid master password.")
    except InvalidTag:
        raise ValueError("Invalid master password.")
        
    return key

def change_master_password(old_password: str, new_password: str):
    # 1. Verify old password and get the old key
    old_key = unlock_vault(old_password)
    
    # 2. Extract all full data entries before changing keys
    old_vault = database.Vault(old_key)
    entries_meta = old_vault.list_entries()
    
    full_entries = []
    for meta in entries_meta:
        full_entries.append(old_vault.get_entry(meta['id']))
        
    # 3. Generate new salt and key
    new_salt = generate_salt()
    new_key = derive_key(new_password, new_salt)
    
    # 4. Create new verification token
    ciphertext, nonce = encrypt(new_key, b"KeyboxVerification")
    
    # 5. Update database metadata
    database.save_metadata("master_salt", new_salt)
    database.save_metadata("verification_nonce", nonce)
    database.save_metadata("verification_token", ciphertext)
    
    # 6. Re-encrypt all entries
    for entry in full_entries:
        payload = json.dumps({
            "website": entry['website'],
            "username": entry['username'],
            "password": entry['password'],
            "profile": entry.get('profile', 'Default'),
            "icon": entry.get('icon'),
            "color": entry.get('color'),
        }).encode('utf-8')
        c_text, n = encrypt(new_key, payload)
        database.update_password(entry['id'], c_text, n)

