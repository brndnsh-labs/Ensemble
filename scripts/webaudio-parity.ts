/**
 * Web Audio parity probe: the SAME graph snippet rendered in node (`node-web-audio-api` through
 * `./node-webaudio.ts`, so the shim is under test) and in headless Chromium, compared per probe.
 * This is how every fidelity fact behind the node renderer was found (#1551, #1554): the
 * `setTargetAtTime` pre-start evaluation, the hot sawtooth, the compressor's transient response,
 * the `4x`-is-`2x` oversampling. Re-run it after a `node-web-audio-api` bump.
 *
 *   npm run webaudio:parity                      # the table
 *   npm run webaudio:parity -- --probe=sawtooth,compressor
 *   npm run webaudio:parity -- --mode=envelope   # sample gain envelopes over time
 *   npm run webaudio:parity -- --mode=latency    # impulse latency per node type
 *   npm run webaudio:parity -- --json
 *
 * A probe is the body of a `(ctx) => void` that builds a graph on a 44.1 kHz
 * `OfflineAudioContext`, kept as source text so both engines run identical code. Lags on a pure tone are periodic
 * aliases (a 440 Hz tone repeats every 100 samples), so read `corr` and `Δdb` first.
 */
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import playwright from '@playwright/test';
import { installDiskPackFetcher } from './node-webaudio.js';

// `@playwright/test` is CommonJS: under the root package's ESM only the default import survives
// (tests/CLAUDE.md), and its type is the test object, so the browser launcher is asserted here.
const { chromium } = playwright as unknown as {
    chromium: typeof import('@playwright/test').chromium;
};

const SR = 44100;
type Probe = (ctx: OfflineAudioContext) => void;

/**
 * A probe is source text, not a closure: both engines rebuild it with `new Function`, so a probe
 * must not reach outside its own body. These builders return the body text.
 */
const osc = (type: string, frequency: number, gain: number, extra = '') =>
    `const o = ctx.createOscillator(); o.type = '${type}'; o.frequency.value = ${frequency}; ${extra}
const g = ctx.createGain(); g.gain.value = ${gain}; o.connect(g); g.connect(ctx.destination); o.start(0);`;
const sineGain = (schedule: string) =>
    `const o = ctx.createOscillator(); o.frequency.value = 440; const g = ctx.createGain(); ${schedule}
o.connect(g); g.connect(ctx.destination); o.start(0);`;
const sawThrough = (node: string) =>
    `const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 110; ${node}
const g = ctx.createGain(); g.gain.value = 0.2; o.connect(f); f.connect(g); g.connect(ctx.destination); o.start(0);`;
const biquad = (type: string, frequency: number, q?: number, gain?: number) =>
    sawThrough(
        `const f = ctx.createBiquadFilter(); f.type = '${type}'; f.frequency.value = ${frequency};${
            q === undefined ? '' : ` f.Q.value = ${q};`
        }${gain === undefined ? '' : ` f.gain.value = ${gain};`}`,
    );
const constantGain = (schedule: string) =>
    `const s = ctx.createConstantSource(); const g = ctx.createGain(); ${schedule}
s.connect(g); g.connect(ctx.destination); s.start(0);`;
const impulseThrough = (node: string) =>
    `const b = ctx.createBuffer(1, 4410, 44100); b.getChannelData(0)[2205] = 1; const s = ctx.createBufferSource(); s.buffer = b;
${node} s.start(0);`;

/** The main table: one probe per node type and automation method the engine uses. */
const TABLE: Record<string, string> = {
    sine: osc('sine', 440, 0.5),
    sawtooth: osc('sawtooth', 220, 0.2),
    sawtoothScheduled: `const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(82.4, 0);
const g = ctx.createGain(); g.gain.value = 0.3; o.connect(g); g.connect(ctx.destination); o.start(0);`,
    square: osc('square', 220, 0.2),
    triangle: osc('triangle', 220, 0.5),
    detune: osc('sine', 440, 0.5, 'o.detune.value = 700;'),
    periodicWave: `const n = 8; const re = new Float32Array(n); const im = new Float32Array(n); for (let i = 1; i < n; i++) { im[i] = 1 / i; }
const o = ctx.createOscillator(); o.setPeriodicWave(ctx.createPeriodicWave(re, im)); o.frequency.value = 220;
const g = ctx.createGain(); g.gain.value = 0.5; o.connect(g); g.connect(ctx.destination); o.start(0);`,
    setTargetAtTime: sineGain(
        'g.gain.setValueAtTime(0.8, 0); g.gain.setTargetAtTime(0.0001, 0.2, 0.15);',
    ),
    attackThenRelease: sineGain(
        'g.gain.setValueAtTime(0, 0.2); g.gain.setTargetAtTime(0.8, 0.2, 0.01); g.gain.setTargetAtTime(0, 0.5, 0.1);',
    ),
    exponentialRamp: sineGain(
        'g.gain.setValueAtTime(0.8, 0.2); g.gain.exponentialRampToValueAtTime(0.001, 1.0);',
    ),
    linearRamp: sineGain(
        'g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(0.8, 0.5); g.gain.linearRampToValueAtTime(0, 1.2);',
    ),
    setValueCurve: sineGain(
        'const c = new Float32Array(64); for (let i = 0; i < 64; i++) { c[i] = 0.8 * Math.sin((Math.PI * i) / 63); } g.gain.setValueAtTime(0.5, 0.1); g.gain.setValueCurveAtTime(c, 0.2, 1.0);',
    ),
    cancelThenTarget: sineGain(
        'g.gain.setValueAtTime(0.8, 0); g.gain.linearRampToValueAtTime(0, 1.4); g.gain.cancelScheduledValues(0.5); g.gain.setTargetAtTime(0.0001, 0.5, 0.1);',
    ),
    lowpassQ: biquad('lowpass', 800, 10),
    highpassQ: biquad('highpass', 400, 6),
    bandpassQ: biquad('bandpass', 1000, 5),
    peakingBoost: biquad('peaking', 1000, 1, 12),
    highshelf: biquad('highshelf', 2000, undefined, 6),
    lowshelf: biquad('lowshelf', 300, undefined, -6),
    filterAutomation: sawThrough(
        "const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(4000, 0); f.frequency.setTargetAtTime(200, 0.1, 0.3); f.Q.value = 2;",
    ),
    compressor: `const c = ctx.createDynamicsCompressor(); c.threshold.value = -24; c.knee.value = 30; c.ratio.value = 12; c.attack.value = 0.003; c.release.value = 0.25;
const o = ctx.createOscillator(); o.frequency.value = 220; const g = ctx.createGain(); g.gain.value = 0.9; o.connect(g); g.connect(c); c.connect(ctx.destination); o.start(0);`,
    limiter: `const c = ctx.createDynamicsCompressor(); c.threshold.value = -1; c.knee.value = 0; c.ratio.value = 20; c.attack.value = 0.001; c.release.value = 0.1;
const o = ctx.createOscillator(); o.frequency.value = 220; const g = ctx.createGain(); g.gain.value = 1.5; o.connect(g); g.connect(c); c.connect(ctx.destination); o.start(0);`,
    waveshaper4x: `const s = ctx.createWaveShaper(); const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { c[i] = Math.tanh(3 * ((i / 1023) * 2 - 1)); } s.curve = c; s.oversample = '4x';
const o = ctx.createOscillator(); o.frequency.value = 220; const g = ctx.createGain(); g.gain.value = 0.9; o.connect(g); g.connect(s); s.connect(ctx.destination); o.start(0);`,
    bufferPlaybackRate: `const b = ctx.createBuffer(1, 44100, 44100); const d = b.getChannelData(0); let s = 12345; for (let i = 0; i < d.length; i++) { s = (s * 1103515245 + 12345) >>> 0; d[i] = (s / 4294967296) * 2 - 1; }
const src = ctx.createBufferSource(); src.buffer = b; src.playbackRate.value = 0.5; const g = ctx.createGain(); g.gain.value = 0.3; src.connect(g); g.connect(ctx.destination); src.start(0);`,
    bufferStopEarly: `const b = ctx.createBuffer(1, 44100, 44100); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) { d[i] = Math.sin((2 * Math.PI * 440 * i) / 44100); }
const src = ctx.createBufferSource(); src.buffer = b; src.connect(ctx.destination); src.start(0.1, 0.25); src.stop(0.6);`,
    stereoPanner: `const p = ctx.createStereoPanner(); p.pan.value = 0.6; const o = ctx.createOscillator(); o.frequency.value = 440;
const g = ctx.createGain(); g.gain.value = 0.5; o.connect(g); g.connect(p); p.connect(ctx.destination); o.start(0);`,
    delayComb: `const o = ctx.createOscillator(); o.frequency.value = 440; const env = ctx.createGain(); env.gain.setValueAtTime(0.5, 0); env.gain.setValueAtTime(0, 0.1);
const d = ctx.createDelay(0.2); d.delayTime.value = 0.03; const fb = ctx.createGain(); fb.gain.value = 0.6;
o.connect(env); env.connect(d); d.connect(fb); fb.connect(d); d.connect(ctx.destination); env.connect(ctx.destination); o.start(0);`,
    analyserInChain: `const a = ctx.createAnalyser(); const o = ctx.createOscillator(); o.frequency.value = 440;
const g = ctx.createGain(); g.gain.value = 0.5; o.connect(g); g.connect(a); a.connect(ctx.destination); o.start(0);`,
    channelMerger: `const m = ctx.createChannelMerger(2); const o = ctx.createOscillator(); o.frequency.value = 440;
const g = ctx.createGain(); g.gain.value = 0.5; o.connect(g); g.connect(m, 0, 0); g.connect(m, 0, 1); m.connect(ctx.destination); o.start(0);`,
};

/** Envelope mode: a constant source through a gain, sampled at fixed times. */
const ENVELOPE: Record<string, string> = {
    decay: constantGain(
        'g.gain.setValueAtTime(0.8, 0); g.gain.setTargetAtTime(0.0001, 0.2, 0.15);',
    ),
    attackThenRelease: constantGain(
        'g.gain.setValueAtTime(0, 0.2); g.gain.setTargetAtTime(0.8, 0.2, 0.01); g.gain.setTargetAtTime(0, 0.5, 0.1);',
    ),
    rampThenTarget: constantGain(
        'g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(0.8, 0.2); g.gain.setTargetAtTime(0.0001, 0.5, 0.15);',
    ),
    valueCurve: constantGain(
        'const c = new Float32Array(64); for (let i = 0; i < 64; i++) { c[i] = 0.8 * Math.sin((Math.PI * i) / 63); } g.gain.setValueAtTime(0.5, 0.1); g.gain.setValueCurveAtTime(c, 0.2, 1.0);',
    ),
    cancelThenTarget: constantGain(
        'g.gain.setValueAtTime(0.8, 0); g.gain.linearRampToValueAtTime(0, 1.4); g.gain.cancelScheduledValues(0.5); g.gain.setTargetAtTime(0.0001, 0.5, 0.1);',
    ),
};

/** Latency mode: one impulse at sample 2205 through a node; where does its peak land? */
const LATENCY: Record<string, string> = {
    impulse: impulseThrough('s.connect(ctx.destination);'),
    biquad: impulseThrough(
        "const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 30; s.connect(f); f.connect(ctx.destination);",
    ),
    compressor: impulseThrough(
        'const c = ctx.createDynamicsCompressor(); s.connect(c); c.connect(ctx.destination);',
    ),
    waveshaper2x: impulseThrough(
        "const w = ctx.createWaveShaper(); const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { c[i] = (i / 1023) * 2 - 1; } w.curve = c; w.oversample = '2x'; s.connect(w); w.connect(ctx.destination);",
    ),
    waveshaper4x: impulseThrough(
        "const w = ctx.createWaveShaper(); const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { c[i] = (i / 1023) * 2 - 1; } w.curve = c; w.oversample = '4x'; s.connect(w); w.connect(ctx.destination);",
    ),
    panner: impulseThrough(
        'const p = ctx.createStereoPanner(); s.connect(p); p.connect(ctx.destination);',
    ),
    delay10ms: impulseThrough(
        'const d = ctx.createDelay(1); d.delayTime.value = 0.01; s.connect(d); d.connect(ctx.destination);',
    ),
};

const MODES = { table: TABLE, envelope: ENVELOPE, latency: LATENCY } as const;
type Mode = keyof typeof MODES;
const MODE_SECONDS: Record<Mode, number> = { table: 1.5, envelope: 1.5, latency: 0.5 };

interface Options {
    mode: Mode;
    probes: string[] | null;
    json: boolean;
}

export function parseParityArgs(argv: string[]): Options {
    const options: Options = { mode: 'table', probes: null, json: false };
    for (const arg of argv) {
        if (arg.startsWith('--mode=')) {
            const mode = arg.slice('--mode='.length);
            if (!(mode in MODES)) {
                throw new Error(`--mode=${mode}: one of ${Object.keys(MODES).join(', ')}`);
            }
            options.mode = mode as Mode;
        } else if (arg.startsWith('--probe=')) {
            options.probes = arg
                .slice('--probe='.length)
                .split(',')
                .map((p) => p.trim())
                .filter(Boolean);
        } else if (arg === '--json') {
            options.json = true;
        } else {
            throw new Error(`unknown argument ${arg}`);
        }
    }
    return options;
}

/** Both engines run this exact source: a probe table serialised to text. */
function serialise(probes: Record<string, string>, only: string[] | null): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [name, body] of Object.entries(probes)) {
        if (only && !only.includes(name)) {
            continue;
        }
        out[name] = body;
    }
    if (only) {
        for (const name of only) {
            if (!(name in out)) {
                throw new Error(`no probe named ${name} (have: ${Object.keys(probes).join(', ')})`);
            }
        }
    }
    return out;
}

type Rendered = Record<string, number[]>;

async function renderInNode(
    serialised: Record<string, string>,
    seconds: number,
): Promise<Rendered> {
    const out: Rendered = {};
    for (const [name, source] of Object.entries(serialised)) {
        const ctx = new OfflineAudioContext(1, Math.round(SR * seconds), SR);
        // The probe's own source, exactly as the page runs it.
        const build = new Function('ctx', source) as Probe;
        build(ctx);
        const rendered = await ctx.startRendering();
        const samples = new Float32Array(rendered.length);
        rendered.copyFromChannel(samples, 0);
        out[name] = Array.from(samples);
    }
    return out;
}

async function renderInChromium(
    serialised: Record<string, string>,
    seconds: number,
): Promise<Rendered> {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.goto('about:blank');
        return await page.evaluate(
            async ({
                serialised,
                seconds,
                SR,
            }: {
                serialised: Record<string, string>;
                seconds: number;
                SR: number;
            }) => {
                const out: Record<string, number[]> = {};
                for (const [name, source] of Object.entries(serialised)) {
                    const ctx = new OfflineAudioContext(1, Math.round(SR * seconds), SR);
                    const build = new Function('ctx', source) as (ctx: OfflineAudioContext) => void;
                    build(ctx);
                    const rendered = await ctx.startRendering();
                    out[name] = Array.from(rendered.getChannelData(0));
                }
                return out;
            },
            { serialised, seconds, SR },
        );
    } finally {
        await browser.close();
    }
}

const db = (v: number) => 20 * Math.log10(v || 1e-12);

export interface ProbeComparison {
    probe: string;
    rmsNodeDb: number;
    rmsChromiumDb: number;
    deltaDb: number;
    peakNodeDb: number;
    peakChromiumDb: number;
    lag: number;
    correlation: number;
    residualDb: number;
    flagged: boolean;
}

/** RMS, peak, best lag within ±600 samples, aligned correlation and residual for one probe. */
export function compareProbe(probe: string, a: number[], b: number[]): ProbeComparison {
    const n = Math.min(a.length, b.length);
    const skip = Math.min(1000, Math.floor(n / 10));
    let best = Number.NEGATIVE_INFINITY;
    let lag = 0;
    for (let l = -600; l <= 600; l++) {
        let s = 0;
        for (let i = skip; i < n - skip; i++) {
            s += a[i] * (b[i + l] ?? 0);
        }
        if (s > best) {
            best = s;
            lag = l;
        }
    }
    let sa = 0;
    let sb = 0;
    let sab = 0;
    let sr = 0;
    let pa = 0;
    let pb = 0;
    const end = n - skip - Math.abs(lag);
    for (let i = skip; i < end; i++) {
        const x = a[i];
        const y = b[i + lag] ?? 0;
        sa += x * x;
        sb += y * y;
        sab += x * y;
        sr += (x - y) ** 2;
        pa = Math.max(pa, Math.abs(x));
        pb = Math.max(pb, Math.abs(y));
    }
    const count = Math.max(1, end - skip);
    const rmsA = Math.sqrt(sa / count);
    const rmsB = Math.sqrt(sb / count);
    const correlation = sab / Math.sqrt(sa * sb || 1);
    const deltaDb = db(rmsA) - db(rmsB);
    return {
        probe,
        rmsNodeDb: db(rmsA),
        rmsChromiumDb: db(rmsB),
        deltaDb,
        peakNodeDb: db(pa),
        peakChromiumDb: db(pb),
        lag,
        correlation,
        residualDb: db(Math.sqrt(sr / count)),
        flagged: Math.abs(deltaDb) > 0.5 || correlation < 0.98,
    };
}

function formatTable(rows: ProbeComparison[]): string {
    const f = (v: number, w = 7) => v.toFixed(1).padStart(w);
    const lines = [
        `${'probe'.padEnd(20)} rmsNode  rmsChr   Δdb  peakNode peakChr   lag   corr   resid`,
    ];
    for (const r of rows) {
        lines.push(
            `${r.probe.padEnd(20)}${f(r.rmsNodeDb)}${f(r.rmsChromiumDb)}${f(r.deltaDb, 6)}${f(r.peakNodeDb, 9)}${f(r.peakChromiumDb, 8)}${String(r.lag).padStart(6)}${r.correlation.toFixed(3).padStart(7)}${f(r.residualDb)}${r.flagged ? '  <<<' : ''}`,
        );
    }
    return lines.join('\n');
}

const ENVELOPE_TIMES = [
    0.1, 0.19, 0.2, 0.21, 0.3, 0.45, 0.49, 0.5, 0.51, 0.55, 0.6, 0.7, 0.9, 1.2, 1.45,
];

function formatEnvelopes(node: Rendered, chromium: Rendered): string {
    const lines = [
        `${'probe'.padEnd(22)}${ENVELOPE_TIMES.map((t) => String(t).padStart(7)).join('')}`,
    ];
    for (const name of Object.keys(node)) {
        for (const [label, data] of [
            ['node', node[name]],
            ['chr', chromium[name]],
        ] as const) {
            lines.push(
                `${`${name} ${label}`.padEnd(22)}${ENVELOPE_TIMES.map((t) => data[Math.round(t * SR)].toFixed(3).padStart(7)).join('')}`,
            );
        }
    }
    return lines.join('\n');
}

function peakIndex(samples: number[]): number {
    let at = -1;
    let max = 0;
    for (let i = 0; i < samples.length; i++) {
        if (Math.abs(samples[i]) > max) {
            max = Math.abs(samples[i]);
            at = i;
        }
    }
    return at;
}

function formatLatency(node: Rendered, chromium: Rendered): string {
    const lines = [
        'probe             node peak@  chromium peak@  Δ samples   (impulse fed at 2205)',
    ];
    for (const name of Object.keys(node)) {
        const a = peakIndex(node[name]);
        const b = peakIndex(chromium[name]);
        lines.push(
            `${name.padEnd(18)}${String(a).padStart(10)}${String(b).padStart(16)}${String(b - a).padStart(11)}`,
        );
    }
    return lines.join('\n');
}

export async function runParity(argv = process.argv.slice(2)): Promise<void> {
    const options = parseParityArgs(argv);
    installDiskPackFetcher();
    const serialised = serialise(MODES[options.mode], options.probes);
    const seconds = MODE_SECONDS[options.mode];
    const [node, chrome] = await Promise.all([
        renderInNode(serialised, seconds),
        renderInChromium(serialised, seconds),
    ]);
    if (options.mode === 'envelope') {
        process.stdout.write(`${formatEnvelopes(node, chrome)}\n`);
        return;
    }
    if (options.mode === 'latency') {
        process.stdout.write(`${formatLatency(node, chrome)}\n`);
        return;
    }
    const rows = Object.keys(serialised).map((name) =>
        compareProbe(name, node[name], chrome[name]),
    );
    if (options.json) {
        process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    } else {
        process.stdout.write(`${formatTable(rows)}\n`);
        const flagged = rows.filter((r) => r.flagged).map((r) => r.probe);
        process.stdout.write(
            flagged.length === 0
                ? '\nEvery probe within 0.5 dB and correlation ≥ 0.98.\n'
                : `\n${flagged.length} probe(s) past 0.5 dB or under 0.98 correlation: ${flagged.join(', ')}.\n`,
        );
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    runParity().catch((error) => {
        console.error('\nwebaudio:parity failed:', error);
        process.exitCode = 1;
    });
}
