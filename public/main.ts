import './styles.css';
// Self-hosted type system (latin subset, specific weights) — bundled by Vite
// to same-origin /assets so the CSP `font-src 'self'` is satisfied. UI =
// Hanken Grotesk (headings + body), Mono = Geist Mono. See css/variables.css
// for the --font-* token wiring.
import '@fontsource/hanken-grotesk/latin-400.css';
import '@fontsource/hanken-grotesk/latin-500.css';
import '@fontsource/hanken-grotesk/latin-700.css';
import '@fontsource/geist-mono/latin-400.css';
import { applyThemeToDom } from './controllers/app-controller.js';
import {
    loadDrumPreset,
    setInstrumentControllerRefs,
} from './controllers/instrument-controller.js';
import { installE2EGlobals } from './e2e-tools.js';
import { validateProgression } from './engine/chords-engine.js';
import { analyzeFormUI } from './engine/conductor.js';
import { getVisualTime, initAudio, playNote } from './engine/engine.js';
import { detectInstalledPacks, warmPacksForVoices } from './engine/pack-runtime.js';
import { scheduler } from './engine/scheduler-core.js';
import { isSoloistMonophonicMode } from './engine/soloist-mode-policy.js';
import { maybeShowPackInstallNudge } from './pack-nudge.js';
import { saveCurrentState } from './persistence.js';
import { initPWA } from './pwa.js';
import { dispatch, getState, subscribe } from './state.js';
import { deriveSoloistModeOnBoot, handleEffects } from './state-effects.js';
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

        // #675 — warm the registry's installed-pack set from the SW cache so
        // genre auto-follow knows which mapped packs are available before the
        // Sounds panel ever mounts. Fire-and-forget: a genre change before it
        // resolves just falls back to synth (then corrects on the next change).
        //
        // Once detection settles we know whether any pack is installed, so chain
        // the one-time "install a pack" nudge (#684) off it — deferred ~2s so it
        // lands after the UI has settled, never on first paint, and never blocks
        // interaction. Self-gates on the seen-flag + zero installed packs.
        void detectInstalledPacks().then(() => {
            setTimeout(maybeShowPackInstallNudge, 2000);
        });

        // Pre-decode any selected sample-pack voice now, off a gesture-free
        // OfflineAudioContext, so first playback comes up sampled instead of
        // flashing the synth fallback while decode runs. The pack bytes are
        // already in the SW cache after install; only the decode is left, and
        // initAudio's ensurePacksForVoices later short-circuits on the warmed
        // pack. Re-read post-hydrate state — the top-of-init destructure predates
        // hydrateState(), so its voices are stale.
        const hydrated = getState();
        warmPacksForVoices([
            hydrated.chords.voice,
            hydrated.bass.voice,
            hydrated.soloist.voice,
            hydrated.harmony.voice,
            hydrated.groove.voice,
        ]);

        // E2E/dev helpers attach engine internals to `window.ensemble` for
        // Playwright tooling (and local-dev debugging). The gate has two arms:
        //   • `import.meta.env.DEV` — true only under `npm run dev`, so the
        //     bridge is always live for local dev-server debugging.
        //   • `VITE_E2E_BRIDGE === '1'` — the explicit opt-in for *built* bundles
        //     that need the bridge: the Playwright e2e suite, which since #1096
        //     runs against a `vite preview` production build (DEV === false — see
        //     playwright.config.ts `webServer`), and the offline-render analysis
        //     harness (`scripts/mix-report.ts`, #656).
        // Vite replaces the var statically, so a real prod build (no flag,
        // DEV === false) tree-shakes the whole branch — install call + `e2e-tools`
        // import — out entirely; the #543 prod guarantee holds. Prod dispatches go
        // through the imported `dispatch` directly (below), so this global is
        // never on the production dispatch path.
        if (import.meta.env.DEV || import.meta.env.VITE_E2E_BRIDGE === '1') {
            installE2EGlobals();
        }

        applyThemeToDom(playback.palette, playback.mode);

        validateProgression(getState(), (a: any, p: any) => dispatch(a, p));

        // --- ASSEMBLE UI ---
        mountComponents(() => getVisualTime(getState()));

        // --- WORKER INIT ---
        initWorker(
            () => scheduler(getState(), (a: any, p: any) => dispatch(a, p)),
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
                        if (
                            isSoloistMonophonicMode(soloist.mode) &&
                            soloist.audio.buffer.has(n.step)
                        ) {
                            return;
                        }

                        if (!sbUpdatedSteps.has(n.step)) {
                            soloist.audio.buffer.set(n.step, []);
                            sbUpdatedSteps.add(n.step);
                        }
                        soloist.audio.buffer.get(n.step)?.push(n);
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
                    scheduler(getState(), (a: any, p: any) => dispatch(a, p));
                }
            },
        );

        setInstrumentControllerRefs(() =>
            scheduler(getState(), (a: any, p: any) => dispatch(a, p)),
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
            } else if (document.visibilityState === 'hidden') {
                // #1127 — flush any pending debounced save before the tab is
                // hidden or closed. saveCurrentState() cancels the debounce
                // timer and writes synchronously, so the persistence chokepoint's
                // 1s window can't drop a just-made change on close.
                saveCurrentState();
            }
        });

        analyzeFormUI(getState().arranger);

        subscribe((action: any, payload: any, stateMap: any, context: any) => {
            syncWorker(action, payload);
            handleEffects(action, payload, stateMap, context);
        });
        syncWorker();

        // #856 — derive the soloist phrasing mode now that the worker + subscriber
        // are live. No SET_GENRE_FEEL fires on boot, so guitar genres would
        // otherwise stay monophonic until the next genre change.
        deriveSoloistModeOnBoot(getState(), dispatch);

        // Signal to E2E tests that hydration and mounting are complete
        document.documentElement.dataset.hydrated = 'true';
    } catch (e) {
        console.error('Error during init:', e);
    }
}

window.previewChord = (index: number) => {
    const { playback, arranger } = getState();
    if (playback.isPlaying) {
        return;
    }
    initAudio(getState());
    const chord = arranger.progression[index] as any;
    if (!chord) {
        return;
    }
    const now = playback.audio?.currentTime || 0;
    if (playback.audio) {
        // #1180: `ignoreSustain` keeps a preview note from ringing on under a
        // held pedal. This used to force `playback.sustainActive = false` and
        // restore it afterwards — two direct state writes, and a transient the
        // whole app could observe mid-preview.
        chord.freqs.forEach((f: number) =>
            playNote(getState(), f, now, 1.0, {
                vol: 0.15,
                instrument: 'Piano',
                ignoreSustain: true,
            }),
        );
    }
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
