import { validateProgression } from './engine/chords-engine.js';
import { analyzeFormUI } from './engine/conductor.js';
import { getVisualTime, initAudio, playNote } from './engine/engine.js';
import { scheduler } from './engine/scheduler-core.js';
import { isSoloistMonophonicMode } from './engine/soloist-mode-policy.js';
import { loadDrumPreset, setInstrumentControllerRefs } from './instrument-controller.js';
import { initPWA } from './pwa.js';
import { getState, subscribe } from './state.js';
import { handleEffects } from './state-effects.js';
import { hydrateState, loadFromUrl } from './state-hydration.js';
import { mountComponents } from './ui-root.jsx';
import { initWorker, syncWorker } from './worker-client.js';

function init() {
    const { playback, groove } = getState();
    try {
        // --- HYDRATE STATE FIRST ---
        // Ensure state is populated BEFORE the UI mounts so components initialize with correct data.
        hydrateState();
        loadFromUrl();

        // Initial Theme Application
        import('./app-controller.js').then(({ applyTheme }) => {
            applyTheme(playback.theme);
        });

        validateProgression(getState(), (a: any, p: any) =>
            (window as any).ensemble?.dispatch(a, p),
        );

        // --- ASSEMBLE UI ---
        mountComponents(() => getVisualTime(getState()));

        // --- WORKER INIT ---
        initWorker(
            () =>
                scheduler(getState(), (a: any, p: any) => (window as any).ensemble?.dispatch(a, p)),
            (
                notes: any[],
                requestTimestamp: number,
                workerProcessTime: number,
                isResolution: boolean,
            ) => {
                const { playback, soloist, bass, harmony, chords, groove } = getState();

                if (playback.resolutionTriggered && !isResolution) {
                    return;
                }

                // --- Latency Monitoring ---
                if (requestTimestamp) {
                    const now = performance.now();
                    const roundTrip = now - requestTimestamp;
                    const logicLatency = roundTrip - (workerProcessTime || 0);

                    if (logicLatency > 50) {
                        console.warn(
                            `[Performance] High Logic Latency: ${logicLatency.toFixed(1)}ms (Worker: ${workerProcessTime?.toFixed(1)}ms)`,
                        );
                    }
                }

                const sbUpdatedSteps = new Set();
                const bassUpdatedSteps = new Set();
                notes.forEach((n: any) => {
                    if (n.module === 'bass') {
                        if (!bassUpdatedSteps.has(n.step)) {
                            bass.buffer.set(n.step, []);
                            bassUpdatedSteps.add(n.step);
                        }
                        bass.buffer.get(n.step).push(n);
                    } else if (n.module === 'soloist') {
                        // ENFORCE MONOPHONIC: If mode is monophonic, skip additional notes for the same step
                        if (isSoloistMonophonicMode(soloist.mode) && soloist.buffer.has(n.step)) {
                            return;
                        }

                        if (!sbUpdatedSteps.has(n.step)) {
                            soloist.buffer.set(n.step, []);
                            sbUpdatedSteps.add(n.step);
                        }
                        soloist.buffer.get(n.step).push(n);
                    } else if (n.module === 'harmony') {
                        if (!harmony.buffer.has(n.step)) {
                            harmony.buffer.set(n.step, []);
                        }
                        harmony.buffer.get(n.step).push(n);
                    } else if (n.module === 'chords') {
                        if (!chords.buffer.has(n.step)) {
                            chords.buffer.set(n.step, []);
                        }
                        chords.buffer.get(n.step).push(n);
                    } else if (n.module === 'groove') {
                        if (!groove.buffer.has(n.step)) {
                            groove.buffer.set(n.step, []);
                        }
                        groove.buffer.get(n.step).push(n);
                    }
                });
                if (playback.isPlaying) {
                    scheduler(getState(), (a: any, p: any) =>
                        (window as any).ensemble?.dispatch(a, p),
                    );
                }
            },
        );

        setInstrumentControllerRefs(() =>
            scheduler(getState(), (a: any, p: any) => (window as any).ensemble?.dispatch(a, p)),
        );

        const hasDrumPattern = groove.instruments.some((inst: any) =>
            inst.steps.some((s: number) => s > 0),
        );
        if (!hasDrumPattern) {
            loadDrumPreset(groove.lastDrumPreset || 'Basic Rock');
        }

        // --- BACKGROUND RECOVERY ---
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                if (playback.audio && playback.audio.state === 'suspended' && playback.isPlaying) {
                    playback.audio.resume().catch(() => {});
                }
            }
        });

        analyzeFormUI(getState().arranger);

        subscribe((action: any, payload: any, stateMap: any, context: any) => {
            syncWorker(action, payload);
            handleEffects(action, payload, stateMap, context);
        });
        syncWorker();

        // Signal to E2E tests that hydration and mounting are complete
        document.documentElement.dataset.hydrated = 'true';
    } catch (e) {
        console.error('Error during init:', e);
    }
}

(window as any).previewChord = (index: number) => {
    const { playback, arranger } = getState();
    if (playback.isPlaying) {
        return;
    }
    initAudio(getState());
    const chord = arranger.progression[index] as any;
    if (!chord) {
        return;
    }
    const wasSustainActive = playback.sustainActive;
    playback.sustainActive = false; // @direct-mutation
    const now = playback.audio?.currentTime || 0;
    if (playback.audio) {
        chord.freqs.forEach((f: number) =>
            playNote(getState(), f, now, 1.0, { vol: 0.15, instrument: 'Piano' }),
        );
    }
    playback.sustainActive = wasSustainActive; // @direct-mutation
    const cards = document.querySelectorAll('.chord-card');
    if (cards[index]) {
        cards[index].classList.add('active');
        setTimeout(() => {
            if (!playback.isPlaying) {
                cards[index].classList.remove('active');
            }
        }, 300);
    }
};

window.addEventListener('load', () => {
    requestAnimationFrame(() => {
        init();
        initPWA();
    });
});
