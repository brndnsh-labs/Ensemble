# Domain docs

How the engineering skills read Ensemble's domain documentation. Ensemble does not use a
`CONTEXT.md` glossary or a `docs/adr/` folder. It has existing homes for both, and a second
copy of either would drift.

## Before exploring, read these

- **The glossary** is `CLAUDE.md`'s *Naming / Canonicalization* section: the canonical genre
  keys, the one-name-per-concept rule, and where aliases live. `AI_MAP.md` names the module for
  each concept.
- **Decisions** live in `docs/design/*.md` as dated `DECISION YYYY-MM-DD` entries inside the
  design doc for that area, such as `write-ownership.md`, `timing-model.md` or
  `ensemble-v2-rollout.md`. Read the doc for the area you are about to touch.
  `docs/README.md` indexes them.

## Use the glossary's vocabulary

When your output names a domain concept, use the canonical term. Normalize friendly UI labels
to the canonical key in state, config and code. A concept missing from the glossary is either
invented language (reconsider it) or a real gap (raise it).

## Recording what gets resolved

`/domain-modeling`, `/grill-with-docs` and `/improve-codebase-architecture` would normally
create `CONTEXT.md` and `docs/adr/` lazily. Here, write instead to:

- **A resolved term**: `CLAUDE.md`'s *Naming / Canonicalization* section, only when it is a
  canonical key or naming rule every agent needs. Keep implementation detail out.
- **An ADR-worthy decision**: a dated `DECISION YYYY-MM-DD` entry in the relevant
  `docs/design/*.md`. Start a new design doc only for a load-bearing model with no home, and add
  it to `docs/README.md`.

## Flag decision conflicts

If your output contradicts a recorded DECISION, say so explicitly rather than overriding it:

> _Contradicts write-ownership.md (runtime never writes a document field), but worth reopening because…_

A dated decision can go stale, so check that it still matches live code before leaning on it.
