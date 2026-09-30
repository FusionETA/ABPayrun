import { serve } from "@hono/node-server"
import { serveStatic } from "@hono/node-server/serve-static"
import { Hono } from "hono"

import { config } from "./config"
import { migrate } from "./db"
import type { AppEnv } from "./lib/hono-env"
import { onError } from "./middleware/error"
import { authRoutes } from "./routes/auth.routes"
import { companiesRoutes } from "./routes/companies.routes"
import { importsRoutes } from "./routes/imports.routes"
import { runsRoutes } from "./routes/runs.routes"

const app = new Hono<AppEnv>()
app.onError(onError)

// Static assets (logo, etc.) served from ./public
app.use("/public/*", serveStatic({ root: "./" }))

// Public routes (login/logout) first, then the authenticated app.
app.route("/", authRoutes)
// DEV-ONLY preview login — never mounted in production.
if (!config.isProd) {
  const { devRoutes } = await import("./routes/dev.routes")
  app.route("/", devRoutes)
}
app.route("/", companiesRoutes)
app.route("/", runsRoutes)
app.route("/", importsRoutes)

// Ensure the schema exists before we start accepting requests.
await migrate()

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`ABPay listening on http://localhost:${info.port}`)
})
