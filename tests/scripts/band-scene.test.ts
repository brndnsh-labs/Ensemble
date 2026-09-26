import { describe, expect, it } from 'vitest';
import { STYLES } from '../../band/index.js';
import {
    analyzeSchedule,
    buildEventDump,
    type DispatchedEvent,
    laneEvents,
    type MixScene,
    performScene,
    performSceneForReport,
    renderMeta,
    sceneScore,
    sceneSettings,
    sceneStyle,
    sceneVoices,
} from '../../scripts/band-scene.js';
import { DEFAULT_MIX_REPORT_SCENES } from '../../scripts/mix-report-utils.js';

function scene(overrides: Partial<MixScene> = {}): MixScene {
    return {
        id: 'jazz-test',
        genreFeel: 'Jazz',
        bpm: 120,
        key: 'C',
        intensity: 0.6,
        sections: [{ value: 'Dm7 | G7 | Cmaj7 | Cmaj7' }],
        ...overrides,
    };
}

function dispatched(overrides: Partial<DispatchedEvent> = {}): DispatchedEvent {
    return {
        pass: 0,
        lane: 'bass',
        tick: 0,
        bar: 0,
        time: 0.25,
        durationSeconds: 0.5,
        midi: 36,
        piece: null,
        velocity: 100,
        level: 0.87,
        levelScale: null,
        muted: false,
        palm: false,
        ...overrides,
    };
}

describe('band-scene — the chart', () => {
    it('reads each bar in the chart editor syntax, with section repeats and meters', () => {
        const score = sceneScore(
            scene({
                timeSignature: '4/4',
                sections: [
                    { value: 'C:2 G7:2 | N.C.', repeat: 2 },
                    { value: 'D | E', timeSignature: '3/4', key: 'G' },
                ],
            }),
        );
        expect(score.meter).toBe('4/4');
        expect(score.sections).toHaveLength(2);
        expect(score.sections[0].repeat).toBe(2);
        expect(score.sections[0].measures).toHaveLength(2);
        expect(score.sections[1]).toMatchObject({ meter: '3/4', key: 'G' });
        const [first] = score.sections[0].measures;
        expect(first.content.kind).toBe('events');
    });

    it('names the scene, section and bar of a chord it cannot read', () => {
        expect(() => sceneScore(scene({ sections: [{ value: 'C | Qzz7' }] }))).toThrow(
            /scene "jazz-test" section 1 bar 2/,
        );
    });

    it('every built-in scene compiles', () => {
        for (const builtIn of DEFAULT_MIX_REPORT_SCENES) {
            const performance = performSceneForReport(
                builtIn,
                'MIX_AUDIT',
                1,
                sceneVoices(builtIn),
            );
            expect(performance.band[0].length).toBeGreaterThan(0);
        }
    });
});

describe('band-scene — settings', () => {
    it("maps a canonical genre to the band's style and refuses anything else", () => {
        expect(sceneStyle(scene({ genreFeel: 'Neo-Soul' }))).toBe('neosoul');
        expect(sceneStyle(scene({ genreFeel: 'Ska-Punk' }))).toBe('skapunk');
        expect(() => sceneStyle(scene({ genreFeel: 'Shred' }))).toThrow(/no band style/);
        // A prototype key is not a genre (the #1266 TABLE[untrusted] rule).
        expect(() => sceneStyle(scene({ genreFeel: 'constructor' }))).toThrow(/no band style/);
    });

    it('every lane plays the synth unless the scene, then an override, pins another sound', () => {
        expect(sceneVoices(scene())).toEqual([
            { module: 'groove', voice: 'synth' },
            { module: 'bass', voice: 'synth' },
            { module: 'chords', voice: 'synth' },
            { module: 'soloist', voice: 'synth' },
        ]);
        const pinned = scene({
            voices: [
                { module: 'chords', voice: 'pack:rhodes' },
                // No band lane: dropped, not an error.
                { module: 'harmony', voice: 'pack:strings-ensemble' },
                { module: 'constructor', voice: 'pack:grand' },
            ],
        });
        const voices = sceneVoices(pinned, [{ module: 'bass', voice: 'pack:upright-bass' }]);
        expect(voices).toContainEqual({ module: 'chords', voice: 'pack:rhodes' });
        expect(voices).toContainEqual({ module: 'bass', voice: 'pack:upright-bass' });
        expect(voices.map((pin) => pin.module)).toEqual(['groove', 'bass', 'chords', 'soloist']);
        expect(sceneVoices(pinned, [{ module: 'chords', voice: 'synth' }])).toContainEqual({
            module: 'chords',
            voice: 'synth',
        });
    });

    it("plays the style's instruments on the synth, and the instrument a pinned pack names", () => {
        const bossa = scene({ genreFeel: 'Bossa' });
        const onSynth = sceneSettings(bossa, 'A', sceneVoices(bossa));
        expect(onSynth.comp).toBe(STYLES.bossa.prefers);
        // The built-in soloist voice is not a request for a trumpet.
        expect(onSynth.lead).toBe(STYLES.bossa.lead?.prefers);

        const rhodes = sceneSettings(
            bossa,
            'A',
            sceneVoices(bossa, [
                { module: 'chords', voice: 'pack:rhodes' },
                { module: 'soloist', voice: 'pack:sax-alto' },
            ]),
        );
        expect(rhodes.comp).toBe('rhodes');
        expect(rhodes.lead).toBe('sax');

        const explicit = sceneSettings(scene({ comp: 'organ', lead: 'trumpet' }), 'A', []);
        expect(explicit).toMatchObject({ comp: 'organ', lead: 'trumpet' });
    });

    it('holds the scene energy, keys the seed on the scene, and follows the lane switches', () => {
        const settings = sceneSettings(
            scene({ intensity: 0.3, includeChords: false, includeSoloist: false }),
            'ALPHA',
            [],
        );
        expect(settings.intensity).toBe(0.3);
        expect(settings.seed).toBe('jazz-test:ALPHA');
        expect(settings.lanes).toEqual({ drums: true, bass: true, comp: false, lead: false });
        expect(sceneSettings(scene({ intensity: undefined }), 'A', []).intensity).toBe(0.7);
    });
});

describe('band-scene — the performance', () => {
    it('plays one pass per loop, the same every time', () => {
        const performance = performSceneForReport(scene(), 'A', 3, sceneVoices(scene()));
        expect(performance.band).toHaveLength(3);
        const again = performSceneForReport(scene(), 'A', 3, sceneVoices(scene()));
        expect(again.band).toEqual(performance.band);
        const other = performSceneForReport(scene(), 'B', 3, sceneVoices(scene()));
        expect(other.band).not.toEqual(performance.band);
    });

    it('the bed is the band without its lead', () => {
        const { band, bed } = performSceneForReport(scene(), 'A', 2, sceneVoices(scene()));
        expect(band.flat().some((event) => event.lane === 'lead')).toBe(true);
        expect(bed.flat().some((event) => event.lane === 'lead')).toBe(false);
        // The drums and bass hear no lead (they play first), so the bed keeps them as played.
        const rhythm = (passes: typeof band) =>
            laneEvents(passes, ['drums', 'bass']).map((events) => events.length);
        expect(rhythm(bed)).toEqual(rhythm(band));
    });

    it('a stem hears only its lanes', () => {
        const { timeline, settings } = performSceneForReport(scene(), 'A', 1, []);
        const passes = performScene(timeline, settings, 1);
        const comp = laneEvents(passes, ['comp']);
        expect(comp[0].length).toBeGreaterThan(0);
        expect(comp[0].every((event) => event.lane === 'comp')).toBe(true);
    });

    it('meta numbers the sixteenth grid across the loops', () => {
        const { timeline } = performSceneForReport(scene(), 'A', 1, []);
        expect(renderMeta(timeline, 120, 2, { sampleRate: 44100, leadInSeconds: 0.25 })).toEqual({
            sampleRate: 44100,
            leadInSeconds: 0.25,
            stepSeconds: 0.125,
            stepsPerLoop: 64,
            loopCount: 2,
            bpm: 120,
        });
    });
});

describe('band-scene — schedule analysis', () => {
    it('counts voice pressure, same-pitch restrikes and notes per step, in the first pass only', () => {
        const metrics = analyzeSchedule(
            [
                dispatched({ tick: 0, time: 0.25, durationSeconds: 1, midi: 60, lane: 'comp' }),
                dispatched({ tick: 0, time: 0.25, durationSeconds: 1, midi: 64, lane: 'comp' }),
                // Restrikes 60 while the first 60 still sounds, with two voices up.
                dispatched({ tick: 240, time: 0.5, durationSeconds: 0.2, midi: 60, lane: 'comp' }),
                // Another lane, another pass, and a drum hit: none of them count.
                dispatched({ tick: 0, time: 0.25, midi: 36, lane: 'bass' }),
                dispatched({ pass: 1, tick: 0, time: 5, midi: 60, lane: 'comp' }),
                dispatched({ lane: 'drums', midi: null, piece: 'kick' }),
            ],
            ['comp'],
            2,
        );
        expect(metrics).toEqual({
            eventCount: 3,
            maxNotesPerStep: 2,
            overLimitSteps: 0,
            maxSimultaneousVoices: 3,
            sameMidiOverlapCount: 1,
            voiceLimitPressureCount: 1,
            minOnsetGapMs: 250,
        });
    });

    it('an empty lane reports zeros, not NaN or Infinity', () => {
        expect(analyzeSchedule([], ['lead'], 1)).toMatchObject({
            eventCount: 0,
            maxNotesPerStep: 0,
            minOnsetGapMs: 0,
        });
    });
});

describe('band-scene — the event dump', () => {
    const meta = {
        sampleRate: 44100,
        leadInSeconds: 0.25,
        stepSeconds: 0.125,
        stepsPerLoop: 64,
        loopCount: 1,
        bpm: 120,
    };

    it("names lanes by the report's tracks and gives a drum hit its General MIDI key", () => {
        const dump = buildEventDump({
            scene: 's',
            stem: 'full+solo',
            seed: 'A',
            lanes: ['drums', 'comp', 'lead'],
            meta,
            dispatched: [
                dispatched({ lane: 'comp', time: 0.5, midi: 64, velocity: 127, level: 0.8 }),
                dispatched({ lane: 'drums', time: 0.25, midi: null, piece: 'kick', level: 1.2 }),
                dispatched({ lane: 'lead', time: 0.75, midi: 72 }),
                // Not one of the stem's lanes.
                dispatched({ lane: 'bass', time: 0.3 }),
            ],
        });
        expect(dump.engine).toBe('band');
        expect(dump.tracks).toEqual(['drums', 'chords', 'soloist']);
        expect(dump.dispatchEvents.map((event) => [event.track, event.midi])).toEqual([
            ['drums', 36],
            ['chords', 64],
            ['soloist', 72],
        ]);
        expect(dump.dispatchEvents[0]).toMatchObject({ piece: 'kick', duration: null });
        expect(dump.dispatchEvents[1]).toMatchObject({ velocity: 1, renderVelocity: 0.8 });
        expect(dump.events).toBe(dump.dispatchEvents);
    });

    it('carries a palm-muted bass note’s mute gain as its level scale', () => {
        const dump = buildEventDump({
            scene: 's',
            stem: 'bass',
            seed: 'A',
            lanes: ['bass'],
            meta,
            dispatched: [dispatched({ muted: true, levelScale: 0.2775 })],
        });
        expect(dump.dispatchEvents[0].levelScale).toBe(0.2775);
    });
});
