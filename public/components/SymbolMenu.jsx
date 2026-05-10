import React from 'preact/compat';

/** @type {string[]} */
const SYMBOLS = [
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

/** @type {Record<string, string>} */
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

/**
 * @typedef {Object} SymbolMenuProps
 * @property {function(string): void} onSelect
 * @property {function(): void} [onClose]
 * @property {'dropdown'|'row'} [variant]
 */
/**
 * @param {SymbolMenuProps} props
 */
export function SymbolMenu({ onSelect, onClose, variant = 'dropdown' }) {
    const isRow = variant === 'row';

    return (
        <div
            class={isRow ? 'symbol-row' : 'symbol-dropdown'}
            onClick={isRow ? undefined : (e) => e.stopPropagation()}
        >
            {SYMBOLS.map((sym) => (
                <button
                    key={sym}
                    class="symbol-btn"
                    title={SYMBOL_LABELS[sym] || sym}
                    aria-label={SYMBOL_LABELS[sym] || sym}
                    onClick={() => {
                        onSelect(sym);
                        if (onClose) {
                            onClose();
                        }
                    }}
                >
                    {sym}
                </button>
            ))}
        </div>
    );
}
