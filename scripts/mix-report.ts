// @ts-nocheck
import { spawn } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import playwright from '@playwright/test';

const { chromium } = playwright;

import { gainForPack } from '../public/data/sound-packs.js';
import { encodeWav } from '../public/engine/wav-encoder.js';
import {
    buildRenderedMixReport,
    COHESION_SAMPLE_BAND,
    DEFAULT_MIX_REPORT_SCENES,
    formatCohesionReport,
    formatPackCalibration,
    formatRenderedMixReport,
    MIX_REPORT_STEMS,
    parseEnsembleAuditInput,
    parseExternalScenes,
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
    const { forwardToStderr = false, env = {} } = options;
    const stdio = forwardToStderr ? ['ignore', 'pipe', 'pipe'] : 'inherit';

    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: REPO_ROOT,
            stdio,
            env: { ...process.env, ...env },
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

function formatLoopArc(loopRmsDb) {
    if (!Array.isArray(loopRmsDb) || loopRmsDb.length === 0) {
        return '-';
    }
    return loopRmsDb.map((v) => (Number.isFinite(v) ? v.toFixed(1) : '-inf')).join('|');
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
                    corr:
                        metrics.stereo?.correlation == null
                            ? '-'
                            : Number(metrics.stereo.correlation).toFixed(3),
                    sideRatio:
                        metrics.stereo?.sideRatio == null
                            ? '-'
                            : Number(metrics.stereo.sideRatio).toFixed(3),
                    arc: metrics.arc || '-',
                    loopDb: formatLoopArc(metrics.loopRmsDb),
                })),
            );

            if (seedRow.findings.length > 0) {
                console.log(`Findings: ${seedRow.findings.join('; ')}.`);
            }
        }
    }
}

async function renderSceneReports({
    scenes,
    seeds,
    writeWav,
    writeEvents,
    loops,
    calibratePack,
    cohesion,
}) {
    const loopCount = Math.max(1, Math.floor(loops || 1));
    const { server, port } = await createStaticServer(DIST_DIR, REQUESTED_PORT);
    const baseUrl = `http://${HOST}:${port}`;
    const writtenWavPaths = [];
    const writtenEventPaths = [];

    let wavDir = null;
    if (writeWav) {
        wavDir = path.isAbsolute(writeWav) ? writeWav : path.resolve(REPO_ROOT, writeWav);
        await mkdir(wavDir, { recursive: true });
    }

    let eventDir = null;
    if (writeEvents) {
        eventDir = path.isAbsolute(writeEvents)
            ? writeEvents
            : path.resolve(REPO_ROOT, writeEvents);
        await mkdir(eventDir, { recursive: true });
    }

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

            if (wavDir) {
                // Bridge: the page hands raw float channel data back to Node so
                // we can encode + write WAVs with the shared encoder, instead of
                // shipping audio through the evaluate return value.
                await page.exposeFunction('__writeWav', async (fileName, channels, sampleRate) => {
                    const buffers = channels.map((channel) => Float32Array.from(channel));
                    const wav = encodeWav(buffers, sampleRate);
                    const outPath = path.join(wavDir, fileName);
                    await writeFile(outPath, Buffer.from(wav));
                    writtenWavPaths.push(outPath);
                });
            }

            if (eventDir) {
                await page.exposeFunction('__writeEvents', async (fileName, payload) => {
                    const outPath = path.join(eventDir, fileName);
                    await writeFile(outPath, JSON.stringify(payload, null, 2));
                    writtenEventPaths.push(outPath);
                });
            }

            await page.goto(baseUrl, { waitUntil: 'networkidle' });
            await page.waitForFunction(
                () =>
                    document.documentElement.dataset.hydrated === 'true' &&
                    Boolean(window.ensemble),
                undefined,
                { timeout: 20000 },
            );

            const evaluated = await page.evaluate(
                async ({
                    scenes,
                    stems,
                    seeds,
                    writeWav,
                    writeEvents,
                    loops,
                    calibratePack,
                    cohesionBand,
                }) => {
                    const ensemble = /** @type {any} */ (window).ensemble;
                    const {
                        getState,
                        validateProgression,
                        initAudio,
                        loadDrumPreset,
                        scheduleGlobalEvent,
                        calculateStepDuration,
                        getEffectiveMeterAtStep,
                        generateNotesForStep,
                        generateSessionSeed,
                        generateSoloistAccents,
                        loopArcMultiplier,
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
                                // #691 — null the live-context sampled-voice handles
                                // (clone-parity, same as audio-export.ts).
                                activeChordVoices: [],
                                lastChordKey: null,
                                // #1016 — render the full form, never a live
                                // section-practice drill (clone-host parity).
                                startStep: 0,
                                loopStartStep: -1,
                                loopEndStep: -1,
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
                                lastSampledHatVoice: null,
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
                                session: JSON.parse(JSON.stringify(liveState.soloist.session)),
                                audio: {
                                    ...(liveState.soloist.audio || {}),
                                    activeVoices: [],
                                    buffer: new Map(),
                                    lastFreq: null,
                                    lastMidiPlayed: null,
                                    lastRenderedFreq: null,
                                    lastPlayedFreq: null,
                                    lastNoteEnd: 0,
                                },
                                motifBuffer: [...(liveState.soloist.motifBuffer || [])],
                                pitchHistory: [...(liveState.soloist.pitchHistory || [])],
                                phraseContext: {
                                    ...(liveState.soloist.session.currentPhrase.context || {}),
                                },
                            },
                            harmony: {
                                ...liveState.harmony,
                                buffer: new Map(),
                                activeVoices: [],
                            },
                            // Normally off: the render has no visualizer to draw to.
                            // `--write-events` turns it on purely as a capture tap —
                            // `queueVisualizerNoteEvent` fires at every lane's actual
                            // schedule site (drums included, which never enter the note
                            // buffer) with post-humanization play times, which is exactly
                            // the event stream a render-vs-intent check needs. The queued
                            // events are inert data; nothing consumes them mid-render.
                            vizState: { ...liveState.vizState, enabled: Boolean(writeEvents) },
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

                    function createSceneState(scene, stem, voiceOverride, seedLabel) {
                        const liveState = getState();
                        const state = cloneState(liveState);
                        state.arranger.sections = scene.sections.map((section) => ({
                            ...section,
                            key: section.key || scene.key,
                            isMinor: section.isMinor ?? false,
                            timeSignature: section.timeSignature || scene.timeSignature || '4/4',
                        }));
                        state.arranger.key = scene.key;
                        const planSeed = `${scene.id}:${seedLabel}`;
                        state.arranger.seed = planSeed;
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
                        state.soloist.enabled = Boolean(
                            stem.enabled.soloist && (scene.includeSoloist ?? true),
                        );
                        state.groove.enabled = Boolean(
                            stem.enabled.drums && (scene.includeDrums ?? true),
                        );

                        validateProgression(state);

                        const sessionSeed = generateSessionSeed(
                            state,
                            state.arranger,
                            state.soloist.style || 'smart',
                            state.playback.bandIntensity,
                            planSeed,
                        );
                        state.soloist.session.seed = sessionSeed;
                        state.groove.accentMap = state.soloist.enabled
                            ? generateSoloistAccents(
                                  state,
                                  state.arranger,
                                  sessionSeed,
                                  state.groove.genreFeel,
                                  state.playback.bandIntensity,
                                  planSeed,
                              )
                            : null;
                        state.groove.seedTimelineStartStep = 0;

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

                        // #1351: a scene may pin lane voices ('synth' | 'pack:<id>')
                        // so an external fixture (--scenes-from) can exercise the
                        // sampled path with event capture ON — the voiceOverride
                        // path below deliberately disables capture (filename
                        // collision), which made pack voices unverifiable.
                        if (Array.isArray(scene.voices)) {
                            // Allowlist the module key — `--scenes-from` input is
                            // external, and `state['constructor']` is a truthy hit
                            // (the #1266 TABLE[untrusted] rule).
                            const VOICE_MODULES = [
                                'bass',
                                'chords',
                                'harmony',
                                'soloist',
                                'groove',
                            ];
                            for (const entry of scene.voices) {
                                if (
                                    entry?.voice &&
                                    VOICE_MODULES.includes(entry.module) &&
                                    state[entry.module]
                                ) {
                                    state[entry.module].voice = entry.voice;
                                }
                            }
                        }

                        // Pack-calibration A/B: force the target lane onto a
                        // specific voice ('synth' baseline vs 'pack:<id>') so the
                        // two renders differ only in the voice under test. The
                        // cohesion render (#687) passes a `voices` array to force
                        // the whole band at once, and `muteReverb` to zero every
                        // bus send for the dry leg of the wet/dry proxy.
                        if (voiceOverride) {
                            const list =
                                voiceOverride.voices ||
                                (voiceOverride.module
                                    ? [
                                          {
                                              module: voiceOverride.module,
                                              voice: voiceOverride.voice,
                                          },
                                      ]
                                    : []);
                            for (const entry of list) {
                                if (state[entry.module]) {
                                    state[entry.module].voice = entry.voice;
                                }
                            }
                            if (voiceOverride.muteReverb) {
                                for (const mod of [
                                    'chords',
                                    'bass',
                                    'soloist',
                                    'harmony',
                                    'groove',
                                ]) {
                                    if (state[mod]) {
                                        state[mod].reverb = 0;
                                    }
                                }
                            }
                        }

                        return state;
                    }

                    function storeNote(targetMap, step, note) {
                        if (!targetMap.has(step)) {
                            targetMap.set(step, []);
                        }
                        targetMap.get(step).push(note);
                    }

                    function fillBuffers(
                        state,
                        timelineStartStep,
                        carryover,
                        captureSharedCatchEvents = false,
                    ) {
                        const cursors = {
                            mainCursor: { index: 0, sectionIndex: 0 },
                            lookaheadCursor: { index: 0, sectionIndex: 0 },
                        };
                        const sharedCatchEvents = [];

                        for (let step = 0; step < state.arranger.totalSteps; step++) {
                            const absoluteStep = timelineStartStep + step;
                            const result = generateNotesForStep(
                                state,
                                absoluteStep,
                                cursors,
                                {
                                    includeBass: state.bass.enabled,
                                    includeChords: state.chords.enabled,
                                    includeSoloist: state.soloist.enabled,
                                    includeHarmony: state.harmony.enabled,
                                    includeDrums: false,
                                },
                                carryover,
                            );

                            if (result.coordination.lastActiveSoloistMidi) {
                                carryover.lastActiveSoloistMidi =
                                    result.coordination.lastActiveSoloistMidi;
                                carryover.lastActiveSoloistStep =
                                    result.coordination.lastActiveSoloistStep;
                            }

                            if (captureSharedCatchEvents && result.coordination?.sharedCatch) {
                                sharedCatchEvents.push({
                                    step,
                                    absoluteStep,
                                    type: result.coordination.sharedCatch.type,
                                    velocity: result.coordination.sharedCatch.velocity,
                                    role: result.coordination.sharedCatch.role || null,
                                    chordMidis: result.notes
                                        .filter(
                                            (note) =>
                                                note.module === 'chords' &&
                                                note.midi > 0 &&
                                                note.muted !== true,
                                        )
                                        .map((note) => note.midi),
                                });
                            }

                            for (const note of result.notes) {
                                if (note.module === 'bass') {
                                    storeNote(state.bass.buffer, absoluteStep, note);
                                } else if (note.module === 'chords') {
                                    storeNote(state.chords.buffer, absoluteStep, note);
                                } else if (note.module === 'harmony') {
                                    storeNote(state.harmony.buffer, absoluteStep, note);
                                } else if (note.module === 'soloist') {
                                    storeNote(state.soloist.audio.buffer, absoluteStep, note);
                                }
                            }
                        }

                        return sharedCatchEvents;
                    }

                    function collectScheduleBuffer(state, modules) {
                        const combined = new Map();
                        for (const moduleName of modules) {
                            const moduleState = state[moduleName];
                            const source =
                                moduleName === 'soloist'
                                    ? moduleState?.audio?.buffer
                                    : moduleState?.buffer;
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

                    // #1351 intent tap: snapshot the pitched lane buffers BEFORE the
                    // scheduler consumes them (scheduleGlobalEvent deletes each step's
                    // entry as it dispatches). This is the engine's generated truth —
                    // the stream `mix:verify` reconciles dispatch against. Freq-less
                    // and midi-0 entries are CC-only carriers, not notes. Boolean-muted
                    // entries are retained in the dump so `mix:verify` can report that
                    // it explicitly excluded the silent sentinel; audible chord ghosts
                    // carry `muted: false` plus their authored low velocity (#938). Drums
                    // never enter these buffers (includeDrums stays false here).
                    function collectIntentEvents(
                        state,
                        stem,
                        timelineStartStep,
                        stepsPerLoop,
                        leadInSeconds,
                        stepSeconds,
                    ) {
                        const lanes = [
                            ['bass', state.bass.buffer],
                            ['chords', state.chords.buffer],
                            ['harmony', state.harmony.buffer],
                            ['soloist', state.soloist.audio.buffer],
                        ];
                        const out = [];
                        for (const [track, buffer] of lanes) {
                            if (!stem.enabled[track] || !(buffer instanceof Map)) {
                                continue;
                            }
                            for (const [step, notes] of buffer.entries()) {
                                const timelineEndStep = timelineStartStep + stepsPerLoop;
                                if (
                                    step < timelineStartStep ||
                                    step >= timelineEndStep ||
                                    !Array.isArray(notes)
                                ) {
                                    continue;
                                }
                                for (const note of notes) {
                                    const freq = note?.freq;
                                    if (!(freq > 0)) {
                                        continue;
                                    }
                                    const midi = Math.round(69 + 12 * Math.log2(freq / 440));
                                    if (!(midi > 0)) {
                                        continue;
                                    }
                                    const absoluteStep = step;
                                    const entry = {
                                        track,
                                        step: absoluteStep - timelineStartStep,
                                        absoluteStep,
                                        time: leadInSeconds + absoluteStep * stepSeconds,
                                        midi,
                                    };
                                    if (typeof note.durationSteps === 'number') {
                                        entry.durationSteps = note.durationSteps;
                                    }
                                    if (typeof note.velocity === 'number') {
                                        entry.velocity = note.velocity;
                                    }
                                    if (note.muted !== undefined) {
                                        entry.muted = note.muted;
                                    }
                                    out.push(entry);
                                }
                            }
                        }
                        return out;
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

                    function computeStereoMetrics(audioBuffer) {
                        // Mono renders have no stereo image — return null so
                        // downstream code can distinguish "wasn't stereo" from
                        // "stereo but center-summed."
                        if ((audioBuffer.numberOfChannels || 1) < 2) {
                            return { correlation: null, sideRatio: null };
                        }
                        const left = audioBuffer.getChannelData(0);
                        const right = audioBuffer.getChannelData(1);
                        const length = Math.min(left.length, right.length);

                        let sumLR = 0;
                        let sumLL = 0;
                        let sumRR = 0;
                        let midEnergy = 0;
                        let sideEnergy = 0;
                        for (let i = 0; i < length; i++) {
                            const l = left[i];
                            const r = right[i];
                            sumLR += l * r;
                            sumLL += l * l;
                            sumRR += r * r;
                            const mid = (l + r) * 0.5;
                            const side = (l - r) * 0.5;
                            midEnergy += mid * mid;
                            sideEnergy += side * side;
                        }

                        const denom = Math.sqrt(sumLL * sumRR);
                        const correlation = denom > 1e-12 ? sumLR / denom : 1;
                        const totalEnergy = midEnergy + sideEnergy;
                        const sideRatio = totalEnergy > 1e-12 ? sideEnergy / totalEnergy : 0;
                        return { correlation, sideRatio };
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

                    function computePerLoopRmsDb(
                        monoSamples,
                        sampleRate,
                        leadInSeconds,
                        loopSeconds,
                        loopCount,
                    ) {
                        if (loopCount <= 1 || loopSeconds <= 0) {
                            return null;
                        }
                        const out = [];
                        const samplesPerLoop = Math.floor(loopSeconds * sampleRate);
                        const startOffset = Math.floor(leadInSeconds * sampleRate);
                        for (let i = 0; i < loopCount; i++) {
                            const start = startOffset + i * samplesPerLoop;
                            const end = Math.min(monoSamples.length, start + samplesPerLoop);
                            if (end <= start) {
                                out.push(-Infinity);
                                continue;
                            }
                            let sumSquares = 0;
                            for (let j = start; j < end; j++) {
                                sumSquares += monoSamples[j] * monoSamples[j];
                            }
                            const rms = Math.sqrt(sumSquares / (end - start));
                            out.push(rms > 0 ? 20 * Math.log10(rms) : -Infinity);
                        }
                        return out;
                    }

                    function classifyArc(loopRmsDb) {
                        if (!loopRmsDb || loopRmsDb.length < 2) {
                            return null;
                        }
                        const finite = loopRmsDb.filter((v) => Number.isFinite(v));
                        if (finite.length < 2) {
                            return null;
                        }
                        const max = Math.max(...finite);
                        const min = Math.min(...finite);
                        if (max - min < 1.5) {
                            return 'flat';
                        }
                        const peakIndex = loopRmsDb.indexOf(max);
                        const troughIndex = loopRmsDb.indexOf(min);
                        const last = loopRmsDb.length - 1;
                        if (peakIndex === 0 && loopRmsDb[last] <= loopRmsDb[0] - 1.5) {
                            return 'front-loaded';
                        }
                        if (peakIndex === last && loopRmsDb[0] <= loopRmsDb[last] - 1.5) {
                            return 'building';
                        }
                        if (peakIndex > 0 && peakIndex < last) {
                            return 'arc';
                        }
                        if (troughIndex > 0 && troughIndex < last) {
                            return 'dip';
                        }
                        return 'irregular';
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
                        // Epic 7 S3a — `air5k` added 2026-05-25 to test
                        // whether the legacy 7.2 kHz probe was missing
                        // modern hi-hat / shaker content. Mirror of
                        // SPECTRAL_BAND_CENTERS in scripts/audio-analysis.ts.
                        const centers = {
                            sub: 60,
                            low: 140,
                            lowMid: 380,
                            mid: 1000,
                            presence: 2800,
                            air5k: 5000,
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
                                air5k: 0,
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
                            air5k: 0,
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

                    async function renderStem(scene, stem, seedLabel, voiceOverride) {
                        await loadDrumPreset(scene.drumPreset || 'Basic Rock');
                        const state = createSceneState(scene, stem, voiceOverride, seedLabel);
                        // Preload any pack a scene-pinned voice needs (same
                        // module-global cache idiom as the cohesion render).
                        for (const module of ['bass', 'chords', 'harmony', 'soloist', 'groove']) {
                            const voice = state[module]?.voice;
                            if (typeof voice === 'string' && voice.startsWith('pack:')) {
                                const packId = voice.slice(5);
                                const loadCtx = new OfflineAudioContext(1, sampleRate, sampleRate);
                                await ensemble.ensurePackLoaded(loadCtx, packId);
                                // `ensurePackLoaded` swallows failure (correct for the
                                // live app's graceful synth fallback, wrong for an
                                // audit tool): a typo'd id would silently render the
                                // synth voice and stamp evidence over the wrong claim.
                                // A pitched pack proves it loaded via built zones;
                                // percussion packs (#662) build none, so only pitched
                                // lanes can be asserted.
                                if (module !== 'groove') {
                                    const zones = ensemble.getPackZones(packId);
                                    if (!zones || zones.length === 0) {
                                        throw new Error(
                                            `scene "${scene.id}": pack "${packId}" for ${module} did not load — refusing to render the synth fallback as pack evidence`,
                                        );
                                    }
                                }
                            }
                        }
                        const sixteenth = 60 / state.playback.bpm / 4;
                        const renderLeadIn = 0.25;
                        const stepsPerLoop = state.arranger.totalSteps;
                        const loopCount = Math.max(1, loops || 1);
                        const totalRenderSteps = stepsPerLoop * loopCount;
                        // Walk the swing-aware per-step durations up front via
                        // `calculateStepDuration` — the same shared swing authority
                        // production's live scheduler and MIDI exporter use — rather
                        // than a fixed straight sixteenth-note grid multiple, so this
                        // tool's evidence matches what a shuffle/swing chart actually
                        // renders (#1063). `sixteenth` above stays the nominal
                        // straight-grid unit for the analysis helpers below (schedule
                        // step-indexing, per-loop RMS windows, event metadata), which
                        // is unaffected by this fix.
                        const swungStepDurations = new Array(totalRenderSteps);
                        let totalSwungSeconds = 0;
                        for (
                            let absoluteStep = 0;
                            absoluteStep < totalRenderSteps;
                            absoluteStep++
                        ) {
                            const { stepInfo, ts } = getEffectiveMeterAtStep(
                                state.arranger,
                                absoluteStep,
                            );
                            const duration = calculateStepDuration(
                                stepInfo.mStep,
                                state.playback.bpm,
                                ts,
                                state.groove,
                            );
                            swungStepDurations[absoluteStep] = duration;
                            totalSwungSeconds += duration;
                        }
                        const renderSeconds = renderLeadIn + totalSwungSeconds + 2;
                        const offlineCtx = new OfflineAudioContext(
                            2,
                            Math.ceil(renderSeconds * sampleRate),
                            sampleRate,
                        );
                        const originalRandom = Math.random;
                        Math.random = mulberry32(hashSeed(`${scene.id}:${seedLabel}`));

                        try {
                            initAudio(state, { audioContext: offlineCtx, enableWatchdog: false });

                            // Schedule analysis is captured from the first loop
                            // only; each loop below refills the consumed buffers
                            // in the same absolute timeline frame as live/MIDI.
                            let schedule = null;

                            const intentEvents = [];
                            const sharedCatchEvents = [];
                            const carryover = {
                                lastActiveSoloistMidi: 0,
                                lastActiveSoloistStep: 0,
                            };

                            // Walk both clocks in parallel exactly as production's
                            // `advanceGlobalStep` does for live playback: `swungTime`
                            // accumulates the precomputed swing-aware durations,
                            // `unswungTime` accumulates the plain 16th grid — so
                            // `unswungNextNoteTime` stays genuinely unswung here too
                            // (#1063).
                            let swungTime = renderLeadIn;
                            let unswungTime = renderLeadIn;

                            for (let loopIndex = 0; loopIndex < loopCount; loopIndex++) {
                                const timelineStartStep = loopIndex * stepsPerLoop;
                                // Drive the soloist's chorus-evolution machinery
                                // (Loop 0 head → Loop 1 themed → Loop 2+ exploratory)
                                // by bumping currentLoopCount the way scheduler-core
                                // does at each `step % totalSteps === 0` boundary.
                                state.playback.currentLoopCount = loopIndex;
                                // Synth-audit Epic 7 S4: broadcast the loop-driven
                                // intensity arc on bandIntensity so all four engines
                                // (drums, bass, chords/harmony, soloist) bias in phase.
                                // The conductor doesn't run in this render path
                                // (autoIntensity=false, dispatch=undefined), so we
                                // write the arc-modulated value directly.
                                const arcMult = loopArcMultiplier(loopIndex, loopCount);
                                state.playback.bandIntensity = Math.max(
                                    0.1,
                                    Math.min(1.0, scene.intensity * arcMult),
                                );
                                // Re-fill every loop because scheduleGlobalEvent
                                // consumes buffer entries. Absolute generation is
                                // load-bearing for session-seed notes and accentMap.
                                sharedCatchEvents.push(
                                    ...fillBuffers(
                                        state,
                                        timelineStartStep,
                                        carryover,
                                        Boolean(writeEvents && !voiceOverride),
                                    ),
                                );
                                if (loopIndex === 0 && stem.schedule) {
                                    schedule = analyzeNoteSchedule(
                                        collectScheduleBuffer(state, stem.schedule.modules),
                                        sixteenth,
                                        renderLeadIn,
                                        stem.schedule.voiceLimit,
                                    );
                                }
                                // Same gate as the sidecar write below: intent capture
                                // is part of event capture, so the default render path
                                // allocates nothing new (#1351 acceptance 7).
                                if (writeEvents && !voiceOverride) {
                                    intentEvents.push(
                                        ...collectIntentEvents(
                                            state,
                                            stem,
                                            timelineStartStep,
                                            stepsPerLoop,
                                            renderLeadIn,
                                            sixteenth,
                                        ),
                                    );
                                }
                                for (let step = 0; step < stepsPerLoop; step++) {
                                    const absoluteStep = timelineStartStep + step;
                                    state.playback.nextNoteTime = swungTime;
                                    state.playback.unswungNextNoteTime = unswungTime;
                                    scheduleGlobalEvent(state, absoluteStep, swungTime);

                                    swungTime += swungStepDurations[absoluteStep];
                                    unswungTime += sixteenth;
                                }
                            }

                            const rendered = await offlineCtx.startRendering();
                            const mono = toMono(rendered);
                            const peak = computePeak(mono);
                            const rms = computeRms(mono);

                            const loopRmsDb = computePerLoopRmsDb(
                                mono,
                                sampleRate,
                                renderLeadIn,
                                stepsPerLoop * sixteenth,
                                loopCount,
                            );
                            const arc = classifyArc(loopRmsDb);

                            if (writeWav) {
                                const channels = [];
                                for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
                                    channels.push(Array.from(rendered.getChannelData(ch)));
                                }
                                const fileName = `${scene.id}-${stem.id}-${seedLabel}.wav`;
                                await /** @type {any} */ (window).__writeWav(
                                    fileName,
                                    channels,
                                    rendered.sampleRate,
                                );
                            }

                            // Skipped for voice-override renders (`--calibrate-pack` /
                            // `--cohesion`): those render the SAME scene/stem/seed twice
                            // to compare voices, so both writes would land on one
                            // filename and the second would silently win.
                            if (writeEvents && !voiceOverride) {
                                const enabledTracks = Object.keys(stem.enabled).filter(
                                    (track) => stem.enabled[track],
                                );
                                const dispatchEvents = (state.playback.drawQueue || [])
                                    .filter(
                                        (event) =>
                                            event &&
                                            event.type === 'note' &&
                                            enabledTracks.includes(event.track),
                                    )
                                    .map((event) => ({
                                        track: event.track,
                                        time: event.time,
                                        midi: event.midi,
                                        duration: event.duration ?? null,
                                        // Present only on lanes whose visualizer payload
                                        // carries it (drums, chords today) — the consumer
                                        // reports the gap rather than inventing a value.
                                        velocity:
                                            typeof event.velocity === 'number'
                                                ? event.velocity
                                                : null,
                                        // #1351 audit fields: the exact scalar the voice
                                        // received, and any articulation attenuation.
                                        renderVelocity:
                                            typeof event.renderVelocity === 'number'
                                                ? event.renderVelocity
                                                : null,
                                        levelScale:
                                            typeof event.levelScale === 'number'
                                                ? event.levelScale
                                                : null,
                                    }))
                                    .sort((a, b) => a.time - b.time);

                                await /** @type {any} */ (window).__writeEvents(
                                    `${scene.id}-${stem.id}-${seedLabel}.events.json`,
                                    {
                                        scene: scene.id,
                                        stem: stem.id,
                                        seed: seedLabel,
                                        tracks: enabledTracks,
                                        meta: {
                                            sampleRate,
                                            leadInSeconds: renderLeadIn,
                                            stepSeconds: sixteenth,
                                            stepsPerLoop,
                                            loopCount,
                                            bpm: state.playback.bpm,
                                        },
                                        // `events` stays as a compatibility alias for
                                        // `dispatchEvents` during migration (#1351).
                                        events: dispatchEvents,
                                        dispatchEvents,
                                        intentEvents: intentEvents
                                            .slice()
                                            .sort((a, b) => a.time - b.time || a.midi - b.midi),
                                        sharedCatchEvents: sharedCatchEvents
                                            .slice()
                                            .sort((a, b) => a.absoluteStep - b.absoluteStep),
                                    },
                                );
                            }

                            return {
                                peak,
                                peakDb: toDb(peak),
                                rms,
                                rmsDb: toDb(rms),
                                crestDb: toDb(peak) - toDb(rms),
                                probes: computeSpectralProbes(mono, sampleRate),
                                transients: computeTransientMetrics(mono, sampleRate),
                                stereo: computeStereoMetrics(rendered),
                                loopRmsDb,
                                arc,
                                schedule,
                            };
                        } finally {
                            Math.random = originalRandom;
                        }
                    }

                    const sceneReports = [];

                    // In calibration mode the full per-stem report is discarded
                    // (Node early-returns the calibration), so skip the whole
                    // N-stem × scenes × seeds render and only do the paired A/B.
                    for (const scene of calibratePack ? [] : scenes) {
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
                            findingThresholds: scene.findingThresholds || null,
                            seeds: seedReports,
                        });
                    }

                    // Pack calibration: render the target lane's stem twice per
                    // scene/seed — once on the synth voice (baseline), once on the
                    // pack — and report the RMS + centroid the Node side turns into
                    // a suggested gain. Same scene/seed → the only difference is the
                    // voice under test.
                    let calibration = null;
                    if (calibratePack) {
                        const { module, packId } = calibratePack;
                        // module → which single-lane stem isolates it.
                        const stemForModule = { groove: 'drums' };
                        const stemId = stemForModule[module] || module;
                        const stem = stems.find((entry) => entry.id === stemId);
                        if (!stem) {
                            calibration = {
                                module,
                                packId,
                                error: `no isolated stem for module "${module}"`,
                            };
                        } else {
                            // Load the pack zones once into the module-global cache
                            // (decode on a throwaway offline ctx); subsequent pack
                            // renders read the same cache.
                            const loadCtx = new OfflineAudioContext(1, sampleRate, sampleRate);
                            await ensemble.ensurePackLoaded(loadCtx, packId);
                            const zones = ensemble.getPackZones(packId);
                            // A pitched pack proves it loaded via built zones; a
                            // percussion pack (#662) builds no zones (it keys by
                            // articulation, not pitch) — its load proof is that its
                            // buffers registered. Either way the stem render below
                            // drives the real engine seam, not the zones directly.
                            const loaded =
                                (zones && zones.length > 0) || ensemble.isPackLoaded(packId);
                            if (!loaded) {
                                calibration = {
                                    module,
                                    packId,
                                    error: `pack "${packId}" failed to load (dist/packs/${packId} present? built?)`,
                                };
                            } else {
                                const rows = [];
                                for (const scene of scenes) {
                                    for (const seed of seeds) {
                                        const synthMetrics = await renderStem(scene, stem, seed, {
                                            module,
                                            voice: 'synth',
                                        });
                                        const packMetrics = await renderStem(scene, stem, seed, {
                                            module,
                                            voice: `pack:${packId}`,
                                        });
                                        rows.push({
                                            sceneId: scene.id,
                                            seed,
                                            synthRmsDb: synthMetrics.rmsDb,
                                            packRmsDb: packMetrics.rmsDb,
                                            synthCentroid: synthMetrics.probes?.centroid || 0,
                                            packCentroid: packMetrics.probes?.centroid || 0,
                                        });
                                    }
                                }
                                calibration = { module, packId, rows };
                            }
                        }
                    }

                    // Cohesion (#687): render the full band (full+solo stem)
                    // all-synth vs all-sample per scene, plus an all-sample dry
                    // leg (reverb muted) for the wet/dry proxy. Reuses the same
                    // per-render metrics (side-ratio / crest / rms) the per-stem
                    // report computes — only the voice config differs.
                    let cohesion = null;
                    if (cohesionBand) {
                        const stem = stems.find((entry) => entry.id === 'full+solo');
                        const SYNTH_BAND = ['chords', 'bass', 'soloist', 'harmony', 'groove'].map(
                            (module) => ({ module, voice: 'synth' }),
                        );
                        // Preload every pack the sample band uses (into the
                        // module-global cache the engine seam reads).
                        const loadCtx = new OfflineAudioContext(1, sampleRate, sampleRate);
                        for (const entry of cohesionBand) {
                            const packId = entry.voice.startsWith('pack:')
                                ? entry.voice.slice(5)
                                : null;
                            if (packId) {
                                await ensemble.ensurePackLoaded(loadCtx, packId);
                            }
                        }
                        const rows = [];
                        for (const scene of scenes) {
                            for (const seed of seeds) {
                                const synthM = await renderStem(scene, stem, seed, {
                                    voices: SYNTH_BAND,
                                });
                                const sampleM = await renderStem(scene, stem, seed, {
                                    voices: cohesionBand,
                                });
                                const sampleDryM = await renderStem(scene, stem, seed, {
                                    voices: cohesionBand,
                                    muteReverb: true,
                                });
                                rows.push({
                                    sceneId: scene.id,
                                    seed,
                                    synth: {
                                        rmsDb: synthM.rmsDb,
                                        crestDb: synthM.crestDb,
                                        sideRatio: synthM.stereo?.sideRatio ?? null,
                                    },
                                    sample: {
                                        rmsDb: sampleM.rmsDb,
                                        crestDb: sampleM.crestDb,
                                        sideRatio: sampleM.stereo?.sideRatio ?? null,
                                    },
                                    sampleWetnessDb: sampleM.rmsDb - sampleDryM.rmsDb,
                                });
                            }
                        }
                        cohesion = { stemId: stem.id, rows };
                    }

                    return { sceneReports, calibration, cohesion };
                },
                {
                    scenes,
                    stems: MIX_REPORT_STEMS,
                    seeds,
                    writeWav: Boolean(writeWav),
                    writeEvents: Boolean(writeEvents),
                    loops: loopCount,
                    calibratePack: calibratePack || null,
                    cohesionBand: cohesion ? COHESION_SAMPLE_BAND : null,
                },
            );

            return {
                sceneRuns: evaluated.sceneReports,
                calibration: evaluated.calibration,
                cohesion: evaluated.cohesion,
                writtenWavPaths,
                writtenEventPaths,
            };
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
    if (cliOptions.scenesFrom && (cliOptions.sceneIds.length > 0 || cliOptions.focusFrom)) {
        throw new Error('--scenes-from is mutually exclusive with --scene/--scenes/--focus-from');
    }
    const focusInput = await loadFocusInput(cliOptions.focusFrom, cliOptions.focusLimit);
    const scenes = cliOptions.scenesFrom
        ? parseExternalScenes(
              await readFile(path.resolve(REPO_ROOT, cliOptions.scenesFrom), 'utf8'),
              cliOptions.scenesFrom,
          )
        : resolveScenes(cliOptions, focusInput);
    const { seeds, source } = resolveSeeds(cliOptions, focusInput);

    if (!cliOptions.noBuild) {
        log.write('Building dist for mix analysis...\n');
        // The offline render drives `window.ensemble`, which `main.ts` gates
        // behind `import.meta.env.DEV || VITE_E2E_BRIDGE`. A plain `vite build`
        // (DEV=false) tree-shakes the bridge out, so opt it back in for this
        // analysis build only — real prod builds never set the flag (#656).
        await runCommand('npm', ['run', 'build:quiet'], {
            forwardToStderr: machineReadable,
            env: { VITE_E2E_BRIDGE: '1' },
        });
    }

    const { sceneRuns, calibration, cohesion, writtenWavPaths, writtenEventPaths } =
        await renderSceneReports({
            scenes,
            seeds,
            writeWav: cliOptions.writeWav,
            writeEvents: cliOptions.writeEvents,
            loops: cliOptions.loops,
            calibratePack: cliOptions.calibratePack,
            cohesion: cliOptions.cohesion,
        });

    // Cohesion mode: the deliverable is the band-level synth-vs-sample block,
    // not the per-stem report. Print it and return (#687).
    if (cliOptions.cohesion) {
        process.stdout.write(`${formatCohesionReport(cohesion)}\n`);
        return { cohesion };
    }

    // Calibration mode: the deliverable is the suggested gain, not the full
    // report. Print it and return — the same paired numbers the catalog `gain`
    // field should be set from.
    if (cliOptions.calibratePack) {
        process.stdout.write(
            `${formatPackCalibration({
                ...calibration,
                currentGain: gainForPack(cliOptions.calibratePack.packId),
            })}\n`,
        );
        return { calibration };
    }

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

    if (writtenWavPaths && writtenWavPaths.length > 0) {
        log.write(`\nWrote ${writtenWavPaths.length} WAV files to ${cliOptions.writeWav}\n`);
    }

    if (writtenEventPaths && writtenEventPaths.length > 0) {
        log.write(`Wrote ${writtenEventPaths.length} event files to ${cliOptions.writeEvents}\n`);
    }

    return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    generateMixReport().catch((error) => {
        console.error('\nMix report failed:', error);
        process.exitCode = 1;
    });
}
