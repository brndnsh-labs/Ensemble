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
    analyzeSchedule,
    buildEventDump,
    laneEvents,
    performSceneForReport,
    renderMeta,
    sceneVoices,
} from './band-scene.js';
import {
    buildRenderedMixReport,
    CALIBRATION_STEM,
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

// mix:report — render the band engine offline and measure it, stem by stem.
//
// The music is composed here in node (`band-scene.ts`: each scene's chart → `compileTimeline`
// → `performPass`); the audio is rendered in the v2 app itself, built with the render bridge
// (`prototypes/v2/lib/render-bridge.ts`), through `renderBandPasses` — the offline render the
// app's WAV export uses, on today's voices and sample packs. Metrics are measured in the page;
// the report is built in node (`mix-report-utils.ts`).

export const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const SAMPLE_RATE = 44100;
// The v2 music stand's static export, built with the render bridge (see the build step
// in `main`). It is the same `out/` the v2 suite serves, so run the suite's own build again
// before trusting it after a mix report.
const V2_DIR = path.join(REPO_ROOT, 'prototypes', 'v2');
const DIST_DIR = path.join(V2_DIR, 'out');
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
    const { forwardToStderr = false, env = {}, cwd = REPO_ROOT } = options;
    const stdio = forwardToStderr ? ['ignore', 'pipe', 'pipe'] : 'inherit';

    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd,
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
    console.log('\n=== Rendered Audio Audit (band engine) ===');
    for (const scene of report.scenes) {
        const band = scene.band
            ? ` | style ${scene.band.style} · comp ${scene.band.comp} · lead ${scene.band.lead}`
            : '';
        console.log(
            `\n[${scene.id}] ${scene.label} | ${scene.genreFeel} @ ${scene.bpm} BPM | intensity ${scene.intensity}${band}`,
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

/**
 * Runs IN THE PAGE (passed to `page.evaluate`, so it must be self-contained): renders one stem
 * through the render bridge (`prototypes/v2/lib/render-bridge.ts`) and measures it there, so
 * the channel data never has to cross into node — only the metrics and the dispatch tap do.
 * With `wavName` set, the channels also go to node's `__writeWav` for encoding.
 */
async function renderAndMeasureInPage({ request, loopCount, wavName }) {
    const render = await window.ensemble.renderBand(request);
    const { channels, sampleRate } = render;

    function toMono(data) {
        const length = data[0].length;
        const mono = new Float32Array(length);
        for (const channel of data) {
            for (let i = 0; i < length; i++) {
                mono[i] += channel[i] / data.length;
            }
        }
        return mono;
    }

    function computeStereoMetrics(data) {
        // Mono renders have no stereo image — return null so downstream code can
        // distinguish "wasn't stereo" from "stereo but center-summed."
        if (data.length < 2) {
            return { correlation: null, sideRatio: null };
        }
        const [left, right] = data;
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

    function computePerLoopRmsDb(monoSamples, leadInSeconds, loopSeconds) {
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

    function goertzelMagnitude(samples, freq) {
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

    function computeSpectralProbes(samples) {
        // Epic 7 S3a — `air5k` added 2026-05-25 to test whether the legacy 7.2 kHz
        // probe was missing modern hi-hat / shaker content. Mirror of
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
        const totals = { sub: 0, low: 0, lowMid: 0, mid: 0, presence: 0, air5k: 0, air: 0 };
        if (windowSize < 256) {
            return { ...totals, centroid: 0 };
        }
        const windows = [];
        const hop = Math.max(1, Math.floor((active.length - windowSize) / 3));
        for (let i = 0; i < 4; i++) {
            const start = Math.min(active.length - windowSize, hop * i);
            windows.push(active.slice(start, start + windowSize));
        }
        for (const windowSamples of windows) {
            for (const [band, freq] of Object.entries(centers)) {
                totals[band] += goertzelMagnitude(windowSamples, freq);
            }
        }
        const totalEnergy = Object.values(totals).reduce((sum, value) => sum + value, 0) || 1;
        const normalized = {};
        let centroidNumerator = 0;
        for (const [band, freq] of Object.entries(centers)) {
            normalized[band] = totals[band] / totalEnergy;
            centroidNumerator += normalized[band] * freq;
        }
        normalized.centroid = centroidNumerator;
        return normalized;
    }

    function computeTransientMetrics(samples) {
        const bounds = activeBounds(samples);
        const active = samples.slice(bounds.start, bounds.end);
        if (active.length < 4) {
            return { maxDelta: 0, spikeCount: 0, spikeRate: 0, threshold: 0 };
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

    if (wavName) {
        await window.__writeWav(
            wavName,
            channels.map((channel) => Array.from(channel)),
            sampleRate,
        );
    }

    const mono = toMono(channels);
    const peak = computePeak(mono);
    const rms = computeRms(mono);
    const loopRmsDb = computePerLoopRmsDb(mono, render.leadInSeconds, render.passSeconds);
    return {
        metrics: {
            peak,
            peakDb: toDb(peak),
            rms,
            rmsDb: toDb(rms),
            crestDb: toDb(peak) - toDb(rms),
            probes: computeSpectralProbes(mono),
            transients: computeTransientMetrics(mono),
            stereo: computeStereoMetrics(channels),
            loopRmsDb,
            arc: classifyArc(loopRmsDb),
        },
        dispatched: render.dispatched,
        leadInSeconds: render.leadInSeconds,
        passSeconds: render.passSeconds,
        sampleRate,
    };
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

            await page.goto(baseUrl, { waitUntil: 'networkidle' });
            await page.waitForFunction(
                () =>
                    document.documentElement.dataset.renderBridge === 'ready' &&
                    Boolean(window.ensemble?.renderBand),
                undefined,
                { timeout: 20000 },
            );

            /**
             * Render one stem of a scene's performance on the given lane sounds, measure it,
             * and (for an ordinary render) write its WAV and event dump. `dump: false` is for
             * the paired renders (`--calibrate-pack`, `--cohesion`), which render the SAME
             * scene/stem/seed twice, so both writes would land on one filename and the second
             * would silently win.
             */
            async function renderStem(scene, seed, performance, stem, voices, options = {}) {
                const { muteReverb = false, dump = false } = options;
                const request = {
                    score: performance.score,
                    passes: laneEvents(performance[stem.performance], stem.lanes),
                    bpm: scene.bpm,
                    sampleRate: SAMPLE_RATE,
                    intensity: performance.settings.intensity ?? 0.7,
                    voices,
                    muteReverb,
                    // Keyed on the scene and seed, as the old harness keyed its renders, so
                    // the voices' own humanising repeats from run to run.
                    randomSeed: `${scene.id}:${seed}`,
                };
                const measured = await page.evaluate(renderAndMeasureInPage, {
                    request,
                    loopCount,
                    wavName: dump && wavDir ? `${scene.id}-${stem.id}-${seed}.wav` : null,
                });
                if (dump && eventDir) {
                    const eventDump = buildEventDump({
                        scene: scene.id,
                        stem: stem.id,
                        seed,
                        lanes: stem.lanes,
                        meta: renderMeta(performance.timeline, scene.bpm, loopCount, measured),
                        dispatched: measured.dispatched,
                    });
                    const outPath = path.join(
                        eventDir,
                        `${scene.id}-${stem.id}-${seed}.events.json`,
                    );
                    await writeFile(outPath, JSON.stringify(eventDump, null, 2));
                    writtenEventPaths.push(outPath);
                }
                return {
                    ...measured.metrics,
                    schedule: stem.schedule
                        ? analyzeSchedule(
                              measured.dispatched,
                              stem.schedule.lanes,
                              stem.schedule.voiceLimit,
                          )
                        : null,
                };
            }

            function stemById(id) {
                return MIX_REPORT_STEMS.find((stem) => stem.id === id);
            }

            const sceneRuns = [];
            // The paired modes' deliverable is their own block (Node returns it without the
            // per-stem report), so they skip the whole N-stem × scenes × seeds render.
            for (const scene of calibratePack || cohesion ? [] : scenes) {
                const seedReports = [];
                let band = null;
                for (const seed of seeds) {
                    const voices = sceneVoices(scene);
                    const performance = performSceneForReport(scene, seed, loopCount, voices);
                    band ??= {
                        style: performance.settings.style,
                        comp: performance.settings.comp,
                        lead: performance.settings.lead,
                    };
                    const stems = {};
                    for (const stem of MIX_REPORT_STEMS) {
                        stems[stem.id] = await renderStem(scene, seed, performance, stem, voices, {
                            dump: true,
                        });
                    }
                    seedReports.push({ seed, stems });
                }
                sceneRuns.push({
                    id: scene.id,
                    label: scene.label || scene.id,
                    genreFeel: scene.genreFeel,
                    bpm: scene.bpm,
                    intensity: scene.intensity,
                    band,
                    source: scene.source || 'default',
                    findingThresholds: scene.findingThresholds || null,
                    seeds: seedReports,
                });
            }

            // Pack calibration: render the target lane's stem twice per scene/seed — once on
            // the synth voice (baseline), once on the pack — and report the RMS + centroid the
            // Node side turns into a suggested gain. Both legs play the SAME performance (the
            // pack decides the instrument the band plays, for both), so the only difference
            // is the voice under test.
            let calibration = null;
            if (calibratePack) {
                const { module, packId } = calibratePack;
                const stem = stemById(CALIBRATION_STEM[module]);
                const status = await page.evaluate((id) => window.ensemble.loadPack(id), packId);
                if (!status.loaded) {
                    calibration = {
                        module,
                        packId,
                        error: `pack "${packId}" failed to load (prototypes/v2/out/packs/${packId} present? built?)`,
                    };
                } else {
                    const target = { module, voice: `pack:${packId}` };
                    const rows = [];
                    for (const scene of scenes) {
                        for (const seed of seeds) {
                            const packVoices = sceneVoices(scene, [target]);
                            const performance = performSceneForReport(
                                scene,
                                seed,
                                loopCount,
                                packVoices,
                            );
                            const synthMetrics = await renderStem(
                                scene,
                                seed,
                                performance,
                                stem,
                                sceneVoices(scene, [{ module, voice: 'synth' }]),
                            );
                            const packMetrics = await renderStem(
                                scene,
                                seed,
                                performance,
                                stem,
                                packVoices,
                            );
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

            // Cohesion (#687): render the full band (full+solo stem) all-synth vs all-sample
            // per scene, plus an all-sample dry leg (reverb muted) for the wet/dry proxy. The
            // performance is the scene's own for all three legs; only the sounds differ.
            let cohesionReport = null;
            if (cohesion) {
                const stem = stemById('full+solo');
                const synthBand = Object.keys(CALIBRATION_STEM).map((module) => ({
                    module,
                    voice: 'synth',
                }));
                const rows = [];
                for (const scene of scenes) {
                    for (const seed of seeds) {
                        const performance = performSceneForReport(
                            scene,
                            seed,
                            loopCount,
                            sceneVoices(scene),
                        );
                        const sampleVoices = sceneVoices(scene, COHESION_SAMPLE_BAND);
                        const synthM = await renderStem(
                            scene,
                            seed,
                            performance,
                            stem,
                            sceneVoices(scene, synthBand),
                        );
                        const sampleM = await renderStem(
                            scene,
                            seed,
                            performance,
                            stem,
                            sampleVoices,
                        );
                        const sampleDryM = await renderStem(
                            scene,
                            seed,
                            performance,
                            stem,
                            sampleVoices,
                            { muteReverb: true },
                        );
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
                cohesionReport = { stemId: stem.id, rows };
            }

            return {
                sceneRuns,
                calibration,
                cohesion: cohesionReport,
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
        log.write('Building the v2 stand for mix analysis...\n');
        // The offline render drives `window.ensemble` (`prototypes/v2/lib/render-bridge.ts`),
        // which the v2 runtime installs only in a build made with NEXT_PUBLIC_RENDER_BRIDGE=1 —
        // real prod builds never set it (#656, #1358). Built at the root base so the page and `/packs/` serve from `/`;
        // `offline.mjs` is what copies the sample packs into the export.
        const buildEnv = { NEXT_PUBLIC_RENDER_BRIDGE: '1', ENSEMBLE_V2_BASE: '/' };
        for (const [command, args] of [
            ['npx', ['next', 'build', '--webpack']],
            ['node', ['scripts/offline.mjs']],
        ]) {
            await runCommand(command, args, {
                forwardToStderr: machineReadable,
                env: buildEnv,
                cwd: V2_DIR,
            });
        }
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
        if (calibration?.error) {
            // No calibration was produced; say so to a script, not only in the text.
            process.exitCode = 1;
        }
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
