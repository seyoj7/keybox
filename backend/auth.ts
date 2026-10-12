import "server-only";
import {
  decrypt,
  deriveKey,
  encrypt,
  generateSalt,
} from "./password_generator";
import * as db from "./db";
import { Vault } from "./vault";

export async function isVaultInitialized(): Promise<boolean> {
  if (!(await db.statusDatabaseFound())) return false;
  try {
    return (await db.getMetadata("master_salt")) !== null;
  } catch {
    return false;
  }
}

export async function setupVault(password: string): Promise<void> {
  await db.ensureDatabase();
  if (await db.getMetadata("master_salt"))
    throw new Error("Vault is already initialized.");
  const salt = generateSalt();
  const key = await deriveKey(password, salt);
  const { ciphertext, nonce } = encrypt(key, Buffer.from("KeyboxVerification"));
  await db.saveMetadata("master_salt", salt);
  await db.saveMetadata("verification_nonce", nonce);
  await db.saveMetadata("verification_token", ciphertext);
  key.fill(0);
}

export async function unlockVault(password: string): Promise<Uint8Array> {
  if (!(await isVaultInitialized())) throw new Error("Vault is not initialized.");
  const salt = await db.getMetadata("master_salt");
  const nonce = await db.getMetadata("verification_nonce");
  const token = await db.getMetadata("verification_token");
  if (!salt || !nonce || !token) throw new Error("Vault is not initialized.");
  const key = await deriveKey(password, salt);
  try {
    if (Buffer.from(decrypt(key, nonce, token)).toString("utf8") !== "KeyboxVerification")
      throw new Error("Invalid master password.");
  } catch {
    key.fill(0);
    throw new Error("Invalid master password.");
  }
  return key;
}

export async function changeMasterPassword(
  oldPassword: string,
  newPassword: string,
): Promise<void> {
  const oldKey = await unlockVault(oldPassword);
  try {
    const oldVault = new Vault(oldKey);
    const entries = await Promise.all(
      (await oldVault.listEntries()).map(({ id }) => oldVault.getEntry(id)),
    );
    const salt = generateSalt();
    const newKey = await deriveKey(newPassword, salt);
    const verification = encrypt(newKey, Buffer.from("KeyboxVerification"));
    await db.saveMetadata("master_salt", salt);
    await db.saveMetadata("verification_nonce", verification.nonce);
    await db.saveMetadata("verification_token", verification.ciphertext);
    for (const entry of entries) {
      const payload = Buffer.from(
        JSON.stringify({
          website: entry.website,
          username: entry.username,
          password: entry.password,
          profile: entry.profile ?? "Default",
          icon: entry.icon ?? null,
          color: entry.color,
        }),
      );
      const encrypted = encrypt(newKey, payload);
      await db.updatePasswordRow(entry.id, encrypted.ciphertext, encrypted.nonce);
    }
    newKey.fill(0);
  } finally {
    oldKey.fill(0);
  }
}
