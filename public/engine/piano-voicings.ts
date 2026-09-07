import type { Chord } from '../types.js';
import { chordFacts } from './chord-facts.js';

export type PianoProfile = 'modern-piano' | 'open-modal' | 'neo-soul-rhodes';

export interface PianoKey {
    midi: number;
    hand: 'left' | 'right';
}

/** Literal chord requirements plus a small, explicitly optional color vocabulary. */
function palette(chord: Chord, bassPresent: boolean, density: string) {
    const facts = chordFacts(chord);
    const required = [...facts.defining];
    if (!bassPresent || required.length < 2) {
        required.push(bassPresent ? facts.root : facts.bass);
    }
    if (!bassPresent) {
        required.push(facts.root);
    }
    const allowed = new Set([...facts.tones, ...required]);
    const simple = ['major', 'minor', '7', 'maj7'].includes(chord.quality);
    if (simple && density !== 'thin') {
        allowed.add((facts.root + 2) % 12);
    }
    if (simple && density === 'rich') {
        allowed.add((facts.root + (chord.quality === 'minor' ? 5 : 9)) % 12);
    }
    // The bassist supplies the root; retain it for triads/dyads where dropping
    // it would erase the harmonic identity. Explicit alterations always win.
    if (bassPresent && facts.defining.length >= 2 && !required.includes(facts.root)) {
        allowed.delete(facts.root);
    }
    return { required: [...new Set(required)], allowed: [...allowed], bass: facts.bass };
}

const candidatesCache = new Map<string, readonly PianoKey[][]>();

function candidates(chord: Chord, bassPresent: boolean, density: string): readonly PianoKey[][] {
    const { required, allowed, bass } = palette(chord, bassPresent, density);
    const count = Math.max(
        required.length,
        allowed.length === 2 ? 3 : density === 'thin' ? 3 : density === 'rich' ? 5 : 4,
    );
    const key = `${required}/${allowed}/${bassPresent}/${bass}/${count}`;
    const cached = candidatesCache.get(key);
    if (cached) {
        return cached;
    }
    const keys: number[] = [];
    // Use the shared chords slot through C6. Some bass-free 13ths need that
    // upper octave to separate the named 13th from the adjacent seventh.
    for (let midi = bassPresent ? 58 : 52; midi <= 84; midi++) {
        if (allowed.includes(midi % 12)) {
            keys.push(midi);
        }
    }
    const result: PianoKey[][] = [];
    const walk = (notes: number[], next: number) => {
        if (notes.length === count) {
            if (required.some((pc) => !notes.some((n) => n % 12 === pc))) {
                return;
            }
            // At least three distinct tones when the chart supports them;
            // power chords deliberately use octave doublings instead.
            if (new Set(notes.map((n) => n % 12)).size < Math.min(3, allowed.length)) {
                return;
            }
            for (let split = 1; split < notes.length; split++) {
                if (
                    notes[split - 1] - notes[0] <= 12 &&
                    notes.at(-1)! - notes[split] <= 12 &&
                    notes[split - 1] <= 69
                ) {
                    result.push(
                        notes.map((midi, i) => ({ midi, hand: i < split ? 'left' : 'right' })),
                    );
                }
            }
            return;
        }
        for (let i = next; i < keys.length; i++) {
            const midi = keys[i];
            if (!notes.length && !bassPresent && midi % 12 !== bass) {
                continue;
            }
            if (notes.length && (midi - notes.at(-1)! < 2 || midi - notes[0] > 24)) {
                continue;
            }
            walk([...notes, midi], i + 1);
        }
    };
    walk([], 0);
    if (candidatesCache.size >= 128) {
        candidatesCache.clear();
    }
    candidatesCache.set(key, result);
    return result;
}

/** Voice-leading cost preserves distinct hands and gives the top line extra weight. */
export function voicePianoChord(
    chord: Chord,
    bassPresent: boolean,
    density: string,
    previous: readonly PianoKey[] = [],
    center = 65,
    profile: PianoProfile = 'modern-piano',
): PianoKey[] {
    let best: PianoKey[] = [];
    let cost = Infinity;
    const facts = chordFacts(chord);
    for (const notes of candidates(chord, bassPresent, density)) {
        let nextCost = Math.abs(notes.reduce((sum, n) => sum + n.midi, 0) / notes.length - center);
        nextCost += Math.abs(notes.filter((n) => n.hand === 'left').length - 2) * 2;
        if (profile === 'open-modal') {
            // Open the texture within the same playable register. Fourths are
            // a preference over already-valid chart tones, never a new scale
            // or a reason to discard a third, seventh or written alteration.
            nextCost += Math.max(0, 19 - (notes.at(-1)!.midi - notes[0].midi)) * 2;
            let fourths = 0;
            for (let i = 1; i < notes.length; i++) {
                const gap = notes[i].midi - notes[i - 1].midi;
                if (gap === 5) {
                    fourths++;
                }
                // Give the low voices breathing room; close upper intervals
                // remain available when they express the written harmony.
                if (notes[i - 1].midi < 65 && gap < 5) {
                    nextCost += (5 - gap) * 2;
                }
            }
            nextCost -= Math.min(2, fourths) * 4;
        }
        for (const hand of ['left', 'right'] as const) {
            const current = notes.filter((n) => n.hand === hand);
            const prior = previous.filter((n) => n.hand === hand);
            if (prior.length) {
                // Rank-preserving matching, not nearest-neighbor collapse of
                // every voice onto the same attractive previous pitch.
                current.forEach((n, i) => {
                    const old = prior[Math.min(i, prior.length - 1)];
                    nextCost += Math.abs(n.midi - old.midi) * 1.5;
                });
                nextCost += Math.abs(current.length - prior.length) * 3;
            }
        }
        if (previous.length) {
            nextCost += Math.abs(notes.at(-1)!.midi - previous.at(-1)!.midi) * 2;
            nextCost -= notes.filter((n) => previous.some((p) => p.midi === n.midi)).length * 2;
        }
        // A color note may replace an optional fifth, but added color never
        // removes a defining chart tone (enforced in candidate admission).
        if (density !== 'thin' && notes.some((n) => n.midi % 12 === (facts.root + 2) % 12)) {
            nextCost -= 2;
        }
        if (nextCost < cost) {
            cost = nextCost;
            best = notes;
        }
    }
    return best;
}
