// @ts-nocheck
/**
 * @vitest-environment happy-dom
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatch, getState } from '../../../public/state.js';
import { ACTIONS } from '../../../public/types.js';

// Mock side-effect modules to prevent EnvironmentTeardownErrors from dynamic imports in state.js
vi.mock('../../../public/controllers/app-controller.js', () => ({
    setBpm: vi.fn(),
    applyTheme: vi.fn(),
}));
vi.mock('../../../public/engine/scheduler-core.js', () => ({
    togglePlay: vi.fn(),
}));

// We'll test the ui-bridge.js logic directly
import { useEnsembleState } from '../../../public/ui-bridge.js';

describe('State Reactivity Bridge Regression Tests', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        document.body.removeChild(container);
        vi.clearAllMocks();
    });

    it('should force a re-render when a state property is mutated via deepSignal', async () => {
        let renderCount = 0;

        function TestComponent() {
            renderCount++;
            const groove = useEnsembleState((s) => s.groove);
            return <div>Volume: {groove.volume}</div>;
        }

        // 1. Initial render
        act(() => {
            render(<TestComponent />, container);
        });

        const initialCount = renderCount;
        const initialVolume = getState().groove.volume;
        expect(container.textContent).toContain(`Volume: ${initialVolume}`);

        // 2. Dispatch an action that mutates in-place (like SET_VOLUME)
        const newVolume = 0.123;
        act(() => {
            dispatch(ACTIONS.SET_VOLUME, { module: 'groove', value: newVolume });
        });

        // 3. Verify render count increased and UI updated
        expect(renderCount).toBeGreaterThan(initialCount);
        expect(container.textContent).toContain(`Volume: ${newVolume}`);
    });
});
