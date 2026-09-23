# Ensemble

Ensemble is a browser-based **virtual band**. Write or import a chord chart, pick a feel, and a full rhythm section — drums, bass, chords, harmony, and an improvising soloist — plays it in real time, right in the browser.

It is built for practice first: mute the part you play and play along with a band that keeps steady time.

**▶ Try it: [ensemble.brndn.zip](https://ensemble.brndn.zip/)** — no install, no account required.

---

## I want to know what it is

- **A songbook.** Starter charts and your own songs, saved on the device. Save is explicit; an unsaved experiment is kept for you and offered back, with Revert to saved.
- **A music stand.** During playback the chart is the screen. Tempo, genre, meter and per-instrument mutes sit around it; a section can be looped for practice.
- **Smart genre feels.** Thirteen genres (Jazz, Funk, Rock, Bossa, Neo-Soul, Hip Hop, and more) re-voice the whole band's drums, bass, comping and phrasing.
- **A soloist with a Dynamic Head.** The soloist writes a seed melody for your progression, states it like a head, then develops it over successive choruses — coherent rather than random.
- **Real sounds, offline.** Downloadable sample packs per instrument, and an installable app that plays without a connection once its sounds are stored.
- **Charts in and out.** Bar-by-bar chart editing, iReal Pro import, share links that open without an account, and MIDI and WAV export.
- **Optional accounts.** A passkey account keeps your songbook on more than one device. Playing never needs one.

---

## I want to host it myself

The app is a Next.js static export in [`prototypes/v2/`](prototypes/v2/README.md) that compiles the engine from `public/`. Build it once and serve the output from any static file server.

**Prerequisites:** Node.js 26+ and npm. This project is **npm-only** — don't use `pnpm`, `yarn`, or `bun`.

```bash
npm ci
npm ci --prefix prototypes/v2
ENSEMBLE_V2_BASE=/ npm run build --prefix prototypes/v2
```

This writes the site to `prototypes/v2/out/`, including its service worker, the sound packs and a `build.json` naming the commit. Leave `ENSEMBLE_V2_BASE` unset to build for a `/v2/` path instead. For development, `npm run dev --prefix prototypes/v2` serves it at `http://localhost:3100/v2/`.

Accounts need the separate API service in [`prototypes/v2-api/`](prototypes/v2-api/README.md) behind `/api/*` on the same origin; without it the app still plays and saves on the device. The production stack — container images, release by tag, cache headers — is described in [`hosting/README.md`](hosting/README.md).

---

## I want to contribute

```bash
npm test                                  # mutation check + lint + docs lint + Vitest
npm run typecheck                         # tsc over public/ and scripts/
npm run validate                          # format + jscpd + typecheck (+ tests/) + knip + npm test
npm run build --prefix prototypes/v2      # build the app
npm run test:e2e --prefix prototypes/v2   # the app's Playwright suite (build first)
```

Run `npm run validate` and the app suite before opening a PR. Musical changes should also pass the relevant **critique test** in `tests/standards/` — see [`tests/README.md`](tests/README.md).

**Analysis & audit tooling:**

- `npm run ensemble:report -- --genre=Jazz --seeds=ALPHA,BETA` — compact multi-seed ensemble audit as JSON.
- `npm run mix:report -- --jsonl --scene=jazz-ride --seeds=ALPHA,BETA` — rendered-audio metrics as JSONL for a multi-seed scene sweep. It builds and serves the app itself. `--write-wav=tmp/mix-render` also drops one `.wav` per scene/stem/seed so renders can be auditioned without the live app.
- `npm run --silent mix:diff -- before.json after.json` — compares two `mix:report --json` outputs and flags stems whose dynamics or spectral balance moved past a threshold (defaults: ±1.5 dB, ±5% spectral, ±1.5 spikes/sec).
- `npm run --silent audition-link -- --scene=jazz-ride --seed=ALPHA` — builds a link that opens a named scene's chart, key, meter, tempo and genre in the app (the v2 dev server by default). See [`docs/guides/listening-gate-tools.md`](docs/guides/listening-gate-tools.md).

**Tech stack:**

- **UI:** React on Next.js (static export)
- **State:** deep-signal domain slices
- **Audio & generation:** Web Audio + a worker-driven logic engine
- **Testing:** Vitest (node, happy-dom and browser mode) + Playwright

**Repository layout:**

- `prototypes/v2/` — the app: React UI, runtime bridge, songbook storage, account client, Playwright checks
- `prototypes/v2-api/` — the account API (standalone Node service)
- `public/` — the engine library: state slices, worker, synthesis, musical engines, songbook codecs
- `tests/` — unit, integration, standards (critique), bench and browser-mode coverage
- `docs/` — docs index, living guides, roadmap, and archived reports
- `scripts/` — analysis, listening-gate and validation tooling
- `hosting/` — the production stack
- `.github/` — CI, contributor, security, and PR templates

**Start here:**

- [`docs/README.md`](docs/README.md) — documentation index and navigation hub.
- [`docs/VISION.md`](docs/VISION.md) — product direction and open work.
- [`CLAUDE.md`](CLAUDE.md) — operational rules and architectural overview. (`AGENTS.md` points here.)
- [`AI_MAP.md`](AI_MAP.md) — file-by-file navigation map for the codebase.
- [`.github/CONTRIBUTING.md`](.github/CONTRIBUTING.md) — contributor workflow and validation expectations.
- [`.github/SECURITY.md`](.github/SECURITY.md) — private vulnerability reporting.
- [`.github/CODE_OF_CONDUCT.md`](.github/CODE_OF_CONDUCT.md) — community standards.

---

## License

GNU Affero General Public License v3.0. See [LICENSE](LICENSE) for details.
