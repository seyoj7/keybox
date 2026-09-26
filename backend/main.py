import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from auth import unlock_vault, is_vault_initialized, setup_vault, change_master_password
from vault import Vault
from password_generator import generate_password

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory session: holds the derived key after unlock
_session_key: Optional[bytes] = None


def _get_vault() -> Vault:
    """Return the active Vault instance, or raise 401 if locked."""
    if _session_key is None:
        raise HTTPException(status_code=401, detail="Vault is locked")
    return Vault(_session_key)


# ── Auth Models ──────────────────────────────────────────────

class AuthRequest(BaseModel):
    password: str

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

class EntryRequest(BaseModel):
    website: str
    username: str
    password: str
    profile: str = "Default"

class GeneratePasswordRequest(BaseModel):
    length: int = 16
    use_uppercase: bool = True
    use_digits: bool = True
    use_special: bool = True


# ── Auth Endpoints ───────────────────────────────────────────

@app.get("/api/status")
def get_status():
    return {"initialized": is_vault_initialized()}


@app.post("/api/init")
def init_vault(req: AuthRequest):
    global _session_key
    try:
        setup_vault(req.password)
        # Auto-unlock after init
        _session_key = unlock_vault(req.password)
        return {"status": "success"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/unlock")
def unlock(req: AuthRequest):
    global _session_key
    try:
        if not is_vault_initialized():
            setup_vault(req.password)
        _session_key = unlock_vault(req.password)
        return {"status": "success"}
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/lock")
def lock_vault():
    global _session_key
    _session_key = None
    return {"status": "locked"}


@app.post("/api/change-password")
def change_password(req: ChangePasswordRequest):
    global _session_key
    try:
        change_master_password(req.old_password, req.new_password)
        # Re-unlock with new password
        _session_key = unlock_vault(req.new_password)
        return {"status": "success"}
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Vault CRUD Endpoints ────────────────────────────────────

@app.get("/api/entries")
def list_entries():
    vault = _get_vault()
    return vault.list_entries()


@app.get("/api/entries/{entry_id}")
def get_entry(entry_id: int):
    vault = _get_vault()
    try:
        return vault.get_entry(entry_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/api/entries")
def add_entry(req: EntryRequest):
    vault = _get_vault()
    entry_id = vault.add_entry(req.website, req.username, req.password, req.profile)
    return {"id": entry_id, "status": "created"}


@app.put("/api/entries/{entry_id}")
def update_entry(entry_id: int, req: EntryRequest):
    vault = _get_vault()
    try:
        vault.update_entry(entry_id, req.website, req.username, req.password, req.profile)
        return {"status": "updated"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.delete("/api/entries/{entry_id}")
def delete_entry(entry_id: int):
    vault = _get_vault()
    vault.delete_entry(entry_id)
    return {"status": "deleted"}


# ── Utility Endpoints ───────────────────────────────────────

@app.post("/api/generate-password")
def gen_password(req: GeneratePasswordRequest):
    pwd = generate_password(
        length=req.length,
        use_uppercase=req.use_uppercase,
        use_digits=req.use_digits,
        use_special=req.use_special,
    )
    return {"password": pwd}


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
