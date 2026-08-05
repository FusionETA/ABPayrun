import type { ErrorHandler } from "hono"

/** Last-resort error handler — logs the error and returns a plain 500. */
export const onError: ErrorHandler = (err, c) => {
  console.error("[abpay] unhandled error:", err)
  return c.html(
    `<!doctype html><meta charset="utf-8"><title>Error · ABPay</title>
     <div style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:1.5rem">
       <h1 style="font-size:1.25rem;margin:0 0 .5rem">Something went wrong</h1>
       <p style="color:#64748b;margin:0">An unexpected error occurred. Please try again.</p>
     </div>`,
    500,
  )
}
