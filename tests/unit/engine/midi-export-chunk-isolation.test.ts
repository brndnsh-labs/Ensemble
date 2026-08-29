// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function loadGenerationRuntime() {
    // Why: each real Web Worker gets its own module graph. Resetting Vitest's
    // module cache creates the equivalent boundary while retained references
    // keep prior live/export graphs independently callable in this fixture.
    vi.resetModules();
    const [
        { ExportProcessor },
        { fillBuffers },
        { resetWorkerContext, workerContext },
        { resetHiddenGenerationMemory },
        { resetSoloistState },
        { resetBassState },
        { cloneStateForDetachedGeneration },
        { validateProgression },
        { dispatch, getState },
        { ACTIONS },
    ] = await Promise.all([
        import('../../../public/engine/midi-worker-logic.js'),
        import('../../../public/engine/worker-buffer-manager.js'),
        import('../../../public/engine/worker-orchestrator.js'),
        import('../../../public/engine/generation-run.js'),
        import('../../../public/engine/soloist-session.js'),
        import('../../../public/engine/bass-engine.js'),
        import('../../../public/export/detached-generation-state.js'),
        import('../../../public/engine/chords-engine.js'),
        import('../../../public/state.js'),
        import('../../../public/types.js'),
    ]);

    return {
        ExportProcessor,
        fillBuffers,
        resetWorkerContext,
        workerContext,
        resetHiddenGenerationMemory,
        resetSoloistState,
        resetBassState,
        cloneStateForDetachedGeneration,
        validateProgression,
        dispatch,
        getState,
        ACTIONS,
    };
}

function buildState(runtime, playbackStep) {
    runtime.dispatch(runtime.ACTIONS.RESET_STATE);
    const state = runtime.getState();
    state.arranger.sections = [
        {
            id: 'export-isolation',
            label: 'Export Isolation',
            value: 'Cmaj7 | Am7 | Dm7 | G7',
            key: 'C',
            timeSignature: '4/4',
        },
    ];
    state.arranger.key = 'C';
    state.arranger.isMinor = false;
    state.arranger.seed = 'midi-export-isolation';
    state.playback.step = playbackStep;
    state.playback.bandIntensity = 0.62;
    state.playback.bpm = 112;
    state.groove.genreFeel = 'Jazz';
    runtime.validateProgression(state);
    return state;
}

function prepareLiveGeneration(runtime, state) {
    runtime.workerContext.state = state;
    runtime.resetWorkerContext(0);
    runtime.resetSoloistState(state);
    runtime.resetBassState(state);
    runtime.resetHiddenGenerationMemory(state);
}

function liveTrace(messages) {
    return messages
        .filter((message) => message.type === 'notes')
        .flatMap((message) => message.notes);
}

function exportBytes(messages) {
    const complete = messages.find((message) => message.type === 'exportComplete');
    expect(complete).toBeDefined();
    return Array.from(complete.blob);
}

async function renderFreshExport(chunkMs, playbackStep) {
    const runtime = await loadGenerationRuntime();
    const state = runtime.cloneStateForDetachedGeneration(buildState(runtime, playbackStep));
    const messages = [];
    vi.stubGlobal('postMessage', (message) => messages.push(message));

    let now = 0;
    const performanceSpy = vi.spyOn(performance, 'now').mockImplementation(() => {
        now += 1;
        return now;
    });
    try {
        const processor = new runtime.ExportProcessor(state, {
            includedTracks: ['chords', 'bass', 'soloist', 'harmonies', 'drums'],
            loopMode: 'once',
            filename: 'isolation',
        });
        processor.CHUNK_MS = chunkMs;
        processor.start();
        await vi.runAllTimersAsync();
    } finally {
        performanceSpy.mockRestore();
    }

    return {
        bytes: exportBytes(messages),
        progressCount: messages.filter((message) => message.type === 'exportProgress').length,
    };
}

async function renderLiveControl() {
    const runtime = await loadGenerationRuntime();
    const state = buildState(runtime, 173);
    prepareLiveGeneration(runtime, state);
    const messages = [];
    vi.stubGlobal('postMessage', (message) => messages.push(message));

    for (let tick = 0; tick < 4; tick++) {
        runtime.fillBuffers(state, tick * 16);
    }

    return liveTrace(messages);
}

async function renderConcurrent({ shareRuntime }) {
    const liveRuntime = await loadGenerationRuntime();
    const liveState = buildState(liveRuntime, 173);
    prepareLiveGeneration(liveRuntime, liveState);

    const exportRuntime = shareRuntime ? liveRuntime : await loadGenerationRuntime();
    const exportSource = shareRuntime ? liveState : buildState(exportRuntime, 173);
    const exportState = exportRuntime.cloneStateForDetachedGeneration(exportSource);
    const messages = [];
    vi.stubGlobal('postMessage', (message) => messages.push(message));

    let now = 0;
    const performanceSpy = vi.spyOn(performance, 'now').mockImplementation(() => {
        now += 1;
        return now;
    });
    try {
        const processor = new exportRuntime.ExportProcessor(exportState, {
            includedTracks: ['chords', 'bass', 'soloist', 'harmonies', 'drums'],
            loopMode: 'once',
            filename: 'isolation',
        });
        processor.CHUNK_MS = 2;
        processor.start();

        let liveTick = 0;
        const advanceLiveGeneration = () => {
            liveRuntime.fillBuffers(liveState, liveTick * 16);
            liveTick++;
            if (liveTick < 4) {
                setTimeout(advanceLiveGeneration, 0);
            }
        };
        setTimeout(advanceLiveGeneration, 0);

        await vi.runAllTimersAsync();
    } finally {
        performanceSpy.mockRestore();
    }

    return {
        live: liveTrace(messages),
        exported: exportBytes(messages),
        progressCount: messages.filter((message) => message.type === 'exportProgress').length,
    };
}

describe('MIDI export chunk isolation', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    it('keeps live and exported traces stable while real export chunks yield', async () => {
        const liveControl = await renderLiveControl();
        const exportControl = await renderFreshExport(Number.POSITIVE_INFINITY, 0);
        const isolated = await renderConcurrent({ shareRuntime: false });

        expect(isolated.progressCount).toBeGreaterThan(0);
        expect(isolated.live).toEqual(liveControl);
        expect(isolated.exported).toEqual(exportControl.bytes);
    });

    it('proves the fixture detects shared mutable generation runtime', async () => {
        const liveControl = await renderLiveControl();
        const exportControl = await renderFreshExport(Number.POSITIVE_INFINITY, 0);
        const shared = await renderConcurrent({ shareRuntime: true });

        // Mutation proof: collapsing both hosts onto one module graph recreates
        // #1050's singleton interleaving and must make both control comparisons red.
        expect(shared.live).not.toEqual(liveControl);
        expect(shared.exported).not.toEqual(exportControl.bytes);
    });
});
