import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Guard for `playDrumSound`'s dispatch: for every name the band can send (and a name it
 * cannot) the exact ordered sequence of side effects on the audio context — node creation,
 * parameter automation, connections, `Math.random` draws, panner release, warnings.
 *
 * Why a recorded sequence and not assertions: the dispatch routes between voices that each
 * keep their own preamble (density ducking, scheduling guard, panner and its pan value,
 * velocity handling), in different orders and with different constants. A restructure that
 * reorders one of those moves audio, and the golden render only plays the names its four
 * scenes use (Kick, Snare, HiHat, HiHatPedal, Open, Ride, Crash — not Sidestick, the toms,
 * the shaker or an unknown name). This replays all of them against a recording context.
 *
 * The expectations in `__snapshots__/drum-dispatch.txt` were captured on the code BEFORE the
 * dispatcher was restructured (#drum-dispatcher) and must not be regenerated to make a
 * change pass: a diff here is a changed sample. Never run it with `-u` for a refactor.
 */

const SNAPSHOT = './__snapshots__/drum-dispatch.txt';

// Every name `prototypes/v2/lib/band-host.ts`'s DRUM_NAMES sends, an unknown name, and the
// two degenerate inputs the dispatcher has always tolerated.
const BAND_NAMES = [
    'Kick',
    'Snare',
    'Sidestick',
    'HiHat',
    'Open',
    'HiHatPedal',
    'Ride',
    'RideBell',
    'Crash',
    'High Tom',
    'Mid Tom',
    'Low Tom',
    'Shaker',
];
const OTHER_NAMES: Array<string | undefined> = ['Bogus', '', undefined];

type Variant = 'normal' | 'default-velocity' | 'nan-velocity' | 'late-time' | 'burst';

// Names whose AudioParams are objects of their own; everything else on a node is a method.
const PARAMS = new Set(['gain', 'frequency', 'Q', 'pan', 'playbackRate', 'detune']);

function mulberry32(seed: number): () => number {
    let a = seed;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function makeRecorder() {
    const log: string[] = [];
    let pendingDraws = 0;
    const endedHandlers: Array<{ label: string; fn: () => void }> = [];
    let nextId = 1;

    const flushDraws = () => {
        if (pendingDraws > 0) {
            log.push(`random x${pendingDraws}`);
            pendingDraws = 0;
        }
    };
    const emit = (line: string) => {
        flushDraws();
        log.push(line);
    };
    const fmt = (v: unknown): string => {
        if (typeof v === 'number') {
            return Number.isFinite(v) ? String(Number(v.toPrecision(9))) : String(v);
        }
        if (typeof v === 'function') {
            return 'fn';
        }
        if (v === null || v === undefined || typeof v === 'string' || typeof v === 'boolean') {
            return String(v);
        }
        const tagged = v as { __label?: string };
        return tagged.__label ?? 'obj';
    };

    const param = (label: string) => {
        const stored = new Map<string | symbol, unknown>();
        return new Proxy(
            {},
            {
                get(_t, prop) {
                    if (typeof prop === 'symbol') {
                        return undefined;
                    }
                    if (prop === '__label') {
                        return label;
                    }
                    if (stored.has(prop)) {
                        return stored.get(prop);
                    }
                    return (...args: unknown[]) => emit(`${label}.${prop}(${args.map(fmt)})`);
                },
                set(_t, prop, value) {
                    stored.set(prop, value);
                    emit(`${label}.${String(prop)}=${fmt(value)}`);
                    return true;
                },
            },
        );
    };

    const node = (kind: string) => {
        const label = `${kind}#${nextId++}`;
        const stored = new Map<string | symbol, unknown>();
        const params = new Map<string, unknown>();
        emit(`create ${label}`);
        return new Proxy(
            {},
            {
                get(_t, prop) {
                    if (typeof prop === 'symbol') {
                        return undefined;
                    }
                    if (prop === '__label') {
                        return label;
                    }
                    if (stored.has(prop)) {
                        return stored.get(prop);
                    }
                    if (PARAMS.has(prop)) {
                        if (!params.has(prop)) {
                            params.set(prop, param(`${label}.${prop}`));
                        }
                        return params.get(prop);
                    }
                    return (...args: unknown[]) => {
                        emit(`${label}.${prop}(${args.map(fmt)})`);
                        if (prop === 'connect') {
                            return args[0];
                        }
                        if (prop === 'getChannelData') {
                            return new Float32Array(stored.get('__length') as number);
                        }
                        return undefined;
                    };
                },
                set(_t, prop, value) {
                    stored.set(prop, value);
                    if (prop === 'onended') {
                        emit(`${label}.onended=fn`);
                        endedHandlers.push({ label, fn: value });
                    } else {
                        emit(`${label}.${String(prop)}=${fmt(value)}`);
                    }
                    return true;
                },
                has() {
                    return true;
                },
                ownKeys() {
                    return [];
                },
                getOwnPropertyDescriptor() {
                    return undefined;
                },
            },
        );
    };

    // A tiny sample rate keeps the 9 s additive cymbal render to a few hundred samples; the
    // draws it makes are still made, in order, and so is every call that follows them.
    const SAMPLE_RATE = 200;
    const audio = {
        currentTime: 10,
        sampleRate: SAMPLE_RATE,
        createOscillator: () => node('osc'),
        createGain: () => node('gain'),
        createStereoPanner: () => node('panner'),
        createBiquadFilter: () => node('filter'),
        createBufferSource: () => node('source'),
        createBuffer: (channels: number, length: number, rate: number) => {
            emit(`createBuffer(${channels},${length},${rate})`);
            const buffer = node('buffer') as Record<string, unknown>;
            buffer.__length = length;
            return buffer;
        },
    };

    const mathRandom = mulberry32(0xd2a3);
    vi.spyOn(Math, 'random').mockImplementation(() => {
        pendingDraws++;
        return mathRandom();
    });
    vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
        emit(`console.warn(${args.map(fmt)})`);
    });

    return {
        audio,
        log,
        emit,
        fmt,
        node,
        flush: flushDraws,
        runEnded() {
            emit('--- onended handlers fire, in registration order');
            for (const handler of endedHandlers.splice(0)) {
                emit(`ended ${handler.label}`);
                handler.fn();
            }
            flushDraws();
        },
    };
}

type Scenario = {
    name: string | undefined;
    variant: Variant;
    voice?: string;
    packKeys?: string[];
    noAudio?: boolean;
    /** Extra hits played on the same context after the first, in order. */
    after?: Array<string | undefined>;
};

/** Replay one scenario against a fresh module graph and return its recorded sequence. */
async function record(scenario: Scenario): Promise<string[]> {
    vi.resetModules();
    const rec = makeRecorder();
    const registry = await import('../../../public/engine/instrument-registry.js');
    const { playDrumSound } = await import('../../../public/engine/synth-drums.js');

    const packId = 'dispatch-test-kit';
    for (const key of scenario.packKeys ?? []) {
        registry.registerPackBuffer(packId, key, {
            __label: `pack-buffer:${key}`,
            duration: 0.5,
        } as unknown as AudioBuffer);
    }

    const noiseBuffer = rec.node('buffer');
    const drumsBus = rec.node('gain');
    const sidechain = rec.node('gain');
    rec.emit('--- scenario start');

    const state = {
        playback: {
            audio: scenario.noAudio ? null : rec.audio,
            bandIntensity: 0.7,
            audioGraph: { drums: { gain: drumsBus }, bass: { sidechain } },
        },
        groove: {
            voice: scenario.voice ?? 'synth',
            genreFeel: 'Jazz',
            audioBuffers: { noise: noiseBuffer } as Record<string, unknown>,
            lastHatGain: null as unknown,
            lastRideGain: null as unknown,
            lastCrashGain: null as unknown,
            lastSampledHatVoice: null as unknown,
        },
        arranger: { key: 'Eb', sections: [], progression: [] },
        bass: { enabled: true },
        chords: { enabled: true },
        soloist: { enabled: false },
    };

    const describeGroove = () => {
        const g = state.groove;
        rec.emit(
            `groove: hat=${rec.fmt(g.lastHatGain)} ride=${rec.fmt(g.lastRideGain)} crash=${rec.fmt(g.lastCrashGain)} sampledHat=${g.lastSampledHatVoice ? 'held' : 'none'}`,
        );
    };
    const args = (name: string | undefined, time: number): [string, number, ...number[]] => {
        switch (scenario.variant) {
            case 'default-velocity':
                return [name as string, time];
            case 'nan-velocity':
                return [name as string, time, Number.NaN];
            case 'late-time':
                // A time already past: the 2 ms guard against the context clock decides.
                return [name as string, 9, 0.8];
            default:
                return [name as string, time, 0.8];
        }
    };

    // A burst of the same name first: density ducking only bites past 18 hits inside half a
    // second, so only a burst shows whether a name's hits are counted at all.
    for (let k = 0; scenario.variant === 'burst' && k < 24; k++) {
        (playDrumSound as (...a: unknown[]) => void)(state, scenario.name, 10.4 + k * 0.005, 0.8);
    }
    (playDrumSound as (...a: unknown[]) => void)(state, ...args(scenario.name, 10.5));
    describeGroove();
    // A second hit on the same context shows what the first left behind: the density-ducking
    // count (it scales this hit's volume), the choke state, and any panner left connected.
    for (const [i, name] of (scenario.after ?? ['Sidestick']).entries()) {
        rec.emit(`--- then ${name}`);
        (playDrumSound as (...a: unknown[]) => void)(state, ...args(name, 10.6 + i * 0.1));
        describeGroove();
    }
    rec.runEnded();
    describeGroove();
    return rec.log;
}

function section(title: string, lines: string[]): string {
    return `=== ${title}\n${lines.join('\n')}\n`;
}

function digest(lines: string[]): string {
    return `${lines.length} lines, sha1 ${createHash('sha1').update(lines.join('\n')).digest('hex')}`;
}

describe('drum dispatcher', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('performs the recorded side effects for every band drum name (synth kit)', async () => {
        let out = '';
        for (const name of BAND_NAMES) {
            out += section(`${name} / synth / normal`, await record({ name, variant: 'normal' }));
        }
        await expect(out).toMatchFileSnapshot(SNAPSHOT);
    });

    it('performs the same side effects for the other inputs and velocity paths', async () => {
        // Full sequences for the odd names; digests for the velocity/time variants of every name
        // (the full text of those would triple the snapshot without being easier to review).
        let out = '';
        for (const name of OTHER_NAMES) {
            const label = name === undefined ? 'undefined' : name === '' ? '(empty)' : name;
            out += section(
                `${label} / synth / normal`,
                await record({ name, variant: 'normal', after: ['Sidestick'] }),
            );
        }
        out += section(
            '(no audio context) HiHat then Kick',
            await record({ name: 'HiHat', variant: 'normal', noAudio: true, after: ['Kick'] }),
        );
        for (const variant of ['default-velocity', 'nan-velocity', 'late-time', 'burst'] as const) {
            for (const name of [...BAND_NAMES, 'Bogus']) {
                out += `${variant} / ${name}: ${digest(await record({ name, variant }))}\n`;
            }
        }
        await expect(out).toMatchFileSnapshot('./__snapshots__/drum-dispatch-variants.txt');
    });

    it('performs the recorded side effects on a sample kit, with synth fall-through', async () => {
        // The pack covers only some articulations: a covered hit plays the sample (and a hat
        // chokes a ringing sampled open hat), an uncovered one — including RideBell here, and the
        // sidestick, shaker and an unknown name — falls through to the synth voice for that hit.
        const packKeys = ['kick', 'hihat-open', 'hihat-closed', 'ride-bell', 'tom-low'];
        const hits = [
            'Open',
            'HiHat',
            'Kick',
            'RideBell',
            'Sidestick',
            'Shaker',
            'Low Tom',
            'High Tom',
            'Crash',
            'Bogus',
        ];
        let out = '';
        for (const name of hits) {
            out += section(
                `${name} / pack`,
                await record({
                    name,
                    variant: 'normal',
                    voice: 'pack:dispatch-test-kit',
                    packKeys,
                    after: ['HiHat', 'Sidestick'],
                }),
            );
        }
        await expect(out).toMatchFileSnapshot('./__snapshots__/drum-dispatch-pack.txt');
    });
});
