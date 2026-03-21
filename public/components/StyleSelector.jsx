import { h } from 'preact';
import { flushBuffers } from '../instrument-controller.js';
import { saveCurrentState } from '../persistence.js';
import { ACTIONS } from '../types.js';
import { useDispatch, useEnsembleState } from '../ui-bridge.js';
import { formatUnicodeSymbols } from '../utils.js';
import { syncWorker } from '../worker-client.js';

/**
 * @typedef {Object} StyleSelectorProps
 * @property {string} module
 * @property {any[]} styles
 */
/**
 * @param {StyleSelectorProps} props
 */
export function StyleSelector({ module, styles }) {
    const dispatch = useDispatch();

    // Select the current style for this module.
    // Note: State structure varies slightly by module.
    const currentStyle = useEnsembleState(
        (/** @type {import('../types.js').EnsembleState} */ state) => {
            const modState = /** @type {any} */ (state)[module];
            if (!modState) {
                return null;
            }
            // Handle nested state vs direct property
            return modState.state?.style || modState.style;
        },
    );

    const onSelect = (/** @type {string} */ styleId) => {
        dispatch(ACTIONS.SET_STYLE, { module, style: styleId });

        if (styleId === 'smart') {
            dispatch(ACTIONS.SET_ACTIVE_TAB, { module, tab: 'smart' });
        } else {
            dispatch(ACTIONS.SET_ACTIVE_TAB, { module, tab: 'classic' });
        }

        syncWorker();
        flushBuffers();
        dispatch(ACTIONS.RESTORE_GAINS);
        saveCurrentState();
    };

    // Group styles by category
    const categorized = styles.reduce(
        (/** @type {Record<string, any[]>} */ acc, /** @type {any} */ item) => {
            const cat = item.category || 'Other';
            if (!acc[cat]) {
                acc[cat] = [];
            }
            acc[cat].push(item);
            return acc;
        },
        /** @type {Record<string, any[]>} */ ({}),
    );

    const categories = Object.keys(categorized).sort();

    return (
        <div class="style-selector-container">
            {categories.map((cat) => (
                <div key={cat} class="style-category">
                    {/* Only show label if there are multiple categories or it provides value */}
                    {categories.length > 1 && (
                        <div
                            class="category-label"
                            style={{
                                fontSize: '0.75rem',
                                color: 'var(--text-muted)',
                                marginTop: '0.5rem',
                                marginBottom: '0.25rem',
                            }}
                        >
                            {cat}
                        </div>
                    )}

                    <div
                        class="chip-grid"
                        style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}
                    >
                        {categorized[cat].map((/** @type {any} */ item) => (
                            <button
                                key={item.id}
                                type="button"
                                class={`preset-chip ${module}-style-chip ${currentStyle === item.id ? 'active' : ''}`}
                                onClick={() => onSelect(item.id)}
                            >
                                {formatUnicodeSymbols(item.name)}
                            </button>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
