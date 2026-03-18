import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { getState, dispatch as internalDispatch, subscribe } from './state.js';

/**
 * @param {any} objA
 * @param {any} objB
 */
function shallowEqual(objA, objB) {
    if (Object.is(objA, objB)) {
        return true;
    }
    if (typeof objA !== 'object' || objA === null || typeof objB !== 'object' || objB === null) {
        return false;
    }
    const keysA = Object.keys(objA);
    const keysB = Object.keys(objB);
    if (keysA.length !== keysB.length) {
        return false;
    }
    for (let i = 0; i < keysA.length; i++) {
        if (!Object.hasOwn(objB, keysA[i]) || !Object.is(objA[keysA[i]], objB[keysA[i]])) {
            return false;
        }
    }
    return true;
}

/**
 * Hook to access the Ensemble global state.
 * @param {Function} selector - Function taking (state) and returning a slice.
 * @returns {*} The selected state slice.
 */
export function useEnsembleState(selector) {
    const selectorRef = useRef(selector);
    selectorRef.current = selector;

    // Trigger re-renders via a version counter
    const [, forceUpdate] = useState(0);

    const currentState = getState();
    const currentSlice = selector(currentState);

    // Track what we last rendered so the subscriber can perform an efficient comparison
    const lastRenderedSliceRef = useRef(currentSlice);
    lastRenderedSliceRef.current = currentSlice;

    useEffect(() => {
        /**
         * @param {string} _action
         * @param {any} _payload
         * @param {any} updatedStateMap
         */
        const update = (_action, _payload, updatedStateMap) => {
            const nextSlice = selectorRef.current(updatedStateMap);
            const stateVersion = updatedStateMap.playback.stateVersion;

            if (!shallowEqual(lastRenderedSliceRef.current, nextSlice)) {
                // If data has changed, force a re-render
                forceUpdate((v) => v + 1);
            } else if (typeof nextSlice === 'object' && nextSlice !== null) {
                // If data is an object, it might have been mutated in-place.
                // We use the global stateVersion to guarantee a re-render.
                forceUpdate(stateVersion);
            }
        };

        const unsubscribe = subscribe(update);
        return () => {
            unsubscribe();
        };
    }, []);

    return currentSlice;
}

useEnsembleState.getState = getState;

/**
 * Hook to get the dispatch function.
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
