`npm test`, `npm run test:browser`, `npm run test:e2e` are three separate runners
(node · browser-audio · e2e); `npm run ci` covers only the first. `npm run validate`
(typecheck + knip + jscpd + format + `npm test`) is the full sweep — run it before a
`/done` that touches more than one file. CI runs `npm test` + `npm run test:e2e` in
parallel; both must be green to merge.

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
