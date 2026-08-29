import { handleEffects } from '../public/state/state-effects.js';
import type { Dispatch, EnsembleState } from '../public/types.js';
import { ACTIONS } from '../public/types.js';
import { syncWorker } from '../public/worker-client.js';

/**
 * Compile-only contract fixture, mirroring typecheck-dispatch-contract.ts.
 * `npm run typecheck` includes scripts, so an unused `@ts-expect-error` turns
 * the gate red if the notify/subscribe path downstream of dispatch
 * (StateListener → syncWorker/handleEffects) ever regains an `any`-typed
 * action/payload hole. The function is deliberately never invoked.
 */
function assertWorkerSyncContract(): void {
    const dispatch = (() => {}) as unknown as Dispatch;
    const state = {} as unknown as EnsembleState;

    handleEffects({ type: ACTIONS.SET_BPM, payload: 120 }, state, { dispatch });
    handleEffects({ type: ACTIONS.TOGGLE_PLAY, payload: undefined }, state, { dispatch });

    // @ts-expect-error — unknown action types are not part of the Action union.
    handleEffects({ type: 'NOT_AN_ACTION', payload: 1 }, state, { dispatch });

    // @ts-expect-error — payload shape must match the selected action's real type.
    handleEffects({ type: ACTIONS.SET_BPM, payload: { bpm: 120 } }, state, { dispatch });

    // @ts-expect-error — a discriminated Action can't decouple its type from its payload.
    handleEffects({ type: ACTIONS.SET_BPM, payload: undefined }, state, { dispatch });

    syncWorker();
    syncWorker(ACTIONS.SET_BPM);
    syncWorker('LOOP_BOUNDARY');
    syncWorker('ARRANGER_UPDATE');

    // @ts-expect-error — unknown action strings are not part of syncWorker's keyspace either.
    syncWorker('NOT_A_WORKER_ACTION');
}

void assertWorkerSyncContract;
