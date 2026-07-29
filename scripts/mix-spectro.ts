#!/usr/bin/env node
// mix:spectro — emit a spectrogram CONTACT SHEET from the deterministic render
// harness: every stem stacked on one shared, bar-numbered time axis.
//
//   npm run --silent mix:spectro -- --scene=funk-pocket
//   npm run --silent mix:spectro -- --scene=jazz-ride --stems=bass,drums,full
//   npm run --silent mix:spectro -- --scene=funk-pocket --range=bar3..bar5
//   npm run --silent mix:spectro -- --from=tmp/ears --out=tmp/sheet.png
//
// WHAT IT IS FOR. `mix:verify` answers questions that reduce to a scalar — is the
// note present, is it on time, does its level track its velocity. Density,
// masking and mud do not reduce that way: "the chords are smearing the snare"
// is a claim about two lanes occupying the same band at the same instant, and the
// honest way to settle it is to LOOK at both. This tool exists so an agent with no
// ears can do that: it turns a render into a picture whose axes we own, so a
// smudge can be named ("bar 6 beat 3, chords lane, 200-600 Hz") instead of
// gestured at.
//
// WHAT IT IS NOT. Not a verdict and not an audition. It emits a picture and the
// facts needed to read it. "The mix looks crowded here" is still a human call, and
// anything that turns on how it *sounds* stays with the listening gate
// (DOCTRINE §5).
//
// Two input modes: it drives `mix-report --write-wav --write-events` itself, or
// `--from=<dir>` points it at an existing render directory. The second mode is
// what makes the tool checkable — see `scripts/plant-defects.ts`, which writes a
// render directory with KNOWN defects in it.

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import type { RenderMeta } from './audio-verify.js';
import { decodeWav } from './mix-verify.js';
import {
    barRangeToWindow,
    type Canvas,
    chooseLabelStride,
    computeGridLines,
    fullSheetWindow,
    layoutSheet,
    MIN_LABEL_SPACING_PX,
    padWindowForClosingLine,
    parseBarRange,
    renderOverlay,
    type SheetLayout,
    SPECTRO_SCALE,
    STEPS_PER_BAR,
    spectrogramHopSamples,
    type TimeWindow,
} from './spectro-grid.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

/** The `.events.json` shape `mix-report --write-events` produces. */
export interface EventDump {
    scene: string;
    stem: string;
    seed: string;
    tracks: string[];
    meta: RenderMeta;
}

export interface LoadedStem {
    dump: EventDump;
    wavPath: string;
    durationSec: number;
}

export interface MixSpectroOptions {
    scene: string | null;
    stems: string[];
    loops: number;
    seed: string | null;
    /** Skip the render; read `*.wav` + `*.events.json` out of this directory. */
    from: string | null;
    /** Output PNG path. Defaults under `tmp/spectro/`. */
    out: string | null;
    /** `bar3..bar5` — zoom the sheet onto those bars, inclusive. */
    range: string | null;
    noBuild: boolean;
}

export function parseMixSpectroArgs(argv: string[]): MixSpectroOptions {
    // `loops` defaults to 1 and cannot distinguish "not passed" from "passed 1",
    // so the `--from` rejection below needs its own sentinel.
    let sawLoops = false;
    const options: MixSpectroOptions = {
        scene: null,
        stems: [],
        loops: 1,
        seed: null,
        from: null,
        out: null,
        range: null,
        noBuild: false,
    };
    for (const arg of argv) {
        if (arg === '--no-build') {
            options.noBuild = true;
        } else if (arg.startsWith('--scene=')) {
            options.scene = arg.slice('--scene='.length);
        } else if (arg.startsWith('--stems=')) {
            options.stems = arg
                .slice('--stems='.length)
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean);
        } else if (arg.startsWith('--loops=')) {
            sawLoops = true;
            const parsed = Number.parseInt(arg.slice('--loops='.length), 10);
            options.loops = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
        } else if (arg.startsWith('--seed=')) {
            options.seed = arg.slice('--seed='.length);
        } else if (arg.startsWith('--from=')) {
            options.from = arg.slice('--from='.length);
        } else if (arg.startsWith('--out=')) {
            options.out = arg.slice('--out='.length);
        } else if (arg.startsWith('--range=')) {
            options.range = arg.slice('--range='.length);
        } else if (arg.startsWith('--')) {
            // A silently-dropped flag would render a sheet nobody asked for and
            // label it as the requested one.
            throw new Error(`Unknown flag: ${arg}`);
        }
    }
    // `--from` replays a directory that was rendered with its own scene/seed/loops
    // baked in. Accepting render flags alongside it would print a caption
    // describing a render that never happened — `--loops` most misleadingly of
    // all, since it silently changes nothing while the caption's bar count comes
    // from the dump and therefore still looks right.
    if (options.from && (options.scene || options.seed || options.noBuild || sawLoops)) {
        throw new Error(
            '--from replays an existing render; --scene/--seed/--loops/--no-build do not apply',
        );
    }
    return options;
}

/**
 * Drive one headless `mix:report` render. Copied from `mix-verify.ts` deliberately
 * — same contract, same two failure modes worth distinguishing.
 */
function runMixReport(outDir: string, options: MixSpectroOptions): void {
    const args = [
        'tsx',
        'scripts/mix-report.ts',
        `--write-wav=${outDir}`,
        `--write-events=${outDir}`,
        `--loops=${options.loops}`,
        '--json',
    ];
    if (options.scene) {
        args.push(`--scene=${options.scene}`);
    }
    if (options.seed) {
        args.push(`--seed=${options.seed}`);
    }
    if (options.noBuild) {
        args.push('--no-build');
    }

    // stdout is the mix report's own JSON, which we do not consume; stderr carries
    // build progress and any real failure, so it stays attached.
    const result = spawnSync('npx', args, {
        cwd: REPO_ROOT,
        stdio: ['ignore', 'ignore', 'inherit'],
    });
    // `error` is set when the process never ran at all (ENOENT on npx); without
    // this it surfaces as the confusing "exited with code null".
    if (result.error) {
        throw new Error(`could not run mix:report — ${result.error.message}`);
    }
    if (result.status !== 0) {
        throw new Error(`mix:report exited with code ${result.status}`);
    }
}

export function loadRenderDir(dir: string, stemFilter: string[]): LoadedStem[] {
    const dumps = readdirSync(dir)
        .filter((name) => name.endsWith('.events.json'))
        .sort();
    if (dumps.length === 0) {
        throw new Error(`${dir} contains no *.events.json — is it a mix:report render directory?`);
    }

    const loaded: LoadedStem[] = [];
    for (const name of dumps) {
        const dump: EventDump = JSON.parse(readFileSync(path.join(dir, name), 'utf8'));
        if (stemFilter.length > 0 && !stemFilter.includes(dump.stem)) {
            continue;
        }
        const wavPath = path.join(dir, name.replace('.events.json', '.wav'));
        const { channels, sampleRate } = decodeWav(readFileSync(wavPath));
        // Same guard `mix:verify` makes: a rate mismatch would put every grid line
        // at the wrong second while the picture still looked entirely plausible.
        if (sampleRate !== dump.meta.sampleRate) {
            throw new Error(
                `${name}: WAV is ${sampleRate} Hz but its event dump says ${dump.meta.sampleRate} Hz`,
            );
        }
        loaded.push({ dump, wavPath, durationSec: channels[0].length / sampleRate });
    }
    if (loaded.length === 0) {
        throw new Error(`no stems matched --stems=${stemFilter.join(',')}`);
    }
    return loaded;
}

/**
 * One scene per sheet, enforced rather than assumed.
 *
 * `--scene` has no default, so a bare `npm run mix:spectro` renders EVERY default
 * scene into one directory — 96, 104, 118 and 138 bpm. Every downstream number is
 * then a single scene's: the grid comes from one `meta`, so a 96 bpm bar line is
 * drawn over 138 bpm audio; the caption names one scene; and the panel labels
 * repeat (`bass`, `bass`, `bass`, `bass`) with nothing to tell them apart. Same
 * reasoning as `mix-verify.ts`'s multi-scene branch, which scene-qualifies its rows
 * and drops its header — here there is no equivalent of "qualify the row", because
 * the grid itself can only be right about one of them.
 */
export function requireSingleScene(scenes: readonly string[], remedy: string): string {
    const unique = [...new Set(scenes)].sort();
    if (unique.length > 1) {
        throw new Error(
            `this render directory holds ${unique.length} scenes (${unique.join(', ')}) and ` +
                `their geometry differs — pass ${remedy}`,
        );
    }
    return unique[0];
}

/**
 * Order the panels so the same stem sits in the same row on every sheet. Two
 * sheets are only comparable at a glance if the rows do not shuffle between them,
 * and `readdirSync` order is alphabetical, which puts `bass` above `full`.
 * The mix leads, then lanes low-to-high — the order a mix engineer reads in.
 */
const PANEL_ORDER = ['full', 'full+solo', 'kick', 'drums', 'bass', 'chords', 'harmony', 'soloist'];

export function orderStems(loaded: LoadedStem[]): LoadedStem[] {
    return [...loaded].sort((a, b) => {
        const rankA = PANEL_ORDER.indexOf(a.dump.stem);
        const rankB = PANEL_ORDER.indexOf(b.dump.stem);
        // Unknown stems keep their alphabetical order, after the known ones.
        const keyA = rankA < 0 ? PANEL_ORDER.length : rankA;
        const keyB = rankB < 0 ? PANEL_ORDER.length : rankB;
        return keyA - keyB || a.dump.stem.localeCompare(b.dump.stem);
    });
}

/** `showspectrumpic=...` with every scale pinned by `SPECTRO_SCALE`. */
export function spectrumFilter(width: number, height: number): string {
    const s = SPECTRO_SCALE;
    return [
        `showspectrumpic=s=${width}x${height}`,
        `legend=${s.legend}`,
        `scale=${s.scale}`,
        `fscale=${s.fscale}`,
        `start=${s.start}`,
        `stop=${s.stop}`,
        `drange=${s.drange}`,
        `limit=${s.limit}`,
        `color=${s.color}`,
        `win_func=${s.win_func}`,
    ].join(':');
}

/**
 * The audio filter chain feeding one panel.
 *
 * `atrim` + `apad` force EVERY stem to exactly the window's duration before the
 * spectrum is drawn. Without it a stem that decoded one frame short would be
 * stretched across the same panel width as the others, so its grid would be
 * subtly wrong while looking fine — the failure this whole module is built to
 * avoid. The trailing `atrim=end` clips `apad`'s rounding back to the window.
 */
export function panelAudioFilter(window: TimeWindow, width: number, height: number): string {
    const duration = window.endSec - window.startSec;
    return [
        `atrim=start=${window.startSec}:end=${window.endSec}`,
        'asetpts=PTS-STARTPTS',
        `apad=whole_dur=${duration}`,
        `atrim=end=${duration}`,
        spectrumFilter(width, height),
    ].join(',');
}

function renderPanel(wavPath: string, outPath: string, window: TimeWindow, layout: SheetLayout) {
    const result = spawnSync(
        'ffmpeg',
        [
            '-hide_banner',
            '-loglevel',
            'error',
            '-y',
            '-i',
            wavPath,
            '-lavfi',
            panelAudioFilter(window, layout.width, layout.panelHeight),
            '-frames:v',
            '1',
            outPath,
        ],
        { encoding: 'utf8' },
    );
    if (result.error) {
        throw new Error(`could not run ffmpeg — ${result.error.message}`);
    }
    if (result.status !== 0) {
        throw new Error(
            `ffmpeg failed on ${path.basename(wavPath)}: ${result.stderr?.trim() || 'unknown error'}`,
        );
    }
}

/**
 * Build the ffmpeg graph that stacks the panels, pads in the header/axis gutters
 * and composites our own annotation layer on top.
 *
 * The overlay is the LAST input (index `panelCount`), fed as raw RGBA at exactly
 * the sheet's size — this repo's ffmpeg has no `drawtext` filter (no libfreetype),
 * and rasterizing the labels ourselves keeps them in the same coordinate system as
 * the grid they annotate.
 */
export function compositeFilter(layout: SheetLayout): string {
    const stackInputs = Array.from({ length: layout.panelCount }, (_, i) => `[${i}:v]`).join('');
    const stages: string[] = [];
    // `vstack` requires two or more inputs; a one-stem sheet skips it.
    if (layout.panelCount > 1) {
        stages.push(`${stackInputs}vstack=inputs=${layout.panelCount}[stack]`);
    }
    const stacked = layout.panelCount > 1 ? '[stack]' : '[0:v]';
    stages.push(
        `${stacked}pad=${layout.width}:${layout.height}:0:${layout.headerHeight}:color=0x101014[padded]`,
    );
    stages.push(`[padded][${layout.panelCount}:v]overlay=0:0:format=rgb[out]`);
    return stages.join(';');
}

function compositeSheet(
    panelPaths: string[],
    overlayPath: string,
    layout: SheetLayout,
    outPath: string,
): void {
    const args = ['-hide_banner', '-loglevel', 'error', '-y'];
    for (const panelPath of panelPaths) {
        args.push('-i', panelPath);
    }
    args.push(
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgba',
        '-s',
        `${layout.width}x${layout.height}`,
        '-i',
        overlayPath,
        '-filter_complex',
        compositeFilter(layout),
        '-map',
        '[out]',
        '-frames:v',
        '1',
        outPath,
    );
    const result = spawnSync('ffmpeg', args, { encoding: 'utf8' });
    if (result.error) {
        throw new Error(`could not run ffmpeg — ${result.error.message}`);
    }
    if (result.status !== 0) {
        throw new Error(`ffmpeg failed to composite the sheet: ${result.stderr?.trim()}`);
    }
}

/** The one-line header: everything needed to read the picture without the CLI. */
export function buildCaption(
    dump: EventDump,
    meta: RenderMeta,
    window: TimeWindow,
    barRange: { fromBar: number; toBar: number } | null,
): string {
    const bars = barRange
        ? `BARS ${barRange.fromBar}-${barRange.toBar}`
        : `${Math.ceil((meta.stepsPerLoop * meta.loopCount) / STEPS_PER_BAR)} BARS`;
    return [
        `${dump.scene}/${dump.seed}`,
        `${meta.bpm} BPM`,
        bars,
        `${window.startSec.toFixed(2)}-${window.endSec.toFixed(2)}S`,
        `${SPECTRO_SCALE.start}-${SPECTRO_SCALE.stop}HZ LOG`,
        `DRANGE ${SPECTRO_SCALE.drange}DB`,
    ].join('  ');
}

/** Raw RGBA, top-to-bottom, straight alpha — exactly what `-f rawvideo` expects. */
function writeOverlay(canvas: Canvas, filePath: string): void {
    writeFileSync(
        filePath,
        Buffer.from(canvas.data.buffer, canvas.data.byteOffset, canvas.data.length),
    );
}

export function defaultOutPath(dump: EventDump, range: string | null): string {
    const suffix = range ? `-${range.replace(/\.\./g, '-')}` : '';
    return path.join(REPO_ROOT, 'tmp', 'spectro', `${dump.scene}-${dump.seed}${suffix}.png`);
}

async function main(argv: string[]): Promise<void> {
    const options = parseMixSpectroArgs(argv);
    const rendered = options.from === null;
    const renderDir = rendered
        ? mkdtempSync(path.join(tmpdir(), 'ensemble-spectro-'))
        : path.resolve(REPO_ROOT, options.from as string);
    const workDir = mkdtempSync(path.join(tmpdir(), 'ensemble-sheet-'));

    try {
        if (rendered) {
            runMixReport(renderDir, options);
        }
        const loaded = orderStems(loadRenderDir(renderDir, options.stems));
        requireSingleScene(
            loaded.map((entry) => entry.dump.scene),
            '--scene=<id> (or point --from at a single-scene render directory)',
        );
        const meta = loaded[0].dump.meta;

        // The window is shared by every panel, so the sheet has ONE time axis.
        const barRange = options.range === null ? null : parseBarRange(options.range);
        const fileDurationSec = Math.max(...loaded.map((entry) => entry.durationSec));
        const window: TimeWindow = barRange
            ? padWindowForClosingLine(barRangeToWindow(barRange, meta), meta, fileDurationSec)
            : fullSheetWindow(meta, fileDurationSec);

        const layout = layoutSheet(loaded.length);
        const gridLines = computeGridLines(meta, window, layout.width);
        const barLines = gridLines.filter((line) => line.kind === 'bar');
        // Bar spacing is uniform, so any adjacent pair measures it; with fewer than
        // two bar lines nothing can collide and the stride is moot.
        const barSpacing = barLines.length > 1 ? barLines[1].x - barLines[0].x : layout.width;
        const overlay = renderOverlay({
            layout,
            gridLines,
            panelLabels: loaded.map((entry) => entry.dump.stem),
            caption: buildCaption(loaded[0].dump, meta, window, barRange),
            labelStride: chooseLabelStride(barSpacing, MIN_LABEL_SPACING_PX),
        });

        const panelPaths = loaded.map((entry, index) => {
            const panelPath = path.join(workDir, `panel-${String(index).padStart(2, '0')}.png`);
            renderPanel(entry.wavPath, panelPath, window, layout);
            return panelPath;
        });
        const overlayPath = path.join(workDir, 'overlay.rgba');
        writeOverlay(overlay, overlayPath);

        const outPath = options.out
            ? path.resolve(REPO_ROOT, options.out)
            : defaultOutPath(loaded[0].dump, options.range);
        mkdirSync(path.dirname(outPath), { recursive: true });
        compositeSheet(panelPaths, overlayPath, layout, outPath);

        process.stdout.write(
            `${outPath}\n` +
                `  ${layout.width}x${layout.height} — ${loaded.length} panel(s): ${loaded
                    .map((entry) => entry.dump.stem)
                    .join(', ')}\n` +
                `  window ${window.startSec.toFixed(3)}-${window.endSec.toFixed(3)}s · ` +
                `${barLines.length} bar line(s) · lead-in ${meta.leadInSeconds.toFixed(3)}s · ` +
                `${meta.bpm} bpm\n` +
                `  ${spectrogramHopSamples(window, layout.width, meta.sampleRate)} samples/column ` +
                `· grid corrected for hop + FFT lag, residual under ±1.5 px\n` +
                `  scales pinned by SPECTRO_SCALE — comparable only against sheets from the same pin\n`,
        );
    } finally {
        rmSync(workDir, { recursive: true, force: true });
        if (rendered) {
            rmSync(renderDir, { recursive: true, force: true });
        }
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main(process.argv.slice(2)).catch((error) => {
        process.stderr.write(`mix:spectro failed: ${(error as Error).message}\n`);
        process.exitCode = 1;
    });
}
