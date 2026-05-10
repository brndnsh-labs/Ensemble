import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
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
 * Reactive hook for CSS media queries. Returns the current match state and
 * re-renders when the query result changes (e.g. window resize, orientation change).
 * @param {string} query - CSS media query string, e.g. `'(max-width: 1023px)'`
 * @returns {boolean}
 */
export function useMediaQuery(query) {
    const [matches, setMatches] = useState(() =>
        typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
    );

    useEffect(() => {
        const mq = window.matchMedia(query);
        const update = () => setMatches(mq.matches);
        mq.addEventListener('change', update);
        return () => mq.removeEventListener('change', update);
    }, [query]);

    return matches;
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
