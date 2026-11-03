import { getCookie } from "hono/cookie"
import { createMiddleware } from "hono/factory"

import { config } from "../config"
import type { AppEnv } from "../lib/hono-env"
import { readSession } from "../lib/jwt"
import { loadAccess } from "../services/access.service"

/**
 * Gate a route behind a valid ABPay session. Reads + verifies the JWT
 * cookie and stashes the payload on `c.get("user")`, and what that person
 * may reach in AltomateHR on `c.get("access")`. Redirects to /login when
 * the session is missing or invalid.
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, config.sessionCookie)
  const session = token ? await readSession(token) : null
  if (!session) {
    return c.redirect("/login")
  }
  c.set("user", session)
  c.set("access", await loadAccess(session))
  await next()
})
