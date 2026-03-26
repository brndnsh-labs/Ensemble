import { switchToRelativeKey, transposeKey, validateAndAnalyze } from '../arranger-controller.js';
import { TIME_SIGNATURES } from '../config.js';
import { flushBuffers, loadDrumPreset } from '../instrument-controller.js';
import { saveCurrentState } from '../persistence.js';
import { ACTIONS } from '../types.js';
import { useDispatch, useEnsembleState } from '../ui-bridge.js';
import { formatUnicodeSymbols } from '../utils.js';
import { syncWorker } from '../worker-client.js';

const GROUPING_OPTIONS = {
    '5/4': [
        [3, 2],
        [2, 3],
    ],
    '7/8': [
        [2, 2, 3],
        [3, 2, 2],
        [2, 3, 2],
    ],
    '7/4': [
        [4, 3],
        [3, 4],
    ],
};

/**
 * @typedef {Object} KeySignatureControlsProps
 * @property {boolean} [showMaximize]
 * @property {boolean} [showTranspose]
 */

/** @param {KeySignatureControlsProps} [props] */
export function KeySignatureControls({ showMaximize = true, showTranspose = true } = {}) {
    const dispatch = useDispatch();
    const { arrangerKey, timeSignature, isMinor, grouping, lastDrumPreset, isMaximized } =
        useEnsembleState((/** @type {import('../types.js').EnsembleState} */ s) => ({
            arrangerKey: s.arranger.key,
            timeSignature: s.arranger.timeSignature,
            isMinor: s.arranger.isMinor,
            grouping: s.arranger.grouping,
            lastDrumPreset: s.groove.lastDrumPreset,
            isMaximized: s.vizState.isMaximized,
        }));

    const handleKeyChange = (/** @type {any} */ e) => {
        const newKey = e.target.value;
        import('../state.js').then(({ arranger }) => {
            arranger.key = newKey;
            validateAndAnalyze();
            saveCurrentState();
            dispatch('KEY_CHANGE');
        });
    };

    const handleTimeSigChange = (/** @type {any} */ e) => {
        const newTS = e.target.value;
        import('../state.js').then(({ arranger }) => {
            arranger.timeSignature = newTS;
            arranger.grouping = null;
            if (lastDrumPreset) {
                loadDrumPreset(lastDrumPreset);
            }
            validateAndAnalyze();
            saveCurrentState();
            dispatch('TIME_SIG_CHANGE');
        });
    };

    const toggleGrouping = () => {
        const options = /** @type {any} */ (GROUPING_OPTIONS)[timeSignature];
        if (!options) {
            return;
        }

        import('../state.js').then(({ arranger }) => {
            const current =
                arranger.grouping || /** @type {any} */ (TIME_SIGNATURES)[timeSignature].grouping;
            const currentIndex = options.findIndex(
                (/** @type {any} */ opt) => opt.join('+') === current.join('+'),
            );
            const nextIndex = (currentIndex + 1) % options.length;

            arranger.grouping = options[nextIndex];
            flushBuffers();
            syncWorker();
            saveCurrentState();
            dispatch('GROUPING_CHANGE');
        });
    };

    const keys = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    const timeSignatures = ['4/4', '3/4', '2/4', '5/4', '6/8', '7/8', '7/4', '12/8'];

    return (
        <div class="key-controls">
            {showMaximize && (
                <button
                    id="maximizeChordBtn"
                    title={isMaximized ? 'Exit Maximize' : 'Maximize'}
                    class={`header-btn ${isMaximized ? 'active' : ''}`}
                    aria-label={isMaximized ? 'Exit Maximize' : 'Maximize Chords'}
                    onClick={() => dispatch(ACTIONS.TOGGLE_MAXIMIZED_CHORDS)}
                >
                    {isMaximized ? '✕' : '⛶'}
                </button>
            )}

            <div class="time-sig-group">
                <select
                    id="timeSigSelect"
                    value={timeSignature}
                    onChange={handleTimeSigChange}
                    aria-label="Time Signature"
                >
                    {timeSignatures.map((/** @type {any} */ ts) => (
                        <option key={ts} value={ts}>
                            {ts}
                        </option>
                    ))}
                </select>
                <div
                    id="groupingToggle"
                    style={{
                        display: ['5/4', '7/8', '7/4'].includes(timeSignature) ? 'flex' : 'none',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <button
                        id="groupingLabel"
                        type="button"
                        class="badge-btn"
                        title="Click to toggle grouping"
                        aria-label="Toggle rhythmic grouping"
                        onClick={toggleGrouping}
                    >
                        {grouping
                            ? grouping.join('+')
                            : /** @type {any} */ (TIME_SIGNATURES)[timeSignature]?.grouping.join(
                                  '+',
                              ) || '3+2'}
                    </button>
                </div>
            </div>

            <select
                id="keySelect"
                value={arrangerKey}
                onChange={handleKeyChange}
                aria-label="Select Key"
            >
                {keys.map((/** @type {any} */ k) => (
                    <option key={k} value={k}>
                        {formatUnicodeSymbols(k)}
                        {isMinor ? 'm' : ''}
                    </option>
                ))}
            </select>

            <button
                id="relKeyBtn"
                title="Relative Key (Major/Minor)"
                class="header-btn rel-key-btn"
                aria-label="Relative Key Toggle"
                onClick={() => {
                    switchToRelativeKey();
                    dispatch('REL_KEY_TOGGLE');
                }}
            >
                {isMinor ? 'min' : 'maj'}
            </button>

            {showTranspose && (
                <>
                    <button
                        id="transDownBtn"
                        title="Transpose Down"
                        class="header-btn"
                        aria-label="Transpose Down"
                        onClick={() => {
                            transposeKey(-1);
                            dispatch('TRANSPOSE');
                        }}
                    >
                        ♭
                    </button>

                    <button
                        id="transUpBtn"
                        title="Transpose Up"
                        class="header-btn"
                        aria-label="Transpose Up"
                        onClick={() => {
                            transposeKey(1);
                            dispatch('TRANSPOSE');
                        }}
                    >
                        ♯
                    </button>
                </>
            )}
        </div>
    );
}
