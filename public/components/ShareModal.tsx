import { useRef, useState } from 'preact/hooks';
import {
    downloadExportResult,
    renderCurrentSessionToWav,
    renderStemsToWav,
    type StemInstrument,
} from '../export/audio-export.js';
import { exportToMidi } from '../export/midi-export.js';
import { generateShareUrl } from '../export/sharing.js';
import { dispatch, getState } from '../state.js';
import { track } from '../telemetry.js';
import { ACTIONS } from '../types.js';
import { useDispatch, useEnsembleState } from '../ui-bridge.js';
import { Icon } from './Icon.jsx';
import { SettingGroup, SettingRow, Stepper, Toggle } from './UIControls.jsx';
import { useModalA11y } from './use-modal-a11y.js';

const STEM_LABELS: Record<StemInstrument, string> = {
    soloist: 'Soloist',
    bass: 'Bass',
    chords: 'Chords',
    harmony: 'Harmony',
    drums: 'Drums',
};

export function ShareModal() {
    const isOpen = useEnsembleState((s) => s.playback.modals.share);
    const [isExporting, setIsExporting] = useState(false);
    const [isRenderingAudio, setIsRenderingAudio] = useState(false);
    const [isExportingStems, setIsExportingStems] = useState(false);
    const [stemProgress, setStemProgress] = useState<{
        instrument: StemInstrument;
        index: number;
        total: number;
    } | null>(null);

    const [includeSolo, setIncludeSolo] = useState(true);
    const [includeBass, setIncludeBass] = useState(true);
    const [includeChords, setIncludeChords] = useState(true);
    const [includeHarmony, setIncludeHarmony] = useState(true);
    const [includeDrums, setIncludeDrums] = useState(true);

    const [numLoops, setNumLoops] = useState(1);
    const [addEnding, setAddEnding] = useState(true);

    // Opt-in per-link: when on, the shared link lands on the AuditionOverlay
    // (VISION.md teacher→student flow — the band ready to play in one tap).
    // Defaults OFF so the plain-editor landing stays the unsurprising default
    // (Brandon's call at #1126 review). Ignored by MIDI/WAV export; only
    // `generateShareUrl` reads it (appends `autoplay=1`).
    const [autoplayOnOpen, setAutoplayOnOpen] = useState(false);

    const [filename, setFilename] = useState('My Song');

    const overlayRef = useRef<HTMLDivElement | null>(null);
    const dispatchAction = useDispatch();

    const { playback, arranger } = getState();
    const measures = arranger.progression.length;
    const bpm = playback.bpm;
    const totalSeconds = (numLoops * measures * 4 * 60) / bpm;
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    const durationDisplay = `~${mins}:${secs.toString().padStart(2, '0')}`;

    const closeModal = () => {
        dispatchAction(ACTIONS.SET_MODAL_OPEN, { modal: 'share', open: false });
    };

    useModalA11y(overlayRef, isOpen, closeModal, 'Share and export');

    const getExportOptions = () => ({
        includeSolo,
        includeBass,
        includeChords,
        includeHarmony,
        includeDrums,
        numLoops,
        addEnding,
        autoplay: autoplayOnOpen,
        filename: filename.replace(/[^a-zA-Z0-9\s\-_()]/g, '').trim() || 'My Song',
    });

    const handleCopyLink = () => {
        try {
            const url = generateShareUrl(getExportOptions());
            navigator.clipboard
                .writeText(url)
                .then(() => {
                    track('share_copied', { audition: autoplayOnOpen });
                    const display = url.length > 60 ? `${url.slice(0, 57)}…` : url;
                    dispatch(ACTIONS.SHOW_TOAST, {
                        message: `Copied: ${display}`,
                        type: 'success',
                    });
                })
                .catch(() => {
                    dispatch(ACTIONS.SHOW_TOAST, {
                        message: 'Failed to copy link. Try long-pressing the URL bar.',
                        type: 'error',
                    });
                });
        } catch (e) {
            console.error('Link generation failed:', e);
        }
    };

    const handleNativeShare = async () => {
        const url = generateShareUrl(getExportOptions());
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Ensemble Arrangement',
                    text: 'Check out this arrangement I made in Ensemble!',
                    url: url,
                });
                track('share_sent', { audition: autoplayOnOpen });
            } catch (err) {
                console.warn('Share failed or cancelled:', err);
            }
        } else {
            handleCopyLink();
        }
    };

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const options = getExportOptions();
            await exportToMidi(options);
            track('export_midi');
            dispatch(ACTIONS.SHOW_TOAST, {
                message: 'MIDI Export complete!',
                type: 'success',
            });
            closeModal();
        } catch (err) {
            console.error('Export failed:', err);
            dispatch(ACTIONS.SHOW_TOAST, {
                message: 'Export failed.',
                type: 'error',
            });
        } finally {
            setIsExporting(false);
        }
    };

    const handleExportAudio = async () => {
        setIsRenderingAudio(true);
        try {
            const options = getExportOptions();
            const result = await renderCurrentSessionToWav({
                loops: options.numLoops,
                filename: options.filename,
            });
            downloadExportResult(result);
            track('export_wav', { stems: false });
            const secs = Math.round(result.durationSeconds);
            dispatch(ACTIONS.SHOW_TOAST, {
                message: `WAV ready — ${secs}s, ${Math.round(result.blob.size / 1024)} KB`,
                type: 'success',
            });
        } catch (err) {
            console.error('Audio export failed:', err);
            dispatch(ACTIONS.SHOW_TOAST, {
                message: 'Audio export failed.',
                type: 'error',
            });
        } finally {
            setIsRenderingAudio(false);
        }
    };

    const getSelectedStemInstruments = (): StemInstrument[] => {
        const selection: Array<[boolean, StemInstrument]> = [
            [includeSolo, 'soloist'],
            [includeBass, 'bass'],
            [includeChords, 'chords'],
            [includeHarmony, 'harmony'],
            [includeDrums, 'drums'],
        ];
        return selection.filter(([checked]) => checked).map(([, instrument]) => instrument);
    };

    const handleExportStems = async () => {
        const instruments = getSelectedStemInstruments();
        if (instruments.length === 0) {
            dispatch(ACTIONS.SHOW_TOAST, {
                message: 'Select at least one instrument above to export stems.',
                type: 'error',
            });
            return;
        }

        setIsExportingStems(true);
        setStemProgress({ instrument: instruments[0], index: 0, total: instruments.length });
        try {
            const options = getExportOptions();
            const results = await renderStemsToWav(instruments, {
                loops: options.numLoops,
                filename: options.filename,
                onStemProgress: (progress) => setStemProgress(progress),
            });
            for (const result of results) {
                downloadExportResult(result);
            }
            track('export_wav', { stems: true });
            dispatch(ACTIONS.SHOW_TOAST, {
                message: `${results.length} stem${results.length === 1 ? '' : 's'} exported`,
                type: 'success',
            });
        } catch (err) {
            console.error('Stem export failed:', err);
            dispatch(ACTIONS.SHOW_TOAST, {
                message: 'Stem export failed.',
                type: 'error',
            });
        } finally {
            setIsExportingStems(false);
            setStemProgress(null);
        }
    };

    if (!isOpen) {
        return null;
    }

    const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share;

    return (
        <div
            id="shareOverlay"
            ref={overlayRef}
            class={`modal-overlay ${isOpen ? 'active' : ''}`}
            onClick={(e: MouseEvent) => {
                const target = e.target as HTMLElement;
                if (target.id === 'shareOverlay') {
                    closeModal();
                }
            }}
        >
            <div
                class="modal-content settings-content"
                onClick={(e: MouseEvent) => e.stopPropagation()}
            >
                <div class="modal-header-shared">
                    <h2>Share & Export</h2>
                    <button
                        id="closeShareBtn"
                        class="close-btn"
                        aria-label="Close"
                        onClick={closeModal}
                    >
                        &times;
                    </button>
                </div>

                <div class="modal-body share-modal-body">
                    <SettingGroup title="1. Configure Content">
                        <div class="instrument-selection-grid">
                            <div class="instrument-toggle-row">
                                <div class="instrument-toggle-container">
                                    <Toggle
                                        checked={includeSolo}
                                        onChange={setIncludeSolo}
                                        ariaLabel="Include Soloist"
                                    />
                                </div>
                                <span class="instrument-toggle-label">
                                    <Icon name="soloist" /> Soloist
                                </span>
                            </div>
                            <div class="instrument-toggle-row">
                                <div class="instrument-toggle-container">
                                    <Toggle
                                        checked={includeBass}
                                        onChange={setIncludeBass}
                                        ariaLabel="Include Bass"
                                    />
                                </div>
                                <span class="instrument-toggle-label">
                                    <Icon name="bass" /> Bass
                                </span>
                            </div>
                            <div class="instrument-toggle-row">
                                <div class="instrument-toggle-container">
                                    <Toggle
                                        checked={includeChords}
                                        onChange={setIncludeChords}
                                        ariaLabel="Include Chords"
                                    />
                                </div>
                                <span class="instrument-toggle-label">
                                    <Icon name="chords" /> Chords
                                </span>
                            </div>
                            <div class="instrument-toggle-row">
                                <div class="instrument-toggle-container">
                                    <Toggle
                                        checked={includeHarmony}
                                        onChange={setIncludeHarmony}
                                        ariaLabel="Include Harmony"
                                    />
                                </div>
                                <span class="instrument-toggle-label">
                                    <Icon name="harmony" /> Harmony
                                </span>
                            </div>
                            <div class="instrument-toggle-row">
                                <div class="instrument-toggle-container">
                                    <Toggle
                                        checked={includeDrums}
                                        onChange={setIncludeDrums}
                                        ariaLabel="Include Drums"
                                    />
                                </div>
                                <span class="instrument-toggle-label">
                                    <Icon name="drums" /> Drums
                                </span>
                            </div>
                        </div>

                        <div class="flex-col">
                            <SettingRow
                                label="Loops"
                                description="Number of times to repeat the arrangement"
                                valueDisplay={
                                    <span class="share-duration-value">{durationDisplay}</span>
                                }
                            >
                                <Stepper
                                    value={numLoops}
                                    min={1}
                                    max={64}
                                    onDecrement={() => setNumLoops(Math.max(1, numLoops - 1))}
                                    onIncrement={() => setNumLoops(Math.min(64, numLoops + 1))}
                                />
                            </SettingRow>

                            <SettingRow
                                label="Resolution Ending"
                                description="Add a final chord to resolve the song"
                            >
                                <Toggle
                                    checked={addEnding}
                                    onChange={setAddEnding}
                                    ariaLabel="Add resolution ending"
                                />
                            </SettingRow>
                        </div>
                    </SettingGroup>

                    <div class="settings-section settings-section--spaced settings-section--borderless">
                        <h3>2. Select Destination</h3>
                        <div class="flex-col share-destination-stack">
                            <div class="help-card share-card">
                                <h4 class="share-card-title">
                                    <Icon name="link" /> Cloud Link
                                </h4>
                                <p class="text-mini-muted share-card-copy">
                                    Generates a unique URL containing your exact mixer levels and
                                    instrument choices.
                                </p>
                                <SettingRow
                                    label="Start playing on open"
                                    description="The link lands with the band ready — one tap and it plays."
                                >
                                    <Toggle
                                        id="autoplayShareToggle"
                                        checked={autoplayOnOpen}
                                        onChange={setAutoplayOnOpen}
                                        ariaLabel="Start playing on open"
                                    />
                                </SettingRow>
                                <div class="flex-row share-actions">
                                    <button
                                        class="primary-btn flex-1 share-action-btn"
                                        onClick={handleCopyLink}
                                    >
                                        Copy Link
                                    </button>
                                    {canNativeShare && (
                                        <button
                                            class="secondary-btn share-action-btn"
                                            onClick={handleNativeShare}
                                        >
                                            <Icon name="upload" /> Share
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div class="help-card share-card share-card--accent">
                                <h4 class="share-card-title">
                                    <Icon name="note" /> DAW MIDI File
                                </h4>
                                <p class="text-mini-muted share-card-copy">
                                    Download a multi-track MIDI file for use in Logic, Ableton, or
                                    other DAWs.
                                </p>
                                <div class="flex-col">
                                    <input
                                        id="exportFilenameInput"
                                        type="text"
                                        value={filename}
                                        onInput={(e: Event) => {
                                            setFilename((e.target as HTMLInputElement).value);
                                        }}
                                        placeholder="Filename..."
                                        maxLength={64}
                                        class="w-full share-filename-input"
                                    />
                                    <button
                                        class="secondary-btn w-full share-action-btn share-action-btn--accent"
                                        onClick={handleExport}
                                        disabled={isExporting}
                                    >
                                        {isExporting ? 'Generating...' : 'Download .mid'}
                                    </button>
                                </div>
                            </div>

                            <div class="help-card share-card share-card--accent">
                                <h4 class="share-card-title">
                                    <Icon name="headphones" /> Audio File (WAV)
                                </h4>
                                <p class="text-mini-muted share-card-copy">
                                    Render the live arrangement to a stereo WAV — useful for sharing
                                    a take, posting a clip, or feeding into another tool.
                                </p>
                                <div class="flex-col">
                                    <button
                                        class="secondary-btn w-full share-action-btn share-action-btn--accent"
                                        onClick={handleExportAudio}
                                        disabled={isRenderingAudio}
                                        data-testid="export-audio-btn"
                                    >
                                        {isRenderingAudio ? 'Rendering…' : 'Download .wav'}
                                    </button>
                                </div>
                            </div>

                            <div class="help-card share-card share-card--accent">
                                <h4 class="share-card-title">
                                    <Icon name="headphones" /> Stems (WAV per instrument)
                                </h4>
                                <p class="text-mini-muted share-card-copy">
                                    Renders one WAV per checked instrument above, each soloed — drop
                                    straight into a DAW mix.
                                </p>
                                <div class="flex-col">
                                    <button
                                        class="secondary-btn w-full share-action-btn share-action-btn--accent"
                                        onClick={handleExportStems}
                                        disabled={isExportingStems}
                                        data-testid="export-stems-btn"
                                    >
                                        {isExportingStems && stemProgress
                                            ? `Rendering ${STEM_LABELS[stemProgress.instrument]} (${stemProgress.index + 1}/${stemProgress.total})…`
                                            : 'Export Stems'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
