# Ensemble

Ensemble is a browser-based **virtual band and songwriting toolkit**. Sketch a chord progression, pick a feel, and a full rhythm section — drums, bass, chords, harmony, and an improvising soloist — interprets it in real time, right in the browser.

It is a PWA built for fast ideas: everything lives on one **chart-first surface**, so you write, perform, and visualize without ever leaving the page.

**▶ Try it: [ensemble.brndn.zip](https://ensemble.brndn.zip/)**

<p align="center">
  <img src="docs/assets/readme/hero.png" alt="The Ensemble chart-first surface: a lead sheet with the live transport, key/time controls, and the per-instrument Live mix rail." width="100%" />
</p>

---

## I want to know what it is

Ensemble turns a lead sheet into a playing band. The chord chart is always on screen — like a music stand — and every other control radiates out from it.

- **Chart-first surface.** A lead sheet is always visible. It's locked by default (your music stand); tap **✏️ Edit** to rewrite chords and sections, and the lock re-engages when you press play.
- **Smart genre presets.** Choose a feel (Jazz, Funk, Rock, Bossa, Neo-Soul, Hip-Hop, and more) and the whole band re-voices its drums, bass, comping, and phrasing to match.
- **Per-instrument Live mix.** A rail along the edge shows the five band members — Drums, Bass, Chords, Harmony, Soloist. Toggle each one, and open per-instrument settings (register, style, drum preset, trading) without covering the chart.
- **AI soloist with a Dynamic Head.** The soloist generates a seed melody that fits your progression, states it like a "head," then evolves and improvises over successive choruses — coherent rather than random. You can also trade fours with it or take over the lead yourself.
- **🌈 Visualizer.** A full-screen overlay renders a real-time piano-roll of what every instrument is playing, color-coded by track and chord tone.
- **Analysis & MIDI.** Audio analysis and melody-to-harmony tooling, plus MIDI export and live routing into a DAW or hardware.

**The surface at a glance:** the **topbar** holds the transport (play/stop, BPM, tap tempo), the key / time-signature / song-seed controls, and quick actions (Library, Edit, Share, 🌈). The **Live mix rail** holds the band. On a phone, the rail collapses into a bottom action bar (🎚️ Mix · 📤 Share · 🌈 Visuals).

A full walkthrough lives in the **in-app Manual** (open the `⋯` menu → **Manual**), and [`public/MANUAL.md`](public/MANUAL.md) includes a **Style Gallery** of one-click deep links to curated presets.

The public instance lives at **[ensemble.brndn.zip](https://ensemble.brndn.zip/)** — no install required.

---

## I want to host it myself

Ensemble is a static PWA — build it once and serve the `dist/` folder from anywhere.

**Prerequisites:** Node.js 26+ and npm. This project is **npm-only** — don't use `pnpm`, `yarn`, or `bun`.

```bash
npm install
npm run dev
```

`npm run dev` starts the Vite dev server with hot-module reload on `http://localhost:5173`.

**Production build:**

```bash
npm run build
```

This emits an optimized bundle into `dist/`, including the service worker (via `vite-plugin-pwa`) so the app is installable and works offline. `dist/` is a plain static site — host it on any static file server or CDN.

**Deploy:** `npm run deploy:test` and `npm run deploy:prod` are thin aliases for `scripts/deploy.sh <test|prod>` — a wrapper around `vite build` + `rsync` (see [`scripts/deploy.sh`](scripts/deploy.sh)). Point them at your own host, or copy `dist/` wherever you like.

---

## I want to contribute

```bash
npm test            # mutation check + lint + docs lint + Vitest
npm run test:e2e    # Playwright smoke suite (Desktop + Mobile)
npm run typecheck   # tsc over public/ and scripts/
npm run validate    # full pipeline: format + jscpd + typecheck + depcheck + knip + npm test + size-limit
```

Run `npm run validate` before opening a PR. Musical changes should also pass the relevant **critique test** in `tests/standards/` — see [`tests/README.md`](tests/README.md).

**Refreshing the screenshots:** `npm run dev` in one shell, then `npm run screenshots` in another — [`scripts/capture-screenshots.ts`](scripts/capture-screenshots.ts) deep-links a populated scene and writes `docs/assets/readme/hero.png`.

**Analysis & audit tooling:**

- `npm run ensemble:report -- --genre=Jazz --seeds=ALPHA,BETA` — compact multi-seed ensemble audit as JSON.
- `npm run mix:report -- --jsonl --scene=jazz-ride --seeds=ALPHA,BETA` — rendered-audio metrics as JSONL for a multi-seed scene sweep. `--write-wav=tmp/mix-render` also drops one `.wav` per scene/stem/seed so renders can be auditioned without the live app.
- `npm run --silent mix:diff -- before.json after.json` — compares two `mix:report --json` outputs and flags stems whose dynamics or spectral balance moved past a threshold (defaults: ±1.5 dB, ±5% spectral, ±1.5 spikes/sec).
- `npm run --silent audition-link -- --scene=jazz-ride --seed=ALPHA` — builds an autoplay-ready URL for a named scene; opening it in the running app hydrates the scene behind a one-click "▶ Play" overlay. See [`docs/guides/listening-gate-tools.md`](docs/guides/listening-gate-tools.md).

**Tech stack:**

- **UI:** Preact
- **State:** deep-signal domain slices
- **Audio & generation:** Web Audio + a worker-driven logic engine
- **Build:** Vite (`vite-plugin-pwa` for the service worker)
- **Testing:** Vitest + Playwright

**Repository layout:**

- `public/` — app source, controllers, engines, components, and styles
- `tests/` — unit, integration, standards (critique), perf, and e2e coverage
- `docs/` — docs index, living guides, roadmap, and archived reports
- `scripts/` — build, deploy, and analysis tooling
- `.github/` — contributor, security, and PR templates

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
