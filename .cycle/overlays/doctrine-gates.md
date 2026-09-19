`npm test`, `npm run test:browser`, `npm run test:e2e` are three separate runners
(node · browser-audio · e2e); `npm run ci` covers only the first. `npm run validate`
(typecheck + knip + jscpd + format + `npm test`) is the full sweep — run it before a
`/done` that touches more than one file. CI runs `npm test` + `npm run test:e2e` in
parallel; both must be green to merge.

**Two CI gates `validate` does NOT cover — run them locally before `/done`:**
- `npm run typecheck:tests` — the root typecheck skips `tests/`; CI's `checks` job does not.
- **The v2 suite, for any diff under `public/`** (not just `prototypes/v2/`): the v2 export
  compiles `public/` and its checks drive the shared controllers, codecs and engine, and
  `v2-checks` is a required context. `npm run build --prefix prototypes/v2` then
  `(cd prototypes/v2 && npx playwright test)` — build FIRST, or the suite runs a stale export.

Run the gates **sequentially from the repo root** and log an exit code per gate. The shell is
zsh: an unquoted `$cmd` holding a command string never word-splits, so a loop over gate strings
exits 127 on every one — "never ran", which a piped `tail` reports as a pass.

**Track-specific DoD on top of the gates:**
- **musical** → run the matching critique test
  (`npx vitest run tests/standards/<…>-critique.test.ts`) and read its Critique Report
  for balance. A new musical bias without a passing critique test is not done.
- **synth** → the human listen on the deployed test build IS the gate — `/done` deploys
  the branch at the gate itself, not a local harness.
- **bundle** → a measured KB delta **and** the full suite green.

**Repo-specific gotchas the gates enforce:**
- A new `public/engine/*.ts` file must be registered in `AI_MAP.md` or the pre-commit
  docs-lint hook blocks the commit — add the row during `/done` staging.
- `// @direct-mutation` is only sanctioned in the three categories in `CLAUDE.md`
  (real-time hot paths, init-only, pre-mount). Everywhere else routes through
  `dispatch` — `state-discipline-reviewer` enforces it.
