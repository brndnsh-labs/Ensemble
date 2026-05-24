#!/usr/bin/env node
// mix:analyze — run the mix-report spectral / stereo / RMS analysis on an
// arbitrary audio file path. Used to calibrate engine output against
// professionally-mixed reference tracks.
//
// Usage:
//   npm run --silent mix:analyze -- <file> [<file> ...] [--json]
//   npm run --silent mix:analyze -- ~/Downloads/*.mp3
//
// Anything ffmpeg can decode is accepted (mp3, wav, flac, m4a). Files are
// decoded to 48 kHz / stereo / f32le via a piped ffmpeg invocation.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import {
    classifyArc,
    computePeak,
    computePerLoopRmsDb,
    computeRms,
    computeSpectralProbes,
    computeStereoMetrics,
    computeTransientMetrics,
    toDb,
    toMonoFromChannels,
} from './audio-analysis.js';
import { DEFAULT_FINDING_THRESHOLDS } from './mix-report-utils.js';

const DECODE_SAMPLE_RATE = 48_000;

interface AnalyzeOptions {
    files: string[];
    json: boolean;
    loops: number;
}

interface FileAnalysis {
    path: string;
    label: string;
    durationSeconds: number;
    sampleRate: number;
    channelCount: number;
    peakDb: number;
    rmsDb: number;
    crestDb: number;
    stereo: { correlation: number | null; sideRatio: number | null };
    probes: ReturnType<typeof computeSpectralProbes>;
    transients: ReturnType<typeof computeTransientMetrics>;
    loopRmsDb: number[] | null;
    arc: ReturnType<typeof classifyArc>;
}

export function parseMixAnalyzeArgs(argv: string[]): AnalyzeOptions {
    const files: string[] = [];
    let json = false;
    let loops = 1;
    for (const arg of argv) {
        if (arg === '--json') {
            json = true;
        } else if (arg.startsWith('--loops=')) {
            const parsed = Number.parseInt(arg.split('=')[1] ?? '1', 10);
            loops = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
        } else if (arg.startsWith('--')) {
            throw new Error(`Unknown flag: ${arg}`);
        } else {
            files.push(arg);
        }
    }
    if (files.length === 0) {
        throw new Error('mix:analyze requires at least one audio file path');
    }
    return { files, json, loops };
}

function decodeAudioFile(path: string): { channels: Float32Array[]; sampleRate: number } {
    const result = spawnSync(
        'ffmpeg',
        [
            '-hide_banner',
            '-loglevel',
            'error',
            '-i',
            path,
            '-f',
            'f32le',
            '-acodec',
            'pcm_f32le',
            '-ac',
            '2',
            '-ar',
            String(DECODE_SAMPLE_RATE),
            '-',
        ],
        { encoding: 'buffer', maxBuffer: 1024 * 1024 * 1024 },
    );
    if (result.status !== 0) {
        const stderr = result.stderr?.toString('utf8') ?? '';
        throw new Error(`ffmpeg failed to decode ${path}: ${stderr.trim() || 'unknown error'}`);
    }
    const raw = result.stdout;
    const totalFloats = raw.byteLength / 4;
    const interleaved = new Float32Array(raw.buffer, raw.byteOffset, totalFloats);
    const perChannel = totalFloats / 2;
    const left = new Float32Array(perChannel);
    const right = new Float32Array(perChannel);
    for (let i = 0; i < perChannel; i++) {
        left[i] = interleaved[i * 2];
        right[i] = interleaved[i * 2 + 1];
    }
    return { channels: [left, right], sampleRate: DECODE_SAMPLE_RATE };
}

export function analyzeFile(path: string, loops: number): FileAnalysis {
    if (!existsSync(path)) {
        throw new Error(`File not found: ${path}`);
    }
    const { channels, sampleRate } = decodeAudioFile(path);
    const mono = toMonoFromChannels(channels);
    const durationSeconds = mono.length / sampleRate;

    const peak = computePeak(mono);
    const rms = computeRms(mono);
    const peakDb = toDb(peak);
    const rmsDb = toDb(rms);
    const crestDb = peakDb - rmsDb;

    const stereo = computeStereoMetrics(channels);
    const probes = computeSpectralProbes(mono, sampleRate);
    const transients = computeTransientMetrics(mono, sampleRate);

    let loopRmsDb: number[] | null = null;
    let arc: ReturnType<typeof classifyArc> = null;
    if (loops > 1) {
        const loopSeconds = durationSeconds / loops;
        loopRmsDb = computePerLoopRmsDb(mono, sampleRate, 0, loopSeconds, loops);
        arc = classifyArc(loopRmsDb);
    }

    return {
        path,
        label: basename(path),
        durationSeconds,
        sampleRate,
        channelCount: channels.length,
        peakDb,
        rmsDb,
        crestDb,
        stereo,
        probes,
        transients,
        loopRmsDb,
        arc,
    };
}

function formatDb(value: number): string {
    if (!Number.isFinite(value)) {
        return '  --  ';
    }
    return `${value >= 0 ? ' ' : ''}${value.toFixed(1)}`;
}

function formatPct(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) {
        return '  -- ';
    }
    return `${(value * 100).toFixed(1)}%`;
}

function printHumanReport(analyses: FileAnalysis[]): void {
    const labelWidth = Math.min(
        46,
        Math.max(20, ...analyses.map((a) => Math.min(46, a.label.length))),
    );

    const head = (s: string, w: number) => s.padEnd(w);
    const cell = (s: string, w: number) => s.padStart(w);

    console.log('');
    console.log(
        head('file', labelWidth) +
            cell('dur', 7) +
            cell('peak', 8) +
            cell('rms', 8) +
            cell('crest', 7) +
            cell('corr', 8) +
            cell('side%', 8) +
            cell('sub%', 7) +
            cell('low%', 7) +
            cell('lowMid', 8) +
            cell('mid%', 7) +
            cell('pres%', 7) +
            cell('air%', 7) +
            cell('cent.', 7) +
            cell('spike/s', 9),
    );
    console.log('-'.repeat(labelWidth + 7 + 8 + 8 + 7 + 8 + 8 + 7 + 7 + 8 + 7 + 7 + 7 + 7 + 9));

    for (const a of analyses) {
        const truncated =
            a.label.length > labelWidth ? `${a.label.slice(0, labelWidth - 1)}…` : a.label;
        console.log(
            head(truncated, labelWidth) +
                cell(`${a.durationSeconds.toFixed(0)}s`, 7) +
                cell(formatDb(a.peakDb), 8) +
                cell(formatDb(a.rmsDb), 8) +
                cell(`${a.crestDb.toFixed(1)}`, 7) +
                cell(a.stereo.correlation === null ? ' -- ' : a.stereo.correlation.toFixed(3), 8) +
                cell(formatPct(a.stereo.sideRatio), 8) +
                cell(formatPct(a.probes.sub), 7) +
                cell(formatPct(a.probes.low), 7) +
                cell(formatPct(a.probes.lowMid), 8) +
                cell(formatPct(a.probes.mid), 7) +
                cell(formatPct(a.probes.presence), 7) +
                cell(formatPct(a.probes.air), 7) +
                cell(`${Math.round(a.probes.centroid)}`, 7) +
                cell(a.transients.spikeRate.toFixed(1), 9),
        );
    }

    console.log('');
    console.log(
        `Findings (genre-agnostic thresholds: sub+low > ${DEFAULT_FINDING_THRESHOLDS.subPlusLowMax * 100}%, air < ${DEFAULT_FINDING_THRESHOLDS.airMin * 100}%, corr > ${DEFAULT_FINDING_THRESHOLDS.stereoCorrelationMax}):`,
    );
    for (const a of analyses) {
        const lowShare = a.probes.sub + a.probes.low;
        const notes: string[] = [];
        if (lowShare > DEFAULT_FINDING_THRESHOLDS.subPlusLowMax) {
            notes.push(`bottom-heavy (sub+low ${(lowShare * 100).toFixed(0)}%)`);
        }
        if (a.probes.air < DEFAULT_FINDING_THRESHOLDS.airMin) {
            notes.push(`thin air band (${(a.probes.air * 100).toFixed(1)}%)`);
        }
        if (
            a.stereo.correlation !== null &&
            a.stereo.correlation > DEFAULT_FINDING_THRESHOLDS.stereoCorrelationMax
        ) {
            notes.push(`functionally mono (corr ${a.stereo.correlation.toFixed(3)})`);
        }
        if (a.arc === 'flat') {
            notes.push('flat per-loop arc');
        }
        if (notes.length === 0) {
            notes.push('passes genre-agnostic thresholds');
        }
        console.log(`  ${a.label}: ${notes.join('; ')}`);
    }
    console.log('');
}

export async function runMixAnalyze(argv: string[] = process.argv.slice(2)): Promise<void> {
    const options = parseMixAnalyzeArgs(argv);
    const analyses: FileAnalysis[] = [];
    for (const file of options.files) {
        const absolute = resolve(file);
        try {
            analyses.push(analyzeFile(absolute, options.loops));
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`skip ${file}: ${message}`);
        }
    }

    if (options.json) {
        console.log(JSON.stringify({ analyses }, null, 2));
    } else {
        printHumanReport(analyses);
    }
}

const isMain = (() => {
    if (typeof process === 'undefined') {
        return false;
    }
    const entry = process.argv[1];
    if (!entry) {
        return false;
    }
    return entry.endsWith('mix-analyze.ts') || entry.endsWith('mix-analyze.js');
})();

if (isMain) {
    runMixAnalyze().catch((err) => {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
    });
}
