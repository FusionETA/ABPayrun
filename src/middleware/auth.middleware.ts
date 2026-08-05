import { getCookie } from "hono/cookie"
import { createMiddleware } from "hono/factory"

import { config } from "../config"
import type { AppEnv } from "../lib/hono-env"
import { readSession } from "../lib/jwt"

/**
 * Gate a route behind a valid ABPay session. Reads + verifies the JWT
 * cookie and stashes the payload on `c.get("user")`. Redirects to /login
 * when it's missing or invalid.
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, config.sessionCookie)
  const session = token ? await readSession(token) : null
  if (!session) {
    return c.redirect("/login")
  }
  c.set("user", session)
  await next()
})
