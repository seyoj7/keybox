import "server-only";
import { decrypt, encrypt } from "./crypto";
import * as db from "./db";

type EntryData = {
  website: string;
  username: string;
  password: string;
  profile?: string;
  icon?: string | null;
  color?: string | null;
};
export type VaultEntry = EntryData & {
  id: number;
  created_at: string;
  updated_at: string;
};

export class Vault {
  constructor(private readonly key: Uint8Array) {}

  async getEntry(id: number): Promise<VaultEntry> {
    const row = await db.getPasswordRow(id);
    if (!row) throw new Error(`Entry ${id} not found.`);
    let data: EntryData;
    try {
      data = JSON.parse(
        Buffer.from(decrypt(this.key, row.nonce, row.encrypted_data)).toString("utf8"),
      ) as EntryData;
    } catch {
      throw new Error("Data tampering detected or incorrect key!");
    }
    return {
      ...data,
      profile: data.profile ?? "Default",
      icon: data.icon ?? null,
      id,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  async listEntries(): Promise<Array<Omit<VaultEntry, "password">>> {
    const entries = await db.listPasswordRows();
    const result: Array<Omit<VaultEntry, "password">> = [];
    for (const row of entries) {
      try {
        const data = JSON.parse(
          Buffer.from(decrypt(this.key, row.nonce, row.encrypted_data)).toString("utf8"),
        ) as EntryData;
        result.push({
          id: row.id,
          website: data.website,
          username: data.username,
          profile: data.profile ?? "Default",
          icon: data.icon ?? null,
          color: data.color ?? null,
          created_at: row.created_at,
          updated_at: row.updated_at,
        });
      } catch {
        console.warn(`Warning: Entry ${row.id} is corrupted or tampered with.`);
      }
    }
    return result;
  }

  async addEntry(data: EntryData): Promise<number> {
    const encrypted = encrypt(
      this.key,
      Buffer.from(
        JSON.stringify({
          ...data,
          profile: data.profile ?? "Default",
          icon: data.icon ?? null,
        }),
      ),
    );
    return db.addPasswordRow(encrypted.ciphertext, encrypted.nonce);
  }

  async updateEntry(id: number, data: EntryData): Promise<void> {
    await this.getEntry(id);
    const encrypted = encrypt(
      this.key,
      Buffer.from(
        JSON.stringify({
          ...data,
          profile: data.profile ?? "Default",
          icon: data.icon ?? null,
        }),
      ),
    );
    await db.updatePasswordRow(id, encrypted.ciphertext, encrypted.nonce);
  }

  async deleteEntry(id: number): Promise<void> {
    await db.deletePasswordRow(id);
  }
}
