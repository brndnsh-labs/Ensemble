/**
 * `BandHost.carryOn` (#1989): a section loop cleared mid-play carries on into the full chart at a
 * barline, with no loop state in the host. The retired loop's release path broke five ways in a
 * week (#1528); each is pinned here against the derived-chart design:
 *
 *   - #1484: a settings change after the release, before the seam, must not send the song back
 *     to bar 0 (the carry is data on the segment, not a flag spent once).
 *   - #1489: a release inside the lookahead of a lap's end must not double its downbeat.
 *   - #1499: a change a timer tick after a pump still sends every note before its barline.
 *   - #1507 / #1517: the bars already played lead into the chord that really follows them,
 *     because the chart carries on at the bar playing the same written bar (`loopEntry`).
 *
 * The voices are mocked: this is scheduling, not sound.
 */
import { type BandEvent, compileTimeline, DEFAULT_SETTINGS, type Timeline } from '@band/index';
import { playBassNote } from '@core/engine/synth-bass';
import { playNote } from '@core/engine/synth-chords';
import { playDrumSound } from '@core/engine/synth-drums';
import { playSoloNote } from '@core/engine/synth-soloist';
import type { ScoreEvent, ScoreMeasure, SemanticScore } from '@core/songbook/score-types';
import type { EnsembleState } from '@core/types';
import { describe, expect, it, vi } from 'vitest';
import { BandHost } from './band-host';
import { loopEntry, loopScore } from './section-loop';

vi.mock('@core/engine/synth-drums', () => ({ playDrumSound: vi.fn() }));
vi.mock('@core/engine/synth-bass', () => ({ playBassNote: vi.fn() }));
vi.mock('@core/engine/synth-chords', () => ({ playNote: vi.fn() }));
vi.mock('@core/engine/synth-soloist', () => ({ playSoloNote: vi.fn() }));

const chord = (symbol: string): ScoreEvent => ({ kind: 'chord', symbol, duration: [4, 1] });
const bar = (id: string, symbol: string): ScoreMeasure => ({
    id,
    content: { kind: 'events', events: [chord(symbol)] },
});

/** A (2 bars), B (4 bars), C (2 bars): looping B, the chart's B is its bars 2–5. */
const full: SemanticScore = {
    notation: 'name',
    key: 'C',
    isMinor: false,
    meter: '4/4',
    grouping: null,
    sections: [
        { id: 'a', label: 'A', repeat: 1, measures: [bar('a1', 'C'), bar('a2', 'F')] },
        {
            id: 'b',
            label: 'B',
            repeat: 1,
            measures: [bar('b1', 'Dm7'), bar('b2', 'G7'), bar('b3', 'Em7'), bar('b4', 'A7')],
        },
        { id: 'c', label: 'C', repeat: 1, measures: [bar('c1', 'Bb'), bar('c2', 'Eb')] },
    ],
};
const loop = loopScore(full, 'b')!;
const fullTimeline = compileTimeline(full);
const loopTimeline = compileTimeline(loop);
const entry = loopEntry(fullTimeline, loopTimeline, 'b')!;

/** 4/4 at 120: two seconds a bar. The loop starts at 10.1 s; a lap is four bars. */
const BAR_S = 2;
const START = 10.1;
const LAP_S = 4 * BAR_S;

const wholeBand = {
    ...DEFAULT_SETTINGS,
    lanes: { drums: true, bass: true, comp: true, lead: true },
};

function fakeAudioContext(startTime: number) {
    return {
        currentTime: startTime,
        destination: {},
        createOscillator: vi.fn(() => ({
            connect: vi.fn(),
            frequency: { setValueAtTime: vi.fn() },
            start: vi.fn(),
            stop: vi.fn(),
            onended: null,
        })),
        createGain: vi.fn(() => ({
            connect: vi.fn(),
            disconnect: vi.fn(),
            gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        })),
    };
}

type Seen = {
    timeline: Timeline;
    window: { from: number };
    start: number;
    pass: number;
    cursor: number;
    events: BandEvent[];
};

/** The loop playing from `START`, the timer every 25 ms; `segments()` is every one it queued. */
function rig() {
    for (const voice of [playDrumSound, playBassNote, playNote, playSoloNote]) {
        vi.mocked(voice).mockClear();
    }
    const audio = fakeAudioContext(10);
    const state = {
        playback: { audio, audioGraph: null, metronome: false },
        chords: { instrument: 'Piano' },
    } as unknown as EnsembleState;
    const host = new BandHost({ state: () => state, silence: () => {} });
    host.setScore(loop, loopTimeline);
    host.start(wholeBand, 120, 0);
    const internals = host as unknown as { segments: Seen[]; pump(): void };
    const seen: Seen[] = [];
    const tick = (t: number) => {
        audio.currentTime = t;
        internals.pump();
        for (const segment of internals.segments) {
            if (!seen.includes(segment)) {
                seen.push(segment);
            }
        }
    };
    const pumpTo = (from: number, to: number) => {
        for (let i = 0; from + i * 0.025 < to - 1e-9; i++) {
            tick(from + i * 0.025);
        }
    };
    return { audio, host, tick, pumpTo, segments: () => seen };
}

function voiceCalls(): { note: string; time: number }[] {
    return [
        ...vi
            .mocked(playDrumSound)
            .mock.calls.map(([, piece, time]) => ({ note: `drums ${piece}`, time })),
        ...vi
            .mocked(playBassNote)
            .mock.calls.map(([, freq, time]) => ({ note: `bass ${freq}`, time })),
        ...vi.mocked(playNote).mock.calls.map(([, freq, time]) => ({ note: `comp ${freq}`, time })),
        ...vi
            .mocked(playSoloNote)
            .mock.calls.map(([, freq, time]) => ({ note: `lead ${freq}`, time })),
    ].sort((x, y) => x.time - y.time);
}

/** The same drum or pitch struck twice within 20 ms: one note handed to the voices twice. */
function doubled(calls: { note: string; time: number }[]): string[] {
    return calls.flatMap((call, i) =>
        calls
            .slice(i + 1)
            .filter((later) => later.note === call.note && later.time - call.time < 0.02)
            .map((later) => `${call.note} at ${call.time} and ${later.time}`),
    );
}

/** The bass's pitch class at each barline from `from` (a note within 60 ms of it). */
function bassRootsFrom(from: number, bars: number): (number | null)[] {
    const bass = vi.mocked(playBassNote).mock.calls.map(([, freq, time]) => ({ freq, time }));
    return Array.from({ length: bars }, (_, i) => {
        const at = from + i * BAR_S;
        const note = bass.find((call) => Math.abs(call.time - at) < 0.06);
        return note ? Math.round(12 * Math.log2(note.freq / 440) + 69) % 12 : null;
    });
}

/** The chart's segments, after the loop's. */
function carried(segments: Seen[]): Seen[] {
    return segments.filter((segment) => segment.timeline === fullTimeline);
}

describe('BandHost.carryOn: a section loop cleared mid-play', () => {
    it('finishes the section and goes on into the next one, at the first barline it can', () => {
        const { audio, host, pumpTo, segments } = rig();
        // Half way through the loop's second bar of its second lap.
        const at = START + LAP_S + BAR_S + 1;
        pumpTo(START, at);
        audio.currentTime = at;
        host.carryOn(full, fullTimeline, entry);
        pumpTo(at, at + 5 * BAR_S);
        const seam = START + LAP_S + 2 * BAR_S;
        const after = carried(segments());
        expect(after[0].window.from).toBe(4); // B's third bar in the chart
        expect(after[0].start).toBeCloseTo(seam, 6);
        expect(after[0].pass).toBe(0);
        // Em7, A7 (the rest of B), then C's Bb and Eb: the section ends, the song goes on.
        expect(bassRootsFrom(seam, 4)).toEqual([4, 9, 10, 3]);
        expect(doubled(voiceCalls())).toEqual([]);
        host.stop();
    });

    it('plays every note before the seam exactly as the loop would have', () => {
        const at = START + BAR_S + 0.7;
        const seam = START + 2 * BAR_S;
        const { pumpTo } = rig();
        pumpTo(START, seam + BAR_S);
        const looped = voiceCalls().filter((call) => call.time < seam - 0.05);
        const { audio, host, pumpTo: pump2 } = rig();
        pump2(START, at);
        audio.currentTime = at;
        host.carryOn(full, fullTimeline, entry);
        pump2(at, seam + BAR_S);
        expect(voiceCalls().filter((call) => call.time < seam - 0.05)).toEqual(looped);
        host.stop();
    });

    it('a clear a timer tick after a pump still sends every note before the seam (#1499)', () => {
        const missing: string[] = [];
        for (let i = 0; i < BAR_S / 0.025; i++) {
            const at = START + BAR_S + i * 0.025 + 0.024;
            const seam = START + Math.ceil((at + 0.15 - START) / BAR_S) * BAR_S;
            const { pumpTo } = rig();
            pumpTo(START, seam + 0.1);
            const looped = voiceCalls().filter((call) => call.time < seam - 0.05);
            const { audio, host, pumpTo: pump2 } = rig();
            pump2(START, at);
            audio.currentTime = at;
            host.carryOn(full, fullTimeline, entry);
            pump2(at + 0.001, seam + 0.1);
            const heard = new Set(voiceCalls().map((call) => JSON.stringify(call)));
            for (const call of looped) {
                if (!heard.has(JSON.stringify(call))) {
                    missing.push(`${call.note} at ${call.time} (clear at ${at})`);
                }
            }
            host.stop();
        }
        expect(missing).toEqual([]);
    });

    it("a clear inside the lookahead of a lap's end doubles no downbeat (#1489)", () => {
        const lapEnd = START + LAP_S;
        for (const [pumpAt, clearAt] of [
            [lapEnd - 0.15, lapEnd - 0.15],
            [lapEnd - 0.152, lapEnd - 0.151],
            [lapEnd - 0.1, lapEnd - 0.08],
        ]) {
            const { audio, host, tick, pumpTo, segments } = rig();
            pumpTo(START, pumpAt);
            tick(pumpAt);
            audio.currentTime = clearAt;
            host.carryOn(full, fullTimeline, entry);
            pumpTo(pumpAt + 0.025, lapEnd + 3 * BAR_S);
            const calls = voiceCalls();
            expect(doubled(calls)).toEqual([]);
            const onBarline = (call: { note: string; time: number }) =>
                call.note.startsWith('bass') && Math.abs(call.time - lapEnd) < 0.03;
            expect(calls.filter(onBarline)).toHaveLength(1);
            host.stop();
            // The lap that was under way led back into B's top, so the chart carries on there
            // or later — never into a bar the loop's last bar did not lead to (#1517).
            const first = carried(segments())[0];
            expect(entry(0)).toBe(2);
            expect([2, 3]).toContain(first.window.from);
        }
    });

    it('a settings change after the clear, before the seam, still carries on (#1484)', () => {
        for (const changeAfter of [0.3, 1.2]) {
            const { audio, host, pumpTo, segments } = rig();
            // Late in the lap's last bar, so the next lap was already queued and is rebuilt.
            const at = START + LAP_S - BAR_S + 0.2;
            pumpTo(START, at);
            audio.currentTime = at;
            host.carryOn(full, fullTimeline, entry);
            pumpTo(at, at + changeAfter);
            audio.currentTime = at + changeAfter;
            host.update({ ...wholeBand, intensity: 0.9 });
            pumpTo(at + changeAfter, START + LAP_S + 4 * BAR_S);
            const lapEnd = START + LAP_S;
            const after = carried(segments());
            expect(after.length).toBeGreaterThan(0);
            // The loop's last bar was under way: the chart takes over at the lap's end, at B's
            // top, never back at the loop's own top or the chart's bar 0.
            expect(after[0].window.from).toBe(2);
            expect(after[0].start).toBeCloseTo(lapEnd, 6);
            // A continuation of the performance, not a fresh start: B's top in the chart is a
            // section arriving, and it crashes as one.
            expect(
                voiceCalls().some(
                    (call) => call.note === 'drums Crash' && Math.abs(call.time - lapEnd) < 0.03,
                ),
            ).toBe(true);
            // The loop's next lap, queued before the clear, was dropped unheard.
            const heardLoop = segments().filter(
                (s) => s.timeline === loopTimeline && s.start >= lapEnd - 1e-6 && s.cursor > 0,
            );
            expect(heardLoop).toEqual([]);
            expect(doubled(voiceCalls())).toEqual([]);
            host.stop();
        }
    });

    it('a tempo change after the clear keeps the seam on the beat', () => {
        const { audio, host, pumpTo, segments } = rig();
        const at = START + BAR_S + 0.5;
        pumpTo(START, at);
        audio.currentTime = at;
        host.carryOn(full, fullTimeline, entry);
        pumpTo(at, at + 0.5);
        audio.currentTime = at + 0.5;
        host.setTempo(60);
        pumpTo(at + 0.5, at + 12);
        const internals = host as unknown as { endTime(s: Seen): number };
        const all = segments();
        const first = carried(all)[0];
        const before = all[all.indexOf(first) - 1];
        expect(first.start).toBeCloseTo(internals.endTime(before), 9);
        expect(doubled(voiceCalls())).toEqual([]);
        host.stop();
    });

    it('the stand reads the loop until the seam, then the chart', () => {
        const { audio, host, pumpTo } = rig();
        const at = START + 0.5;
        pumpTo(START, at);
        audio.currentTime = at;
        host.carryOn(full, fullTimeline, entry);
        const seam = START + BAR_S;
        pumpTo(at, seam - 0.01);
        host.songTick();
        expect(host.heardTimeline()).toBe(loopTimeline);
        pumpTo(seam - 0.01, seam + 0.2);
        const tick = host.songTick()!;
        expect(host.heardTimeline()).toBe(fullTimeline);
        // The chart's bar 3: B's second bar, the loop's bar 1.
        expect(fullTimeline.bars[3].start).toBeLessThanOrEqual(tick);
        expect(host.placeAt(tick)).toEqual({ bar: 3, pass: 0 });
        host.stop();
        expect(host.heardTimeline()).toBe(fullTimeline);
    });

    it('stopped, it is setScore: the next Play is the chart', () => {
        const { host } = rig();
        host.stop();
        host.carryOn(full, fullTimeline, entry);
        expect(host.heardTimeline()).toBe(fullTimeline);
    });
});
