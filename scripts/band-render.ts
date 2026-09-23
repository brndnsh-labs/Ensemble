/**
 * Render the band engine to `.mid` (and optionally a text piano roll) from node.
 *
 *   npm run band:render -- --chart=blues --style=jazz --bpm=140 [--seed=x] [--passes=2]
 *                          [--intensity=0.8] [--comp=guitar] [--off=bass] [--out=tmp/band]
 *                          [--print=8]
 *
 * `--chart=all --style=all` renders every fixture in every style. `--print=N` prints the
 * first N bars as a grid, for reading a groove without a DAW.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
    type BandEvent,
    type CompInstrument,
    compileTimeline,
    DEFAULT_SETTINGS,
    type PassMemory,
    performPass,
    STYLE_IDS,
    type StyleId,
    type Timeline,
    toMidi,
} from '../band/index.js';
import { FIXTURES } from '../band/test/scores.js';

const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
        const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
        return [key, value];
    }),
);

const charts = args.chart === 'all' || !args.chart ? Object.keys(FIXTURES) : [args.chart];
const styles = (args.style === 'all' || !args.style ? STYLE_IDS : [args.style]) as StyleId[];
const bpm = Number(args.bpm ?? 120);
const passes = Number(args.passes ?? 2);
const out = args.out ?? 'tmp/band';
mkdirSync(out, { recursive: true });

const NOTE = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const DRUM_ROWS = [
    'crash',
    'ride',
    'hatOpen',
    'hat',
    'hatPedal',
    'rim',
    'snare',
    'ghost',
    'tomHigh',
    'tomMid',
    'tomLow',
    'kick',
];

function printBars(timeline: Timeline, events: BandEvent[], count: number) {
    for (const bar of timeline.bars.slice(0, count)) {
        const steps = Math.round(bar.meter.barTicks / 120);
        const cell = (e: BandEvent) => Math.min(steps - 1, Math.round((e.tick - bar.start) / 120));
        const inBar = events.filter((e) => e.bar === bar.index);
        const chords = bar.spans.map((s) => s.chord?.symbol ?? 'N.C.').join(' ');
        console.log(`\nbar ${bar.index + 1} [${bar.visit.label}] ${bar.meter.name}  ${chords}`);
        for (const piece of DRUM_ROWS) {
            const hits = inBar.filter((e) => e.lane === 'drums' && e.piece === piece);
            if (!hits.length) {
                continue;
            }
            const row = Array.from({ length: steps }, () => '.');
            for (const h of hits) {
                row[cell(h)] = h.velocity > 100 ? 'X' : h.velocity > 60 ? 'x' : 'o';
            }
            console.log(`  ${piece.padEnd(8)} ${row.join('')}`);
        }
        for (const lane of ['bass', 'comp'] as const) {
            const notes = inBar.filter((e) => e.lane === lane);
            const byStep = new Map<number, string[]>();
            for (const n of notes) {
                if (n.lane === 'drums') {
                    continue;
                }
                const mark = n.muted ? '×' : n.stroke === 'up' ? '↑' : '';
                const name = `${NOTE[n.midi % 12]}${Math.floor(n.midi / 12) - 1}${mark}`;
                byStep.set(cell(n), [...(byStep.get(cell(n)) ?? []), name]);
            }
            const text = [...byStep].map(([s, names]) => `${s}:${names.join('+')}`).join(' ');
            console.log(`  ${lane.padEnd(8)} ${text}`);
        }
    }
}

for (const chart of charts) {
    const score = FIXTURES[chart];
    if (!score) {
        throw new Error(`Unknown chart ${chart}. Try: ${Object.keys(FIXTURES).join(', ')}`);
    }
    const timeline = compileTimeline(score);
    for (const style of styles) {
        const settings = {
            ...DEFAULT_SETTINGS,
            style,
            seed: args.seed ?? 'ensemble',
            intensity: args.intensity ? Number(args.intensity) : null,
            comp: (args.comp ?? 'piano') as CompInstrument,
            lanes: {
                drums: !args.off?.includes('drums'),
                bass: !args.off?.includes('bass'),
                comp: !args.off?.includes('comp'),
            },
        };
        const all: BandEvent[] = [];
        let memory: PassMemory | undefined;
        for (let pass = 0; pass < passes; pass++) {
            const result = performPass(timeline, settings, {
                pass,
                looping: pass < passes - 1,
                memory,
            });
            memory = result.memory;
            // Later passes are appended end to end.
            const offset = pass * timeline.ticks;
            all.push(...result.events.map((e) => ({ ...e, tick: e.tick + offset })));
        }
        const extended = { ...timeline, ticks: timeline.ticks * passes };
        const file = path.join(out, `${chart}-${style}.mid`);
        writeFileSync(
            file,
            toMidi(all, extended, { bpm, title: `${chart} (${style})`, comp: settings.comp }),
        );
        console.log(`${file}  ${all.length} events`);
        if (args.print) {
            printBars(timeline, all, Number(args.print));
        }
    }
}
