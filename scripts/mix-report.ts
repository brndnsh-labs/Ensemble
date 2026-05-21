// @ts-nocheck
import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import playwright from '@playwright/test';

const { chromium } = playwright;

import {
    buildRenderedMixReport,
    DEFAULT_MIX_REPORT_SCENES,
    formatRenderedMixReport,
    MIX_REPORT_STEMS,
    parseEnsembleAuditInput,
    resolveMixReportCliOptions,
    selectMixReportScenes,
} from './mix-report-utils.js';

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

function runCommand(command, args, options = {}) {
    const { forwardToStderr = false } = options;
    const stdio = forwardToStderr ? ['ignore', 'pipe', 'pipe'] : 'inherit';

    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: REPO_ROOT,
            stdio,
            env: process.env,
        });
        let output = '';

        if (forwardToStderr) {
            child.stdout?.on('data', (chunk) => {
                const text = String(chunk);
                output += text;
                process.stderr.write(text);
            });
            child.stderr?.on('data', (chunk) => {
                const text = String(chunk);
                output += text;
                process.stderr.write(text);
            });
        }

        child.on('error', reject);
        child.on('exit', (code) => {
            if (code === 0) {
                resolve();
                return;
            }

            const details = output.trim();
            reject(
                new Error(
                    details
                        ? `${command} ${args.join(' ')} exited with code ${code}\n${details}`
                        : `${command} ${args.join(' ')} exited with code ${code}`,
                ),
            );
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

function formatMetric(value, digits = 3) {
    if (!Number.isFinite(value)) {
        return '-';
    }
    return value.toFixed(digits);
}

async function readStdin() {
    if (process.stdin.isTTY) {
        throw new Error('Expected piped JSON when using --focus-from=-');
    }

    return new Promise((resolve, reject) => {
        let text = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (chunk) => {
            text += chunk;
        });
        process.stdin.on('end', () => resolve(text));
        process.stdin.on('error', reject);
    });
}

async function loadFocusInput(focusFrom, focusLimit) {
    if (!focusFrom) {
        return null;
    }

    const sourceText =
        focusFrom === '-'
            ? await readStdin()
            : await readFile(path.resolve(REPO_ROOT, focusFrom), 'utf8');
    return {
        path: focusFrom,
        focusLimit,
        ...parseEnsembleAuditInput(sourceText, { focusLimit }),
    };
}

function resolveScenes(options, focusInput) {
    if (options.sceneIds.length > 0) {
        return selectMixReportScenes(DEFAULT_MIX_REPORT_SCENES, options.sceneIds);
    }

    if (focusInput?.renderScene?.sections?.length) {
        return [
            {
                ...focusInput.renderScene,
                sections: focusInput.renderScene.sections.map((section) => ({ ...section })),
            },
        ];
    }

    return selectMixReportScenes(DEFAULT_MIX_REPORT_SCENES);
}

function resolveSeeds(options, focusInput) {
    if (options.seedsExplicit || !focusInput?.seeds?.length) {
        return {
            seeds: options.seeds,
            source: {
                kind: 'manual',
                reportType: focusInput?.reportType || null,
                path: focusInput?.path || null,
                sceneSource: focusInput?.renderScene ? 'ensemble-audit' : 'defaults',
                focusLimit: focusInput?.focusLimit || null,
                focusSeeds: [],
            },
        };
    }

    return {
        seeds: focusInput.seeds,
        source: {
            kind: 'ensemble-focus',
            reportType: focusInput.reportType,
            path: focusInput.path,
            sceneSource: focusInput.renderScene ? 'ensemble-audit' : 'defaults',
            focusLimit: focusInput.focusLimit,
            focusSeeds: focusInput.focusSeeds,
        },
    };
}

function printHumanMixReport(report) {
    console.log('\n=== Rendered Audio Audit ===');
    for (const scene of report.scenes) {
        console.log(
            `\n[${scene.id}] ${scene.label} | ${scene.genreFeel} @ ${scene.bpm} BPM | intensity ${scene.intensity}`,
        );

        for (const seedRow of scene.seeds) {
            const focusSuffix = seedRow.focus
                ? ` | focus #${seedRow.focus.focusRank} | issueScore ${seedRow.focus.issueScore}`
                : '';
            console.log(`Seed: ${seedRow.seed}${focusSuffix}`);
            console.table(
                Object.entries(seedRow.stems).map(([stemId, metrics]) => ({
                    stem: stemId,
                    peakDb: formatDb(metrics.peakDb),
                    rmsDb: formatDb(metrics.rmsDb),
                    crestDb: formatDb(metrics.crestDb),
                    maxDelta: formatMetric(metrics.transients?.maxDelta || 0, 3),
                    spikesPerSec: formatMetric(metrics.transients?.spikeRate || 0, 1),
                    maxVoices: metrics.schedule?.maxSimultaneousVoices ?? '-',
                    retriggers: metrics.schedule?.sameMidiOverlapCount ?? '-',
                    steals: metrics.schedule?.voiceLimitPressureCount ?? '-',
                    sub: Number(metrics.probes?.sub || 0).toFixed(3),
                    lowMid: Number(metrics.probes?.lowMid || 0).toFixed(3),
                    presence: Number(metrics.probes?.presence || 0).toFixed(3),
                    air: Number(metrics.probes?.air || 0).toFixed(3),
                    centroidHz: Math.round(metrics.probes?.centroid || 0),
                })),
            );

            if (seedRow.findings.length > 0) {
                console.log(`Findings: ${seedRow.findings.join('; ')}.`);
            }
        }
    }
}

async function renderSceneReports({ scenes, seeds }) {
    const { server, port } = await createStaticServer(DIST_DIR, REQUESTED_PORT);
    const baseUrl = `http://${HOST}:${port}`;

    try {
        const browser = await chromium.launch({ headless: true });
        try {
            const page = await browser.newPage();
            // tsx transpiles via esbuild with keepNames=true, which wraps named
            // functions with `__name(fn, 'name')` calls in the page.evaluate body.
            // That helper is undefined in the browser; inject a no-op shim onto
            // window before navigation so all subsequent eval'd code finds it.
            await page.addInitScript(() => {
                (window as unknown as { __name: <T>(fn: T) => T }).__name = (fn) => fn;
            });
            await page.goto(baseUrl, { waitUntil: 'networkidle' });
            await page.waitForFunction(
                () =>
                    document.documentElement.dataset.hydrated === 'true' &&
                    Boolean(window.ensemble),
                undefined,
                { timeout: 20000 },
            );

            return await page.evaluate(
                async ({ scenes, stems, seeds }) => {
                    const ensemble = /** @type {any} */ (window).ensemble;
                    const {
                        getState,
                        validateProgression,
                        initAudio,
                        loadDrumPreset,
                        scheduleGlobalEvent,
                        generateNotesForStep,
                    } = ensemble;

                    const sampleRate = 44100;

                    function hashSeed(seed) {
                        let hash = 2166136261;
                        for (const char of String(seed || 'MIX_AUDIT')) {
                            hash ^= char.charCodeAt(0);
                            hash = Math.imul(hash, 16777619);
                        }
                        return hash >>> 0;
                    }

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
                                audioGraph: null,
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
                                deviceBuffer: [
                                    ...(liveState.soloist.session.rhythm.deviceBuffer || []),
                                ],
                                phraseContext: {
                                    ...(liveState.soloist.session.currentPhrase.context || {}),
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

                    function createSceneState(scene, stem) {
                        const liveState = getState();
                        const state = cloneState(liveState);
                        state.arranger.sections = scene.sections.map((section) => ({
                            ...section,
                            key: section.key || scene.key,
                            isMinor: section.isMinor ?? false,
                            timeSignature: section.timeSignature || scene.timeSignature || '4/4',
                        }));
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
                        state.groove.lastSmartGenre =
                            scene.requestedGenre || scene.genre || scene.genreFeel;
                        state.groove.creativity = scene.creativity ?? true;
                        state.groove.fillActive = false;
                        state.groove.pendingCrash = false;
                        state.groove.lastDrumPreset = scene.drumPreset;
                        state.chords.style = scene.chordStyle || state.chords.style;
                        state.chords.density = scene.density || state.chords.density;
                        state.bass.style = scene.bassStyle || state.bass.style;
                        state.harmony.style = scene.harmonyStyle || state.harmony.style;
                        state.soloist.style = scene.soloistStyle || state.soloist.style;
                        state.bass.enabled = Boolean(
                            stem.enabled.bass && (scene.includeBass ?? true),
                        );
                        state.chords.enabled = Boolean(
                            stem.enabled.chords && (scene.includeChords ?? true),
                        );
                        state.harmony.enabled = Boolean(
                            stem.enabled.harmony && (scene.includeHarmony ?? true),
                        );
                        // The rendered audit still targets backing-band stems for stable comparisons.
                        state.soloist.enabled = false;
                        state.groove.enabled = Boolean(
                            stem.enabled.drums && (scene.includeDrums ?? true),
                        );

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

                    function collectScheduleBuffer(state, modules) {
                        const combined = new Map();
                        for (const moduleName of modules) {
                            const source = state[moduleName]?.buffer;
                            if (!(source instanceof Map)) {
                                continue;
                            }
                            for (const [step, notes] of source.entries()) {
                                if (!Array.isArray(notes) || notes.length === 0) {
                                    continue;
                                }
                                if (!combined.has(step)) {
                                    combined.set(step, []);
                                }
                                combined.get(step).push(...notes);
                            }
                        }
                        return combined;
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

                    function computeTransientMetrics(samples, sampleRate) {
                        const bounds = activeBounds(samples);
                        const active = samples.slice(bounds.start, bounds.end);
                        if (active.length < 4) {
                            return {
                                maxDelta: 0,
                                spikeCount: 0,
                                spikeRate: 0,
                                threshold: 0,
                            };
                        }

                        const rms = computeRms(active);
                        const peak = computePeak(active);
                        const threshold = Math.max(0.02, peak * 0.18, rms * 5);
                        let maxDelta = 0;
                        let spikeCount = 0;
                        let lastSpikeIndex = -64;

                        for (let i = 1; i < active.length; i++) {
                            const delta = Math.abs(active[i] - active[i - 1]);
                            if (delta > maxDelta) {
                                maxDelta = delta;
                            }
                            if (delta >= threshold && i - lastSpikeIndex > 64) {
                                spikeCount++;
                                lastSpikeIndex = i;
                            }
                        }

                        return {
                            maxDelta,
                            spikeCount,
                            spikeRate: spikeCount / Math.max(0.001, active.length / sampleRate),
                            threshold,
                        };
                    }

                    function analyzeNoteSchedule(
                        buffer,
                        stepDuration,
                        renderLeadIn,
                        voiceLimit = 3,
                    ) {
                        const events = [];
                        let maxNotesPerStep = 0;
                        let overLimitSteps = 0;

                        for (const [step, notes] of buffer.entries()) {
                            if (!Array.isArray(notes) || notes.length === 0) {
                                continue;
                            }
                            maxNotesPerStep = Math.max(maxNotesPerStep, notes.length);
                            if (notes.length > voiceLimit) {
                                overLimitSteps++;
                            }
                            for (const note of notes) {
                                const midi = note.midi ?? null;
                                const start =
                                    renderLeadIn + step * stepDuration + (note.timingOffset || 0);
                                const duration = (note.durationSteps || 1) * stepDuration;
                                events.push({
                                    midi,
                                    start,
                                    end: start + duration,
                                });
                            }
                        }

                        events.sort((a, b) => a.start - b.start || (a.midi || 0) - (b.midi || 0));

                        let maxSimultaneousVoices = 0;
                        let sameMidiOverlapCount = 0;
                        let voiceLimitPressureCount = 0;
                        let minOnsetGapMs = Infinity;
                        let previousStart = null;
                        /** @type {Array<{end: number, midi: number|null}>} */
                        let active = [];
                        const lastMidiEnd = new Map();

                        for (const event of events) {
                            if (previousStart !== null) {
                                const gapMs = (event.start - previousStart) * 1000;
                                if (gapMs > 0) {
                                    minOnsetGapMs = Math.min(minOnsetGapMs, gapMs);
                                }
                            }
                            previousStart = event.start;

                            active = active.filter((voice) => voice.end > event.start + 1e-6);
                            if (active.length >= voiceLimit) {
                                voiceLimitPressureCount++;
                            }
                            if (event.midi !== null) {
                                const priorEnd = lastMidiEnd.get(event.midi) || -Infinity;
                                if (priorEnd > event.start + 1e-6) {
                                    sameMidiOverlapCount++;
                                }
                                lastMidiEnd.set(event.midi, Math.max(priorEnd, event.end));
                            }
                            active.push({ end: event.end, midi: event.midi });
                            maxSimultaneousVoices = Math.max(maxSimultaneousVoices, active.length);
                        }

                        return {
                            eventCount: events.length,
                            maxNotesPerStep,
                            overLimitSteps,
                            maxSimultaneousVoices,
                            sameMidiOverlapCount,
                            voiceLimitPressureCount,
                            minOnsetGapMs: Number.isFinite(minOnsetGapMs) ? minOnsetGapMs : 0,
                        };
                    }

                    async function renderStem(scene, stem, seedLabel) {
                        await loadDrumPreset(scene.drumPreset || 'Basic Rock');
                        const state = createSceneState(scene, stem);
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
                        Math.random = mulberry32(hashSeed(`${scene.id}:${seedLabel}`));

                        try {
                            initAudio(state, { audioContext: offlineCtx, enableWatchdog: false });
                            fillBuffers(state);
                            const schedule = stem.schedule
                                ? analyzeNoteSchedule(
                                      collectScheduleBuffer(state, stem.schedule.modules),
                                      sixteenth,
                                      renderLeadIn,
                                      stem.schedule.voiceLimit,
                                  )
                                : null;

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
                                transients: computeTransientMetrics(mono, sampleRate),
                                schedule,
                            };
                        } finally {
                            Math.random = originalRandom;
                        }
                    }

                    const sceneReports = [];

                    for (const scene of scenes) {
                        const seedReports = [];

                        for (const seed of seeds) {
                            const stemsById = {};
                            for (const stem of stems) {
                                stemsById[stem.id] = await renderStem(scene, stem, seed);
                            }

                            seedReports.push({
                                seed,
                                stems: stemsById,
                            });
                        }

                        sceneReports.push({
                            id: scene.id,
                            label: scene.label || scene.id,
                            genreFeel: scene.genreFeel,
                            bpm: scene.bpm,
                            intensity: scene.intensity,
                            source: scene.source || 'default',
                            seeds: seedReports,
                        });
                    }

                    return sceneReports;
                },
                { scenes, stems: MIX_REPORT_STEMS, seeds },
            );
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

export async function generateMixReport(argv = process.argv.slice(2)) {
    const cliOptions = resolveMixReportCliOptions(argv);
    const machineReadable = cliOptions.json || cliOptions.jsonl;
    const log = machineReadable ? process.stderr : process.stdout;
    const focusInput = await loadFocusInput(cliOptions.focusFrom, cliOptions.focusLimit);
    const scenes = resolveScenes(cliOptions, focusInput);
    const { seeds, source } = resolveSeeds(cliOptions, focusInput);

    if (!cliOptions.noBuild) {
        log.write('Building dist for mix analysis...\n');
        await runCommand('npm', ['run', 'build:quiet'], {
            forwardToStderr: machineReadable,
        });
    }

    const sceneRuns = await renderSceneReports({ scenes, seeds });
    const report = buildRenderedMixReport({
        sceneRuns,
        options: {
            seeds,
            sceneIds: scenes.map((scene) => scene.id),
            focusFrom: cliOptions.focusFrom,
            focusLimit: focusInput ? cliOptions.focusLimit : null,
        },
        source,
    });

    if (machineReadable) {
        process.stdout.write(
            `${formatRenderedMixReport(report, {
                jsonl: cliOptions.jsonl,
                pretty: cliOptions.pretty,
            })}\n`,
        );
    } else {
        printHumanMixReport(report);
    }

    return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    generateMixReport().catch((error) => {
        console.error('\nMix report failed:', error);
        process.exitCode = 1;
    });
}
