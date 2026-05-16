// @ts-nocheck
// TODO: All tests in this file were removed in the StudioWorkspace → InstrumentRail migration
// (commit 3c5527ee removed StudioWorkspace entirely).
//
// The surface under test no longer exists. The replacement architecture is:
//   - Desktop: `.instrument-rail` (--vertical or --horizontal) is always visible.
//     Per-instrument settings open via the ⚙ aria-label="<Instrument> settings" button on each
//     mix row, rendering a `.workspace-studio-surface--settings.is-open` popover anchored to the
//     row. The mixer is now a `.workspace-studio-mixer-accordion` inside the same rail.
//   - Mobile: `.mobile-action-bar__btn` with text "Mix" opens `.mobile-mix-sheet` (a
//     StudioSurface portal). Inside it, `InstrumentRail` renders 5 `.workspace-studio-mix-row`
//     rows. Per-instrument settings open from those rows too.
//
// Coverage to rebuild (separate design task):
//   1. Desktop — mixer accordion opens and all 5 instrument strips (vol/reverb sliders) visible
//      and within viewport.
//   2. Desktop — Drum settings popover (swing, swing-base, creativity) visible and within bounds.
//   3. Desktop — Chords settings popover (density select) visible and within bounds.
//   4. Desktop — Harmony settings popover (complexity slider) visible and within bounds.
//   5. Desktop — Soloist settings popover (preset, phrasing, trading controls) visible/scrollable.
//   6. Mobile — Mix sheet opens 5 rows; instrument settings popovers accessible from within.
//   7. Mobile — Mixer accordion within mix sheet scrolls to reveal all sliders on short viewport.
//   8. iPhone — Mix sheet and soloist settings use full-height insets; controls reachable.
