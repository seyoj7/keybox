import json
import database
from password_generator import encrypt, decrypt
from cryptography.exceptions import InvalidTag


class Vault:
    def __init__(self, key: bytes):
        self.key = key
        
    def add_entry(self, website, username, password, profile="Default", icon=None):
        payload = json.dumps({
            "website": website,
            "username": username,
            "password": password,
            "profile": profile,
            "icon": icon
        }).encode('utf-8')
        
        ciphertext, nonce = encrypt(self.key, payload)
        entry_id = database.save_password(ciphertext, nonce)
        return entry_id

    def get_entry(self, entry_id: int):
        row = database.get_password(entry_id)
        if not row:
            raise ValueError(f"Entry {entry_id} not found.")
            
        encrypted_data, nonce, created_at, updated_at = row
        try:
            plaintext = decrypt(self.key, nonce, encrypted_data)
        except InvalidTag:
            raise ValueError("Data tampering detected or incorrect key!")
            
        data = json.loads(plaintext.decode('utf-8'))
        data['id'] = entry_id
        data['created_at'] = created_at
        data['updated_at'] = updated_at
        # Backward compat: old entries won't have 'profile' or 'icon'
        if 'profile' not in data:
            data['profile'] = 'Default'
        if 'icon' not in data:
            data['icon'] = None
        return data

    def update_entry(self, entry_id: int, website, username, password, profile="Default", icon=None):
        # Verify it exists and isn't tampered with
        self.get_entry(entry_id)
        
        payload = json.dumps({
            "website": website,
            "username": username,
            "password": password,
            "profile": profile,
            "icon": icon
        }).encode('utf-8')
        
        ciphertext, nonce = encrypt(self.key, payload)
        database.update_password(entry_id, ciphertext, nonce)
        
    def delete_entry(self, entry_id: int):
        database.delete_password(entry_id)

    def list_entries(self):
        rows = database.list_passwords()
        results = []
        for row in rows:
            entry_id, encrypted_data, nonce, created_at, updated_at = row
            try:
                plaintext = decrypt(self.key, nonce, encrypted_data)
                data = json.loads(plaintext.decode('utf-8'))
                results.append({
                    "id": entry_id,
                    "website": data.get("website"),
                    "username": data.get("username"),
                    "profile": data.get("profile", "Default"),
                    "icon": data.get("icon"),
                    "color": data.get("color"),
                    "created_at": created_at,
                    "updated_at": updated_at
                })
            except InvalidTag:
                print(f"Warning: Entry {entry_id} is corrupted or tampered with.")
        return results