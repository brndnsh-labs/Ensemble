import { useEffect, useRef, useState } from 'preact/hooks';
import { getState, dispatch as internalDispatch } from './state.js';
import type { Dispatch, EnsembleState } from './types.js';

export function useEnsembleState<T>(selector: (state: EnsembleState) => T): T {
    const selectorRef = useRef(selector);
    selectorRef.current = selector;

    const currentState = getState();
    return selectorRef.current(currentState);
}

export function useMediaQuery(query: string): boolean {
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

export function useDispatch(): Dispatch {
    return internalDispatch;
}
