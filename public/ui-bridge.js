import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { getState, dispatch as internalDispatch, subscribe } from './state.js';

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

    const [slice, setSlice] = useState(() => selector(getState()));

    useEffect(() => {
        const update = (_action, _payload, updatedStateMap) => {
            const newSlice = selectorRef.current(updatedStateMap);
            setSlice((prevSlice) => {
                if (!shallowEqual(prevSlice, newSlice)) {
                    return newSlice;
                }
                return prevSlice;
            });
        };

        const unsubscribe = subscribe(update);
        return unsubscribe;
    }, []);

    return slice;
}

useEnsembleState.getState = getState;

/**
 * Hook to get the dispatch function.
 */
export function useDispatch() {
    return useCallback((action, payload) => {
        internalDispatch(action, payload);
    }, []);
}
