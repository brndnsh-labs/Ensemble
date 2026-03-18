import { h } from 'preact';
import React from 'preact/compat';

/** @param {any} props */
/**
 * @param {Object} props
 */
export function SymbolMenu({ onSelect, onClose }) {
    const symbols = [
        '|',
        'maj7',
        'm7',
        '7',
        'ø',
        'o',
        'aug',
        'aug7',
        'sus4',
        'sus2',
        '#',
        'b',
        ',',
        '-',
    ];

    const SYMBOL_LABELS = {
        '|': 'Bar Line',
        maj7: 'Major 7th',
        m7: 'Minor 7th',
        7: 'Dominant 7th',
        ø: 'Half-Diminished 7th',
        o: 'Diminished',
        aug: 'Augmented',
        aug7: 'Augmented 7th',
        sus4: 'Suspended 4th',
        sus2: 'Suspended 2nd',
        '#': 'Sharp',
        b: 'Flat',
        ',': 'Comma Separator',
        '-': 'Minor',
    };

    return (
        <div class="symbol-dropdown" onClick={(e) => e.stopPropagation()}>
            {symbols.map((sym) => (
                <button
                    key={sym}
                    class="symbol-btn"
                    title={SYMBOL_LABELS[sym] || sym}
                    aria-label={SYMBOL_LABELS[sym] || sym}
                    onClick={() => {
                        onSelect(sym);
                        onClose();
                    }}
                >
                    {sym}
                </button>
            ))}
        </div>
    );
}
