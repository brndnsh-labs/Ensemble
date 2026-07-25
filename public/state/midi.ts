import { deepSignal } from 'deepsignal';
import type { Action, MidiState, Mutable } from '../types.js';
import { ACTIONS } from '../types.js';

export type { MidiState };

export const midi = deepSignal<MidiState>({
    enabled: false,
    outputs: [],
    selectedOutputId: null,
    chordsChannel: 1,
    bassChannel: 2,
    soloistChannel: 3,
    harmonyChannel: 4,
    drumsChannel: 10,
    latency: 0,
    muteLocal: true,
    chordsOctave: 0,
    bassOctave: 0,
    soloistOctave: 0,
    harmonyOctave: 0,
    drumsOctave: 0,
    velocitySensitivity: 1.0,
    inputs: [],
    selectedInputId: null,
    inputEnabled: false,
});

export function midiReducer(action: Action): boolean {
    const m = midi as Mutable<typeof midi>;
    switch (action.type) {
        // #1259 — this slice had no RESET_STATE case, so the entire persisted MIDI
        // config survived `hydrateState()`'s "starting fresh" fallback: channels,
        // octave offsets, latency and a stale `selectedOutputId` all carried over.
        //
        // `outputs` / `inputs` are deliberately NOT reset. They are a mirror of live
        // hardware enumeration (`syncMIDIOutputs` / `syncMIDIInputs` in
        // midi-controller.ts, derived from the module-level `midiAccess`), never
        // written by hydration, and so not part of what a reset has to undo. Clearing
        // them would blank the device pickers until the next `onstatechange` while the
        // ports themselves stayed open — a desync, not a reset. Keep the inverse scoped
        // to what hydration actually writes.
        //
        // Both sync helpers early-return unless `midiAccess` is set, and `initMIDI()`'s
        // only live caller is a user click in Settings — so at the one moment this case
        // actually runs (boot hydration), the two lists are still empty and resetting
        // them would be a no-op anyway. That is what makes this a fact rather than a
        // preference, and it is also why resetting `enabled`/`selectedOutputId` here
        // cannot strand an open port or a held note: there is nothing open yet.
        //
        // Boot-only by contract: `RESET_STATE` has no delta case in `worker-client.ts`,
        // so it posts nothing, yet this case now writes 13 worker-mirrored fields. Safe
        // today only because hydration runs before `initWorker()`. If a reset ever gets
        // a UI entry point, it must be followed by `flushBuffers()` — not a bare
        // `syncWorker()`, which patches slices without resetting cursors. See
        // `docs/guides/WORKER_CONTRACT.md` rule 8.
        case ACTIONS.RESET_STATE:
            m.enabled = false;
            m.selectedOutputId = null;
            m.inputEnabled = false;
            m.selectedInputId = null;
            m.chordsChannel = 1;
            m.bassChannel = 2;
            m.soloistChannel = 3;
            m.harmonyChannel = 4;
            m.drumsChannel = 10;
            m.latency = 0;
            m.muteLocal = true;
            m.chordsOctave = 0;
            m.bassOctave = 0;
            m.soloistOctave = 0;
            m.harmonyOctave = 0;
            m.drumsOctave = 0;
            m.velocitySensitivity = 1.0;
            return true;
        case ACTIONS.SET_PARAM:
            if (action.payload.module === 'midi') {
                (midi as Record<string, unknown>)[action.payload.param] = action.payload.value;
                return true;
            }
            break;
        case ACTIONS.SET_MIDI_CONFIG:
            for (const key in action.payload) {
                if (Object.hasOwn(midi, key)) {
                    (midi as Record<string, unknown>)[key] =
                        action.payload[key as keyof typeof action.payload];
                }
            }
            return true;
    }
    return false;
}
