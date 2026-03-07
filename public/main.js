import { validateProgression } from './chords.js';
import { analyzeFormUI } from './conductor.js';
import { initAudio, playNote } from './engine/engine.js';
import { scheduler } from './engine/scheduler-core.js';
import { loadDrumPreset, setInstrumentControllerRefs } from './instrument-controller.js';
import { initPWA } from './pwa.js';
import { getState, subscribe } from './state.js';
import { hydrateState, loadFromUrl } from './state-hydration.js';
import { mountComponents } from './ui-root.jsx';
import { UnifiedVisualizer } from './visualizer.js';
import { initWorker, syncWorker } from './worker-client.js';

let viz;

function init() {
    const { playback, groove } = getState();
    try {
        // --- HYDRATE STATE FIRST ---
        // Ensure state is populated BEFORE the UI mounts so components initialize with correct data.
        hydrateState();
        loadFromUrl();
        validateProgression();

        // --- ASSEMBLE UI ---
        mountComponents();

        // --- WORKER INIT ---
        initWorker(
            () => scheduler(),
            (notes, requestTimestamp, workerProcessTime, isResolution) => {
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
                notes.forEach((n) => {
                    if (n.module === 'bass') {
                        if (!bassUpdatedSteps.has(n.step)) {
                            bass.buffer.set(n.step, []);
                            bassUpdatedSteps.add(n.step);
                        }
                        bass.buffer.get(n.step).push(n);
                    } else if (n.module === 'soloist') {
                        // ENFORCE MONOPHONIC: If double stops are disabled, skip additional notes for the same step
                        if (!soloist.doubleStops && soloist.buffer.has(n.step)) {
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
                    scheduler();
                }
            },
        );

        viz = new UnifiedVisualizer('unifiedVizContainer');
        playback.viz = viz;
        viz.addTrack('bass', 'var(--success-color)');
        viz.addTrack('soloist', 'var(--soloist-color)');
        viz.addTrack('harmony', 'var(--harmony-color)');
        viz.addTrack('drums', 'var(--text-color)');

        setInstrumentControllerRefs(() => scheduler(), viz);

        const hasDrumPattern = groove.instruments.some((inst) => inst.steps.some((s) => s > 0));
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

        analyzeFormUI();

        subscribe((action, payload) => syncWorker(action, payload));
        syncWorker();
    } catch (e) {
        console.error('Error during init:', e);
    }
}

window.previewChord = (index) => {
    const { playback, arranger } = getState();
    if (playback.isPlaying) {
        return;
    }
    initAudio();
    const chord = arranger.progression[index];
    if (!chord) {
        return;
    }
    const wasSustainActive = playback.sustainActive;
    playback.sustainActive = false;
    const now = playback.audio.currentTime;
    chord.freqs.forEach((f) => playNote(f, now, 1.0, { vol: 0.15, instrument: 'Piano' }));
    playback.sustainActive = wasSustainActive;
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
