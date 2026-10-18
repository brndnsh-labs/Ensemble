/**
 * The cymbal trim follows the section that is playing (#1637). The host hands every drum hit
 * the number of pitched lanes its own section sounds (`soundingLayers`), read off the timeline
 * the band performed, so a section that mutes a lane trims the cymbals in its bars and in no
 * other. Driven through the real host path with the voices mocked: the fifth argument of
 * `playDrumSound` is the count the cymbal trim receives.
 */
import { type BandSettings, compileTimeline, DEFAULT_SETTINGS } from '@band/index';
import { playBassNote } from '@core/engine/synth-bass';
import { playNote } from '@core/engine/synth-chords';
import { playDrumSound } from '@core/engine/synth-drums';
import { playSoloNote } from '@core/engine/synth-soloist';
import type { ScoreMeasure, SemanticScore } from '@core/songbook/score-types';
import type { EnsembleState } from '@core/types';
import { describe, expect, it, vi } from 'vitest';
import { BandHost, soundingLayers } from './band-host';

vi.mock('@core/engine/synth-drums', () => ({ playDrumSound: vi.fn() }));
vi.mock('@core/engine/synth-bass', () => ({ playBassNote: vi.fn() }));
vi.mock('@core/engine/synth-chords', () => ({ playNote: vi.fn() }));
vi.mock('@core/engine/synth-soloist', () => ({ playSoloNote: vi.fn() }));

const bar = (id: string, symbol: string): ScoreMeasure => ({
    id,
    content: { kind: 'events', events: [{ kind: 'chord', symbol, duration: [4, 1] }] },
});

type Instruments = SemanticScore['sections'][number]['instruments'];

/** Two sections of two bars each; the second one carries `instruments`. */
const song = (second: Instruments): SemanticScore => ({
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
            ...(second ? { instruments: second } : {}),
            measures: [bar('b1', 'G7'), bar('b2', 'C')],
        },
    ],
});

const wholeBand: BandSettings = {
    ...DEFAULT_SETTINGS,
    lanes: { drums: true, bass: true, comp: true, lead: true },
};

type Enabled = { bass: boolean; chords: boolean; soloist: boolean };

/** The live state, with the pitched lanes switched on as `enabled` says. */
function liveState(
    audio: unknown,
    enabled: Enabled = { bass: true, chords: true, soloist: true },
): EnsembleState {
    return {
        playback: { audio, audioGraph: null, metronome: false },
        groove: { enabled: true },
        bass: { enabled: enabled.bass },
        chords: { instrument: 'Piano', enabled: enabled.chords },
        soloist: { enabled: enabled.soloist },
    } as unknown as EnsembleState;
}

const BAR_S = 2; // 4/4 at 120 bpm
const START_S = 10.1;

/** Plays all four bars (both sections); returns each drum hit's bar and the count it got. */
function drumLayers(
    score: SemanticScore,
    enabled?: Enabled,
): { name: string; bar: number; layers: number | undefined }[] {
    for (const voice of [playDrumSound, playBassNote, playNote, playSoloNote]) {
        vi.mocked(voice).mockClear();
    }
    const audio = {
        currentTime: 10,
        destination: {},
        createOscillator: vi.fn(),
        createGain: vi.fn(),
    };
    const state = liveState(audio, enabled);
    const host = new BandHost({ state: () => state, silence: () => {} });
    host.setScore(score);
    host.start(wholeBand, 120, 0);
    for (let t = START_S; t < START_S + 4 * BAR_S - 0.2; t += 0.025) {
        audio.currentTime = t;
        (host as unknown as { pump(): void }).pump();
    }
    host.stop();
    return vi.mocked(playDrumSound).mock.calls.map(([, name, time, , layers]) => ({
        name,
        // A downbeat is pushed a few ms ahead of its barline: round to the nearest bar.
        bar: Math.floor((time - START_S + 0.05) / BAR_S),
        layers,
    }));
}

const countsIn = (hits: { layers: number | undefined }[]) => new Set(hits.map((hit) => hit.layers));

describe('the cymbal trim follows the section playing (#1637)', () => {
    it('a section that mutes lanes trims its own bars and no others', () => {
        const hits = drumLayers(song({ bass: false, soloist: false }));
        const inA = hits.filter((hit) => hit.bar < 2);
        const inB = hits.filter((hit) => hit.bar >= 2);

        expect(inA.length).toBeGreaterThan(0);
        expect(inB.length).toBeGreaterThan(0);
        expect(countsIn(inA)).toEqual(new Set([3]));
        expect(countsIn(inB)).toEqual(new Set([1]));
    });

    it('counts a lane that is switched off globally as off in every section', () => {
        const hits = drumLayers(song({ bass: false }), {
            bass: true,
            chords: true,
            soloist: false,
        });

        expect(countsIn(hits.filter((hit) => hit.bar < 2))).toEqual(new Set([2]));
        expect(countsIn(hits.filter((hit) => hit.bar >= 2))).toEqual(new Set([1]));
    });

    it('a chart with no section overrides gives every drum hit the switched-on lane count', () => {
        const hits = drumLayers(song(undefined));
        const cymbals = hits.filter((hit) => ['HiHat', 'Open', 'Ride', 'Crash'].includes(hit.name));

        expect(cymbals.length).toBeGreaterThan(0);
        expect(countsIn(hits)).toEqual(new Set([3]));
    });
});

describe('soundingLayers', () => {
    const timeline = compileTimeline(song({ chords: false }));
    const state = liveState({});

    it('reads the section the tick is in', () => {
        expect(soundingLayers(state, timeline, 0)).toBe(3);
        expect(soundingLayers(state, timeline, timeline.bars[2].start)).toBe(2);
    });

    it('falls back to the switched-on lanes outside every bar', () => {
        expect(soundingLayers(state, timeline, timeline.ticks + 1000)).toBe(3);
    });
});
