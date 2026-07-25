import { useEnsembleState } from '../ui-bridge.js';

/**
 * The "Visual Flash" beat/accent overlay — a full-screen white pulse.
 *
 * why this exists (#1181): the whole pipeline was already here and working —
 * `triggerFlash()` dispatches `TRIGGER_FLASH`, the `playback` reducer writes
 * `flashIntensity`, `state-effects` schedules `FLASH_EXPIRED` 50ms later to fade it
 * back to 0, and `#flashOverlay`'s CSS (opacity 0, `transition: opacity 0.05s`) has
 * been sitting in `layout.css` all along. The one missing piece was **any component
 * rendering the element**; it was dropped in a UI migration, so `flashIntensity` had
 * been written and read by nothing since. This is that element.
 *
 * Kept as its own component rather than inlined into `App`: it subscribes to
 * `flashIntensity`, which changes on every flash (several times a bar during
 * playback), and `useEnsembleState` reactivity is per-component — inlining it would
 * re-render the whole app tree on each pulse.
 *
 * Gated on `playback.visualFlash` here as well as at the `triggerFlash()` call sites.
 * That looks redundant but isn't: this render gate is the **single chokepoint** that
 * guarantees the user's setting is honored, so a future trigger that forgets to check
 * the flag can't leak a flash onto the screen. (One such site already existed —
 * `applyPendingGenre` — fixed in the same change.)
 *
 * For the practicing-musician persona this is a silent visual pulse, which is why the
 * decision on #1181 was to finish it rather than delete it: it serves the
 * metronome-core identity without touching the audio.
 */
export function FlashOverlay() {
    const { visualFlash, flashIntensity } = useEnsembleState((s) => ({
        visualFlash: s.playback.visualFlash,
        flashIntensity: s.playback.flashIntensity,
    }));

    if (!visualFlash) {
        return null;
    }

    // Inline style is correct here per CLAUDE.md — opacity is a runtime-calculated
    // value, not static presentation. The rest of the styling lives in layout.css.
    return <div id="flashOverlay" aria-hidden="true" style={{ opacity: flashIntensity }} />;
}
