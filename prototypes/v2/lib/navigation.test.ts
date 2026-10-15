import { describe, expect, it } from 'vitest';
import { depthFor, isNavEntry, type NavEntry, type NavView, navKey, stepTo } from './navigation';

const home: NavView = { kind: 'home' };
const all: NavView = { kind: 'all', collection: null };
const standards: NavView = { kind: 'standards', entry: 'Blues' };
const song = (id: string): NavView => ({ kind: 'song', ref: { kind: 'song', id } });
const entry = (view: NavView, depth: number): NavEntry => ({ ensemble: 1, depth, view });

describe('isNavEntry', () => {
    it('accepts only what Ensemble writes', () => {
        expect(isNavEntry(entry(home, 0))).toBe(true);
        expect(isNavEntry(null)).toBe(false);
        expect(isNavEntry({ ensemble: 1, depth: -1, view: home })).toBe(false);
        expect(isNavEntry({ ensemble: 1, depth: 1.5, view: home })).toBe(false);
        expect(isNavEntry({ ensemble: 1, depth: 0, view: { kind: 'elsewhere' } })).toBe(false);
        expect(isNavEntry({ depth: 0, view: home })).toBe(false);
    });
});

describe('depthFor', () => {
    it('puts a song one above wherever it was opened from', () => {
        expect(depthFor(song('a'), entry(home, 0))).toBe(1);
        expect(depthFor(song('a'), entry(all, 1))).toBe(2);
        expect(depthFor(song('a'), entry(standards, 1))).toBe(2);
    });
    it('keeps a song that replaces a song level', () => {
        expect(depthFor(song('copy'), entry(song('a'), 2))).toBe(2);
    });
    it('keeps the songbook at the floor and its pages one up', () => {
        expect(depthFor(home, entry(song('a'), 2))).toBe(0);
        expect(depthFor(all, entry(home, 0))).toBe(1);
        expect(depthFor(standards, entry(all, 1))).toBe(1);
    });
});

describe('stepTo', () => {
    it('claims a foreign top entry in place rather than going back past it', () => {
        expect(stepTo(home, null)).toEqual({ kind: 'replace', entry: entry(home, 0) });
        expect(stepTo(song('a'), { some: 'fragment' })).toEqual({
            kind: 'replace',
            entry: entry(song('a'), 1),
        });
    });
    it('pushes going deeper and goes back going shallower', () => {
        expect(stepTo(all, entry(home, 0))).toEqual({ kind: 'push', entry: entry(all, 1) });
        expect(stepTo(song('a'), entry(all, 1))).toEqual({
            kind: 'push',
            entry: entry(song('a'), 2),
        });
        expect(stepTo(home, entry(song('a'), 2))).toEqual({
            kind: 'back',
            delta: -2,
            entry: entry(home, 0),
        });
    });
    it('replaces across a level, and does nothing for the same place', () => {
        expect(stepTo(standards, entry(all, 1))).toEqual({
            kind: 'replace',
            entry: entry(standards, 1),
        });
        expect(stepTo(song('copy'), entry(song('a'), 1))).toEqual({
            kind: 'replace',
            entry: entry(song('copy'), 1),
        });
        expect(stepTo(song('a'), entry(song('a'), 1))).toEqual({ kind: 'none' });
    });
    it('names each place once', () => {
        expect(navKey(song('a'))).not.toBe(navKey(song('b')));
        expect(navKey({ kind: 'song', ref: { kind: 'standard', id: 'a' } })).not.toBe(
            navKey(song('a')),
        );
    });
});
