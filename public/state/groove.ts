import { deepSignal } from 'deepsignal/core';
import type { Action, GlobalContext, GrooveState, Mutable } from '../types.js';
import { ACTIONS, isSwingSub } from '../types.js';

export type { GrooveState };

export const groove = deepSignal<GrooveState>({
    enabled: true,
    voice: 'synth',
    autoSound: true,
    volume: 1.0,
    reverb: 0.2,
    humanize: 20,
    swing: 0,
    swingSub: '8th',
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
        case ACTIONS.SET_PARAM:
            if (isGrooveModule(action.payload.module)) {
                (groove as Record<string, unknown>)[action.payload.param] = action.payload.value;
                return true;
            }
            break;
        case ACTIONS.SET_SWING:
            g.swing = action.payload;
            return true;
        case ACTIONS.SET_SWING_SUB:
            // #1264 — payload arrives untyped (a DOM `<Select>` value, or the e2e
            // bridge). An unrecognized grid is IGNORED rather than defaulted: silently
            // resetting a user's 16th-note feel to 8th on a bad payload changes the
            // groove's idiom, which is a worse failure than the write not landing.
            if (isSwingSub(action.payload)) {
                g.swingSub = action.payload;
            }
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
        case ACTIONS.SET_GENRE_FEEL:
            if (playback.isPlaying) {
                g.pendingGenreFeel = action.payload;
                g.lastSmartGenre = action.payload.genreName || groove.lastSmartGenre;
            } else {
                g.genreFeel = action.payload.feel ?? groove.genreFeel;
                g.pendingGenreFeel = null;
                g.lastSmartGenre = action.payload.genreName || groove.lastSmartGenre;
                if (action.payload.swing !== undefined) {
                    g.swing = action.payload.swing;
                }
                if (isSwingSub(action.payload.sub)) {
                    g.swingSub = action.payload.sub;
                }
            }
            return true;
    }
    return false;
}
