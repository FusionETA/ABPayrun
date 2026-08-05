import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

import { config } from "../config"

/**
 * AES-256-GCM encryption for secrets stored at rest (the per-company
 * wp_live_* tokens). Key comes from TOKEN_ENC_KEY (64 hex chars = 32
 * bytes). Format of the stored string: `ivHex:tagHex:cipherHex`.
 */
const key = Buffer.from(config.tokenEncKey, "hex")

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`
}

export function decryptSecret(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(":")
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error("Malformed encrypted secret.")
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"))
  decipher.setAuthTag(Buffer.from(tagHex, "hex"))
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]).toString("utf8")
}
