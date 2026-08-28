import { dispatch } from '../public/state.js';
import { ACTIONS } from '../public/types.js';

/**
 * Compile-only contract fixture. `npm run typecheck` includes scripts, so an
 * unused `@ts-expect-error` turns the gate red if Dispatch ever becomes loose.
 * The function is deliberately never invoked.
 */
function assertDispatchContract(): void {
    dispatch(ACTIONS.TOGGLE_PLAY);
    dispatch(ACTIONS.SET_BPM, 120);

    // @ts-expect-error — unknown action strings are not part of the keyspace.
    dispatch('NOT_AN_ACTION');

    // @ts-expect-error — SET_BPM requires its numeric/string payload.
    dispatch(ACTIONS.SET_BPM);

    // @ts-expect-error — payload shape must match the selected action.
    dispatch(ACTIONS.SET_BPM, { bpm: 120 });

    // @ts-expect-error — payload-less actions reject unrelated payloads.
    dispatch(ACTIONS.TOGGLE_PLAY, true);

    const unionAction = ACTIONS.SET_BPM as typeof ACTIONS.SET_BPM | typeof ACTIONS.SET_KEY;

    // @ts-expect-error — a union action cannot decouple its runtime key from its payload.
    dispatch(unionAction, 120);

    const looseSoloistUpdate: Record<string, unknown> = { enabled: true };

    // @ts-expect-error — broad records cannot bypass UPDATE_SB's known field contract.
    dispatch(ACTIONS.UPDATE_SB, looseSoloistUpdate);

    // @ts-expect-error — UPDATE_SB rejects misspelled fields.
    dispatch(ACTIONS.UPDATE_SB, { isWaitngForEntry: true });
}

void assertDispatchContract;
