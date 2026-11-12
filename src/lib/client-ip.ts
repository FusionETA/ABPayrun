import type { Context } from "hono"
import { getConnInfo } from "@hono/node-server/conninfo"

import { config } from "../config"

/**
 * The visitor's IP. Behind one reverse proxy (config.trustProxy) it is the
 * LAST X-Forwarded-For hop — the one the proxy appended; earlier hops are
 * whatever the visitor sent. With nothing in front, it is the connection.
 * Null when neither says.
 */
export function clientIp(c: Context): string | null {
  if (config.trustProxy) {
    const hops = (c.req.header("x-forwarded-for") ?? "")
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean)
    if (hops.length > 0) return hops[hops.length - 1] ?? null
  }
  try {
    return getConnInfo(c).remote.address ?? null
  } catch {
    return null
  }
}
