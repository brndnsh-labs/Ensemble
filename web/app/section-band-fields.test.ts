import type { ScoreSection } from '@core/songbook/score-types';
import { describe, expect, it } from 'vitest';
import { sectionMarks } from './section-band-fields';

const section = (label: string, instruments?: ScoreSection['instruments']): ScoreSection => ({
    id: 's',
    label,
    repeat: 1,
    measures: [],
    ...(instruments ? { instruments } : {}),
});

/** #2021 — the letter's hint says only what the name doesn't, and which players sit out. */
describe('sectionMarks', () => {
    it('is quiet for plain names and names that spell their role', () => {
        for (const label of ['A', 'Head', 'Verse 2', 'Chorus']) {
            expect(sectionMarks(section(label))).toBe('');
        }
    });

    it('names a role the label only implies', () => {
        expect(sectionMarks(section('Hook'))).toBe('Chorus');
        expect(sectionMarks(section('B'))).toBe('Bridge');
    });

    it('lists the players left out', () => {
        expect(sectionMarks(section('A', { bass: false, groove: false }))).toBe('no drums, bass');
        expect(sectionMarks(section('Hook', { soloist: false }))).toBe('Chorus · no lead');
    });
});
