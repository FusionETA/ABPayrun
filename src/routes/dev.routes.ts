import { Hono } from "hono"
import { setCookie } from "hono/cookie"

import { config } from "../config"
import { issueSession } from "../lib/jwt"

/**
 * DEV-ONLY routes. Mounted in index.ts ONLY when NODE_ENV !== production,
 * so this can never be reached on the Droplet.
 *
 * `/dev-login` mints a session for a fake user so you can preview the
 * authenticated UI without a real AltomateHR login (useful before the
 * /auth/verify endpoint is deployed + tokens are in place).
 */
export const devRoutes = new Hono()

devRoutes.get("/dev-login", async (c) => {
  const token = await issueSession({
    id: "dev-user",
    email: "dev@abpay.local",
    name: "Dev Preview",
    role: "OWNER",
  })
  setCookie(c, config.sessionCookie, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: config.isProd,
    path: "/",
    maxAge: 60 * 60,
  })
  return c.redirect("/companies")
})
