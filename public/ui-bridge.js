import { useCallback, useRef } from 'preact/hooks';
import { getState, dispatch as internalDispatch } from './state.js';

/**
 * Custom hook to access Ensemble state slices with fine-grained reactivity.
 * Since the entire state is now powered by deepSignals, simply accessing
 * a property in the selector will automatically subscribe the component to updates.
 *
 * @template T
 * @param {(state: import('./types.js').EnsembleState) => T} selector - Function to select a state slice.
 * @returns {T} The selected state slice.
 */
export function useEnsembleState(selector) {
    // We maintain the selectorRef pattern just in case of complex closures,
    // though for signals it is often less critical.
    const selectorRef = useRef(selector);
    selectorRef.current = selector;

    const currentState = getState();
    return selectorRef.current(currentState);
}

/**
 * Hook to access the dispatch function.
 * @returns {(action: string, payload?: any) => void}
 */
export function useDispatch() {
    return useCallback(
        /** @type {(action: string, payload?: any) => void} */ (
            (action, payload) => {
                internalDispatch(action, payload);
            }
        ),
        [],
    );
}
