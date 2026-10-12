import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomInt,
} from "node:crypto";
import { argon2id } from "hash-wasm";

const SPECIAL = "!@#$%^&*()_+-=[]{}|;:,.<>?";

export function generateSalt(): Uint8Array {
  return randomBytes(16);
}

export async function deriveKey(
  password: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  return argon2id({
    password,
    salt,
    parallelism: 4,
    iterations: 3,
    memorySize: 65536,
    hashLength: 32,
    outputType: "binary",
  });
}

export function encrypt(
  key: Uint8Array,
  plaintext: Uint8Array,
): { ciphertext: Uint8Array; nonce: Uint8Array } {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return { ciphertext, nonce };
}

export function decrypt(
  key: Uint8Array,
  nonce: Uint8Array,
  ciphertext: Uint8Array,
): Uint8Array {
  if (ciphertext.byteLength < 16) throw new Error("Invalid encrypted data.");
  const body = ciphertext.subarray(0, ciphertext.byteLength - 16);
  const tag = ciphertext.subarray(ciphertext.byteLength - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

export function generatePassword(
  length = 16,
  useUppercase = true,
  useDigits = true,
  useSpecial = true,
): string {
  if (!Number.isInteger(length) || length < 1 || length > 1024) {
    throw new Error("Password length must be between 1 and 1024.");
  }
  if (length < 1 + Number(useUppercase) + Number(useDigits) + Number(useSpecial)) {
    throw new Error("Password length is too short for the selected character sets.");
  }

  const groups = ["abcdefghijklmnopqrstuvwxyz"];
  if (useUppercase) groups.push("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
  if (useDigits) groups.push("0123456789");
  if (useSpecial) groups.push(SPECIAL);
  const all = groups.join("");
  const characters = groups.map((group) => group[randomInt(group.length)]);
  while (characters.length < length) characters.push(all[randomInt(all.length)]);
  for (let i = characters.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [characters[i], characters[j]] = [characters[j], characters[i]];
  }
  return characters.join("");
}
