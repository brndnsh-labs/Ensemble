- **Biome version bumps** can change formatter output (e.g. `it.each(...)` call
  wrapping) and fail `lint` on files it didn't touch — not a regression. Run
  `npm run format` to reformat, and if Biome complains `biome.json`'s `$schema` is
  stale, bump it to match. Re-run `npm test` after.
- **cspell major bumps (9→10 seen before)** — check whether `package.json` already
  declares the new major before treating it as live work; it may already be pinned.
