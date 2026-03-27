import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';

const REPO_ROOT = '/home/brandon/code/ensemble';
const DIST_DIR = path.join(REPO_ROOT, 'dist');
const HOST = '127.0.0.1';
const REQUESTED_PORT = Number(process.env.MIX_REPORT_PORT || 0);
const MIME_TYPES = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.woff2': 'font/woff2',
};

const SCENES = [
    {
        id: 'rock-backbeat',
        genreFeel: 'Rock',
        drumPreset: 'Basic Rock',
        bpm: 118,
        intensity: 0.72,
        complexity: 0.58,
        key: 'C',
        sections: [
            {
                id: 'rock-a',
                label: 'Rock Groove',
                value: 'C | G | Am | F | C | G | F | G',
            },
        ],
    },
    {
        id: 'blues-shuffle',
        genreFeel: 'Blues',
        drumPreset: 'Blues Shuffle',
        bpm: 96,
        intensity: 0.7,
        complexity: 0.6,
        key: 'C',
        sections: [
            {
                id: 'blues-a',
                label: 'Blues',
                value: 'C7 | F7 | C7 | C7 | F7 | F7 | C7 | C7 | G7 | F7 | C7 | G7',
            },
        ],
    },
    {
        id: 'jazz-ride',
        genreFeel: 'Jazz',
        drumPreset: 'Jazz',
        bpm: 138,
        intensity: 0.64,
        complexity: 0.55,
        key: 'C',
        sections: [
            {
                id: 'jazz-a',
                label: 'Jazz Head',
                value: 'Dm7 | G7 | Cmaj7 | A7 | Dm7 | G7 | Cmaj7 | Cmaj7',
            },
        ],
    },
    {
        id: 'funk-pocket',
        genreFeel: 'Funk',
        drumPreset: 'Funk',
        bpm: 104,
        intensity: 0.78,
        complexity: 0.66,
        key: 'E',
        sections: [
            {
                id: 'funk-a',
                label: 'Funk Vamp',
                value: 'Em7 | Em7 | A7 | A7 | Em7 | Em7 | A7 | B7',
            },
        ],
    },
];

const STEMS = [
    {
        id: 'full',
        label: 'Full Mix',
        enabled: { drums: true, bass: true, chords: true, harmony: true },
    },
    {
        id: 'drums',
        label: 'Drums',
        enabled: { drums: true, bass: false, chords: false, harmony: false },
    },
    {
        id: 'bass',
        label: 'Bass',
        enabled: { drums: false, bass: true, chords: false, harmony: false },
    },
    {
        id: 'chords',
        label: 'Chords',
        enabled: { drums: false, bass: false, chords: true, harmony: false },
    },
    {
        id: 'harmony',
        label: 'Harmony',
        enabled: { drums: false, bass: false, chords: false, harmony: true },
    },
];

function spawnCommand(command, args, options = {}) {
    return spawn(command, args, {
        cwd: REPO_ROOT,
        stdio: options.stdio || 'inherit',
        env: { ...process.env, ...options.env },
    });
}

function runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawnCommand(command, args, options);
        child.on('error', reject);
        child.on('exit', (code) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
        });
    });
}

async function createStaticServer(rootDir, port) {
    const server = http.createServer(async (req, res) => {
        try {
            const requestUrl = new URL(req.url || '/', `http://${HOST}`);
            let pathname = decodeURIComponent(requestUrl.pathname);
            if (pathname === '/') {
                pathname = '/index.html';
            }

            let filePath = path.resolve(rootDir, `.${pathname}`);
            if (
                !filePath.startsWith(`${rootDir}${path.sep}`) &&
                filePath !== path.join(rootDir, 'index.html')
            ) {
                res.writeHead(403);
                res.end('Forbidden');
                return;
            }

            try {
                const fileStats = await stat(filePath);
                if (fileStats.isDirectory()) {
                    filePath = path.join(filePath, 'index.html');
                }
            } catch (error) {
                const isAssetRequest = path.extname(filePath) !== '';
                if (isAssetRequest) {
                    throw error;
                }
                filePath = path.join(rootDir, 'index.html');
            }

            const body = await readFile(filePath);
            const contentType = MIME_TYPES[path.extname(filePath)] || 'application/octet-stream';
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(body);
        } catch {
            res.writeHead(404);
            res.end('Not found');
        }
    });

    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, HOST, resolve);
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
        throw new Error('Failed to determine mix report server address');
    }

    return { server, port: address.port };
}

function formatDb(value) {
    if (!Number.isFinite(value)) {
        return '-inf';
    }
    return value.toFixed(1);
}

function summarizeFindings(scene) {
    const full = scene.stems.full;
    const drums = scene.stems.drums;
    const bass = scene.stems.bass;
    const chords = scene.stems.chords;
    const harmony = scene.stems.harmony;
    const notes = [];

    if (drums.rmsDb < full.rmsDb - 8.5) {
        notes.push('drums sit fairly far behind the master bed');
    } else if (drums.rmsDb > full.rmsDb - 5) {
        notes.push('drums are very forward in the mix');
    } else {
        notes.push('drums are in a healthy backing-band range');
    }

    if (drums.probes.presence > chords.probes.presence * 1.4) {
        notes.push('drums dominate the presence band more than chords');
    }

    if (bass.probes.sub > chords.probes.sub * 3) {
        notes.push('bass owns the sub slot cleanly');
    }

    if (chords.probes.lowMid > bass.probes.lowMid * 1.2) {
        notes.push('chords carry most of the low-mid harmonic body');
    }

    if (harmony.rmsDb > -80 && harmony.probes.air > chords.probes.air * 0.9) {
        notes.push('harmony contributes meaningful top-end air');
    }

    return notes;
}

async function generateReport() {
    console.log('Building dist for mix analysis...');
    await runCommand('npm', ['run', 'build:quiet']);

    const { server, port } = await createStaticServer(DIST_DIR, REQUESTED_PORT);
    const baseUrl = `http://${HOST}:${port}`;

    try {
        const browser = await chromium.launch({ headless: true });
        try {
            const page = await browser.newPage();
            await page.goto(baseUrl, { waitUntil: 'networkidle' });
            await page.waitForFunction(
                () =>
                    document.documentElement.dataset.hydrated === 'true' &&
                    Boolean(window.ensemble),
                undefined,
                { timeout: 20000 },
            );

            const report = await page.evaluate(
                async ({ scenes, stems }) => {
                    const ensemble = /** @type {any} */ (window).ensemble;
                    await ensemble.loadTools();
                    const {
                        getState,
                        validateProgression,
                        initAudio,
                        loadDrumPreset,
                        scheduleGlobalEvent,
                        generateNotesForStep,
                    } = ensemble;

                    const sampleRate = 44100;

                    function mulberry32(seed) {
                        let t = seed >>> 0;
                        return () => {
                            t += 0x6d2b79f5;
                            let x = Math.imul(t ^ (t >>> 15), 1 | t);
                            x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
                            return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
                        };
                    }

                    function cloneState(liveState) {
                        return {
                            playback: {
                                ...liveState.playback,
                                modals: { ...(liveState.playback.modals || {}) },
                                drawQueue: [],
                                audio: null,
                                masterGain: null,
                                saturator: null,
                                masterLimiter: null,
                                reverbNode: null,
                                reverbPreFilter: null,
                                chordsGain: null,
                                bassGain: null,
                                soloistGain: null,
                                harmoniesGain: null,
                                drumsGain: null,
                                chordsEQ: null,
                                chordsPanner: null,
                                bassEQ: null,
                                bassSidechain: null,
                                soloistEQ: null,
                                harmoniesEQ: null,
                                harmoniesPanner: null,
                            },
                            arranger: {
                                ...liveState.arranger,
                                sections: liveState.arranger.sections.map((section) => ({
                                    ...section,
                                })),
                                progression: [],
                                stepMap: [],
                                sectionMap: [],
                                measureMap: [],
                            },
                            groove: {
                                ...liveState.groove,
                                instruments: liveState.groove.instruments.map((inst) => ({
                                    ...inst,
                                    steps: [...inst.steps],
                                })),
                                audioBuffers: {},
                                buffer: new Map(),
                                fillSteps: null,
                                fillMap: null,
                                accentMap: null,
                                lastHatGain: null,
                                lastRideGain: null,
                                lastCrashGain: null,
                            },
                            chords: {
                                ...liveState.chords,
                                buffer: new Map(),
                                held: {},
                                activeNotes: {},
                                activeInstrument: {},
                            },
                            bass: {
                                ...liveState.bass,
                                buffer: new Map(),
                                activeNotes: [],
                                lastFreq: null,
                                lastPlayedFreq: null,
                            },
                            soloist: {
                                ...liveState.soloist,
                                buffer: new Map(),
                                activeVoices: [],
                                motifBuffer: [...(liveState.soloist.motifBuffer || [])],
                                pitchHistory: [...(liveState.soloist.pitchHistory || [])],
                                deviceBuffer: [...(liveState.soloist.deviceBuffer || [])],
                                phraseContext: {
                                    ...(liveState.soloist.phraseContext || {}),
                                },
                                lastFreq: null,
                                lastPlayedFreq: null,
                            },
                            harmony: {
                                ...liveState.harmony,
                                buffer: new Map(),
                                activeVoices: [],
                            },
                            vizState: { ...liveState.vizState, enabled: false },
                            midi: { ...liveState.midi, enabled: false, muteLocal: true },
                            conductor: {
                                ...liveState.conductor,
                                form: liveState.conductor.form
                                    ? JSON.parse(JSON.stringify(liveState.conductor.form))
                                    : null,
                            },
                            ui: { ...liveState.ui },
                        };
                    }

                    function createSceneState(scene, enabled) {
                        const liveState = getState();
                        const state = cloneState(liveState);
                        state.arranger.sections = scene.sections.map((section) => ({ ...section }));
                        state.arranger.key = scene.key;
                        state.arranger.timeSignature = scene.timeSignature || '4/4';
                        state.playback.bpm = scene.bpm;
                        state.playback.bandIntensity = scene.intensity;
                        state.playback.complexity = scene.complexity;
                        state.playback.autoIntensity = false;
                        state.playback.visualFlash = false;
                        state.playback.metronome = false;
                        state.playback.isPlaying = false;
                        state.playback.isScheduling = false;
                        state.playback.currentKey = scene.key;
                        state.playback.conductorVelocity = 1;
                        state.playback.nextNoteTime = 0;
                        state.playback.unswungNextNoteTime = 0;
                        state.playback.modals.performance = false;
                        state.playback.modals.drumPad = false;
                        state.groove.genreFeel = scene.genreFeel;
                        state.groove.lastSmartGenre = scene.genreFeel;
                        state.groove.creativity = true;
                        state.groove.fillActive = false;
                        state.groove.pendingCrash = false;
                        state.groove.lastDrumPreset = scene.drumPreset;
                        state.bass.enabled = enabled.bass;
                        state.chords.enabled = enabled.chords;
                        state.harmony.enabled = enabled.harmony;
                        state.soloist.enabled = false;
                        state.groove.enabled = enabled.drums;

                        validateProgression(state);

                        const stepsPerMeasure =
                            state.arranger.measureMap?.[0]?.end -
                                state.arranger.measureMap?.[0]?.start || 16;
                        const snare = state.groove.instruments.find(
                            (inst) => inst.name === 'Snare',
                        );
                        let snareMask = 0;
                        if (snare) {
                            for (let i = 0; i < stepsPerMeasure; i++) {
                                if (snare.steps[i] > 0) {
                                    snareMask |= 1 << i;
                                }
                            }
                        }
                        state.groove.snareMask = snareMask;

                        return state;
                    }

                    function storeNote(targetMap, step, note) {
                        if (!targetMap.has(step)) {
                            targetMap.set(step, []);
                        }
                        targetMap.get(step).push(note);
                    }

                    function fillBuffers(state) {
                        const cursors = {
                            mainCursor: { index: 0, sectionIndex: 0 },
                            lookaheadCursor: { index: 0, sectionIndex: 0 },
                        };

                        for (let step = 0; step < state.arranger.totalSteps; step++) {
                            const result = generateNotesForStep(state, step, cursors, {
                                includeBass: state.bass.enabled,
                                includeChords: state.chords.enabled,
                                includeSoloist: false,
                                includeHarmony: state.harmony.enabled,
                                includeDrums: false,
                            });

                            for (const note of result.notes) {
                                if (note.module === 'bass') {
                                    storeNote(state.bass.buffer, step, note);
                                } else if (note.module === 'chords') {
                                    storeNote(state.chords.buffer, step, note);
                                } else if (note.module === 'harmony') {
                                    storeNote(state.harmony.buffer, step, note);
                                }
                            }
                        }
                    }

                    function toMono(audioBuffer) {
                        const channelCount = audioBuffer.numberOfChannels || 1;
                        const length = audioBuffer.length;
                        const mono = new Float32Array(length);

                        for (let channel = 0; channel < channelCount; channel++) {
                            const data = audioBuffer.getChannelData(channel);
                            for (let i = 0; i < length; i++) {
                                mono[i] += data[i] / channelCount;
                            }
                        }

                        return mono;
                    }

                    function computePeak(samples) {
                        let peak = 0;
                        for (let i = 0; i < samples.length; i++) {
                            const value = Math.abs(samples[i]);
                            if (value > peak) {
                                peak = value;
                            }
                        }
                        return peak;
                    }

                    function computeRms(samples) {
                        let sumSquares = 0;
                        for (let i = 0; i < samples.length; i++) {
                            sumSquares += samples[i] * samples[i];
                        }
                        return Math.sqrt(sumSquares / Math.max(1, samples.length));
                    }

                    function toDb(value) {
                        if (!value || value <= 0) {
                            return -120;
                        }
                        return 20 * Math.log10(value);
                    }

                    function activeBounds(samples) {
                        let start = 0;
                        let end = samples.length - 1;
                        const threshold = 1e-4;
                        while (start < samples.length && Math.abs(samples[start]) < threshold) {
                            start++;
                        }
                        while (end > start && Math.abs(samples[end]) < threshold) {
                            end--;
                        }
                        return { start, end: Math.max(start + 1, end) };
                    }

                    function goertzelMagnitude(samples, sampleRate, freq) {
                        const omega = (2 * Math.PI * freq) / sampleRate;
                        const coeff = 2 * Math.cos(omega);
                        let s0 = 0;
                        let s1 = 0;
                        let s2 = 0;

                        for (let i = 0; i < samples.length; i++) {
                            s0 = samples[i] + coeff * s1 - s2;
                            s2 = s1;
                            s1 = s0;
                        }

                        return Math.sqrt(s1 * s1 + s2 * s2 - coeff * s1 * s2);
                    }

                    function computeSpectralProbes(samples, sampleRate) {
                        const centers = {
                            sub: 60,
                            low: 140,
                            lowMid: 380,
                            mid: 1000,
                            presence: 2800,
                            air: 7200,
                        };
                        const bounds = activeBounds(samples);
                        const active = samples.slice(bounds.start, bounds.end);
                        const windowSize = Math.min(4096, active.length);
                        if (windowSize < 256) {
                            return {
                                sub: 0,
                                low: 0,
                                lowMid: 0,
                                mid: 0,
                                presence: 0,
                                air: 0,
                                centroid: 0,
                            };
                        }

                        const windows = [];
                        const hop = Math.max(1, Math.floor((active.length - windowSize) / 3));
                        for (let i = 0; i < 4; i++) {
                            const start = Math.min(active.length - windowSize, hop * i);
                            windows.push(active.slice(start, start + windowSize));
                        }

                        const totals = {
                            sub: 0,
                            low: 0,
                            lowMid: 0,
                            mid: 0,
                            presence: 0,
                            air: 0,
                        };

                        for (const windowSamples of windows) {
                            for (const [band, freq] of Object.entries(centers)) {
                                totals[band] += goertzelMagnitude(windowSamples, sampleRate, freq);
                            }
                        }

                        const totalEnergy =
                            Object.values(totals).reduce((sum, value) => sum + value, 0) || 1;
                        const normalized = /** @type {Record<string, number>} */ ({});
                        let centroidNumerator = 0;

                        for (const [band, freq] of Object.entries(centers)) {
                            normalized[band] = totals[band] / totalEnergy;
                            centroidNumerator += normalized[band] * freq;
                        }

                        normalized.centroid = centroidNumerator;
                        return normalized;
                    }

                    async function renderScene(scene, enabled, seed) {
                        await loadDrumPreset(scene.drumPreset);
                        const state = createSceneState(scene, enabled);
                        const sixteenth = 60 / state.playback.bpm / 4;
                        const renderLeadIn = 0.25;
                        const renderSeconds =
                            renderLeadIn + state.arranger.totalSteps * sixteenth + 2;
                        const offlineCtx = new OfflineAudioContext(
                            2,
                            Math.ceil(renderSeconds * sampleRate),
                            sampleRate,
                        );
                        const originalRandom = Math.random;
                        Math.random = mulberry32(seed);

                        try {
                            initAudio(state, { audioContext: offlineCtx, enableWatchdog: false });
                            fillBuffers(state);

                            for (let step = 0; step < state.arranger.totalSteps; step++) {
                                const time = renderLeadIn + step * sixteenth;
                                state.playback.nextNoteTime = time;
                                state.playback.unswungNextNoteTime = time;
                                scheduleGlobalEvent(state, step, time);
                            }

                            const rendered = await offlineCtx.startRendering();
                            const mono = toMono(rendered);
                            const peak = computePeak(mono);
                            const rms = computeRms(mono);

                            return {
                                peak,
                                peakDb: toDb(peak),
                                rms,
                                rmsDb: toDb(rms),
                                crestDb: toDb(peak) - toDb(rms),
                                probes: computeSpectralProbes(mono, sampleRate),
                            };
                        } finally {
                            Math.random = originalRandom;
                        }
                    }

                    const sceneReports = [];
                    let seedBase = 1337;

                    for (const scene of scenes) {
                        const stemsById = {};

                        for (const stem of stems) {
                            stemsById[stem.id] = await renderScene(scene, stem.enabled, seedBase++);
                        }

                        sceneReports.push({
                            id: scene.id,
                            genreFeel: scene.genreFeel,
                            bpm: scene.bpm,
                            intensity: scene.intensity,
                            stems: stemsById,
                        });
                    }

                    return sceneReports;
                },
                { scenes: SCENES, stems: STEMS },
            );

            console.log('\n=== Ensemble Mix Report ===');
            for (const scene of report) {
                console.log(
                    `\n[${scene.id}] ${scene.genreFeel} @ ${scene.bpm} BPM | intensity ${scene.intensity}`,
                );
                console.table(
                    Object.entries(scene.stems).map(([stemId, metrics]) => ({
                        stem: stemId,
                        peakDb: formatDb(metrics.peakDb),
                        rmsDb: formatDb(metrics.rmsDb),
                        crestDb: formatDb(metrics.crestDb),
                        sub: metrics.probes.sub.toFixed(3),
                        lowMid: metrics.probes.lowMid.toFixed(3),
                        presence: metrics.probes.presence.toFixed(3),
                        air: metrics.probes.air.toFixed(3),
                        centroidHz: Math.round(metrics.probes.centroid),
                    })),
                );

                const findings = summarizeFindings(scene);
                if (findings.length > 0) {
                    console.log(`Findings: ${findings.join('; ')}.`);
                }
            }
        } finally {
            await browser.close();
        }
    } finally {
        await new Promise((resolve, reject) => {
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            });
        });
    }
}

generateReport().catch((error) => {
    console.error('\nMix report failed:', error);
    process.exitCode = 1;
});
