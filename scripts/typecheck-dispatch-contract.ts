import { dispatch } from '../public/state.js';
import { ACTIONS } from '../public/types.js';

/**
 * Compile-only contract fixture. `npm run typecheck` includes scripts, so an
 * unused `@ts-expect-error` turns the gate red if Dispatch ever becomes loose.
 * The function is deliberately never invoked.
 */
function assertDispatchContract(): void {
    dispatch(ACTIONS.SET_BPM, 120);

    // @ts-expect-error — unknown action strings are not part of the keyspace.
    dispatch('NOT_AN_ACTION');

    // @ts-expect-error — SET_BPM requires its numeric payload.
    dispatch(ACTIONS.SET_BPM);

    // @ts-expect-error — payload shape must match the selected action.
    dispatch(ACTIONS.SET_BPM, { bpm: 120 });

    const unionAction = ACTIONS.SET_BPM as typeof ACTIONS.SET_BPM | typeof ACTIONS.SET_METRONOME;

    // @ts-expect-error — a union action cannot decouple its runtime key from its payload.
    dispatch(unionAction, 120);

    // @ts-expect-error — SET_GENRE_FEEL rejects misspelled fields.
    dispatch(ACTIONS.SET_GENRE_FEEL, { genrName: 'Jazz' });

    // @ts-expect-error — SET_GENRE_FEEL rejects a field of the wrong type.
    dispatch(ACTIONS.SET_GENRE_FEEL, { swing: 'fast' });

    // A widened `Record<string, unknown>` (e.g. a value threaded through generic
    // plumbing) cannot silently satisfy an action with required fields — every
    // one of SET_GENRE_FEEL's fields is optional, so `Record<string, unknown>`
    // is (surprisingly) structurally assignable to it; SET_INSTRUMENT_VOICE's
    // required `module`/`voice` make this a genuine test.
    const looseInstrumentVoice: Record<string, unknown> = { module: 'chords', voice: 'synth' };

    // @ts-expect-error — broad records cannot bypass a known-field contract.
    dispatch(ACTIONS.SET_INSTRUMENT_VOICE, looseInstrumentVoice);

    // SET_PARAM writes only a field its named slice declares (#1633).
    dispatch(ACTIONS.SET_PARAM, { module: 'playback', param: 'bpm', value: 120 });

    // @ts-expect-error — a field no slice declares cannot be created through SET_PARAM.
    dispatch(ACTIONS.SET_PARAM, { module: 'playback', param: 'noSuchField', value: 1 });

    // @ts-expect-error — a real field of another slice is not a field of this one.
    dispatch(ACTIONS.SET_PARAM, { module: 'playback', param: 'swing', value: 1 });

    // @ts-expect-error — the old lane aliases are gone; the module is the slice name.
    dispatch(ACTIONS.SET_PARAM, { module: 'sb', param: 'enabled', value: true });

    // @ts-expect-error — SET_VOLUME takes a lane's canonical name, not an alias.
    dispatch(ACTIONS.SET_VOLUME, { module: 'gb', value: 1 });
}

void assertDispatchContract;
