import { switchToRelativeKey, transposeKey, validateAndAnalyze } from '../arranger-controller.js';
import { TIME_SIGNATURES } from '../config.js';
import { getCanonicalMeters } from '../data/smart-genres.js';
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
    dispatch(ACTIONS.SET_KEY, newKey);
    validateAndAnalyze();
    saveCurrentState();
}

function updateTimeSignature(
    timeSignature: string,
    lastDrumPreset: string | null,
    dispatch: (action: any, ...args: any[]) => void,
) {
    dispatch(ACTIONS.SET_TIME_SIGNATURE, timeSignature);
    dispatch(ACTIONS.SET_GROUPING, null);
    if (lastDrumPreset) {
        loadDrumPreset(lastDrumPreset);
    }
    validateAndAnalyze();
    saveCurrentState();
}

function cycleGrouping(timeSignature: string, dispatch: (action: any, ...args: any[]) => void) {
    const options = GROUPING_OPTIONS[timeSignature];
    if (!options) {
        return;
    }

    const current = arranger.grouping || TIME_SIGNATURES[timeSignature].grouping;
    const currentIndex = options.findIndex((opt) => opt.join('+') === current.join('+'));
    const nextIndex = (currentIndex + 1) % options.length;

    dispatch(ACTIONS.SET_GROUPING, options[nextIndex]);
    flushBuffers();
    syncWorker();
    saveCurrentState();
}

export function TimeSignatureControl() {
    const dispatch = useDispatch();
    const { timeSignature, grouping, lastDrumPreset, genreFeel } = useEnsembleState((s) => ({
        timeSignature: s.arranger.timeSignature,
        grouping: s.arranger.grouping,
        lastDrumPreset: s.groove.lastDrumPreset,
        genreFeel: s.groove.genreFeel,
    }));
    const supportsGrouping = Boolean(GROUPING_OPTIONS[timeSignature]);
    // Soft hint (S10): mark the meters idiomatic for the current genre with ★.
    // Non-blocking — every meter stays selectable; this only highlights the
    // canonical pairings so users know which are genre-authentic.
    const canonicalMeters = getCanonicalMeters(genreFeel);

    return (
        <ToolbarPopover
            buttonId="timeSigBtn"
            panelId="timeSigPanel"
            triggerAriaLabel="Open time signature controls"
            panelLabel="Time signature"
            triggerClassName="workspace-arranger-toolbar-trigger workspace-arranger-toolbar-trigger--time"
            panelClassName="workspace-toolbar-panel--time"
            triggerContent={
                <>
                    <span class="workspace-toolbar-trigger-copy">
                        <span class="workspace-toolbar-trigger-label">Time</span>
                        <span class="workspace-toolbar-trigger-value">{timeSignature}</span>
                    </span>
                    <span class="workspace-toolbar-trigger-caret" aria-hidden="true">
                        ▾
                    </span>
                </>
            }
        >
            <div class="workspace-toolbar-panel__section">
                <span class="workspace-toolbar-panel__label" id="timeSigLabel">
                    Meter
                </span>
                <div class="meter-grid" role="group" aria-labelledby="timeSigLabel">
                    {TIME_SIGNATURE_OPTIONS.map((timeSignatureOption) => {
                        const isActive = timeSignatureOption === timeSignature;
                        // ★ marks the meters idiomatic for the current genre.
                        const isIdiomatic = canonicalMeters.includes(timeSignatureOption);
                        return (
                            <button
                                key={timeSignatureOption}
                                type="button"
                                class={`meter-chip${isActive ? ' is-active' : ''}`}
                                data-meter={timeSignatureOption}
                                aria-pressed={isActive}
                                title={
                                    isIdiomatic && genreFeel
                                        ? `Idiomatic for ${genreFeel}`
                                        : undefined
                                }
                                onClick={() =>
                                    updateTimeSignature(
                                        timeSignatureOption,
                                        lastDrumPreset,
                                        dispatch,
                                    )
                                }
                            >
                                {timeSignatureOption}
                                {isIdiomatic ? (
                                    <span class="meter-chip__star" aria-hidden="true">
                                        ★
                                    </span>
                                ) : null}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div
                id="groupingToggle"
                class="workspace-toolbar-panel__section grouping-toggle"
                hidden={!supportsGrouping}
            >
                <span class="workspace-toolbar-panel__label">Grouping</span>
                <button
                    id="groupingLabel"
                    type="button"
                    class="header-btn workspace-toolbar-panel__button workspace-toolbar-panel__button--wide"
                    title="Click to toggle grouping"
                    aria-label="Toggle rhythmic grouping"
                    onClick={() => cycleGrouping(timeSignature, dispatch)}
                >
                    {grouping
                        ? grouping.join('+')
                        : TIME_SIGNATURES[timeSignature]?.grouping.join('+') || '3+2'}
                </button>
            </div>
        </ToolbarPopover>
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
