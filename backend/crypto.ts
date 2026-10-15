import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { argon2id } from "hash-wasm";

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
