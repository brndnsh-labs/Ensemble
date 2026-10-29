import { act } from 'react';
import { createRoot } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Renders `useHook(props)` in a throwaway component (react-dom into happy-dom). `result.current`
 * is the latest return, `rerender` renders again with new props, `unmount` runs the cleanups.
 */
export function renderHook<Props, Result>(useHook: (props: Props) => Result, initialProps: Props) {
    const result = { current: undefined as Result };
    function Probe({ props }: { props: Props }) {
        result.current = useHook(props);
        return null;
    }
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(<Probe props={initialProps} />));
    return {
        result,
        rerender(nextProps: Props) {
            act(() => root.render(<Probe props={nextProps} />));
        },
        unmount() {
            act(() => root.unmount());
            host.remove();
        },
    };
}
