# Security Model & Audit Baseline

Threat model and standing security checklist for Ensemble. Rewritten 2026-09-23 (#1386) on the v2 music stand and its account API, after the cutover (#1357) and the deletion of the v1 app (#1358); the 2026-05-30 baseline described that deleted app. Future `/security-review` runs on a diff should check changes against the surface map and standing rules below.

## Threat model: an offline-first static app plus one small account API

Ensemble is two deployable parts on one origin (`ensemble.brndn.zip`), both released as container images on `docker04` (DOCTRINE §6):

- **The stand** (`prototypes/v2/`): a Next.js static export served by unprivileged nginx (`hosting/web/`), installable and fully playable offline. It compiles the engine library in `public/`. Guest use sends nothing to any server.
- **The account API** (`prototypes/v2-api/`, behind `/api/*`): a Node service with its own `node:sqlite` database — passkey sign-in, sessions, recovery codes, and explicit-Save sync of a user's songbook. Accounts are optional; losing the API never stops the band.

So the server-side classes are **in scope for the API only**: authentication and session handling, authorization (one account reading or writing another's songs), injection into SQLite, request forgery, abuse and resource exhaustion. The stand's attack surface stays client-side: untrusted input (share links, imported files, v1 browser data) reaching a dangerous sink, the service worker's cache and scope, and supply chain.

Network egress from the stand is same-origin only for everything but analytics: static assets, sound packs, and `/api/*` for a signed-in account. **Analytics (#1389)** load one cross-origin script, `https://umami.brndn.zip/telemetry.js`, only in a production build (`NEXT_PUBLIC_TELEMETRY=1`, set for the one `ensemble-web` image released to both prod and ensembletest) on the canonical host (`ensemble.brndn.zip` — the hostname check is what keeps ensembletest silent, since it runs the same image). Every payload carries `url: location.pathname` and `referrer: ''`, and only the allow-listed event vocabulary in `prototypes/v2/lib/telemetry.ts` — never a chart title, chord content, account id or email. `data-do-not-track="true"`, `autoTrack`/`autoPageview` off, `referrerPolicy: strict-origin`. The tracker is optional: a blocked or failed script never affects the app, and it is never precached by the service worker, so an offline visit sends nothing.

## Attack-surface map

| Surface | Defending code | Status |
| :- | :- | :- |
| Account API — passkey ceremonies, sessions, step-up re-auth | `prototypes/v2-api/src/auth/` (`registration.ts`, `login.ts`, `session.ts`, `fresh-auth.ts`, `request-guard.ts`), `src/http/` (`same-origin.ts`, `cookies.ts`, `headers.ts`) | **Reviewed** in the stories that built it (#1188–#1190; see `prototypes/v2-api/README.md`). Single canonical origin and RP ID, fail-closed same-origin guard (`Sec-Fetch-Site`/`Origin`/`Referer`, never `hono/csrf`), `HttpOnly` `SameSite=Strict` `__Host-` cookies, 32-byte session tokens stored only as SHA-256, absolute 30-day expiry, fixation defense, collapsed `401` error taxonomy, runtime shape guard before any bind parameter. |
| Account API — recovery codes | `src/auth/recovery.ts`, `recovery-material.ts` | **Reviewed** (#1191). Single-use codes behind a restricted recovery-only session that cannot read the library. |
| Account API — library, Save, delete, account deletion | `src/http/app.ts` and the library/save/delete modules (README §§ #1202, #1259, #1260, #1271) | **Reviewed** per story. Owner-scoped queries, idempotent owner-bound receipts, body limits on every mutation (64 KB; Save and delete carry their own bounds), JSON-only mutation routes, fresh-auth gate on account deletion. |
| Account API — abuse and capacity | `src/http/rate-limit-guard.ts`, `src/auth/rate-limit.ts`, `DEFAULT_REGISTRATION_CAP` (`src/auth/registration.ts`) | **Partly open.** Transport rate limit (300/min) and ceremony limits are in place; registration is capped at 25 accounts (#1272). The on-host disk alert that was the other half of #1272 is not built yet (plan on #1272). |
| `#chart=` share links | `public/songbook/chart-link.ts` (`decodeChartLink`), the shared-link effect in `prototypes/v2/app/ensemble.tsx` | **Defended.** Size-bounded decode (200,000 encoded characters), then the canonical document validators (`validateChartDocument`/`validateChartDocumentV2`); a bad payload is an error message, never a throw into the UI. Opens as an unsaved draft; nothing is written. |
| Old v1 `?s=` share links | `prototypes/v2/lib/v1-link.ts`, `public/state/share-codec.ts` (decode only) | **Defended, one open hardening item:** #1132 (`normalizeKey` prototype lookup, and `section.key` skipping the key-membership check on this path). Harmless at today's call sites. |
| v1 browser-data import | `prototypes/v2/lib/import-v1.ts` | **Defended.** Read-only `getItem` view of `ensemble_*`; v1's own normalizers, then the canonical codec; never writes back to a v1 key. **Not separately security-reviewed.** |
| iReal Pro and chart-file import | `prototypes/v2/lib/import-document.ts`, `app/import-dialog.tsx`, `public/songbook/` parsers | Parsed into the semantic score and validated before use; the original text is kept verbatim as data (`importSource`), never interpreted as markup. **Not separately security-reviewed.** |
| HTML sinks in the stand | React's default escaping; the one `dangerouslySetInnerHTML` is `app/layout.tsx`'s constant theme script | **Clean.** No user-derived value reaches an HTML sink. |
| Response headers | `hosting/web/nginx.conf` (`nosniff`, `Referrer-Policy`, `frame-ancestors 'none'`), edge Caddy (HSTS), API `src/http/headers.ts` | **Gap: no script/connect CSP.** The stand ships no `Content-Security-Policy` beyond `frame-ancestors`, and `nginx.conf`'s comment wrongly says the app's own `<meta>` CSP covers it — that meta tag left with v1's `index.html`. Filed as #1395 (F8). |
| Service worker and offline cache | `prototypes/v2/scripts/offline.mjs` (generated worker), the `/v2/sw.js` tombstone | **Reviewed** in #1355, including the open-redirect fix (origin re-check on the tombstone's forward). The worker excludes `/api` explicitly and never caches private API responses or personalized HTML. |
| Account-local storage | `prototypes/v2/lib/sync/` (IndexedDB), `lib/account/` | Local owner/generation fence, **not** authentication (`AccountScope`); authorization comes only from the verified server session. Sign-out clears local account data once the server confirms revocation. |
| Web MIDI | `public/controllers/midi-controller.ts` | **Not exposed in v2** — the stand never calls it. (MIDI *export* is a file download.) |
| Analytics egress | `prototypes/v2/lib/telemetry.ts`, gated in `next.config.mjs` (`NEXT_PUBLIC_TELEMETRY`) | **Defended.** Production-build + canonical-hostname gate; allow-listed typed events only, pathname-only `url`, always-empty `referrer`. The one test-only escape hatch (`window.__ENSEMBLE_TELEMETRY_TEST_OVERRIDE__`) is set by Playwright's `page.addInitScript`, never reachable from a URL/hash/query string. |
| Supply chain | `package.json` (preact, @preact/signals, deepsignal), `prototypes/v2/package.json` (next, react, react-dom, @simplewebauthn/browser), `prototypes/v2-api/package.json` (hono, @hono/node-server, @simplewebauthn/server) | Small. Locked installs (`npm ci`) everywhere in CI; `/dep-update` is the maintenance path. |
| CI and release | `.github/workflows/ci.yml`, the `ensemble-release` forced-command account (homelab-maintenance) | Workflow-level `permissions:` with per-job widening only where an image is pushed; images pushed to GHCR; a release is one forced command accepting only `release <stack> <web|api> sha-<40 hex>`, reached over the tailnet — no general shell and no root. |

## Findings

**Closed since the 2026-05-30 baseline:** F1 and F2 (the `ManualModal` markdown sink and its metadata injection) were deleted with the v1 UI (#1358). F3 (`npm ci`), F4 (`permissions:`), F5 (headers from the web server) and F6 (deploy as root → forced-command release account) are done.

**Open:**

- **F7 (Optional) — GitHub Actions pinned to major-version tags.** Unchanged: SHA-pinning third-party actions (`docker/*`, `tailscale/github-action`) is the supply-chain ideal; lower priority for first-party `actions/*`.
- **F8 (Hardening) — the stand ships no script/connect CSP.** Filed as #1395. A CSP is the second line behind React's escaping; adding one must account for Next's inline bootstrap scripts, the constant theme script, the workers and analytics' `umami.brndn.zip` origin (#1389, live on prod since this landed).
- **#1132** — the v1-link key hardening above.
- **#1272** — the disk alert above.

## Standing rules for future changes (check on every diff)

1. **Any new URL fragment/param, imported format or persisted field** is validated before it reaches state or storage: route it through the canonical codecs (`public/songbook/`), allowlist enums, bound numbers and lengths. Never `dispatch` or save a raw decoded value.
2. **No new `dangerouslySetInnerHTML`** without a note on why its input is trusted; prefer React's default escaping. No user-derived value in an HTML sink, ever.
3. **No new network egress** (`fetch`, `WebSocket`, `sendBeacon`, a third-party script) without an explicit reason; update the CSP once F8 lands. Chart contents, titles and account identifiers never leave the device except to the user's own account API.
4. **API changes keep the guards:** same-origin and JSON-only on every mutation, owner-scoped queries, the collapsed error taxonomy, and a fresh-auth check on anything destructive to an account. Auth, ownership or concurrency changes get an independent correctness and security review (`prototypes/v2/CLAUDE.md` § Verification).
5. **The service worker never caches** `/api/*`, a private response, or personalized HTML.
6. **No secrets in the repo or CI logs**; the release key stays a forced command.
7. **Keep `npm audit` clean** in all three packages — `/dep-update` is the maintenance path.
