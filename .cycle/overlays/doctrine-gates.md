**The gate list (Brandon, 2026-09-27) — the one list; root `CLAUDE.md` and `web/CLAUDE.md` point here:**
- **Every change:** `npm run typecheck`, `npm run typecheck:tests`, `npm test`, `npm run lint`,
  `npm run knip`.
- **A change that reaches the app** (anything outside the `changes` job's docs/tests list in
  `ci.yml`, `core/**` included — the v2 export compiles it): also `npm run build --prefix web`,
  then only the Playwright specs the change touches (`(cd web && npx playwright test
  checks/<spec>.spec.ts)`) — build FIRST, or the suite runs a stale export. A timing-sensitive
  spec runs twice (`--repeat-each=2`).
- **CI runs the full v2 suite.** Don't run the full local e2e by default.
- **Extras, by what the change touches:**
  - an IndexedDB or sync change → `npm run test:sync`, and register a new sync browser file in
    its config (`vitest.sync.config.ts`) so both engines actually run it;
  - a Web Audio engine change → `npm run test:browser`;
  - a voice, bus, pack or master change → `npm run golden`, with `npm run golden -- --update`
    and the fingerprints committed when the change is meant.

`npm test`, `npm run test:browser` and the v2 suite (`npm run test:e2e --prefix
web`) are three separate runners (node · browser-audio · the app's Playwright);
`npm run ci` (typecheck, typecheck:tests, knip, knip:prod, `npm test`) covers only the first, and
`npm run validate` is format + jscpd + `npm run ci`. CI runs `checks`, `e2e-tests` (browser-mode audio guards +
`test:sync`) and `v2-checks` in parallel; all three must be green to merge.

Run the gates **sequentially from the repo root** and log an exit code per gate. The shell is
zsh: an unquoted `$cmd` holding a command string never word-splits, so a loop over gate strings
exits 127 on every one — "never ran", which a piped `tail` reports as a pass.

**Track-specific DoD on top of the gates:**
- **musical** → run the band critique for the style
  (`npx vitest run band/test/critique.test.ts -t <style>`) and read its report for balance.
  A new musical bias without a passing critique claim is not done. A passing one still waits for
  the pre-merge listen when the change changes the sound (§5's listening brake).
- **synth** → the human listen on the deployed test build IS the gate — `/cycle`'s Ship step deploys
  the branch to test with the merge held (never queued unheard), not a local harness.
- **bundle** → a measured KB delta **and** the full suite green.

**Repo-specific gotchas the gates enforce:**
- A new `core/engine/*.ts` file must be registered in `AI_MAP.md` or the pre-commit
  docs-lint hook blocks the commit — add the row when staging.
- `// @direct-mutation` is only sanctioned in the three categories in `CLAUDE.md`
  (real-time hot paths, init-only, detached render clone). Everywhere else
  routes through `dispatch` — `state-discipline-reviewer` enforces it.
