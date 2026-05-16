import { switchToRelativeKey, transposeKey, validateAndAnalyze } from '../arranger-controller.js';
import { TIME_SIGNATURES } from '../config.js';
import { flushBuffers, loadDrumPreset } from '../instrument-controller.js';
import { saveCurrentState } from '../persistence.js';
import { arranger } from '../state.js';
import { ACTIONS } from '../types.js';
import { useDispatch, useEnsembleState } from '../ui-bridge.js';
import { formatUnicodeSymbols } from '../utils.js';
import { syncWorker } from '../worker-client.js';
import { ToolbarPopover } from './ToolbarPopover.jsx';

const GROUPING_OPTIONS: Record<string, number[][]> = {
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

function formatKeySummary(key: string, isMinor: boolean) {
    return `${formatUnicodeSymbols(key)} ${isMinor ? 'min' : 'maj'}`;
}

function getRelativeKeyActionLabel(isMinor: boolean) {
    return isMinor ? 'Relative major' : 'Relative minor';
}

function updateArrangerKey(newKey: string, dispatch: (action: any, ...args: any[]) => void) {
    arranger.key = newKey;
    validateAndAnalyze();
    saveCurrentState();
    dispatch(ACTIONS.KEY_CHANGE);
}

function updateTimeSignature(
    timeSignature: string,
    lastDrumPreset: string | null,
    dispatch: (action: any, ...args: any[]) => void,
) {
    arranger.timeSignature = timeSignature;
    arranger.grouping = null;
    if (lastDrumPreset) {
        loadDrumPreset(lastDrumPreset);
    }
    validateAndAnalyze();
    saveCurrentState();
    dispatch(ACTIONS.TIME_SIG_CHANGE);
}

function cycleGrouping(timeSignature: string, dispatch: (action: any, ...args: any[]) => void) {
    const options = GROUPING_OPTIONS[timeSignature];
    if (!options) {
        return;
    }

    const current = arranger.grouping || (TIME_SIGNATURES as any)[timeSignature].grouping;
    const currentIndex = options.findIndex((opt) => opt.join('+') === current.join('+'));
    const nextIndex = (currentIndex + 1) % options.length;

    arranger.grouping = options[nextIndex];
    flushBuffers();
    syncWorker();
    saveCurrentState();
    dispatch(ACTIONS.GROUPING_CHANGE);
}

export function TimeSignatureControl() {
    const dispatch = useDispatch();
    const { timeSignature, grouping, lastDrumPreset } = useEnsembleState((s) => ({
        timeSignature: s.arranger.timeSignature,
        grouping: s.arranger.grouping,
        lastDrumPreset: s.groove.lastDrumPreset,
    }));
    const supportsGrouping = Boolean(GROUPING_OPTIONS[timeSignature]);

    return (
        <div class="time-sig-group">
            <select
                id="timeSigSelect"
                value={timeSignature}
                onChange={(event) =>
                    updateTimeSignature(
                        (event.target as HTMLSelectElement).value,
                        lastDrumPreset,
                        dispatch,
                    )
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
                        : (TIME_SIGNATURES as any)[timeSignature]?.grouping.join('+') || '3+2'}
                </button>
            </div>
        </div>
    );
}

interface KeySignatureMenuControlProps {
    showTranspose?: boolean;
}

export function KeySignatureMenuControl({
    showTranspose = true,
}: KeySignatureMenuControlProps = {}) {
    const dispatch = useDispatch();
    const { arrangerKey, isMinor } = useEnsembleState((s) => ({
        arrangerKey: s.arranger.key,
        isMinor: s.arranger.isMinor,
    }));

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
                    onChange={(event) =>
                        updateArrangerKey((event.target as HTMLSelectElement).value, dispatch)
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
                        dispatch(ACTIONS.REL_KEY_TOGGLE);
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
                                dispatch(ACTIONS.TRANSPOSE);
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
                                dispatch(ACTIONS.TRANSPOSE);
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

interface KeySignatureControlsProps {
    showTranspose?: boolean;
}

export function KeySignatureControls({ showTranspose = true }: KeySignatureControlsProps = {}) {
    return (
        <div class="key-controls">
            <TimeSignatureControl />
            <KeySignatureMenuControl showTranspose={showTranspose} />
        </div>
    );
}
