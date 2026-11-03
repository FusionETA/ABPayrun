import type { Access } from "../services/access.service"
import type { SessionPayload } from "./jwt"

/**
 * Hono type env — makes `c.get("user")` / `c.set("user", …)` type-safe.
 * `user` is populated by the requireAuth middleware.
 */
export type AppEnv = {
  Variables: {
    user: SessionPayload
    /** What the signed-in person may reach (AltomateHR Manage access). */
    access: Access
  }
}
