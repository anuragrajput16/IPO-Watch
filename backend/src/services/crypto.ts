import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { env } from "../config/env.js";

const KEY = Buffer.from(env.PAN_ENCRYPTION_KEY, "hex");

/** AES-256-GCM. Stored as iv:tag:ciphertext, all base64. */
export function encryptPan(pan: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([cipher.update(pan.toUpperCase(), "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), enc.toString("base64")].join(":");
}

export function decryptPan(stored: string): string {
  const [ivB64, tagB64, dataB64] = stored.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("malformed encrypted PAN");
  const decipher = createDecipheriv("aes-256-gcm", KEY, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

/** Deterministic HMAC so a PAN can be matched for uniqueness without decrypting. */
export function hashPan(pan: string): string {
  return createHmac("sha256", env.PAN_HASH_SECRET).update(pan.toUpperCase()).digest("hex");
}

/** What the UI shows when PANs are masked: the last four characters. */
export function panLast4(pan: string): string {
  return pan.toUpperCase().slice(-4);
}

export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 12);
}
export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

export function randomToken(): string {
  return randomBytes(48).toString("base64url");
}
export function sha256(v: string): string {
  return createHmac("sha256", env.JWT_REFRESH_SECRET).update(v).digest("hex");
}
