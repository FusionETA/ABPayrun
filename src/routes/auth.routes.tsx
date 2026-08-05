import { Hono } from "hono"
import { deleteCookie, setCookie } from "hono/cookie"

import { config } from "../config"
import { issueSession, sessionTtlSeconds } from "../lib/jwt"
import { login, type AltomateUser } from "../services/auth.service"
import { syncOwnerCompanies } from "../services/company.service"
import { Layout } from "../views/layout"
import { LoginPage } from "../views/login"

export const authRoutes = new Hono()

/**
 * Map a `?error=` code to a human message. POST /login redirects here on
 * failure (POST-Redirect-GET) so refreshing the page can't re-submit the
 * form — and so the email/password never linger in a re-postable request.
 * Codes only (no PII) travel in the URL.
 */
function loginErrorMessage(code: string | undefined): string | undefined {
  switch (code) {
    case "missing":
      return "Enter your email and password."
    case "invalid":
      return "Invalid email or password."
    case "credential":
      return "ABPay can't authenticate to AltomateHR — its access credential was rejected (invalid or revoked). Refresh ABPay's credential, then try again."
    case "unreachable":
      return "Couldn't reach AltomateHR. Please try again."
    default:
      return undefined
  }
}

authRoutes.get("/login", (c) => {
  const error = loginErrorMessage(c.req.query("error"))
  return c.html(
    <Layout title="Sign in" bare>
      <LoginPage error={error} />
    </Layout>,
  )
})

authRoutes.post("/login", async (c) => {
  const form = await c.req.parseBody()
  const email = String(form.email ?? "").trim()
  const password = String(form.password ?? "")

  if (!email || !password) {
    return c.redirect("/login?error=missing")
  }

  let user: AltomateUser | null
  try {
    user = await login(email, password)
  } catch (err) {
    console.error("[abpay] login failed (AltomateHR):", err)
    const code =
      err instanceof Error && /access credential/i.test(err.message)
        ? "credential"
        : "unreachable"
    return c.redirect(`/login?error=${code}`)
  }

  if (!user) {
    return c.redirect("/login?error=invalid")
  }

  const token = await issueSession(user)
  setCookie(c, config.sessionCookie, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: config.isProd,
    path: "/",
    maxAge: sessionTtlSeconds,
  })

  // Pull the owner's AltomateHR companies into ABPay so they can connect a
  // token to each. Best-effort — login still succeeds if the sync fails.
  try {
    await syncOwnerCompanies(user.organizations)
  } catch (err) {
    console.error("[abpay] syncOwnerCompanies failed:", err)
  }

  return c.redirect("/companies")
})

authRoutes.post("/logout", (c) => {
  deleteCookie(c, config.sessionCookie, { path: "/" })
  return c.redirect("/login")
})
