import { type Dispatch, type SetStateAction, useEffect, useEffectEvent, useState } from 'react';
import { flushSync } from 'react-dom';
import * as runtime from '../lib/runtime';

/** What the shell hands `usePlaybackState`. */
interface PlaybackStateOptions {
    /**
     * The shell's Play: warms audio inside the gesture, then starts the band behind any action
     * already running. An armed `?autoplay=1` link calls it on the first gesture.
     */
    startPlayback: () => void;
}

/** What the stand reads back, and the setters the shell's play paths write. */
interface PlaybackState {
    /** The band is playing, as the poll last read it (or a play path just set it). */
    playing: boolean;
    setPlaying: Dispatch<SetStateAction<boolean>>;
    /**
     * The band was playing when a `perform` began, held true until it settles, so the stand and
     * Stop stay usable through a feel change.
     */
    playbackPending: boolean;
    setPlaybackPending: Dispatch<SetStateAction<boolean>>;
    /** The playhead's slot, or null when stopped. */
    active: number | null;
    setActive: Dispatch<SetStateAction<number | null>>;
    /** The count-in beat sounding now (0-based), or null. */
    countInBeat: number | null;
    /** Which chorus the band is in, and its part (#1990); null when stopped. */
    place: runtime.PerformancePlace | null;
    /** In the active bar's last felt pulse: the chart sheet's next-bar cue. */
    nextSoon: boolean;
    /** In the active slot's last felt pulse: the neck's chord-change cue. */
    changeSoon: boolean;
    /** A `?autoplay=1` link is armed, waiting for the first gesture. */
    pendingAutoplay: boolean;
    /** The shared-link effect arms it. */
    setPendingAutoplay: Dispatch<SetStateAction<boolean>>;
}

function samePlace(a: runtime.PerformancePlace, b: runtime.PerformancePlace): boolean {
    return (
        a.chorus === b.chorus &&
        a.of === b.of &&
        a.part === b.part &&
        a.pass === b.pass &&
        a.barChorus === b.barChorus &&
        a.bar === b.bar &&
        a.tradeKey === b.tradeKey &&
        a.trading === b.trading
    );
}

/**
 * The playback poll and the state it publishes (#1920): `playing`, the playhead's slot, the
 * count-in beat and the two look-ahead cues, read off the engine every animation frame while the
 * band plays; plus a shared link's armed `?autoplay=1` and the two effects that start and disarm
 * it. The shell keeps the play paths that write the setters (`perform`, `togglePlayback`,
 * `startPlayback`, `playSong`, the shared-link effect) and the rest of its boot effect
 * (telemetry, `start()`, `beforeunload`). Call it before anything reads `playing` or `active`
 * during render (`useChartView`).
 */
export function usePlaybackState({ startPlayback }: PlaybackStateOptions): PlaybackState {
    // An audition/share link's `?autoplay=1` (#1382): browsers block audio before a gesture,
    // so this arms one instead of playing immediately — the shared-link effect sets it, and
    // the gesture effect below clears it on the first pointer or key event anywhere on the page.
    const [pendingAutoplay, setPendingAutoplay] = useState(false);
    const [playing, setPlaying] = useState(false);
    const [playbackPending, setPlaybackPending] = useState(false);
    const [active, setActive] = useState<number | null>(null);
    // The count-in beat sounding now (0-based), or null when not counting in (#1422) — cheap
    // enough to ride the same 60ms poll `playing`/`active` already use, no new interval.
    const [countInBeat, setCountInBeat] = useState<number | null>(null);
    // #1458 — is playback in the ACTIVE bar's last FELT pulse right now? Strengthens the next-bar
    // cue and gates the Following look-ahead's jump-ahead scroll. Edge-triggered off the same
    // 60ms poll below (`runtime.inLastBeat()`, a pure engine read off the song tick the active slot
    // is read from, #1506 — never the chart's own `active` state, which the poll that publishes
    // it can still be a tick behind) rather than a new interval — it only flips twice a bar,
    // nowhere near "per frame".
    const [nextSoon, setNextSoon] = useState(false);
    // #1590 — the neck's own cue: the last felt pulse before the ACTIVE SLOT ends, which in a
    // two-chord bar is mid-bar, where `nextSoon` (the barline's) never fires. Same poll, same
    // tick; it flips twice a chord.
    const [changeSoon, setChangeSoon] = useState(false);
    // #1990 — which chorus, and whose turn: read off the same tick as the slot, and set only
    // when it changes (a few times a minute), so it costs a frame nothing.
    const [place, setPlace] = useState<runtime.PerformancePlace | null>(null);

    useEffect(() => {
        // The stand follows the performance every animation frame while it plays (#1240), reading
        // the playhead straight off the engine: a fixed-period sample of it could step over a
        // chord shorter than the period (a sixteenth at 240 bpm is 62.5ms). Stopped, a 60ms
        // check notices playback started anywhere else — the lock screen's media controls. A
        // hidden page gets no frames, so a slower timer still notices playback stopping there.
        let frame = 0;
        let idle = 0;
        // A frame's paint is committed inside that frame (`flushSync`, #1693). State set in an
        // animation frame is otherwise committed in a later task, and on a busy main thread the
        // next frame can run first: it sets the next chord, and the one this frame read is never
        // shown although a frame saw it. The first call runs inside this effect, where React is
        // already committing and a nested flush is refused, so it commits the ordinary way.
        const follow = (commit: (paint: () => void) => void) => {
            window.cancelAnimationFrame(frame);
            window.clearTimeout(idle);
            const playingNow = runtime.state().playback.isPlaying;
            // ONE read of the band's clock for the whole paint (#1506): the audio clock can cross
            // a barline between two reads in this one task, and the active bar and the cue below
            // read separately once showed the bar just left with the new bar's cue.
            const tick = playingNow ? runtime.songTick() : null;
            const slot = runtime.playheadSlot(tick);
            commit(() => {
                setPlaying(playingNow);
                // No slot while counting in or between two queued segments: the pointer holds.
                setActive((previous) => (!playingNow ? null : slot >= 0 ? slot : previous));
                setCountInBeat(runtime.countInBeat());
                // #1458 — a pure engine read off the live song tick, not the ACTIVE bar's rendered
                // DOM node: React hasn't necessarily committed `active`'s new value yet on the very
                // frame playback crosses a barline, so reading the OLD bar's DOM attributes here
                // would still see the bar just left after the engine had already moved on.
                setNextSoon(runtime.inLastBeat(tick));
                // The slot this same tick is in, never `active`'s committed value, for the reason
                // above — and off any slot (-1) there is no chord to be leaving.
                setChangeSoon(runtime.inLastBeatOfSlot(tick, slot));
                // Held across the count-in and a seam between two queued segments (null tick).
                const here = runtime.performancePlace(tick);
                setPlace((previous) => {
                    const next = !playingNow ? null : (here ?? previous);
                    return previous && next && samePlace(previous, next) ? previous : next;
                });
            });
            if (playingNow) {
                frame = window.requestAnimationFrame(inFrame);
            }
            idle = window.setTimeout(inFrame, playingNow ? 250 : 60);
        };
        const inFrame = () => follow(flushSync);
        follow((paint) => paint());
        return () => {
            window.cancelAnimationFrame(frame);
            window.clearTimeout(idle);
        };
    }, []);
    // `startPlayback` is the shell's component-scope function declaration, new every render:
    // reached through an effect event, so `pendingAutoplay` alone arms the listeners and no
    // render re-arms them.
    const onStart = useEffectEvent(startPlayback);
    useEffect(() => {
        // An armed `?autoplay=1` link (#1382): browsers block audio before a user gesture, so
        // this waits for the first one anywhere on the page — a click/tap or a key press,
        // exactly what pressing Play itself would supply — then starts the band the same way
        // Play does and disarms itself. `{ once: true }` on each listener means whichever
        // fires first already removed itself; the cleanup below catches the other.
        if (!pendingAutoplay) {
            return;
        }
        const start = (event: Event) => {
            setPendingAutoplay(false);
            const target = event.target;
            // The gesture landed on Play itself (`data-play-toggle`, `transport-bar.tsx`):
            // disarm and let the button's OWN `onClick` start playback. Calling
            // `startPlayback()` here too raced that click — `runtime.toggle()` can resolve
            // inside the ~100ms between a tap's `pointerdown` and its `click`, so by the time
            // `onPlayToggle` ran `isPlaying` already read true and it called `runtime.stop()`,
            // starting and immediately stopping the band on the very tap meant to start it.
            if (target instanceof Element && target.closest('[data-play-toggle]')) {
                return;
            }
            onStart();
        };
        // `capture: true` so a nested handler's `stopPropagation` on the way up can't
        // swallow the gesture before this sees it — this listener only ever reads the
        // event, never acts on behalf of whatever it landed on.
        window.addEventListener('pointerdown', start, { once: true, capture: true });
        window.addEventListener('keydown', start, { once: true, capture: true });
        return () => {
            window.removeEventListener('pointerdown', start, { capture: true });
            window.removeEventListener('keydown', start, { capture: true });
        };
    }, [pendingAutoplay]);
    // Disarms autoplay the moment the band is playing by ANY means — including the Play
    // button's own click a moment after the branch above deferred to it — so a later stray
    // tap/key elsewhere on the page can never reach `startPlayback()` a second time.
    useEffect(() => {
        if (playing) {
            setPendingAutoplay(false);
        }
    }, [playing]);

    return {
        playing,
        setPlaying,
        playbackPending,
        setPlaybackPending,
        active,
        setActive,
        countInBeat,
        place,
        nextSoon,
        changeSoon,
        pendingAutoplay,
        setPendingAutoplay,
    };
}
