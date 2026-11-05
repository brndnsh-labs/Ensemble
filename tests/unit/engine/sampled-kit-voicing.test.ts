import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    __resetPackCacheForTest,
    registerPackBuffer,
} from '../../../core/engine/instrument-registry.js';
import { playDrumSound } from '../../../core/engine/synth-drums.js';
import type { EnsembleState } from '../../../core/types.js';

/**
 * #1998 — what the installed acoustic kit plays, against a recording audio context:
 * the kick ducks the bass as the synth kick does, the mid tom plays its own takes, and a
 * ghost stroke is a damped backbeat take rather than the backbeat 10 dB down.
 */

const PACK = 'acoustic-kit';

interface Param {
    calls: Array<[string, ...number[]]>;
    setValueAtTime: (v: number, t: number) => void;
    linearRampToValueAtTime: (v: number, t: number) => void;
    setTargetAtTime: (v: number, t: number, tc: number) => void;
    cancelScheduledValues: (t: number) => void;
}

function param(): Param {
    const calls: Param['calls'] = [];
    return {
        calls,
        setValueAtTime: (v, t) => calls.push(['set', v, t]),
        linearRampToValueAtTime: (v, t) => calls.push(['ramp', v, t]),
        setTargetAtTime: (v, t, tc) => calls.push(['target', v, t, tc]),
        cancelScheduledValues: (t) => calls.push(['cancel', t]),
    };
}

interface FakeNode {
    kind: string;
    outputs: FakeNode[];
    connect: (n: FakeNode) => void;
    disconnect: () => void;
    [key: string]: unknown;
}

function makeAudio() {
    const nodes: FakeNode[] = [];
    const node = (kind: string, extra: Record<string, unknown> = {}): FakeNode => {
        const n: FakeNode = {
            kind,
            outputs: [],
            connect(target) {
                n.outputs.push(target);
            },
            disconnect: vi.fn(),
            ...extra,
        };
        nodes.push(n);
        return n;
    };
    const audio = {
        currentTime: 0,
        createGain: () => node('gain', { gain: param() }),
        createStereoPanner: () => node('panner', { pan: param() }),
        createBiquadFilter: () =>
            node('biquad', { type: '', frequency: param(), Q: param(), gain: param() }),
        createBufferSource: () =>
            node('source', {
                buffer: null,
                playbackRate: param(),
                start: vi.fn(),
                stop: vi.fn(),
                onended: null,
            }),
    };
    return { audio, nodes };
}

function makeState() {
    const { audio, nodes } = makeAudio();
    const drumsBus = { kind: 'drumsBus', outputs: [], connect() {}, disconnect() {} };
    const sidechain = { gain: param() };
    const state = {
        playback: {
            audio,
            audioGraph: { drums: { gain: drumsBus }, bass: { sidechain } },
            bandIntensity: 0.5,
        },
        groove: { voice: `pack:${PACK}`, lastSampledHatVoice: null },
    } as unknown as EnsembleState;
    return { state, nodes, sidechain };
}

const buffer = (tag: string) => ({ tag, duration: 1.4 }) as unknown as AudioBuffer;

/** The drum level the band host sends for a band velocity (`bandEventLevel`). */
const level = (velocity: number) => (velocity / 127) * 1.2;

/** Walk a source's chain to the drum panner, naming each node on the way. */
function chainFrom(source: FakeNode): string[] {
    const path: string[] = [];
    let at: FakeNode | undefined = source;
    while (at && at.kind !== 'panner') {
        path.push(at.kind === 'biquad' ? `biquad:${at.type as string}` : at.kind);
        at = at.outputs[0];
    }
    return path;
}

const sources = (nodes: FakeNode[]) => nodes.filter((n) => n.kind === 'source');

beforeEach(() => {
    __resetPackCacheForTest();
    for (const key of ['kick', 'snare', 'tom-high', 'tom-mid', 'tom-low']) {
        registerPackBuffer(PACK, key, buffer(key));
    }
});
afterEach(() => {
    __resetPackCacheForTest();
});

describe('sampled kit — the kick ducks the bass (#1998)', () => {
    it('a sampled kick dips the bass sidechain at its own time, as the synth kick does', () => {
        const { state, nodes, sidechain } = makeState();
        playDrumSound(state, 'Kick', 1, 1);
        // It played the pack's kick, not the synth voice …
        expect((sources(nodes)[0].buffer as { tag: string }).tag).toBe('kick');
        expect(nodes.some((n) => n.kind === 'biquad')).toBe(false);
        // … and the sidechain took the synth kick's duck: down to 0.45, back to 1.
        expect(sidechain.gain.calls).toEqual([
            ['cancel', 1],
            ['target', 0.45, 1, 0.005],
            ['target', 1, 1.005, 0.12],
        ]);
    });

    it('no other sampled hit touches the sidechain', () => {
        const { state, sidechain } = makeState();
        playDrumSound(state, 'Snare', 1, 1);
        playDrumSound(state, 'High Tom', 1.5, 1);
        expect(sidechain.gain.calls).toEqual([]);
    });
});

describe('sampled kit — three toms (#1998)', () => {
    it.each([
        ['High Tom', 'tom-high'],
        ['Mid Tom', 'tom-mid'],
        ['Low Tom', 'tom-low'],
    ])('%s plays the %s takes', (name, key) => {
        const { state, nodes } = makeState();
        playDrumSound(state, name, 1, 1);
        expect((sources(nodes)[0].buffer as { tag: string }).tag).toBe(key);
    });
});

describe('sampled kit — a ghost stroke is damped, not just quieter (#1998)', () => {
    it('a ghost (band velocity under 50) strikes through a low-pass and a short decay', () => {
        const { state, nodes } = makeState();
        playDrumSound(state, 'Snare', 2, level(36));
        const [source] = sources(nodes);
        expect(chainFrom(source)).toEqual(['source', 'gain', 'biquad:lowpass', 'gain']);
        const filter = nodes.find((n) => n.kind === 'biquad') as FakeNode & { Q: Param };
        const cutoff = (filter.frequency as Param).calls[0];
        expect(cutoff[1]).toBeLessThan(3400); // under the backbeat take's spectral centroid
        expect(filter.Q.calls[0][1]).toBeLessThanOrEqual(-3); // no resonant peak (Q is in dB)
        // The decay closes the tail, and the source stops well before the take's 1.4 s.
        const envelope = filter.outputs[0] as FakeNode & { gain: Param };
        expect(envelope.gain.calls.some(([op, v, t]) => op === 'target' && v === 0 && t > 2)).toBe(
            true,
        );
        const stops = (source.stop as ReturnType<typeof vi.fn>).mock.calls.map(([t]) => t);
        expect(Math.min(...stops)).toBeLessThan(2 + 0.5);
    });

    it('frees its filter and envelope with the hit', () => {
        const { state, nodes } = makeState();
        playDrumSound(state, 'Snare', 2, level(36));
        const [source] = sources(nodes);
        (source.onended as () => void)();
        for (const n of nodes.filter((x) => x.kind === 'biquad' || x.kind === 'gain')) {
            expect(n.disconnect, `${n.kind} left connected`).toHaveBeenCalled();
        }
    });

    it('splits where the band does: velocity 49 is a ghost, 50 is a snare hit', () => {
        const ghost = makeState();
        playDrumSound(ghost.state, 'Snare', 2, level(49));
        expect(chainFrom(sources(ghost.nodes)[0])).toContain('biquad:lowpass');

        const hit = makeState();
        playDrumSound(hit.state, 'Snare', 2, level(50));
        expect(chainFrom(sources(hit.nodes)[0])).toEqual(['source', 'gain']);
        // A full hit rings the whole take: its only stop is past the recording's end.
        const stops = (sources(hit.nodes)[0].stop as ReturnType<typeof vi.fn>).mock.calls;
        expect(stops.map(([t]) => t)).toEqual([expect.any(Number)]);
        expect(stops[0][0]).toBeGreaterThan(2 + 1.4);
    });

    it('only the snare is damped: a soft sidestick or tom plays its take as recorded', () => {
        registerPackBuffer(PACK, 'sidestick', buffer('sidestick'));
        const { state, nodes } = makeState();
        playDrumSound(state, 'Sidestick', 2, level(30));
        playDrumSound(state, 'Low Tom', 3, level(30));
        expect(nodes.some((n) => n.kind === 'biquad')).toBe(false);
    });
});
