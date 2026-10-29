import { act } from 'react';
import { createRoot } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The one component `renderHook` renders: it calls the hook and publishes what it returned. */
function Probe<Props, Result>({
    useHook,
    props,
    result,
}: {
    useHook: (props: Props) => Result;
    props: Props;
    result: { current: Result };
}) {
    result.current = useHook(props);
    return null;
}

/**
 * Renders `useHook(props)` in a throwaway component (react-dom into happy-dom). `result.current`
 * is the latest return, `rerender` renders again with new props, `unmount` runs the cleanups.
 */
export function renderHook<Props, Result>(useHook: (props: Props) => Result, initialProps: Props) {
    const result = { current: undefined as Result };
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(<Probe useHook={useHook} props={initialProps} result={result} />));
    return {
        result,
        rerender(nextProps: Props) {
            act(() => root.render(<Probe useHook={useHook} props={nextProps} result={result} />));
        },
        unmount() {
            act(() => root.unmount());
            host.remove();
        },
    };
}
