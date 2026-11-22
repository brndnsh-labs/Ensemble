# Build: dark mode that extensions leave alone, no light flash, and a pass over every screen in dark (#2265)

You are working on Ensemble, a backing band in a browser (`packages/app`, a static site; the owner, Brandon, uses it on his iPhone and in a desktop browser). Read the issue, which is the specification: `gh api repos/brndnsh-labs/Ensemble/issues/2265 --jq .body`. In short: the app already follows the system's light or dark setting (`color-scheme: light dark` in `packages/app/index.html` and `packages/app/src/style.css`, dark tokens under `prefers-color-scheme: dark`), but an extension in his browser recolours it on top of that. He asked for "a real automatic dark mode that looks great and hopefully signals to extensions that there's a native dark mode already active".

## What to build (the issue's four parts; each is required)

1. **Tell extensions the page has its own dark theme.** Before adding anything, read Dark Reader's own documentation for site authors (its repository's README or docs; you may fetch those public pages, and nothing else on the network; put nothing about this project in any request). Add exactly what it documents for a site that wants to be left alone, and quote the passage and its address in the decisions. Say what you found for browsers' own forced-dark modes (Chrome's auto dark theme, Samsung Internet) and add only what is documented to work; guess nothing.
2. **No light flash before the styles load**: the two paper and ink colours set in `index.html` itself, inline, for each scheme, so the first paint is already right. Keep them in step with the tokens in `style.css` (say in a comment that the two places must agree, and where).
3. **The installed app's splash and bar colour**: `packages/app/public/manifest.webmanifest` has one `background_color` and `theme_color`, both the light paper. Find what the manifest can say for a dark scheme today and whether iOS Safari and Chrome honour it (documentation, not memory). Do it if it is supported; if it is not, say so plainly and leave the manifest as it is. The `theme-color` metas in `index.html` already have both.
4. **A pass over every screen in dark, by looking** (`node scripts/look.ts <out.png> <width>x<height> <address> [dark] [steps...]`, against `pnpm app --port 8767`): home (with a few recent charts: seed `localStorage` key `ensemble.recent.1` with `[{id:"#/chart/<chart id>", played:<ms>}]` and reload), the library, a style's list, a chart's screen stopped and playing, each sheet and More, the editor (chart, text, arrangement), Takes, a kept take, Credits. Fix what is off in dark: contrast of faint text and rules on the dark paper, anything left with a light background or a browser-default look (inputs, selects, the file picker's button, scrollbars, focus rings, text selection, autofill), the highlighter and pencil colours. The spot colours of the styles stay as they are in both themes; if one reads badly on dark paper, say so and what you did around it, not to it.

## Rules

- Read `CLAUDE.md` (its standing rules bind you) and `docs/TESTING.md` (only its four kinds of test; this job adds none; the five smoke journeys are fixed). Read `docs/decisions/README.md` and the app's look in `docs/decisions/app.md` ("the poster wall is chosen", "a gap of paper between the coloured blocks") before changing a colour: the look is ink on paper with flat spot colours, and it stays that.
- **No switch in the app** to choose light or dark: it follows the system. No new colours for the styles. No dependency.
- **Nothing stored changes**: not `stored.ts`, `settings.ts`, the service worker or `offline.ts`.
- Light mode must not change at all unless a fault you fix is in both: take every picture in light too and compare before and after.
- **Contrast**: text on paper meets WCAG AA in both themes (4.5:1 for body text, 3:1 for large text and for rules that carry meaning). Compute the ratios for ink, faint and rule on paper, light and dark, and state them. Change a token only where it fails.
- Decisions go in `docs/decisions/app.md` as a new `## ` section appended at the end: what was added for extensions and the documentation it rests on, what the manifest can and cannot do, each thing fixed in the pass, the contrast ratios.

## For his eye

`out/dark-pass/` in your worktree (not committed; add `out/dark-pass/` to `.gitignore`): an `index.html` showing each screen above in light and dark at 390x844, and home and a chart's screen at 1280x900; before and after side by side where something changed (take "before" from `https://ensembletest.brndn.zip/`), with what was changed under each. Say what was measured; nothing about how it looks beyond that.

## Where you are

The worktree is made: `/home/brandon/code/ensemble/.work/2265`, branch `dark-pass` from `origin/main`, installed. Work only inside it. Do not read the `legacy` branch or `~/code/ensemble-legacy`. The repository is public: nothing private in anything committed (no local addresses). Do not push, do not open a pull request, do not file or edit issues.

Commit as you go, staging by path (never `git add -A`, never `--no-verify`, never amend, never reset a commit away, never `git stash`), this brief (`prompts/dark-pass.md`) with the first commit. Each message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Check `git log -1 --format=%ae` prints `50114222+brndnsh@users.noreply.github.com`; if not, stop and say so.

Gates: `pnpm lint`, `pnpm typecheck`, `pnpm smoke` (60-second budget), `pnpm app:build` then confirm the built `packages/app/dist/index.html` carries the tag and the inline colours. `pnpm check` once, alone.

Never `pkill -f`. Never `pgrep -f` in a wait loop. Never wrap node in `timeout`. Stop a server by its port (`fuser -k 8767/tcp`); leave ports 8765 and 8766 alone. Foreground `sleep` is blocked. Leave no shell, server or browser running when you finish.

## The report

Under 400 words: what was added for extensions, with the passage quoted and its address; what you found for forced-dark modes; how the flash was checked; what the manifest can do and what you did; each thing fixed in the pass, with the screen; the contrast ratios before and after; every token changed; the gate results; where the page is; what you could not check (a real extension, a real phone).
