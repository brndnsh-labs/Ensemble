// @ts-nocheck
/**
 * @vitest-environment happy-dom
 *
 * #1008 — paused-frame lifecycle for both visualizer loops. The bug: while the
 * overlay sat open with playback paused, the main-thread loop and the
 * OffscreenCanvas worker each woke at display rate forever despite having
 * nothing to paint. These tests drive both loops under a fake rAF and prove:
 * pause leaves zero continuing callbacks after the final frame, resume
 * restarts both loops, reduced-motion event-stepping is unchanged, and close
 * still tears everything down.
 */
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const engineState = vi.hoisted(() => ({ renders: [] }));

vi.mock('../../../public/visualizer/visualizer-engine.js', () => ({
    VisualizerEngine: class {
        render(...args) {
            engineState.renders.push(args);
        }
        resize() {}
        setTheme() {}
        addTrack() {}
        setRegister() {}
        setBeatReference() {}
        pushNote() {}
        pushChord() {}
        truncateNotes() {}
        clear() {}
        destroy() {}
    },
}));

// --- shared fake-rAF harness -------------------------------------------------

let pendingFrames;
let rafCounter;

function installFakeRaf() {
    pendingFrames = new Map();
    rafCounter = 0;
    vi.stubGlobal('requestAnimationFrame', (cb) => {
        const id = ++rafCounter;
        pendingFrames.set(id, cb);
        return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id) => {
        pendingFrames.delete(id);
    });
}

/** Runs every currently-queued frame once; newly queued frames wait for the next call. */
function flushQueuedFrames(timestamp = 1000) {
    const batch = [...pendingFrames.keys()];
    for (const id of batch) {
        const cb = pendingFrames.get(id);
        pendingFrames.delete(id);
        cb(timestamp);
    }
}

/** Runs queued frames until none are left (bounded), i.e. the loop reached steady state. */
function drainToSteadyState(maxFrames = 64) {
    let ran = 0;
    let stamp = 1000;
    while (pendingFrames.size > 0 && ran++ < maxFrames) {
        stamp += 16.7;
        flushQueuedFrames(stamp);
    }
    if (ran >= maxFrames) {
        throw new Error(`rAF queue did not settle after ${maxFrames} frames`);
    }
}

beforeEach(() => {
    installFakeRaf();
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

// --- worker loop -------------------------------------------------------------

describe('visualizer-worker paused-frame lifecycle (#1008)', () => {
    const post = (data) => {
        act(() => {
            self.onmessage({ data });
        });
    };

    beforeEach(async () => {
        vi.resetModules();
        engineState.renders.length = 0;
        // The worker registers onmessage on `self` at import time; reimporting
        // after resetModules gives each test fresh module state.
        await import('../../../public/visualizer-worker.js');
    });

    it('INIT while paused leaves zero steady-state rAF callbacks', () => {
        post({ type: 'INIT', canvas: {}, staticCanvas: {} });
        drainToSteadyState();

        expect(pendingFrames.size).toBe(0);
        expect(engineState.renders).toHaveLength(0);
    });

    it('plays continuously, then pause paints one frozen frame and stops scheduling', () => {
        post({ type: 'INIT', canvas: {}, staticCanvas: {} });
        post({ type: 'SET_PLAYING', isPlaying: true });
        post({ type: 'SYNC_CLOCK', audioTime: 42, perfTime: performance.now() });

        flushQueuedFrames();
        expect(engineState.renders.length).toBeGreaterThanOrEqual(1);
        expect(pendingFrames.size).toBe(1);

        // Playing keeps the loop alive across many frames.
        for (let i = 0; i < 5; i++) {
            flushQueuedFrames(2000 + i * 16);
            expect(pendingFrames.size).toBe(1);
        }

        post({ type: 'SET_PLAYING', isPlaying: false });

        // One final frozen frame, then the queue empties and stays empty.
        drainToSteadyState();
        const frozenRenderCount = engineState.renders.length;
        expect(frozenRenderCount).toBeGreaterThan(0);
        expect(pendingFrames.size).toBe(0);

        // No continuing callbacks after the final frame.
        flushQueuedFrames(5000);
        flushQueuedFrames(6000);
        expect(pendingFrames.size).toBe(0);
        expect(engineState.renders).toHaveLength(frozenRenderCount);
    });

    it('SET_PLAYING(true) explicitly restarts a stopped loop', () => {
        post({ type: 'INIT', canvas: {}, staticCanvas: {} });
        post({ type: 'SET_PLAYING', isPlaying: true });
        post({ type: 'SYNC_CLOCK', audioTime: 10, perfTime: performance.now() });
        post({ type: 'SET_PLAYING', isPlaying: false });
        drainToSteadyState();
        expect(pendingFrames.size).toBe(0);

        post({ type: 'SET_PLAYING', isPlaying: true });
        expect(pendingFrames.size).toBe(1);

        flushQueuedFrames(3000);
        expect(pendingFrames.size).toBe(1);
    });

    it('a message received while paused-and-settled requests exactly one frame', () => {
        post({ type: 'INIT', canvas: {}, staticCanvas: {} });
        post({ type: 'SYNC_CLOCK', audioTime: 7, perfTime: performance.now() });
        drainToSteadyState();
        expect(pendingFrames.size).toBe(0);

        post({ type: 'THEME', themeCache: { bgColor: '#000' } });
        expect(pendingFrames.size).toBe(1);

        drainToSteadyState();
        expect(pendingFrames.size).toBe(0);
    });

    it('reduced-motion event-stepping is unchanged while playing', () => {
        post({ type: 'INIT', canvas: {}, staticCanvas: {} });
        post({ type: 'SET_PLAYING', isPlaying: true });
        // SYNC_CLOCK pins audio time; perf anchor is "now", so elapsed real time
        // advances `now` — but renders must land on step boundaries regardless.
        post({ type: 'SYNC_CLOCK', audioTime: 0.01, perfTime: performance.now() });
        post({ type: 'SET_REDUCED_MOTION', reducedMotion: true });
        // 120bpm, 4 steps/beat -> stepDur 0.125s.
        const stepDur = 60 / 120 / 4;

        // Playing: run a bounded stretch of frames.
        for (let i = 0; i < 10; i++) {
            flushQueuedFrames(4000 + i * 16);
        }
        expect(engineState.renders.length).toBeGreaterThanOrEqual(1);
        for (const [renderedTime] of engineState.renders) {
            const stepIndex = Math.round(renderedTime / stepDur);
            expect(Math.abs(renderedTime - stepIndex * stepDur)).toBeLessThan(1e-9);
        }

        // Intra-step frames do not repaint (frozen within the step).
        const countAtStep = engineState.renders.length;
        flushQueuedFrames();
        flushQueuedFrames();
        expect(engineState.renders.length).toBe(countAtStep);
    });
});

// --- main-thread component loop ----------------------------------------------

// File-scope so the hoisted vi.mock factories can reach it.
const componentHarness = vi.hoisted(() => {
    const h = {
        state: null,
        dispatchCalls: [],
        dispatch: vi.fn(),
        UnifiedVisualizer: vi.fn(function () {
            this.setPlaying = vi.fn();
            this.syncClock = vi.fn();
            this.render = vi.fn();
            this.clear = vi.fn();
            this.setBeatReference = vi.fn();
            this.pushNote = vi.fn();
            this.pushChord = vi.fn();
            this.truncateNotes = vi.fn();
            this.setRegister = vi.fn();
            this.setFill = vi.fn();
            this.resize = vi.fn();
            this.addTrack = vi.fn();
            this.setTheme = vi.fn();
            this.setReducedMotion = vi.fn();
            this.destroy = vi.fn();
        }),
    };
    return h;
});

vi.mock('../../../public/state.js', () => ({
    dispatch: (...args) => componentHarness.dispatch(...args),
    getState: () => componentHarness.state,
    get stateMap() {
        return componentHarness.state;
    },
}));
vi.mock('../../../public/ui-bridge.js', () => ({
    useEnsembleState: (selector) => selector(componentHarness.state),
}));
vi.mock('../../../public/visualizer/visualizer-proxy.js', () => ({
    UnifiedVisualizer: componentHarness.UnifiedVisualizer,
}));
vi.mock('../../../public/controllers/app-controller.js', () => ({
    resolveMode: () => 'dark',
}));
vi.mock('../../../public/controllers/instrument-controller.js', () => ({
    switchMeasure: vi.fn(),
}));

describe('Visualizer component paused-frame lifecycle (#1008)', () => {
    let container;
    let mockState;
    const dispatchCalls = componentHarness.dispatchCalls;
    const dispatchMock = componentHarness.dispatch;
    const UnifiedVisualizerMock = componentHarness.UnifiedVisualizer;
    const lastViz = () => UnifiedVisualizerMock.mock.results.at(-1)?.value;

    dispatchMock.mockImplementation((action, payload) => {
        dispatchCalls.push([action, payload]);
        if (payload?.module && payload?.param) {
            componentHarness.state[payload.module][payload.param] = payload.value;
        }
    });

    let VisualizerComponent;

    const makeState = () => ({
        playback: {
            isPlaying: false,
            isDrawing: false,
            audio: { currentTime: 100 },
            drawQueue: [],
            bpm: 120,
            palette: 'default',
            mode: 'auto',
            unswungNextNoteTime: 0,
            step: 0,
        },
        groove: { currentMeasure: 0 },
        chords: { lastActiveChordIndex: null, octave: 4 },
        bass: { octave: 2 },
        soloist: { octave: 5 },
        harmony: { octave: 4 },
        arranger: { timeSignature: '4/4' },
    });

    const mountViz = async () => {
        if (!VisualizerComponent) {
            ({ Visualizer: VisualizerComponent } = await import(
                '../../../public/components/Visualizer.jsx'
            ));
        }
        await act(() => {
            render(<VisualizerComponent enabled={true} getVisualTime={() => 100} />, container);
        });
    };

    beforeEach(() => {
        document.body.innerHTML = '';
        container = document.createElement('div');
        document.body.appendChild(container);
        mockState = makeState();
        componentHarness.state = mockState;
        dispatchCalls.length = 0;

        UnifiedVisualizerMock.mockClear();
        dispatchMock.mockClear();

        window.matchMedia = vi.fn(() => ({
            matches: false,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        }));
        window.ResizeObserver = class {
            observe() {}
            disconnect() {}
            unobserve() {}
        };
    });

    afterEach(() => {
        render(null, container);
        container.remove();
    });

    it('runs continuously while playing, then stops when the transport pauses', async () => {
        mockState.playback.isPlaying = true;
        await mountViz();

        // Playing: every flushed frame schedules exactly one successor.
        for (let i = 0; i < 10; i++) {
            flushQueuedFrames(2000 + i * 16);
            expect(pendingFrames.size).toBe(1);
        }
        expect(lastViz().syncClock).toHaveBeenCalled();

        mockState.playback.isPlaying = false;
        await act(() => {
            render(<VisualizerComponent enabled={true} getVisualTime={() => 100} />, container);
        });
        drainToSteadyState();
        expect(pendingFrames.size).toBe(0);
    });

    it('pause drains the queue, settles state, then leaves zero continuing callbacks', async () => {
        mockState.playback.isPlaying = true;
        mockState.playback.isDrawing = true;
        mockState.chords.lastActiveChordIndex = 3;
        mockState.playback.drawQueue = [{ type: 'note', track: 'bass', time: 99, midi: 36 }];
        await mountViz();

        // Simulate the transport stopping mid-drain.
        mockState.playback.isPlaying = false;
        await act(() => {
            render(<VisualizerComponent enabled={true} getVisualTime={() => 100} />, container);
        });

        drainToSteadyState();

        expect(mockState.playback.isDrawing).toBe(false);
        expect(mockState.chords.lastActiveChordIndex).toBe(null);
        expect(mockState.playback.drawQueue).toEqual([]);
        expect(lastViz().clear).toHaveBeenCalled();
        expect(pendingFrames.size).toBe(0);

        // Nothing wakes back up on its own.
        flushQueuedFrames(90000);
        flushQueuedFrames(99999);
        expect(pendingFrames.size).toBe(0);
    });

    it('mounting while idle schedules nothing', async () => {
        await mountViz();

        flushQueuedFrames();
        drainToSteadyState();
        expect(pendingFrames.size).toBe(0);
    });

    it('resume after a settled pause restarts the loop', async () => {
        mockState.playback.isPlaying = true;
        mockState.playback.isDrawing = true;
        await mountViz();
        mockState.playback.isPlaying = false;
        await act(() => {
            render(<VisualizerComponent enabled={true} getVisualTime={() => 100} />, container);
        });
        drainToSteadyState();
        expect(pendingFrames.size).toBe(0);

        mockState.playback.isPlaying = true;
        await act(() => {
            render(<VisualizerComponent enabled={true} getVisualTime={() => 100} />, container);
        });
        expect(pendingFrames.size).toBe(1);
        flushQueuedFrames();
        expect(pendingFrames.size).toBe(1);
    });

    it('a stale frame clock across an idle pause cannot escalate to emergency lookahead', async () => {
        mockState.playback.isPlaying = true;
        mockState.playback.isDrawing = true;
        await mountViz();
        mockState.playback.isPlaying = false;
        await act(() => {
            render(<VisualizerComponent enabled={true} getVisualTime={() => 100} />, container);
        });
        drainToSteadyState();

        mockState.playback.isPlaying = true;
        await act(() => {
            render(<VisualizerComponent enabled={true} getVisualTime={() => 100} />, container);
        });
        // Playing again: frames flow, and none of the resumed deltas — however
        // stale the wall clock — may escalate to emergency lookahead.
        for (let i = 0; i < 30; i++) {
            flushQueuedFrames(50000 + i * 100);
        }

        const emergencies = dispatchCalls.filter(
            ([action]) => action === 'TRIGGER_EMERGENCY_LOOKAHEAD',
        );
        expect(emergencies).toHaveLength(0);

        mockState.playback.isPlaying = false;
        await act(() => {
            render(<VisualizerComponent enabled={true} getVisualTime={() => 100} />, container);
        });
        drainToSteadyState();
    });

    it('unmount still terminates the worker proxy and drops pending frames', async () => {
        mockState.playback.isPlaying = true;
        await mountViz();
        expect(pendingFrames.size).toBe(1);

        render(null, container);

        expect(lastViz().destroy).toHaveBeenCalled();
        expect(pendingFrames.size).toBe(0);
    });
});
