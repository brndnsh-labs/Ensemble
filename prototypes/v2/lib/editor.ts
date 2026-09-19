import { getChordDetails } from '@engine/engine/chords-engine';

// Match the playback parser's root precedence and spelling, not a new chart language.
const ROOT = /^(?:[#b]?(?:III|II|IV|I|VII|VI|V|iii|ii|iv|i|vii|vi|v)|[#b]?[1-7]|[A-Ga-g][#b]?)/;

/**
 * Did the parser understand this whole quality? `recognised` (#1331) is the signal: it means
 * the entire normalised suffix matched one table spelling, so `Maj7`, `m7(b5)`, `Δ7` and
 * `mMaj7` pass even though the canonical spelling differs from what was typed — comparing
 * strings is what used to reject them. A partial match (`m7#11` consumes `m7`, drops `#11`) is
 * still rejected, which is this guard's real job. (#1340 swapped that example: `m7#5` became a
 * real quality, so it is now accepted — the guard's behaviour is unchanged.)
 *
 * The `suffix !== ''` half covers the other direction: normalisation strips parentheses,
 * slashes and spaces before matching, so a tail of `(` normalises to nothing and would
 * otherwise "match" the bare-triad row. Anything the user typed has to leave a real spelling.
 */
function isQuality(text: string): boolean {
    const details = getChordDetails(text);
    return details.recognised && (text === '' || details.suffix !== '');
}

function supportedChord(token: string): boolean {
    const root = token.match(ROOT)?.[0];
    if (!root) {
        return false;
    }
    const tail = token.slice(root.length);
    // #1331 — ask the parser whether it understood the WHOLE suffix, instead of comparing its
    // canonical spelling back to the typed text. Since #1320-#1324 the parser normalises case,
    // parentheses, Δ and the in-quality slash before matching, so `Maj7`, `m7(b5)`, `Δ7` and
    // `mMaj7` all parse correctly while returning a spelling that differs from what was typed
    // — the old string equality rejected exactly the chords that now work. A partial match
    // (`m7#11` consumes `m7` and drops `#11`) is still rejected: that is this guard's real job.
    // (#1340 swapped the example; `m7#5` is a real quality now and parses whole.)
    const parts = tail.split('/');
    if (parts.length > 2) {
        return false;
    }
    if (parts.length === 2) {
        const [head, bass] = parts;
        // Half-written slash text (`C/9`, `Cmaj7/`) is for the user to finish, not for the
        // parser to read charitably.
        if (head === '' || bass === '') {
            return false;
        }
        // A real slash bass: a quality this parser consumes, over a root.
        if (bass.match(ROOT)?.[0] === bass) {
            return isQuality(head);
        }
        // Otherwise the slash is notation INSIDE the quality — `6/9`, `m6/9`, `m/maj7` —
        // which is why the previous version needed a literal `6/9` special case.
        return isQuality(tail);
    }
    return isQuality(tail);
}

/** The legacy parser is tolerant; new editor text must never silently become another chord. */
export function validateEditorText(label: string, text: string): void {
    const bars = text.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
    for (const bar of bars) {
        if (!bar.trim()) {
            throw new Error(
                `Section ${label}: add chords to each bar. Empty bars are not supported yet.`,
            );
        }
        for (const token of bar.trim().split(/\s+/)) {
            if (!supportedChord(token)) {
                throw new Error(
                    `Section ${label}: unsupported chord spelling “${token.slice(0, 60)}”. Try Dm7, G7/B or Cmaj7; use # and b for accidentals.`,
                );
            }
        }
    }
}
