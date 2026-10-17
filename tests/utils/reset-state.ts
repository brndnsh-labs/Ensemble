import { type ArrangerState, arranger } from '../../public/state/arranger.js';
import { type GrooveState, groove } from '../../public/state/groove.js';
import {
    bass,
    chords,
    INSTRUMENT_REVERB_DEFAULTS,
    soloist,
} from '../../public/state/instruments.js';
import {
    DEFAULT_BAND_INTENSITY,
    type GlobalContext,
    playback,
} from '../../public/state/playback.js';
import type { Mutable } from '../../public/types.js';

/**
 * Test-only full-state reset (#1381). `ACTIONS.RESET_STATE` was v1's
 * `hydrateState()` corrupt-payload fallback — deleted with v1's load/save layer
 * in #1424, and nothing else ever dispatched it. This is what several test
 * files used it for instead: a clean baseline between cases sharing one
 * module-level slice singleton. It writes slice fields directly rather than
 * through a reducer — a test-only reset; there is no live `dispatch` path this could stand in for.
 *
 * Keep in sync with each slice's own `deepSignal<T>({ ... })` initializer if a
 * default changes; this is intentionally NOT derived from it (a shared
 * derivation would reintroduce a cross-module coupling only tests need).
 */
export function resetAllStateForTest(): void {
    const p = playback as Mutable<GlobalContext>;
    p.bpm = 100;
    p.bandIntensity = DEFAULT_BAND_INTENSITY;
    p.autoIntensity = true;
    p.metronome = false;
    p.countIn = true;
    p.masterVolume = 0.4;

    const a = arranger as Mutable<ArrangerState>;
    a.sections = [{ id: 's1', label: 'Intro', repeat: 1 }];
    a.key = 'C';
    a.timeSignature = '4/4';
    a.notation = 'roman';
    a.isMinor = false;
    a.grouping = null;
    a.seed = '';
    a.randomizeSeed = true;

    const g = groove as Mutable<GrooveState>;
    g.enabled = true;
    g.voice = 'synth';
    g.autoSound = true;
    g.volume = 1.0;
    g.reverb = 0.2;
    g.swing = 0;
    g.swingSub = '8th';
    g.genreFeel = 'Rock';
    g.lastSmartGenre = 'Rock';
    g.humanize = 20;
    g.lastHatGain = null;
    g.lastSampledHatVoice = null;
    g.lastRideGain = null;
    g.lastCrashGain = null;

    const cc = chords as Mutable<typeof chords>;
    cc.enabled = true;
    cc.volume = 1.0;
    cc.reverb = INSTRUMENT_REVERB_DEFAULTS.chords;
    cc.voice = 'synth';
    cc.autoSound = true;
    cc.style = 'smart';

    const bb = bass as Mutable<typeof bass>;
    bb.enabled = true;
    bb.volume = 1.0;
    bb.reverb = INSTRUMENT_REVERB_DEFAULTS.bass;
    bb.style = 'smart';
    bb.voice = 'synth';
    bb.autoSound = true;

    const s = soloist as Mutable<typeof soloist>;
    s.enabled = false;
    s.voice = 'synth';
    s.autoSound = true;
    s.volume = 1.0;
    s.reverb = INSTRUMENT_REVERB_DEFAULTS.soloist;
    s.mode = 'monophonic';
    s.autoMode = true;
    const aud = s.audio as Mutable<typeof s.audio>;
    aud.lastRenderedFreq = null;
}
