import { type ArrangerState, arranger } from '../../public/state/arranger.js';
import { type ConductorState, conductor } from '../../public/state/conductor.js';
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
import { type VisualizerState, vizState } from '../../public/state/visualizer.js';
import type { Mutable } from '../../public/types.js';

/**
 * Test-only full-state reset (#1381). `ACTIONS.RESET_STATE` was v1's
 * `hydrateState()` corrupt-payload fallback — deleted with v1's load/save layer
 * in #1424, and nothing else ever dispatched it. This is what several test
 * files used it for instead: a clean baseline between cases sharing one
 * module-level slice singleton. It writes slice fields directly rather than
 * through a reducer, which is the same class of write real production code
 * uses at boot (`state-hydration.ts`'s pre-mount `@direct-mutation` exception)
 * — there is no live `dispatch` path this could stand in for.
 *
 * Keep in sync with each slice's own `deepSignal<T>({ ... })` initializer if a
 * default changes; this is intentionally NOT derived from it (a shared
 * derivation would reintroduce a cross-module coupling only tests need).
 */
export function resetAllStateForTest(): void {
    const c = conductor as Mutable<ConductorState>;
    c.targetIntensity = 0.35;
    c.stepSize = 0.0005;
    c.formIteration = 0;

    const p = playback as Mutable<GlobalContext>;
    p.bpm = 100;
    p.bandIntensity = DEFAULT_BAND_INTENSITY;
    p.autoIntensity = true;
    p.metronome = false;
    p.countIn = true;
    p.visualFlash = false;
    p.qualityColors = true;
    p.sessionTimer = 5;
    p.applyPresetSettings = false;
    p.songMode = true;
    p.masterVolume = 0.4;

    const a = arranger as Mutable<ArrangerState>;
    a.scorePlan = null;
    a.sections = [{ id: 's1', label: 'Intro', value: 'I | V | vi | IV', repeat: 1 }];
    a.key = 'C';
    a.timeSignature = '4/4';
    a.notation = 'roman';
    a.isMinor = false;
    a.isDirty = false;
    a.history = [];
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
    g.orchestrationMap = null;
    g.fillMap = null;
    g.accentMap = null;
    g.sectionSeedMap = {};
    g.seedTimelineStartStep = 0;
    g.lastHatGain = null;
    g.lastSampledHatVoice = null;
    g.lastRideGain = null;
    g.lastCrashGain = null;

    const v = vizState as Mutable<VisualizerState>;
    v.enabled = false;

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
    s.style = 'smart';
    s.mode = 'monophonic';
    s.autoMode = true;
    const session = s.session as Mutable<typeof s.session>;
    const phr = session.phrasing as Mutable<typeof session.phrasing>;
    const cp = session.currentPhrase as Mutable<typeof session.currentPhrase>;
    const cpCtx = cp.context as Mutable<typeof cp.context>;
    const mem = session.memory as Mutable<typeof session.memory>;
    const con = session.contour as Mutable<typeof session.contour>;
    session.seed = null;
    session.sessionSteps = 0;
    session.phraseCount = 0;
    session.tension = 0;
    session.lastSmartStyle = 'scalar';
    phr.state = 'rest';
    phr.isResting = true;
    phr.transitionState = null;
    phr.restSteps = 0;
    phr.activeSteps = 0;
    phr.busySteps = 0;
    phr.isWaitingForEntry = false;
    phr.isYielding = false;
    phr.lastAttackStep = -100;
    cp.startStep = null;
    cp.loopCount = null;
    cp.sectionLabel = null;
    cp.sectionOccurrence = 0;
    cp.notesInPhrase = 0;
    cpCtx.role = 'call';
    cpCtx.skeleton = [];
    cpCtx.lastInterval = null;
    cpCtx.profile = 'srv';
    cpCtx.signature = null;
    cpCtx.responseSignature = null;
    cpCtx.responseMode = 'free';
    cpCtx.responseSource = 'free';
    cpCtx.sectionLabel = null;
    cpCtx.sectionOccurrence = 0;
    cpCtx.restatementEcho = null;
    mem.recentNotes = [];
    mem.sharedHookBuffer = [];
    mem.sectionRecall = {};
    mem.sectionRecallLoop = null;
    mem.formArcRecall = {};
    con.trend = 'Static';
    con.direction = 1;
    con.steps = 0;
    const aud = s.audio as Mutable<typeof s.audio>;
    aud.lastFreq = null;
    aud.lastMidiPlayed = null;
    aud.lastRenderedFreq = null;
    aud.lastPlayedFreq = null;
    aud.lastNoteEnd = 0;
}
