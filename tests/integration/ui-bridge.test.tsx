// @ts-nocheck
/**
 * @vitest-environment happy-dom
 */
import { render } from 'preact';
import { useState } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock side-effect modules to prevent EnvironmentTeardownErrors from dynamic imports in state.js
vi.mock('../../public/app-controller.js', () => ({
    setBpm: vi.fn(),
    applyTheme: vi.fn(),
}));
vi.mock('../../public/engine/scheduler-core.js', () => ({
    togglePlay: vi.fn(),
}));

const activeListeners = new Set();

vi.mock('../../public/state.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        subscribe: vi.fn((listener) => {
            activeListeners.add(listener);
            const unsubscribe = actual.subscribe(listener);
            return () => {
                activeListeners.delete(listener);
                unsubscribe();
            };
        }),
        storage: {
            get: vi.fn(() => []),
            save: vi.fn(),
        },
    };
});

import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';
import { useEnsembleState } from '../../public/ui-bridge.js';

describe('UI Bridge Integration: Preact & State Stability', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        activeListeners.clear();
    });

    afterEach(() => {
        render(null, container); // Unmount anything remaining
        document.body.removeChild(container);
        vi.clearAllMocks();
    });

    describe('State Access', () => {
        it('should correctly select a state slice', async () => {
            function TestComponent() {
                const bpm = useEnsembleState((s) => s.playback.bpm);
                return <div id="bpm-val">{bpm}</div>;
            }

            act(() => {
                render(<TestComponent />, container);
            });

            const el = container.querySelector('#bpm-val');
            expect(el?.textContent).toBe('100');
        });
    });

    describe('Selective Re-renders', () => {
        it('should handle 50 rapid dispatches and settle on the final state', async () => {
            function TestComponent() {
                const bpm = useEnsembleState((s) => s.playback.bpm);
                return <div id="bpm-val">{bpm}</div>;
            }

            act(() => {
                render(<TestComponent />, container);
            });

            const targetBpm = 200;
            act(() => {
                for (let i = 60; i <= targetBpm; i++) {
                    dispatch(ACTIONS.SET_BPM, i);
                }
            });

            const bpmEl = container.querySelector('#bpm-val');
            expect(bpmEl.textContent).toBe(targetBpm.toString());
        });
    });

    describe('Selective Re-renders', () => {
        it('should only re-render components whose slice has changed', async () => {
            let playbackRenders = 0;
            let grooveRenders = 0;

            function PlaybackComp() {
                playbackRenders++;
                const bpm = useEnsembleState((s) => s.playback.bpm);
                return <div>BPM: {bpm}</div>;
            }

            function GrooveComp() {
                grooveRenders++;
                const volume = useEnsembleState((s) => s.groove.volume);
                return <div>Vol: {volume}</div>;
            }

            act(() => {
                render(
                    <div>
                        <PlaybackComp />
                        <GrooveComp />
                    </div>,
                    container,
                );
            });

            const initialPlaybackRenders = playbackRenders;
            const initialGrooveRenders = grooveRenders;

            // Update Playback ONLY
            act(() => {
                dispatch(ACTIONS.SET_BPM, 140);
            });

            expect(playbackRenders).toBeGreaterThan(initialPlaybackRenders);
            expect(grooveRenders).toBe(initialGrooveRenders);

            // Update Groove ONLY (Note: SET_VOLUME mutates in-place and increments stateVersion)
            act(() => {
                dispatch(ACTIONS.SET_VOLUME, { module: 'groove', value: 0.9 });
            });

            expect(grooveRenders).toBeGreaterThan(initialGrooveRenders);
        });
    });

    describe('Selector Resilience', () => {
        it('should use the latest selector even if it changes between renders', async () => {
            function Parent() {
                const [prop, setProp] = useState('bpm');
                // Changing selector function dynamically
                const selector = (s) =>
                    prop === 'bpm' ? s.playback.bpm : s.playback.bandIntensity;

                return (
                    <div>
                        <Child selector={selector} />
                        <button id="toggle" onClick={() => setProp('intensity')}>
                            Toggle
                        </button>
                    </div>
                );
            }

            function Child({ selector }) {
                const value = useEnsembleState(selector);
                return <div id="val">{value}</div>;
            }

            act(() => {
                render(<Parent />, container);
            });

            const initialBpm = getState().playback.bpm;
            expect(container.querySelector('#val').textContent).toBe(initialBpm.toString());

            // Switch selector to intensity
            const toggleBtn = container.querySelector('#toggle');
            act(() => {
                toggleBtn.click();
            });

            const intensity = getState().playback.bandIntensity;
            expect(container.querySelector('#val').textContent).toBe(intensity.toString());
        });
    });
});
