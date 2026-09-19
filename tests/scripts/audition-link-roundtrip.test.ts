// @vitest-environment happy-dom
// A generated audition link is only useful if the app's REAL URL hydration reads it back as the
// scenario that was asked for — a param hydration silently ignores yields a link that plays
// something else with no error.
import { beforeEach, describe, expect, it } from 'vitest';
import { loadFromUrl } from '../../public/state/state-hydration.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';
import { runAuditionLink } from '../../scripts/audition-link.js';

function hydrate(...argv: string[]) {
    let out = '';
    const write = process.stdout.write;
    process.stdout.write = ((chunk: string) => {
        out += chunk;
        return true;
    }) as typeof process.stdout.write;
    try {
        expect(runAuditionLink(argv)).toBe(0);
    } finally {
        process.stdout.write = write;
    }
    const url = new URL(out.trim());
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
    loadFromUrl();
    return getState();
}

describe('audition link -> loadFromUrl round trip', () => {
    beforeEach(() => {
        dispatch(ACTIONS.RESET_STATE);
    });

    it('restores the progression (accidentals intact), genre, key and intensity', () => {
        const state = hydrate(
            '--prog=Cm7 | Cm7#5 | C+ | Cm(b6)',
            '--genre=Neo-Soul',
            '--key=Eb',
            '--int=0.8',
            '--bpm=92',
            '--ts=6/8',
        );
        expect(state.arranger.sections.map((s) => s.value)).toEqual(['Cm7 | Cm7#5 | C+ | Cm(b6)']);
        expect(state.groove.genreFeel).toBe('Neo-Soul');
        expect(state.arranger.key).toBe('Eb');
        expect(state.playback.bandIntensity).toBeCloseTo(0.8);
        expect(state.playback.bpm).toBe(92);
        expect(state.arranger.timeSignature).toBe('6/8');
    });

    it('switches parts and density without disturbing the ones it left alone', () => {
        const before = getState();
        const bassOctave = before.bass.octave;
        const chordOctave = before.chords.octave;
        const state = hydrate(
            '--prog=C | C+ | C6 | C7',
            '--genre=Jazz',
            '--density=rich',
            '--on=soloist',
            '--off=harmony',
        );
        expect(state.soloist.enabled).toBe(true);
        expect(state.harmony.enabled).toBe(false);
        expect(state.chords.enabled).toBe(true);
        expect(state.chords.density).toBe('rich');
        expect(state.chords.octave).toBe(chordOctave); // not hydration's 48 fallback
        expect(state.bass.enabled).toBe(true);
        expect(state.bass.octave).toBe(bassOctave);
    });
});
