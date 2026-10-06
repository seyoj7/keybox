import uvicorn
import os
import hmac
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from starlette.responses import JSONResponse
from auth import unlock_vault, is_vault_initialized, setup_vault, change_master_password
from vault_database import Vault
from password_generator import generate_password

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
_api_token = os.environ.get("KEYBOX_API_TOKEN")
_require_api_token = True


@app.middleware("http")
async def require_keybox_process(request: Request, call_next):
    if _require_api_token:
        if not _api_token:
            return JSONResponse(
                status_code=503,
                content={"detail": "The Keybox session is not initialized."},
            )
        supplied_token = request.headers.get("x-keybox-token", "")
        if not hmac.compare_digest(supplied_token, _api_token):
            return JSONResponse(
                status_code=401,
                content={"detail": "This local service only accepts requests from Keybox."},
            )
    return await call_next(request)

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

class DbLocationRequest(BaseModel):
    new_path: str

class LocateDatabaseRequest(BaseModel):
    path: Optional[str] = None

class EntryRequest(BaseModel):
    website: str
    username: str
    password: str
    profile: str = "Default"
    icon: Optional[str] = None

class GeneratePasswordRequest(BaseModel):
    length: int = 16
    use_uppercase: bool = True
    use_digits: bool = True
    use_special: bool = True


# ── Auth Endpoints ───────────────────────────────────────────

@app.get("/api/status")
def get_status():
    import vault_database as database

    database_found = os.path.isfile(database.DB_PATH)
    if not database_found:
        return {"initialized": False, "database_found": False}
    initialized = is_vault_initialized()
    return {
        "initialized": initialized,
        "database_found": database_found,
    }


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
            raise ValueError("Vault is not initialized.")
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
    entry_id = vault.add_entry(req.website, req.username, req.password, req.profile, req.icon)
    return {"id": entry_id, "status": "created"}


@app.put("/api/entries/{entry_id}")
def update_entry(entry_id: int, req: EntryRequest):
    vault = _get_vault()
    try:
        vault.update_entry(entry_id, req.website, req.username, req.password, req.profile, req.icon)
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


@app.get("/api/db-location")
def get_db_location():
    import vault_database as database
    return {"path": database.DB_PATH}


@app.post("/api/db-location")
def set_db_location(req: DbLocationRequest):
    import vault_database as database
    try:
        database.change_db_location(req.new_path)
        return {"status": "success", "path": database.DB_PATH}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/db-location/locate")
def locate_database(req: LocateDatabaseRequest = LocateDatabaseRequest()):
    import vault_database as database

    try:
        selected_path = req.path
        if not selected_path:
            import tkinter as tk
            from tkinter import filedialog

            picker = tk.Tk()
            picker.withdraw()
            picker.attributes('-topmost', True)
            selected_path = filedialog.askopenfilename(
                title='Locate your Keybox database',
                filetypes=[('Keybox database', 'keybox.db'), ('SQLite database', '*.db')],
            )
            picker.destroy()
        if not selected_path:
            raise HTTPException(status_code=400, detail='No database was selected.')

        database.select_database_file(selected_path)
        return {"status": "success", "path": database.DB_PATH}
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000, reload=False)
