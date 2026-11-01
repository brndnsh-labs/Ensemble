import type { ChartNotation } from '@core/songbook/types';
import type { ReactNode } from 'react';
import type { ChartChord } from '../lib/lead-sheet';

// How a written chord reads on the stand: the chart sheet's bars and the neck's chart row set
// their chords the same way.

/**
 * The visible chord symbol in the chart's current notation (#1276). `chord.display`
 * (`FormattedChordNames`) is precomputed for all three notations by `chordNames`
 * (`lib/band-chart.ts`) regardless of which one is selected, so switching notation is a
 * pure read-time choice, never a re-analysis of the chord.
 */
function chordSymbol(chord: ChartChord, notation: ChartNotation): ReactNode {
    const disp = chord.display?.[notation];
    if (!disp) {
        return chord.absName;
    }
    // Set the way a real book sets it (#1700): the root full size, the quality small and raised
    // beside it, a slash bass after. Read at a distance, the root is the fact that matters; the
    // quality qualifies it. Spans with no space between them, so the text is still "Cmaj7/E".
    return (
        <>
            <span className="chord-root">{disp.root}</span>
            {disp.suffix && <span className="chord-quality">{disp.suffix}</span>}
            {disp.bass && <span className="chord-bass">/{disp.bass}</span>}
        </>
    );
}

/**
 * How a written event reads on the stand. A hold is the slash the bar editor takes for it (the
 * chord before it rings on), N.C. is printed as charts print it, and a fermata sits over the
 * symbol it holds. Only the band engine can open charts with these (`lib/band-chart.ts`).
 */
export function eventText(chord: ChartChord, notation: ChartNotation): ReactNode {
    return chord.kind === 'hold'
        ? '/'
        : chord.kind === 'no-chord'
          ? 'N.C.'
          : chordSymbol(chord, notation);
}
