# Security Model & Audit Baseline

Threat model and standing security checklist for Ensemble. Written 2026-05-30 as a general best-practices audit (not tied to a specific change). Future `/security-review` runs on a diff should check changes against the surface map and standing rules below.

## Threat model: this is a static client-side PWA

Ensemble has **no backend**. It is a Vite-built static bundle deployed by `rsync` to a web root (`scripts/deploy-{prod,test}.sh`). There is no server process, database, authentication, session, or server-held secret. Consequently the classic server-side threat classes are **out of scope by construction**: SQL/command injection, SSRF, auth bypass, IDOR, server-side secret leakage.

The real attack surface is **client-side**: untrusted input reaching a dangerous browser sink, supply-chain, and the PWA/deploy pipeline. The app makes **no network egress** beyond a same-origin `fetch('MANUAL.md')` — no telemetry, no third-party calls, no WebSocket.

## Attack-surface map

| Surface | Files | Status |
| :- | :- | :- |
| Share-URL / persisted-state deserialization | `state-hydration.ts`, `sharing.ts`, `utils.ts` (`compress/decompressSections`) | **Well defended.** Allowlists + `clamp()` + length caps + schema validation on every field; 100KB payload cap against memory exhaustion. |
| The one HTML-injection sink | `components/ManualModal.tsx` (`dangerouslySetInnerHTML`), `utils/manual-metadata.ts` | **Defended (defense-in-depth).** Input is same-origin static (`MANUAL.md` + repo config), not user-controlled at runtime; `escapeHTML` runs before markdown transforms; link schemes blocked. See F1/F2. |
| Content-Security-Policy | `public/index.html` `<meta>` | **Strong but `<meta>`-only.** `script-src 'self'`, `object-src 'none'`, `base-uri 'self'`. Cannot carry `frame-ancestors`/HSTS — see F5. |
| Service worker (PWA cache) | `public/sw.ts` | **Clean.** Workbox precache + `cleanupOutdatedCaches`; standard `SKIP_WAITING`/`clients.claim`. |
| Web MIDI | `midi-controller.ts` | Low risk — permission-gated, local devices, no data egress. |
| Supply chain | `package.json`, `package-lock.json` | **Small & clean.** 3 runtime deps (preact, @preact/signals, deepsignal); `npm audit` = 0 vulnerabilities. Dependabot + weekly `npm update` (`/dep-update`). |
| CI / deploy | `.github/workflows/ci.yml`, `scripts/deploy-*.sh` | Deploy is **local rsync** — no deploy creds in CI. Hardening items F3/F4/F6. |

## Findings (2026-05-30)

No high-severity issues. The codebase is security-conscious. Items below are hardening / defense-in-depth.

- **F1 (Low) — `simpleMarkdown` link href emits the unvalidated value.** `ManualModal.tsx:37-45` validates `cleanUrl` (lowercased, control-chars stripped) against `javascript:`/`data:`/`vbscript:`, but emits the raw `url` in the `href`. Mitigated today (link text is `escapeHTML`'d before the regex, and `MANUAL.md` is not user-controlled), but the validate-one-value / emit-another mismatch is fragile if the manual ever becomes user-supplied. Fix: emit the validated value.
- **F2 (Low) — metadata injected after escaping.** `injectManualMetadata` runs *after* `simpleMarkdown` (intentional ordering, documented in-code), so its HTML tables bypass `escapeHTML`. Safe only because the metadata derives from repo config (genre/style names). If any injected value ever derives from user input, it becomes an injection point.
- **F3 (Hardening) — CI uses `npm install`, not `npm ci`.** `ci.yml` re-resolves deps and can drift from the lockfile. `npm ci` gives reproducible, lockfile-pinned installs and fails on drift.
- **F4 (Hardening) — no `permissions:` block in the workflow.** `GITHUB_TOKEN` defaults broader than needed. Add `permissions: { contents: read }` at the top of `ci.yml`.
- **F5 (Hardening) — CSP is `<meta>`-only.** `frame-ancestors` (clickjacking), HSTS, and `X-Content-Type-Options: nosniff` cannot be delivered via `<meta>` — they require HTTP response headers from the static host (nginx/apache). Document and configure these at the web-server layer; this is the single biggest best-practices gap for a deployed web app.
- **F6 (Hardening) — deploy runs as `root@`.** `deploy-*.sh` rsync over SSH as root. A dedicated deploy user scoped to the web root reduces blast radius. (SSH creds are correctly *not* in the repo.)
- **F7 (Optional) — GitHub Actions pinned to major-version tags.** SHA-pinning third-party actions is the supply-chain-hardening ideal; lower priority for first-party `actions/*`.

## Standing rules for future changes (check on every diff)

1. **Any new URL param / persisted field** must be validated before it reaches state: allowlist enums, `clamp()` numbers, cap string length, `stripDangerousChars`/`escapeHTML` free text. Never `dispatch` a raw decoded value. (Pattern: `state-hydration.ts`.)
2. **No new `dangerouslySetInnerHTML`** without an escaping/sanitizing step on the input and a note on why the input is trusted. Prefer Preact's default text escaping.
3. **No new network egress** (`fetch`, `WebSocket`, `sendBeacon`) without an explicit reason — it widens `connect-src` and the privacy surface. Update the CSP if added.
4. **No secrets in the repo or CI** — deploy credentials stay in local SSH config.
5. **Keep `npm audit` clean** — `/dep-update` is the maintenance path.
