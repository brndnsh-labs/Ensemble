This repo has **one reviewer agent**, `ear-reviewer` (`.claude/agents/ear-reviewer.md`): it reads takes as transcriptions (`ensemble read`) against the music notes, and runs beside the general review where a row names it. Every row is also reviewed by a fresh-context general reviewer briefed with the "what to hold" column. The rows without an agent are the backlog for writing dedicated ones.

| Path | Domain | What to hold |
|---|---|---|
| `packages/engine/src/players/**` | engine, players | The engine row, and **`ear-reviewer`** beside the general review: the takes the change reaches, read before and after against the music notes for the seat and the style. |
| `packages/engine/src/**` | engine | Purity: same chart, style, options and seed give identical events; no DOM, audio, I/O, clock or `Math.random`; imports nothing from `app` or `audio`. No style named in engine code (a style is data). Extending an open-ended plan must not change passes already generated. Range, register and resolution rules in `docs/MUSIC_NOTES.md` and `docs/music-notes/`. |
| `packages/engine/src/critic/**`, `scorecard/**` | critic | A metric measures what its name says, over the seeds it claims. A baseline change is an accepted improvement with a `DECISIONS.md` line, never a quiet drop (§5). |
| `packages/styles/src/**`, `library/*.chart` | styles | `packages/styles/src/**` also gets **`ear-reviewer`** beside the general review, on the styles the change touches. Data only: no engine edit rode along. Other styles' goldens are byte for byte unchanged and `pnpm score` shows no movement for them. A tune's changes are checked against a published source, never recalled. |
| `test/**` | tests | Only the four kinds in `docs/TESTING.md`; public API only; no mocks; each test names its rule in musical or user-facing words. A new property fits the budget as it stands. A changed golden has its `DECISIONS.md` line. |
| `packages/audio/src/**` | audio | Knows nothing about music theory (no chord, scale or style words). Scheduling against the audio clock, not timers. `docs/AUDIO_NOTES.md` for packs, mixing and phones. |
| `packages/app/src/**`, `smoke/**` | app | `play/jam.ts` is the only place a take becomes sounds. `stored.ts`, the stored shapes and the service worker are §5 brakes: something kept by an older build must still load. No committed Playwright spec beyond the five journeys. |
| `scripts/packs/**`, `assets/packs/**` | packs | §5 brake. Each source pinned to a version, its licence read from the fetched file and kept beside the pack; the electric piano is non-commercial share-alike. |
| `.github/**`, `hosting/**`, `scripts/image.sh` | release | §5 brake, with `/security-review`. Nothing private published; the image is the commit it is named for; the release job stays `main`-only and never runs for a pull request. |
| `packages/cli/src/**`, other `scripts/**` | tooling | A take is its chart, style, options and seed: the same four give the same MIDI file. |
| `docs/**`, `*.md`, `prompts/**` | docs | Agrees with the code and with `CLAUDE.md`; `docs/CHART_FORMAT.md` is a spec, so each example in it is a corpus row. |

**Fallback:** a path matching nothing gets the general review. A diff across rows is held to every row it touches. Musical judgment (is this idiomatic) is reported as an observation for Brandon's ear, never as a pass or a fail.
