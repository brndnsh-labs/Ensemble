# Mix calibration data

Derived measurements backing the per-scene finding thresholds in
`scripts/mix-report-utils.ts` (`DEFAULT_FINDING_THRESHOLDS` + per-scene
`findingThresholds`). Tracked here — and not under `tmp/` — because these are the
provenance for constants that ship in live tooling: the numbers justify the
thresholds, so they belong in version control next to them.

Total payload is ~130 KB. No audio lives here.

## Files

| File | What it is |
| --- | --- |
| `calibration.json` | `npm run mix:analyze` output over 10 commercial reference mixes plus one of our own renders. The source of the Jazz/Rock/Blues/Funk targets quoted in `mix-report-utils.ts`. Calibrated 2026-05-24. |
| `before-s1.jsonl`, `after-s1.jsonl`, `after-s2.jsonl` | Per-story analysis dumps from the epic-7 overnight branch `overnight/synth-epic-7-2026-05-25` (bus-pan widening + Haas widener on the reverb wet). |

The original run also produced three `.log` files. They held nothing but a
`Wrote 28 WAV files to <dir>` banner each, so they were dropped rather than
force-added past the `*.log` gitignore rule.

## Where the audio went

`calibration.json` measured two different kinds of source:

- **Commercial reference mixes** — bought/downloaded MP3s, always outside the repo
  and never tracked. Only the derived measurements (peak/RMS/crest, spectral band
  probes, stereo correlation and side ratio) live here.
- **Our own renders** — `tmp/references/*.wav`, ~330 MB that a re-render reproduces.
  Deliberately left disposable under the gitignored `tmp/`; the `.jsonl` dumps in
  this directory are their distillation.

`mix:analyze` writes an absolute `path` for every entry. Those were **rewritten
before this data was committed** — our own render keeps a repo-relative path, and
each external source keeps only its filename — so no local home-directory layout
ships in a public repo. Nothing else in the file was touched; the measurements and
`label` values are exactly as the tool emitted them. If you re-run `mix:analyze`
and commit the result, strip the paths again.

They are provenance only. No code reads this directory at runtime, so a stale path
here breaks nothing.

The filenames carry YouTube video IDs, which cspell reads as misspellings, so
`scripts/calibration/*.{json,jsonl}` is in `cspell.json`'s `ignorePaths`. This
README is deliberately still spellchecked — only the generated data is exempt.

## Regenerating

Re-running requires the source MP3s, which are not in the repo:

```bash
npm run mix:analyze -- <path-to-reference.mp3>       # one file
npm run mix:report                                    # our renders + findings
```

`docs/synth-audit/epic-7-mix-architecture.md` has the full epic context and the
standing instruction to re-check renders against the reference set after a story.
