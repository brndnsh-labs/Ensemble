- **No `reopen` verb** — `issue edit` has no `--state` flag. To reopen: PATCH the API
  directly (`curl -X PATCH .../issues/<n> -d '{"state":"open"}'`, same token auth).
- **Verify a body actually landed before trusting `Closes #<n>` to fire** — an
  unexpected empty body means a flag got silently dropped upstream, not that Forgejo's
  auto-close is broken. Check with `pr view`/`issue view` (both include `body`) before
  assuming the service is at fault. `forgejo-merge.mjs` also closes referenced issues
  itself after a successful merge, independent of Forgejo's native close.
- **No job-log API on this Forgejo build** — every documented `/actions/.../logs` route
  404s even with a valid token. Logs come from `ci-logs` (wraps `fj-ex`, scrapes the web
  UI with a session cookie); `ci-logs --failed` / `ci-logs <run> <job>` / `ci-logs --list`.
