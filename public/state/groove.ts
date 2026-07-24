import { deepSignal } from 'deepsignal';
import type { Action, GlobalContext, GrooveState, Mutable } from '../types.js';
import { ACTIONS } from '../types.js';

export type { GrooveState };

export const groove = deepSignal<GrooveState>({
    enabled: true,
    voice: 'synth',
    autoSound: true,
    instruments: [
        { name: 'Kick', symbol: '🥁', steps: new Array(128).fill(0), muted: false },
        { name: 'Snare', symbol: '👏', steps: new Array(128).fill(0), muted: false },
        { name: 'HiHat', symbol: '🎩', steps: new Array(128).fill(0), muted: false },
        { name: 'Open', symbol: '📀', steps: new Array(128).fill(0), muted: false },
        { name: 'Clave', symbol: '🥢', steps: new Array(128).fill(0), muted: false },
        { name: 'Conga', symbol: '🪘', steps: new Array(128).fill(0), muted: false },
        { name: 'Bongo', symbol: '🥁', steps: new Array(128).fill(0), muted: false },
        { name: 'Perc', symbol: '🪇', steps: new Array(128).fill(0), muted: false },
        { name: 'Shaker', symbol: '🧂', steps: new Array(128).fill(0), muted: false },
        { name: 'Guiro', symbol: '🥖', steps: new Array(128).fill(0), muted: false },
        { name: 'High Tom', symbol: '🪘', steps: new Array(128).fill(0), muted: false },
        { name: 'Mid Tom', symbol: '🪘', steps: new Array(128).fill(0), muted: false },
        { name: 'Low Tom', symbol: '🪘', steps: new Array(128).fill(0), muted: false },
    ],
    volume: 1.0,
    reverb: 0.2,
    measures: 1,
    currentMeasure: 0,
    followPlayback: true,
    humanize: 20,
    swing: 0,
    swingSub: '8th',
    lastDrumPreset: 'Basic Rock',
    seed: '',
    audioBuffers: {},
    genreFeel: 'Rock',
    lastSmartGenre: 'Rock',
    pendingGenreFeel: null,
    genreSwitchCountdown: null,
    orchestrationMap: null,
    fillMap: null,
    accentMap: null,
    seedTimelineStartStep: 0,
    fillActive: false,
    fillSteps: {},
    buffer: new Map(),
    lastHatGain: null,
    lastSampledHatVoice: null,
    lastRideGain: null,
    lastCrashGain: null,
    fillStartStep: 0,
    fillLength: 0,
    snareMask: 0,
    pendingCrash: false,
    // why: generative fills/variations/entropy default ON (drum audit 2026-05-29).
    sectionSeedMap: {},
    variations: null,
});

/**
 * Every module alias that addresses the groove/drum lane on a `SET_PARAM` /
 * `SET_VOLUME` / `SET_REVERB` payload.
 *
 * This slice is the single authority for those three actions (#1182): the
 * `instrumentStateMap` arms in `instruments.ts` used to write groove state too,
 * and since `state.ts` runs both reducers unconditionally (it ignores their
 * boolean return), every groove volume/reverb/param change was written twice —
 * with this one landing second and winning. The aliases had also drifted apart:
 * `instrumentStateMap` carried `groove` + `gb` while this reducer took `groove`
 * + `drum` + `drums`, so `gb` was handled ONLY over there and `drum`/`drums`
 * ONLY here. Both sides now consult this set, which is why `gb` is in it —
 * dropping it from the instrument side without adding it here would have turned
 * a `gb`-keyed dispatch into a silent no-op.
 *
 * (`gb` has no dispatcher left in the repo; it's kept for stale persisted
 * payloads. `groove` STAYS in `instrumentStateMap` regardless — the
 * `SET_INSTRUMENT_VOICE` A/B voice switch resolves through that map.)
 */
const GROOVE_MODULE_KEYS = new Set(['groove', 'drum', 'drums', 'gb']);

/** True when a dispatch payload's `module` addresses the groove/drum lane. */
export function isGrooveModule(module: unknown): boolean {
    return typeof module === 'string' && GROOVE_MODULE_KEYS.has(module);
}

export function grooveReducer(action: Action, playback: GlobalContext): boolean {
    const g = groove as Mutable<typeof groove>;
    switch (action.type) {
        case ACTIONS.UPDATE_GB:
            for (const key in action.payload) {
                if (Object.hasOwn(groove, key)) {
                    (groove as any)[key] = (action.payload as any)[key];
                }
            }
            return true;
        case ACTIONS.SET_PARAM:
            if (isGrooveModule(action.payload.module)) {
                (groove as Record<string, unknown>)[action.payload.param] = action.payload.value;
                return true;
            }
            break;
        case ACTIONS.RESET_STATE:
            g.enabled = true;
            g.voice = 'synth';
            g.autoSound = true;
            g.volume = 1.0;
            g.reverb = 0.2;
            g.swing = 0;
            g.swingSub = '8th';
            g.genreFeel = 'Rock';
            g.lastSmartGenre = 'Rock';
            g.measures = 1;
            g.currentMeasure = 0;
            g.orchestrationMap = null;
            g.fillMap = null;
            g.accentMap = null;
            // #791: RESET_STATE previously left sectionSeedMap frozen from the
            // first-ever play while the song seed re-rolled — an incoherent
            // partial re-randomization. Clear it with its sibling seed maps so a
            // reset truly starts the groove memory fresh.
            g.sectionSeedMap = {};
            g.seedTimelineStartStep = 0;
            g.lastHatGain = null;
            g.lastSampledHatVoice = null;
            g.lastRideGain = null;
            g.lastCrashGain = null;

            groove.instruments.forEach((inst) => {
                inst.steps.fill(0);
                inst.muted = false;
            });
            return true;
        case ACTIONS.SET_ACTIVE_MEASURE:
            g.currentMeasure = parseInt(String(action.payload), 10);
            return true;
        case ACTIONS.SET_SWING:
            g.swing = action.payload;
            return true;
        case ACTIONS.SET_SWING_SUB:
            g.swingSub = action.payload;
            return true;
        case ACTIONS.SET_HUMANIZE:
            g.humanize = action.payload;
            return true;
        case ACTIONS.SET_VOLUME:
            if (isGrooveModule(action.payload.module)) {
                g.volume = action.payload.value;
                return true;
            }
            return false;
        case ACTIONS.SET_REVERB:
            if (isGrooveModule(action.payload.module)) {
                g.reverb = action.payload.value;
                return true;
            }
            return false;
        case ACTIONS.SET_GROOVE_SEED:
            if (!groove.sectionSeedMap) {
                g.sectionSeedMap = {};
            }
            g.sectionSeedMap[action.payload.sectionId] = action.payload.seed;
            return true;
        case ACTIONS.SET_SONG_SEED:
            // #791: sectionSeedMap is a memo of deriveSectionSeed(sectionId,
            // songSeed). When the song seed changes (re-roll on play, the seed
            // control, a shared-URL load) the memo is stale — invalidate it so
            // every section re-derives from the new seed. Without this, a
            // re-rolled take keeps the old groove for already-seeded sections
            // (the "incoherent partial re-randomization" of finding #791). A
            // PINNED seed never dispatches SET_SONG_SEED on replay, so its memo
            // survives and the groove reproduces exactly.
            g.sectionSeedMap = {};
            return true;
        case ACTIONS.SET_GENRE_COUNTDOWN:
            if (groove.genreSwitchCountdown !== action.payload) {
                g.genreSwitchCountdown = action.payload;
                return true;
            }
            return false;
        case ACTIONS.SET_GENRE_FEEL:
            if (playback.isPlaying) {
                g.pendingGenreFeel = action.payload;
                g.lastSmartGenre = action.payload.genreName || groove.lastSmartGenre;
            } else {
                g.genreFeel = action.payload.feel ?? groove.genreFeel;
                g.pendingGenreFeel = null;
                g.lastSmartGenre = action.payload.genreName || groove.lastSmartGenre;
                // DeepSignal handles nested reactivity, but we still map to ensure fresh references
                // for any legacy components that might rely on shallow comparison.
                g.instruments = groove.instruments.map((inst) => ({
                    ...inst,
                    steps: [...inst.steps],
                }));

                if (action.payload.swing !== undefined) {
                    g.swing = action.payload.swing;
                }
                if (action.payload.sub !== undefined) {
                    g.swingSub = action.payload.sub;
                }
            }
            return true;
        case ACTIONS.TRIGGER_FILL:
            g.fillSteps = action.payload.steps;
            g.fillActive = true;
            g.fillStartStep = action.payload.startStep;
            g.fillLength = action.payload.length;
            g.pendingCrash = !!action.payload.crash;
            return true;
    }
    return false;
}
