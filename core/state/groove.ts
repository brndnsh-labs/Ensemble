import { deepSignal } from 'deepsignal/core';
import type { Action, GlobalContext, GrooveState, Mutable } from '../types.js';
import { ACTIONS, isSwingSub } from '../types.js';
import { writeDeclaredParam } from './set-param.js';

export type { GrooveState };

export const groove = deepSignal<GrooveState>({
    enabled: true,
    voice: 'synth',
    autoSound: true,
    volume: 1.0,
    reverb: 0.2,
    // 20 is "not set" (#2010): the band plays its style's own humanize until the musician
    // changes it (`web/lib/genre-humanize.ts`'s `UNSET_HUMANIZE`).
    humanize: 20,
    swing: 0,
    swingSub: '8th',
    audioBuffers: {},
    genreFeel: 'Rock',
    lastSmartGenre: 'Rock',
    pendingGenreFeel: null,
    lastHatGain: null,
    lastSampledHatVoice: null,
    lastRideGain: null,
    lastCrashGain: null,
});

/**
 * The module name that addresses the groove/drum lane on a `SET_PARAM` / `SET_VOLUME` /
 * `SET_REVERB` payload.
 *
 * This slice is the single authority for those three actions (#1182): the
 * `instrumentStateMap` arms in `instruments.ts` used to write groove state too, and since
 * `state.ts` runs both reducers unconditionally (it ignores their boolean return), every groove
 * volume/reverb/param change was written twice. The old `drum`, `drums` and `gb` aliases had
 * no dispatcher left and are gone (#1633): `module` is the canonical slice name only.
 * (`groove` also stays in `instrumentStateMap` — the `SET_INSTRUMENT_VOICE` A/B voice switch
 * resolves through that map.)
 */
const GROOVE_MODULE = 'groove';

/** True when a dispatch payload's `module` addresses the groove/drum lane. */
export function isGrooveModule(module: unknown): boolean {
    return module === GROOVE_MODULE;
}

export function grooveReducer(action: Action, playback: GlobalContext): boolean {
    const g = groove as Mutable<typeof groove>;
    switch (action.type) {
        case ACTIONS.SET_PARAM:
            if (isGrooveModule(action.payload.module)) {
                return writeDeclaredParam(
                    groove,
                    'groove',
                    action.payload.param,
                    action.payload.value,
                );
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
