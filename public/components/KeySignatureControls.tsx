import { TIME_SIGNATURES } from '../config.js';
import {
    refreshArrangerUI,
    setKeyCenter,
    switchToRelativeKey,
    transposeKey,
} from '../controllers/arranger-controller.js';
import { loadDrumPreset } from '../controllers/instrument-controller.js';
import { getCanonicalMeters } from '../data/smart-genres.js';
import { formatUnicodeSymbols } from '../sanitize.js';
import { arranger } from '../state.js';
import { ACTIONS } from '../types.js';
import { useDispatch, useEnsembleState } from '../ui-bridge.js';
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
    // Canonical resync — pushes the new meter/grouping + recomputed arranger maps
    // to the worker (no delta case covers SET_TIME_SIGNATURE, so a full flush is
    // required for a mid-playback meter change to take effect). #1128 replaced a
    // hand-copied tail that ran flushBuffers() BEFORE syncWorker() — the
    // pre-#1120 buggy order that was live here; refreshArrangerUI() fixes it.
    refreshArrangerUI();
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
    refreshArrangerUI();
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
    // No dispatch here by design (#1166): every control in this component routes through an
    // arranger-controller helper (switchToRelativeKey / transposeKey) that owns its own state
    // writes. The trailing REL_KEY_TOGGLE / TRANSPOSE dispatches this used to fire were inert.
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
                    onChange={(event) => setKeyCenter((event.target as HTMLSelectElement).value)}
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
