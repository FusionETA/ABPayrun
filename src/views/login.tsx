export function LoginPage({ error, email }: { error?: string; email?: string }) {
  return (
    <div class="flex min-h-[82vh] flex-col items-center justify-center">
      {/* Brand: AltomateHR logo + wordmark, with the ABPay sub-header */}
      <div class="mb-8 flex flex-col items-center text-center">
        <img
          src="/public/brand-icon.png"
          alt="AltomateHR"
          width="72"
          height="72"
          class="h-[72px] w-[72px] object-contain drop-shadow-[0_10px_22px_rgba(76,26,134,.28)]"
        />
        <div class="mt-3.5 text-[1.6rem] font-extrabold leading-none tracking-tight text-brand">
          AltomateHR
        </div>
        <div class="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          <span class="text-brand">ABPay</span> · Payroll import
        </div>
      </div>

      {/* Login card */}
      <form
        method="post"
        action="/login"
        class="w-full max-w-sm rounded-3xl border border-white/70 bg-white/80 p-7 shadow-[0_24px_70px_-24px_rgba(76,26,134,.30)] backdrop-blur-xl"
      >
        <h1 class="text-lg font-extrabold text-ink">Login Portal</h1>
        <p class="mt-1 text-sm text-muted">Use your assigned account to continue.</p>

        {error ? (
          <div class="mt-4 flex items-center gap-2 rounded-2xl border border-red-200/70 bg-red-50/80 px-3.5 py-2.5 text-sm font-medium text-red-700">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="h-4 w-4 shrink-0"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            {error}
          </div>
        ) : null}

        <div class="mt-5">
          <label class="mb-1.5 block text-sm font-semibold text-ink" for="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            value={email ?? ""}
            autocomplete="username"
            placeholder="you@company.com"
            class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-ink outline-none transition placeholder:text-muted/50 focus:border-brand focus:ring-4 focus:ring-brand/15"
          />
        </div>

        <div class="mt-4">
          <label class="mb-1.5 block text-sm font-semibold text-ink" for="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autocomplete="current-password"
            placeholder="Enter your password"
            class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-ink outline-none transition placeholder:text-muted/50 focus:border-brand focus:ring-4 focus:ring-brand/15"
          />
        </div>

        <button
          type="submit"
          class="press mt-6 flex w-full items-center justify-between rounded-2xl bg-brand px-5 py-3 text-sm font-bold text-white shadow-lg shadow-brand/30 hover:bg-[#3f1670]"
        >
          <span>Login</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="h-4 w-4"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </form>

      <p class="mt-5 text-center text-xs text-muted">Secured with your AltomateHR credentials</p>
    </div>
  )
}
