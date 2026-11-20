import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { settings } from "./config";

export function encrypt(data: Uint8Array, context: string): string {
  const { keys, ACTIVE_KEY_ID: keyId } = settings();
  const key = keys.get(keyId);
  if (!key) {
    throw new Error("Encryption key unavailable");
  }
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  return [
    keyId,
    nonce.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decrypt(envelope: string, context: string): Buffer {
  const [keyId, nonce, tag, ciphertext] = envelope.split(".");
  const key = settings().keys.get(keyId);
  if (!key) {
    throw new Error("Decryption key unavailable");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(nonce, "base64url"),
  );
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]);
}

export function newSecret() {
  return randomBytes(32).toString("base64url");
}
