import { switchToRelativeKey, transposeKey, validateAndAnalyze } from '../arranger-controller.js';
import { TIME_SIGNATURES } from '../config.js';
import { flushBuffers, loadDrumPreset } from '../instrument-controller.js';
import { saveCurrentState } from '../persistence.js';
import { ACTIONS } from '../types.js';
import { useDispatch, useEnsembleState } from '../ui-bridge.js';
import { formatUnicodeSymbols } from '../utils.js';
import { syncWorker } from '../worker-client.js';
import { ToolbarPopover } from './ToolbarPopover.jsx';

/** @type {Record<string, number[][]>} */
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

const KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const TIME_SIGNATURE_OPTIONS = ['4/4', '3/4', '2/4', '5/4', '6/8', '7/8', '7/4', '12/8'];

/**
 * @typedef {Object} KeySignatureControlsProps
 * @property {boolean} [showMaximize]
 * @property {boolean} [showTranspose]
 */

/**
 * @param {string} key
 * @param {boolean} isMinor
 */
function formatKeySummary(key, isMinor) {
    return `${formatUnicodeSymbols(key)} ${isMinor ? 'min' : 'maj'}`;
}

/** @param {boolean} isMinor */
function getRelativeKeyActionLabel(isMinor) {
    return isMinor ? 'Relative major' : 'Relative minor';
}

/**
 * @param {string} newKey
 * @param {(action: string) => void} dispatch
 */
function updateArrangerKey(newKey, dispatch) {
    import('../state.js').then(({ arranger }) => {
        arranger.key = newKey;
        validateAndAnalyze();
        saveCurrentState();
        dispatch('KEY_CHANGE');
    });
}

/**
 * @param {string} timeSignature
 * @param {string | null} lastDrumPreset
 * @param {(action: string) => void} dispatch
 */
function updateTimeSignature(timeSignature, lastDrumPreset, dispatch) {
    import('../state.js').then(({ arranger }) => {
        arranger.timeSignature = timeSignature;
        arranger.grouping = null;
        if (lastDrumPreset) {
            loadDrumPreset(lastDrumPreset);
        }
        validateAndAnalyze();
        saveCurrentState();
        dispatch('TIME_SIG_CHANGE');
    });
}

/**
 * @param {string} timeSignature
 * @param {(action: string) => void} dispatch
 */
function cycleGrouping(timeSignature, dispatch) {
    const options = /** @type {number[][] | undefined} */ (GROUPING_OPTIONS[timeSignature]);
    if (!options) {
        return;
    }

    import('../state.js').then(({ arranger }) => {
        const current =
            arranger.grouping || /** @type {any} */ (TIME_SIGNATURES)[timeSignature].grouping;
        const currentIndex = options.findIndex((opt) => opt.join('+') === current.join('+'));
        const nextIndex = (currentIndex + 1) % options.length;

        arranger.grouping = options[nextIndex];
        flushBuffers();
        syncWorker();
        saveCurrentState();
        dispatch('GROUPING_CHANGE');
    });
}

export function MaximizeChordButton({ className = '' } = {}) {
    const dispatch = useDispatch();
    const { isMaximized } = useEnsembleState(
        (/** @type {import('../types.js').EnsembleState} */ s) => ({
            isMaximized: s.vizState.isMaximized,
        }),
    );

    return (
        <button
            id="maximizeChordBtn"
            type="button"
            title={isMaximized ? 'Exit Maximize' : 'Maximize'}
            class={['header-btn', className, isMaximized ? 'active' : ''].filter(Boolean).join(' ')}
            aria-label={isMaximized ? 'Exit Maximize' : 'Maximize Chords'}
            onClick={() => dispatch(ACTIONS.TOGGLE_MAXIMIZED_CHORDS)}
        >
            {isMaximized ? '✕' : '⛶'}
        </button>
    );
}

export function TimeSignatureControl() {
    const dispatch = useDispatch();
    const { timeSignature, grouping, lastDrumPreset } = useEnsembleState(
        (/** @type {import('../types.js').EnsembleState} */ s) => ({
            timeSignature: s.arranger.timeSignature,
            grouping: s.arranger.grouping,
            lastDrumPreset: s.groove.lastDrumPreset,
        }),
    );
    const supportsGrouping = Boolean(GROUPING_OPTIONS[timeSignature]);

    return (
        <div class="time-sig-group">
            <select
                id="timeSigSelect"
                value={timeSignature}
                onChange={(/** @type {any} */ event) =>
                    updateTimeSignature(event.target.value, lastDrumPreset, dispatch)
                }
                aria-label="Time Signature"
            >
                {TIME_SIGNATURE_OPTIONS.map((timeSignatureOption) => (
                    <option key={timeSignatureOption} value={timeSignatureOption}>
                        {timeSignatureOption}
                    </option>
                ))}
            </select>
            <div
                id="groupingToggle"
                style={{
                    display: supportsGrouping ? 'flex' : 'none',
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
                    onClick={() => cycleGrouping(timeSignature, dispatch)}
                >
                    {grouping
                        ? grouping.join('+')
                        : /** @type {any} */ (TIME_SIGNATURES)[timeSignature]?.grouping.join('+') ||
                          '3+2'}
                </button>
            </div>
        </div>
    );
}

/** @param {{ showTranspose?: boolean }} [props] */
export function KeySignatureMenuControl({ showTranspose = true } = {}) {
    const dispatch = useDispatch();
    const { arrangerKey, isMinor } = useEnsembleState(
        (/** @type {import('../types.js').EnsembleState} */ s) => ({
            arrangerKey: s.arranger.key,
            isMinor: s.arranger.isMinor,
        }),
    );

    return (
        <ToolbarPopover
            buttonId="keyMenuBtn"
            panelId="arrangerKeyPanel"
            triggerAriaLabel="Open key controls"
            panelLabel="Key controls"
            triggerClassName="workspace-arranger-toolbar-trigger workspace-arranger-toolbar-trigger--key"
            panelClassName="workspace-toolbar-panel--key"
            triggerContent={
                <>
                    <span class="workspace-toolbar-trigger-copy">
                        <span class="workspace-toolbar-trigger-label">Key</span>
                        <span class="workspace-toolbar-trigger-value">
                            {formatKeySummary(arrangerKey, isMinor)}
                        </span>
                    </span>
                    <span class="workspace-toolbar-trigger-caret" aria-hidden="true">
                        ▾
                    </span>
                </>
            }
        >
            <div class="workspace-toolbar-panel__section">
                <label class="workspace-toolbar-panel__label" htmlFor="keySelect">
                    Key center
                </label>
                <select
                    id="keySelect"
                    value={arrangerKey}
                    onChange={(/** @type {any} */ event) =>
                        updateArrangerKey(event.target.value, dispatch)
                    }
                    aria-label="Select Key"
                >
                    {KEYS.map((key) => (
                        <option key={key} value={key}>
                            {formatUnicodeSymbols(key)}
                            {isMinor ? 'm' : ''}
                        </option>
                    ))}
                </select>
            </div>

            <div class="workspace-toolbar-panel__section">
                <span class="workspace-toolbar-panel__label">Relative move</span>
                <button
                    id="relKeyBtn"
                    type="button"
                    title={getRelativeKeyActionLabel(isMinor)}
                    class="header-btn workspace-toolbar-panel__button workspace-toolbar-panel__button--wide"
                    aria-label={getRelativeKeyActionLabel(isMinor)}
                    onClick={() => {
                        switchToRelativeKey();
                        dispatch('REL_KEY_TOGGLE');
                    }}
                >
                    {getRelativeKeyActionLabel(isMinor)}
                </button>
            </div>

            {showTranspose && (
                <div class="workspace-toolbar-panel__section">
                    <span class="workspace-toolbar-panel__label">Transpose</span>
                    <div class="workspace-toolbar-panel__row">
                        <button
                            id="transDownBtn"
                            type="button"
                            title="Transpose Down"
                            class="header-btn workspace-toolbar-panel__button"
                            aria-label="Transpose Down"
                            onClick={() => {
                                transposeKey(-1);
                                dispatch('TRANSPOSE');
                            }}
                        >
                            ♭ Down
                        </button>

                        <button
                            id="transUpBtn"
                            type="button"
                            title="Transpose Up"
                            class="header-btn workspace-toolbar-panel__button"
                            aria-label="Transpose Up"
                            onClick={() => {
                                transposeKey(1);
                                dispatch('TRANSPOSE');
                            }}
                        >
                            ♯ Up
                        </button>
                    </div>
                </div>
            )}
        </ToolbarPopover>
    );
}

/** @param {KeySignatureControlsProps} [props] */
export function KeySignatureControls({ showMaximize = true, showTranspose = true } = {}) {
    return (
        <div class="key-controls">
            <TimeSignatureControl />
            <KeySignatureMenuControl showTranspose={showTranspose} />
            {showMaximize && <MaximizeChordButton />}
        </div>
    );
}
