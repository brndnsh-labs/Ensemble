import { Fragment } from 'preact';
import React from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { clearChordPresetHighlight, refreshArrangerUI } from '../arranger-controller.js';
import { SONG_TEMPLATES } from '../data/song-templates.js';
import { pushHistory } from '../history.js';
import { generateSong } from '../song-generator.js';
import { getState } from '../state.js';
import { ACTIONS } from '../types.js';
import { showToast } from '../ui.js';
import { useDispatch, useEnsembleState } from '../ui-bridge.js';
import { generateId } from '../utils.js';
import { ButtonGroup, SettingGroup, SettingRow, Toggle } from './UIControls.jsx';

export function GenerateSongModal() {
    const { arranger } = getState();
    const dispatch = useDispatch();
    const isOpen = useEnsembleState(
        (/** @type {import('../types.js').EnsembleState} */ s) => s.playback.modals.generateSong,
    );
    const lastInteractedId = useEnsembleState(
        (/** @type {import('../types.js').EnsembleState} */ s) =>
            s.arranger.lastInteractedSectionId,
    );
    const sections = useEnsembleState(
        (/** @type {import('../types.js').EnsembleState} */ s) => s.arranger.sections,
    );
    const isDirty = useEnsembleState(
        (/** @type {import('../types.js').EnsembleState} */ s) => s.arranger.isDirty,
    );

    /** @type {import('preact/hooks').MutableRef<HTMLDivElement|null>} */
    const overlayRef = useRef(null);

    // Internal component state for form values
    const [activeTab, setActiveTab] = useState('templates');
    const [key, setKey] = useState(arranger.key);
    const [isMinor, setIsMinor] = useState(arranger.isMinor);
    const [timeSignature, setTimeSignature] = useState(arranger.timeSignature);
    const [structure, setStructure] = useState('pop');
    const [complexity, setComplexity] = useState(0.3);
    const [seedMode, setSeedMode] = useState('none');
    const [selectedSectionId, setSelectedSectionId] = useState(
        lastInteractedId || (sections?.[0]?.id ?? ''),
    );
    const [manualSeedValue, setManualSeedValue] = useState('');
    const [seedType, setSeedType] = useState('Verse');
    const [hasGenerated, setHasGenerated] = useState(false);
    const [confirmTemplate, setConfirmTemplate] = useState(null);
    const [confirmGen, setConfirmGen] = useState(false);

    const prevOpenRef = useRef(false);

    useEffect(() => {
        if (isOpen && !prevOpenRef.current) {
            setHasGenerated(false);

            // Focus first element
            if (overlayRef.current) {
                const focusable = /** @type {HTMLElement} */ (
                    overlayRef.current.querySelector(
                        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
                    )
                );
                if (focusable) {
                    setTimeout(() => focusable.focus(), 50);
                }
            }
        }
        prevOpenRef.current = isOpen;
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) {
            setKey(arranger.key);
            setIsMinor(arranger.isMinor);
            setTimeSignature(arranger.timeSignature);
            setSelectedSectionId(lastInteractedId || (sections?.[0]?.id ?? ''));
        }
    }, [
        isOpen,
        arranger.key,
        arranger.isMinor,
        arranger.timeSignature,
        lastInteractedId,
        sections,
    ]);

    const close = () => {
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'generateSong', open: false });
    };

    const applyTemplate = (/** @type {any} */ template) => {
        if (confirmTemplate !== template.name) {
            setConfirmTemplate(template.name);
            return;
        }
        setConfirmTemplate(null);

        try {
            pushHistory();

            const newSections = template.sections.map((/** @type {any} */ s) => ({
                id: generateId(),
                label: s.label,
                value: s.value,
                repeat: s.repeat || 1,
            }));

            dispatch(ACTIONS.LOAD_TEMPLATE, {
                sections: newSections,
                isMinor: template.isMinor,
            });

            clearChordPresetHighlight();
            refreshArrangerUI();

            setTimeout(() => {
                showToast('✨ Template Applied!');
                setHasGenerated(true);
            }, 50);
        } catch (/** @type {any} */ e) {
            if (e.name === 'TypeError' && e.message.includes('currentTime')) {
                // Audio not initialized, ignore this error as it's expected if no user gesture yet
                setHasGenerated(true);
                return;
            }
            console.error('Template application failed:', e);
            showToast('Template application failed.');
        }
    };

    const handleConfirm = () => {
        if (hasGenerated) {
            close();
            return;
        }

        if (isDirty && sections.length > 1) {
            if (!confirmGen) {
                setConfirmGen(true);
                return;
            }
        }
        setConfirmGen(false);

        try {
            let seed = null;
            if (seedMode === 'existing') {
                const section =
                    sections.find((/** @type {any} */ s) => s.id === selectedSectionId) ||
                    sections[0];
                if (section?.value) {
                    seed = {
                        type: seedType,
                        value: section.value,
                    };
                }
            } else if (seedMode === 'manual' && manualSeedValue.trim() !== '') {
                seed = {
                    type: seedType,
                    value: manualSeedValue.trim(),
                };
            }

            const newSections = generateSong({
                key,
                isMinor,
                timeSignature,
                structure,
                complexity,
                seed,
            });

            pushHistory();

            dispatch(ACTIONS.SET_ARRANGEMENT, newSections);

            if (newSections.length > 0) {
                const first = newSections[0];
                if (first.key && first.key !== 'Random') {
                    dispatch(ACTIONS.SET_PARAM, {
                        module: 'arranger',
                        param: 'key',
                        value: first.key,
                    });
                }
                if (first.timeSignature && first.timeSignature !== 'Random') {
                    dispatch(ACTIONS.SET_PARAM, {
                        module: 'arranger',
                        param: 'timeSignature',
                        value: first.timeSignature,
                    });
                }
            }

            dispatch(ACTIONS.SET_PARAM, { module: 'arranger', param: 'isMinor', value: isMinor });
            dispatch(ACTIONS.SET_PARAM, { module: 'arranger', param: 'isDirty', value: true });

            clearChordPresetHighlight();
            refreshArrangerUI();

            setTimeout(() => {
                showToast('✨ Arrangement Ready!');
                setHasGenerated(true);
            }, 50);
        } catch (/** @type {any} */ e) {
            if (e.name === 'TypeError' && e.message.includes('currentTime')) {
                // Audio not initialized, ignore this error as it's expected if no user gesture yet
                setHasGenerated(true);
                return;
            }
            console.error('Generation failed explicitly:', e);
            showToast('Generation failed. Check console for details.');
        }
    };
    const structureOptions = [
        { id: 'pop', label: 'Pop 🎤', desc: 'Standard Verse-Chorus-Bridge' },
        { id: 'jazz', label: 'Jazz 🎷', desc: 'AABA Standard Form' },
        { id: 'blues', label: 'Blues 🎸', desc: '12-Bar Blues Form' },
        { id: 'ballad', label: 'Ballad 🎹', desc: 'Melodic & Sentimental' },
        { id: 'simple', label: 'Simple 🎵', desc: 'Basic Verse-Chorus' },
        { id: 'loop', label: 'Loop 🔄', desc: 'Short 4-Bar Phrase' },
    ];

    return (
        <div
            id="generateSongOverlay"
            ref={overlayRef}
            class={`modal-overlay ${isOpen ? 'active' : ''}`}
            aria-hidden={!isOpen ? 'true' : 'false'}
            role="dialog"
            aria-modal="true"
            aria-labelledby="generate-song-title"
            onClick={(/** @type {MouseEvent} */ e) => {
                const target = /** @type {HTMLElement} */ (e.target);
                if (target.id === 'generateSongOverlay') {
                    close();
                }
            }}
        >
            <div
                class="modal-content settings-content generate-modal-shell"
                onClick={(/** @type {MouseEvent} */ e) => e.stopPropagation()}
            >
                <div class="modal-header-shared">
                    <h2 id="generate-song-title">Inspiration Hub</h2>
                    <button
                        id="closeGenerateSongBtn"
                        class="close-btn"
                        aria-label="Close"
                        onClick={close}
                    >
                        &times;
                    </button>
                </div>

                <div class="modal-body generate-modal-body">
                    {hasGenerated ? (
                        <div class="animate-in generate-success">
                            <div class="generate-success-icon" aria-hidden="true">
                                ✨
                            </div>
                            <h3 class="generate-success-title">Arrangement Ready!</h3>
                            <p class="generate-success-copy">
                                Your new arrangement is ready to play.
                            </p>
                            <button class="primary-btn generate-success-button" onClick={close}>
                                👍 Done
                            </button>
                        </div>
                    ) : (
                        <div class="generate-form animate-in">
                            <div class="generate-mode-switcher">
                                <ButtonGroup
                                    className="generate-mode-toggle-group"
                                    options={[
                                        {
                                            label: '📚 Structure Library',
                                            value: 'templates',
                                        },
                                        {
                                            label: '🎲 Randomize',
                                            value: 'generator',
                                        },
                                    ]}
                                    value={activeTab}
                                    onChange={(/** @type {any} */ v) => setActiveTab(v)}
                                />
                            </div>

                            {activeTab === 'templates' ? (
                                <SettingGroup title="Song Templates">
                                    <p class="setting-description generate-copy">
                                        Select a curated song structure to replace your current
                                        arrangement.
                                    </p>
                                    <div class="template-grid generate-template-grid">
                                        {SONG_TEMPLATES.map((/** @type {any} */ template) => (
                                            <button
                                                key={template.name}
                                                class="template-card-btn generate-template-card"
                                                onClick={() => applyTemplate(template)}
                                                aria-label={
                                                    confirmTemplate === template.name
                                                        ? 'Apply template? This replaces current arrangement.'
                                                        : undefined
                                                }
                                                aria-live={
                                                    confirmTemplate === template.name
                                                        ? 'polite'
                                                        : 'off'
                                                }
                                            >
                                                <div class="generate-template-card-header">
                                                    <span>{template.name}</span>
                                                    {confirmTemplate === template.name && (
                                                        <span class="generate-template-card-confirm">
                                                            Click again to replace
                                                        </span>
                                                    )}
                                                </div>
                                                <div class="generate-template-card-meta">
                                                    {template.sections.length} Sections •{' '}
                                                    {template.sections.reduce(
                                                        (
                                                            /** @type {any} */ acc,
                                                            /** @type {any} */ s,
                                                        ) => acc + (s.repeat || 1),
                                                        0,
                                                    )}{' '}
                                                    Blocks
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </SettingGroup>
                            ) : (
                                <Fragment>
                                    {/* --- FOUNDATION --- */}
                                    <SettingGroup title="1. Foundation">
                                        <SettingRow
                                            label="Root Key"
                                            description="Starting key for the song"
                                        >
                                            <select
                                                id="gen-root-key"
                                                value={key}
                                                onChange={(/** @type {any} */ e) =>
                                                    setKey(e.target.value)
                                                }
                                                class="generate-select--sm"
                                            >
                                                <option value="Random">Random</option>
                                                <option value="C">C</option>
                                                <option value="Db">Db</option>
                                                <option value="D">D</option>
                                                <option value="Eb">Eb</option>
                                                <option value="E">E</option>
                                                <option value="F">F</option>
                                                <option value="Gb">Gb</option>
                                                <option value="G">G</option>
                                                <option value="Ab">Ab</option>
                                                <option value="A">A</option>
                                                <option value="Bb">Bb</option>
                                                <option value="B">B</option>
                                            </select>
                                        </SettingRow>

                                        <SettingRow
                                            label="Key Quality"
                                            description="Major or Minor mode"
                                        >
                                            <div class="flex-row">
                                                <span style={{ opacity: isMinor ? 0.5 : 1 }}>
                                                    Major
                                                </span>
                                                <Toggle checked={isMinor} onChange={setIsMinor} />
                                                <span style={{ opacity: isMinor ? 1 : 0.5 }}>
                                                    Minor
                                                </span>
                                            </div>
                                        </SettingRow>

                                        <SettingRow
                                            label="Time Signature"
                                            description="Rhythmic meter"
                                        >
                                            <select
                                                id="gen-time-sig"
                                                value={timeSignature}
                                                onChange={(/** @type {any} */ e) =>
                                                    setTimeSignature(e.target.value)
                                                }
                                                class="generate-select--sm"
                                            >
                                                <option value="Random">Random</option>
                                                <option value="4/4">4/4</option>
                                                <option value="3/4">3/4</option>
                                                <option value="2/4">2/4</option>
                                                <option value="5/4">5/4</option>
                                                <option value="6/8">6/8</option>
                                                <option value="7/8">7/8</option>
                                                <option value="12/8">12/8</option>
                                            </select>
                                        </SettingRow>
                                    </SettingGroup>

                                    {/* --- VIBE & STYLE --- */}
                                    <SettingGroup
                                        title="2. Vibe & Style"
                                        className="generate-section-spaced"
                                    >
                                        <SettingRow
                                            label="Structure"
                                            description="The architectural form of the song"
                                        >
                                            <select
                                                id="gen-structure"
                                                value={structure}
                                                onChange={(/** @type {any} */ e) =>
                                                    setStructure(e.target.value)
                                                }
                                                class="generate-select--md"
                                            >
                                                {structureOptions.map((/** @type {any} */ opt) => (
                                                    <option key={opt.id} value={opt.id}>
                                                        {opt.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </SettingRow>

                                        <SettingRow
                                            label="Complexity"
                                            description="Influences chord extensions (7ths, 9ths)"
                                            valueDisplay={
                                                <span class="generate-value-highlight">
                                                    {Math.round(complexity * 100)}%
                                                </span>
                                            }
                                        >
                                            <input
                                                type="range"
                                                min="0"
                                                max="1"
                                                step="0.1"
                                                value={complexity}
                                                onInput={(/** @type {any} */ e) =>
                                                    setComplexity(parseFloat(e.target.value))
                                                }
                                                class="generate-range"
                                            />
                                        </SettingRow>
                                    </SettingGroup>

                                    {/* --- ADVANCED --- */}
                                    <SettingGroup
                                        title="3. Seeds"
                                        className="generate-section-spaced generate-section-borderless"
                                    >
                                        <SettingRow
                                            label="Seed Source"
                                            description="Base the new song on a motif"
                                        >
                                            <select
                                                value={seedMode}
                                                onChange={(/** @type {any} */ e) =>
                                                    setSeedMode(e.target.value)
                                                }
                                                class="generate-select--md"
                                            >
                                                <option value="none">None</option>
                                                <option value="existing">Existing Section</option>
                                                <option value="manual">Manual Entry</option>
                                            </select>
                                        </SettingRow>

                                        {seedMode === 'existing' && (
                                            <div class="animate-in generate-subsection">
                                                <SettingRow
                                                    label="Select Section"
                                                    description="Choose a section to use as a seed"
                                                >
                                                    <select
                                                        value={selectedSectionId}
                                                        onChange={(/** @type {any} */ e) =>
                                                            setSelectedSectionId(e.target.value)
                                                        }
                                                        class="generate-select--md"
                                                    >
                                                        {sections.map((/** @type {any} */ s) => (
                                                            <option key={s.id} value={s.id}>
                                                                {s.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </SettingRow>
                                            </div>
                                        )}

                                        {seedMode === 'manual' && (
                                            <div class="animate-in generate-subsection">
                                                <SettingRow
                                                    label="Chord Progression"
                                                    description="e.g. I | IV | V"
                                                >
                                                    <input
                                                        type="text"
                                                        value={manualSeedValue}
                                                        onInput={(/** @type {any} */ e) =>
                                                            setManualSeedValue(e.target.value)
                                                        }
                                                        placeholder="I | IV | V"
                                                        class="generate-text-input"
                                                    />
                                                </SettingRow>
                                            </div>
                                        )}

                                        {seedMode !== 'none' && (
                                            <div class="animate-in generate-subsection">
                                                <SettingRow
                                                    label="Treat Seed as..."
                                                    description="Section type for the seed"
                                                >
                                                    <select
                                                        id="gen-seed-type"
                                                        value={seedType}
                                                        onChange={(/** @type {any} */ e) =>
                                                            setSeedType(e.target.value)
                                                        }
                                                        class="generate-select--sm"
                                                    >
                                                        <option value="Verse">Verse</option>
                                                        <option value="Chorus">Chorus</option>
                                                        <option value="Bridge">Bridge</option>
                                                        <option value="Intro">Intro</option>
                                                    </select>
                                                </SettingRow>
                                            </div>
                                        )}
                                    </SettingGroup>

                                    <button
                                        class="primary-btn generate-submit-btn"
                                        onClick={handleConfirm}
                                        aria-label={
                                            confirmGen
                                                ? 'Replace current arrangement with generated song?'
                                                : undefined
                                        }
                                        aria-live={confirmGen ? 'polite' : 'off'}
                                    >
                                        {confirmGen
                                            ? '⚠️ Replace arrangement?'
                                            : '✨ Generate New Arrangement'}
                                    </button>
                                </Fragment>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
