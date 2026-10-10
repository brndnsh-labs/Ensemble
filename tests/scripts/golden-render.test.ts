/** `scripts/golden-render.ts`: the fingerprint, its comparison, and the committed fixtures. */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    compareFingerprints,
    compareRun,
    FINGERPRINT_BANDS,
    FINGERPRINT_VERSION,
    type FingerprintFile,
    FLOOR_DB,
    type FrozenRequest,
    fingerprint,
    formatResults,
    freezeScene,
    GOLDEN_DIR,
    GOLDEN_SCENES,
    GOLDEN_STEMS,
    parseGoldenArgs,
    requestPath,
    TOLERANCE,
} from '../../scripts/golden-render.js';

const SR = 44100;

/** Two seconds of a 1 kHz tone at `amplitude`, in both channels (or `side` out of phase). */
function tone(amplitude: number, options: { freq?: number; side?: number } = {}): Float32Array[] {
    const { freq = 1000, side = 0 } = options;
    const left = new Float32Array(2 * SR);
    const right = new Float32Array(2 * SR);
    for (let i = 0; i < left.length; i++) {
        const sample = Math.sin((2 * Math.PI * freq * i) / SR);
        left[i] = (amplitude + side) * sample;
        right[i] = (amplitude - side) * sample;
    }
    return [left, right];
}

describe('fingerprint', () => {
    it('reads level, tone, width and contour off a known signal', () => {
        const print = fingerprint(tone(0.5), SR);
        expect(print.seconds).toBe(2);
        expect(print.rmsDb).toBeCloseTo(-9.03, 1);
        expect(print.peakDb).toBeCloseTo(-6.02, 1);
        expect(print.blocksDb).toHaveLength(4);
        expect(print.blocksDb.every((db) => Math.abs(db - print.rmsDb) < 0.05)).toBe(true);
        // A centred tone has no side signal.
        expect(print.sideDb).toBe(FLOOR_DB);
        // The 1 kHz band carries it; a band three octaves away carries almost none.
        const at = (freq: number) => print.bandsDb[FINGERPRINT_BANDS.indexOf(freq as 1000)];
        expect(at(1000)).toBeGreaterThan(-10);
        expect(at(125)).toBeLessThan(at(1000) - 40);
    });

    it('silence reads the floor, never -Infinity or NaN', () => {
        const print = fingerprint([new Float32Array(SR), new Float32Array(SR)], SR);
        const values = [
            print.rmsDb,
            print.peakDb,
            print.sideDb,
            ...print.bandsDb,
            ...print.blocksDb,
        ];
        expect(values.every((value) => value === FLOOR_DB)).toBe(true);
        expect(JSON.parse(JSON.stringify(print))).toEqual(print);
    });
});

describe('compareFingerprints', () => {
    const golden = fingerprint(tone(0.5), SR);

    it('passes the same render and a change inside the tolerance', () => {
        expect(compareFingerprints(golden, fingerprint(tone(0.5), SR))).toEqual([]);
        // 0.05 dB: half the level tolerance.
        const nudged = fingerprint(tone(0.5 * 10 ** (0.05 / 20)), SR);
        expect(compareFingerprints(golden, nudged)).toEqual([]);
    });

    it('fails a 0.5 dB level change and says what moved', () => {
        const louder = fingerprint(tone(0.5 * 10 ** (0.5 / 20)), SR);
        const differences = compareFingerprints(golden, louder);
        const metrics = differences.map((difference) => difference.metric);
        expect(metrics).toContain('level (RMS)');
        expect(metrics).toContain('peak');
        expect(metrics).toContain('tone 1 kHz');
        expect(metrics.filter((metric) => metric.startsWith('contour'))).toHaveLength(4);
        const level = differences.find((difference) => difference.metric === 'level (RMS)');
        expect(level?.delta).toBeCloseTo(0.5, 1);
        expect(level?.tolerance).toBe(TOLERANCE.levelDb);
    });

    it('brackets the level tolerance', () => {
        const at = (deltaDb: number) =>
            compareFingerprints(golden, { ...golden, rmsDb: golden.rmsDb + deltaDb }).length;
        expect(at(TOLERANCE.levelDb - 0.01)).toBe(0);
        expect(at(TOLERANCE.levelDb + 0.01)).toBe(1);
        expect(at(-TOLERANCE.levelDb - 0.01)).toBe(1);
    });

    it('fails a tone change the level alone would hide, and a width change', () => {
        // Same amplitude an octave up: the level holds, the bands do not.
        const brighter = compareFingerprints(golden, fingerprint(tone(0.5, { freq: 2000 }), SR));
        const metrics = brighter.map((difference) => difference.metric);
        expect(metrics).not.toContain('level (RMS)');
        expect(metrics).toContain('tone 1 kHz');
        expect(metrics).toContain('tone 2 kHz');

        const wider = compareFingerprints(golden, fingerprint(tone(0.5, { side: 0.05 }), SR));
        expect(wider.map((difference) => difference.metric)).toEqual(['stereo side']);
    });

    it('fails a render that got longer or lost its tail', () => {
        const longer = {
            ...golden,
            seconds: golden.seconds + 0.5,
            blocksDb: [...golden.blocksDb, -30],
        };
        const metrics = compareFingerprints(golden, longer).map((difference) => difference.metric);
        expect(metrics).toContain('length (s)');
        expect(metrics).toContain('contour 2.0–2.5 s');
    });

    it('gives quiet levels the wider tolerance, and only when both sides are quiet', () => {
        const quiet = { ...golden, sideDb: -75 };
        const within = { ...quiet, sideDb: -75 - TOLERANCE.quietToleranceDb + 0.01 };
        const beyond = { ...quiet, sideDb: -75 - TOLERANCE.quietToleranceDb - 0.01 };
        expect(compareFingerprints(quiet, within)).toEqual([]);
        expect(compareFingerprints(quiet, beyond)).toHaveLength(1);
        // Quiet on one side only is a real change: a stem that gained a side signal.
        expect(compareFingerprints(quiet, { ...quiet, sideDb: -59.9 })).toHaveLength(1);
    });
});

describe('compareRun and its report', () => {
    const print = fingerprint(tone(0.5), SR);
    const golden: FingerprintFile = {
        version: FINGERPRINT_VERSION,
        scenes: { scene: { mix: print, bass: print } },
    };

    it('names the stem that moved and the one with no fingerprint', () => {
        const louder = fingerprint(tone(0.6), SR);
        const results = compareRun(golden, { scene: { mix: print, bass: louder, lead: print } });
        expect(results.find((row) => row.stem === 'mix')?.differences).toEqual([]);
        expect(results.find((row) => row.stem === 'bass')?.differences.length).toBeGreaterThan(0);
        expect(results.find((row) => row.stem === 'lead')?.missing).toBe(true);
        const report = formatResults(results, 2);
        expect(report).toContain('scene / bass:');
        expect(report).toContain('scene / lead: no committed fingerprint');
        expect(report).not.toContain('scene / mix');
        expect(report).toMatch(/\+\d+ more/);
    });
});

describe('parseGoldenArgs', () => {
    it('reads the flags, and --refreeze implies --update', () => {
        expect(parseGoldenArgs([])).toEqual({
            update: false,
            refreeze: false,
            json: false,
            scenes: null,
        });
        expect(parseGoldenArgs(['--refreeze'])).toMatchObject({ update: true, refreeze: true });
        expect(parseGoldenArgs(['--scene=funk-synth,jazz-synth', '--json'])).toMatchObject({
            scenes: ['funk-synth', 'jazz-synth'],
            json: true,
        });
    });

    it('refuses an unknown flag or scene', () => {
        expect(() => parseGoldenArgs(['--bless'])).toThrow(/unknown argument/);
        expect(() => parseGoldenArgs(['--scene=polka'])).toThrow(/no scene "polka"/);
    });
});

describe('the committed fixtures', () => {
    const file = JSON.parse(
        readFileSync(path.join(GOLDEN_DIR, 'fingerprints.json'), 'utf8'),
    ) as FingerprintFile;
    const frozen = (id: string) =>
        JSON.parse(readFileSync(requestPath(id), 'utf8')) as FrozenRequest;

    it('hold a fingerprint for every stem of every scene, at this version', () => {
        expect(file.version).toBe(FINGERPRINT_VERSION);
        expect(Object.keys(file.scenes).sort()).toEqual(GOLDEN_SCENES.map((s) => s.id).sort());
        for (const scene of GOLDEN_SCENES) {
            expect(existsSync(requestPath(scene.id)), scene.id).toBe(true);
            for (const stem of GOLDEN_STEMS) {
                const print = file.scenes[scene.id][stem.id];
                expect(print, `${scene.id}/${stem.id}`).toBeDefined();
                expect(print.bandsDb).toHaveLength(FINGERPRINT_BANDS.length);
                // Every stem sounds: a fingerprint of silence would guard nothing.
                expect(print.rmsDb, `${scene.id}/${stem.id}`).toBeGreaterThan(-50);
            }
        }
    });

    it('freeze every lane, on the sounds the scene names', () => {
        for (const scene of GOLDEN_SCENES) {
            const request = frozen(scene.id);
            const lanes = new Set(request.passes.flat().map((event) => event.lane));
            expect([...lanes].sort(), scene.id).toEqual(['bass', 'comp', 'drums', 'lead']);
            for (const pin of scene.voices ?? []) {
                expect(request.voices, scene.id).toContainEqual(pin);
            }
            expect(request.genreFeel).toBe(scene.genreFeel);
        }
    });

    it('know every field the band puts on an event today', () => {
        // The frozen events are the band's of the day they were frozen. A field the band has
        // added since (a new articulation) is one no fixture exercises: recompose them with
        // `npm run golden -- --refreeze` so the check renders what the band now plays.
        const fields = (requests: FrozenRequest[]) => {
            const byLane = new Map<string, Set<string>>();
            for (const event of requests.flatMap((request) => request.passes.flat())) {
                const known = byLane.get(event.lane) ?? new Set<string>();
                for (const key of Object.keys(event)) {
                    known.add(key);
                }
                byLane.set(event.lane, known);
            }
            return byLane;
        };
        const known = fields(GOLDEN_SCENES.map((scene) => frozen(scene.id)));
        const live = fields(GOLDEN_SCENES.map((scene) => freezeScene(scene)));
        for (const [lane, keys] of live) {
            const unknown = [...keys].filter((key) => !known.get(lane)?.has(key));
            expect(unknown, `${lane}: run \`npm run golden -- --refreeze\``).toEqual([]);
        }
    });
});
