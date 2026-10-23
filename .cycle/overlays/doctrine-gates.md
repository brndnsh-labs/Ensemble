`npm test`, `npm run test:browser` and the v2 suite (`npm run test:e2e --prefix
web`) are three separate runners (node · browser-audio · the app's Playwright);
`npm run ci` covers only the first. `npm run validate` (format + jscpd + `npm run ci`:
typecheck, typecheck:tests, knip, `npm test`) is the full sweep — run it before shipping
a change that touches more than one file. CI runs `checks`, `e2e-tests` (browser-mode audio guards +
`test:sync`) and `v2-checks` in parallel; all three must be green to merge.

**The CI gate `validate` does NOT cover — run it locally before shipping:**
- **The v2 suite, for any diff under `core/`** (not just `web/`): the v2 export
  compiles `core/` and its checks drive the shared controllers, codecs and engine, and
  `v2-checks` is a required context. `npm run build --prefix web` then
  `(cd web && npx playwright test)` — build FIRST, or the suite runs a stale export.

Run the gates **sequentially from the repo root** and log an exit code per gate. The shell is
zsh: an unquoted `$cmd` holding a command string never word-splits, so a loop over gate strings
exits 127 on every one — "never ran", which a piped `tail` reports as a pass.

**Track-specific DoD on top of the gates:**
- **musical** → run the band critique for the style
  (`npx vitest run band/test/critique.test.ts -t <style>`) and read its report for balance.
  A new musical bias without a passing critique claim is not done.
- **synth** → the human listen on the deployed test build IS the gate — `/cycle`'s Ship step deploys
  the branch to test with the merge held (never queued unheard), not a local harness.
- **bundle** → a measured KB delta **and** the full suite green.

**Repo-specific gotchas the gates enforce:**
- A new `core/engine/*.ts` file must be registered in `AI_MAP.md` or the pre-commit
  docs-lint hook blocks the commit — add the row when staging.
- `// @direct-mutation` is only sanctioned in the three categories in `CLAUDE.md`
  (real-time hot paths, init-only, detached render clone). Everywhere else
  routes through `dispatch` — `state-discipline-reviewer` enforces it.
