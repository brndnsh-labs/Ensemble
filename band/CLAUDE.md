# band/ — the new band engine

Read [`docs/design/band-engine.md`](../docs/design/band-engine.md) first: its decision, its
shape and its laws. Rules that bind every change here:

- **Pure and deterministic.** No `Math.random`, no clocks, no global state, no imports from
  `public/engine`, `public/state` or the DOM. `public/songbook/` (the chart codecs) is the only
  outside dependency. Randomness goes through `ctx.rng(purpose, scope)`.
- **Timing moves only in `feel/feel.ts`.** Players write on the straight sixteenth grid.
- **Chord meaning comes only from `theory/chord.ts`.** Never parse a symbol in a player.
- **A new style gets the invariant suite automatically.** Also add its claims to
  `test/critique.test.ts`, then render it (`npm run band:render -- --style=<id> --print=8`)
  and read the grid before asking for an ear check.
- **Taste is Brandon's.** A green critique means the rules hold. It does not mean it grooves.
