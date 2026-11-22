# Ensemble

A backing band in a browser. Type or pick a chord chart, press Play, and a generated band (drums, bass, a chord instrument and, if you want one, a soloist) plays it in one of nine styles while you practise over it. It runs entirely in the browser, installs as an app, and works offline.

**https://ensemble.brndn.zip**

## How it is put together

- `packages/engine`: the band. Pure: a chart, a style, options and a seed go in, events come out, the same every time.
- `packages/styles`: the nine styles, as data.
- `packages/audio`: a sampler and a scheduler. It knows nothing about music.
- `packages/app`: the app (React, Vite, a service worker).
- `library/`: the built-in charts. `docs/CHART_FORMAT.md` is the format.
- `assets/packs/`: the instruments, each with its own `LICENCE`.

`docs/BRIEF.md` says what it is and why; `CLAUDE.md` has the rules of the repository and every command; `docs/decisions/` is the record of what was decided and why.

## Running it

Node 26 and pnpm.

```sh
pnpm install
pnpm app          # the app, served for development
pnpm check        # typecheck, lint, the engine suite
pnpm smoke        # the browser journeys against the built app (needs Google Chrome)
```

A push to `main` is checked, built into an image and released to the test site, then to production once the browser journeys have passed against the test site (`.github/workflows/ci.yml`).

## Licence

The code is under the GNU Affero General Public License, version 3 (`LICENSE`). The sample packs under `assets/packs/` carry their own licences.
