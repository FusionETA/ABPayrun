import { sign, verify } from "hono/jwt"

import { config } from "../config"

/** Claims carried in the ABPay session JWT. */
export type SessionPayload = {
  sub: string // AltomateHR user id
  email: string
  name: string
  role: string
  exp: number // unix seconds
}

/** Identity fields we need to mint a session. */
export type SessionUser = {
  id: string
  email: string
  name: string
  role: string
}

const SESSION_TTL_SECONDS = 60 * 60 * 8 // 8 hours

/** Sign a session JWT for a verified user. */
export async function issueSession(user: SessionUser): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
  const payload: SessionPayload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    exp,
  }
  return sign(payload, config.jwtSecret, "HS256")
}

/** Verify + decode a session JWT. Returns null on any failure/expiry. */
export async function readSession(token: string): Promise<SessionPayload | null> {
  try {
    return (await verify(token, config.jwtSecret, "HS256")) as unknown as SessionPayload
  } catch {
    return null
  }
}

export const sessionTtlSeconds = SESSION_TTL_SECONDS
