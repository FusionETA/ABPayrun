import { html } from "hono/html"
import type { PropsWithChildren } from "hono/jsx"

type LayoutProps = PropsWithChildren<{
  title: string
  user?: { name: string; email: string } | null
  /** Auth pages (login) render clean — no floating blobs. */
  bare?: boolean
  /** Bottom-right toast (from a ?ok=/?err= redirect). Auto-dismisses. */
  flash?: { type: "ok" | "err"; msg: string } | null
}>

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean).slice(0, 2)
  const s = parts.map((w) => w[0]?.toUpperCase() ?? "").join("")
  return s || "U"
}

/**
 * Base document. Themed to match AltomateHR (purple #4C1A86 + mint
 * #9AFAE3, Manrope, big radius) with a glassmorphism treatment:
 * frosted panels floating over soft gradient blobs. Tailwind + htmx come
 * from CDN; the theme is configured inline (fine for an internal tool —
 * vendor + compile for production later).
 */
export function Layout({ title, user, bare, flash, children }: LayoutProps) {
  return (
    <>
      {html`<!doctype html>`}
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>{title} · ABPay</title>
          <link rel="icon" type="image/png" href="/public/icon.png" />
          <link rel="apple-touch-icon" href="/public/icon.png" />
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
          <link
            href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap"
            rel="stylesheet"
          />
          <script src="https://cdn.tailwindcss.com"></script>
          <script src="https://unpkg.com/htmx.org@2.0.4"></script>
          {html`<script>
            tailwind.config = {
              theme: { extend: {
                colors: {
                  brand: '#4C1A86', mint: '#9AFAE3',
                  ink: '#1b0f2e', muted: '#6b6280',
                },
                fontFamily: { sans: ['Manrope','ui-sans-serif','system-ui','sans-serif'] },
                borderRadius: { '3xl': '1.75rem', '4xl': '2.25rem' },
              } }
            }
          </script>`}
          {html`<style>
            body{font-family:'Manrope',ui-sans-serif,system-ui,sans-serif;color:#1b0f2e;background:#f6f7f9;min-height:100vh}
            .glass{background:rgba(255,255,255,.55);backdrop-filter:blur(22px) saturate(165%);-webkit-backdrop-filter:blur(22px) saturate(165%);border:1px solid rgba(255,255,255,.6);box-shadow:0 12px 40px -10px rgba(76,26,134,.20)}
            .glass-nav{background:rgba(255,255,255,.6);backdrop-filter:blur(18px) saturate(165%);-webkit-backdrop-filter:blur(18px) saturate(165%);border-bottom:1px solid rgba(255,255,255,.55)}
            .lift{transition:transform .25s cubic-bezier(.2,.7,.3,1),box-shadow .25s ease}
            .lift:hover{transform:translateY(-3px);box-shadow:0 22px 55px -12px rgba(76,26,134,.30)}
            .press{transition:transform .12s ease,box-shadow .2s ease,background-color .2s ease}
            .press:hover{transform:translateY(-1px)}.press:active{transform:translateY(0) scale(.985)}
            .layer{position:relative;z-index:1}
            .spinner{display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.45);border-top-color:#fff;border-radius:50%;animation:spin .6s linear infinite;vertical-align:-2px;margin-right:6px}
            @keyframes spin{to{transform:rotate(360deg)}}
            @keyframes toastIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
            .toast{animation:toastIn .3s cubic-bezier(.2,.7,.3,1)}
            ::-webkit-scrollbar{width:10px;height:10px}
            ::-webkit-scrollbar-thumb{background:rgba(76,26,134,.22);border-radius:9999px;border:2px solid transparent;background-clip:content-box}
            ::-webkit-scrollbar-thumb:hover{background:rgba(76,26,134,.4);background-clip:content-box}
            @media (prefers-reduced-motion: reduce){.blob{animation:none}}
          </style>`}
        </head>
        <body>

          {user ? (
            <header class="glass-nav sticky top-0 z-20">
              <div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
                <div class="flex items-center gap-6">
                  <a href="/" class="flex items-center gap-2.5 font-bold">
                    <img src="/public/brand-icon.png" alt="AltomateHR" width="36" height="36" class="h-9 w-9 object-contain" />
                    <span class="text-ink">ABPay</span>
                  </a>
                  <nav class="hidden items-center gap-1 sm:flex">
                    <a href="/" class="rounded-xl px-3 py-1.5 text-sm font-medium text-muted transition hover:bg-white/50 hover:text-ink">
                      Dashboard
                    </a>
                    <a href="/companies" class="rounded-xl px-3 py-1.5 text-sm font-medium text-muted transition hover:bg-white/50 hover:text-ink">
                      Companies
                    </a>
                    <a href="/convert" class="rounded-xl px-3 py-1.5 text-sm font-medium text-muted transition hover:bg-white/50 hover:text-ink">
                      Convert
                    </a>
                  </nav>
                </div>
                <div class="flex items-center gap-3 text-sm">
                  <form method="post" action="/refresh">
                    <button
                      type="submit"
                      title="Refresh companies and runs from AltomateHR"
                      class="press inline-flex items-center gap-1.5 rounded-xl border border-white/70 bg-white/50 px-3 py-1.5 font-medium text-ink hover:bg-white"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        class="h-4 w-4"
                      >
                        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                        <path d="M21 3v6h-6" />
                      </svg>
                      <span class="hidden sm:inline">Refresh</span>
                    </button>
                  </form>
                  <div class="flex items-center gap-2">
                    <span class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">
                      {initials(user.name)}
                    </span>
                    <span class="hidden text-muted sm:inline">{user.name}</span>
                  </div>
                  <form method="post" action="/logout">
                    <button
                      type="submit"
                      class="press rounded-xl border border-white/70 bg-white/50 px-3.5 py-1.5 font-medium text-ink hover:bg-white"
                    >
                      Sign out
                    </button>
                  </form>
                </div>
              </div>
            </header>
          ) : null}

          <main class="layer mx-auto max-w-7xl px-6 py-10">{children}</main>

          {flash ? (
            <div
              id="abpay-toast"
              class={`toast fixed bottom-6 right-6 z-50 max-w-sm rounded-2xl border px-4 py-3 text-sm font-medium shadow-xl ${
                flash.type === "ok"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-red-200 bg-red-50 text-red-800"
              }`}
            >
              {flash.msg}
            </div>
          ) : null}

          {html`<script>
            (function(){
              var t = document.getElementById('abpay-toast');
              if(!t) return;
              setTimeout(function(){
                t.style.transition = 'opacity .4s, transform .4s';
                t.style.opacity = '0';
                t.style.transform = 'translateY(8px)';
                setTimeout(function(){ if(t) t.remove(); }, 400);
              }, 4000);
            })();
          </script>`}

          {html`<script>
            document.addEventListener('submit', function(e){
              if(!e.target || (e.target.method||'').toLowerCase()!=='post') return;
              var b = e.target.querySelector('button[type=submit]');
              if(b && !b.disabled){ b.disabled=true; b.innerHTML='<span class="spinner"></span>Please wait…'; }
            });
          </script>`}
        </body>
      </html>
    </>
  )
}
