import { useEffect, useRef, useState } from 'preact/hooks';
import {
    appendSections,
    clearChordPresetHighlight,
    refreshArrangerUI,
} from '../arranger-controller.js';
import { KEY_ORDER, TIME_SIGNATURES } from '../config.js';
import { GENRE_NAMES } from '../data/smart-genres.js';
import { SONG_TEMPLATES } from '../data/song-templates.js';
import { pushHistory, undo } from '../history.js';
import {
    type GenerateSongOptions,
    type GenerateSongRole,
    generateSong,
    predictStructure,
} from '../song-generator.js';
import { chordsFromSectionValue, parseSeedText } from '../song-generator-seed.js';
import { generateId } from '../state/share-codec.js';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { showToast } from '../ui.js';
import { useEnsembleState } from '../ui-bridge.js';
import { Icon } from './Icon.jsx';
import { PresetLibrary } from './PresetLibrary.jsx';
import { ButtonGroup } from './UIControls.jsx';
import { useModalA11y } from './use-modal-a11y.js';

/**
 * Consolidated inspiration affordance. One 🎲 entry point that hosts three
 * flows: a guided song-builder wizard (Roll), curated templates, and the
 * chord-progression library (replace or append).
 *
 * The Roll tab is a single-screen wizard with Surprise Me as a universal
 * commit — answering zero questions still works (smart defaults), answering
 * all of them narrows the search. After a roll lands, a toast with [Reroll]
 * [Undo] action buttons lets the user iterate without reopening the modal.
 */

type Mode = 'roll' | 'templates' | 'library';
type ApplyMode = 'replace' | 'append';

const FEEL_GROOVE = '__groove'; // sentinel for "Match my groove"
const TIME_SIGNATURE_KEYS = Object.keys(TIME_SIGNATURES);

const SUGGEST_CHIPS: Array<{ label: string; chords: string[] }> = [
    { label: 'I-V-vi-IV', chords: ['I', 'V', 'vi', 'IV'] },
    { label: 'ii-V-I', chords: ['ii', 'V', 'I'] },
    { label: '12-bar', chords: ['I', 'I', 'I', 'I', 'IV', 'IV', 'I', 'I', 'V', 'IV', 'I', 'V'] },
    { label: 'vi-IV-I-V', chords: ['vi', 'IV', 'I', 'V'] },
    { label: 'i-bVI-bIII-bVII', chords: ['i', 'bVI', 'bIII', 'bVII'] },
];

// Last-roll options live in module scope so the toast Reroll action can replay
// them even after the modal closes.
let lastRollOptions: GenerateSongOptions | null = null;
let lastRollApplyMode: ApplyMode = 'replace';

function applyRoll(
    sections: ReturnType<typeof generateSong>,
    applyMode: ApplyMode,
    isMinor: boolean,
): void {
    if (applyMode === 'append') {
        // appendSections() already calls pushHistory(); do not double-push or
        // the toast's one-click Undo will appear to do nothing on first press.
        appendSections(sections.map((s) => ({ ...s })));
        clearChordPresetHighlight();
        refreshArrangerUI();
        return;
    }
    pushHistory();
    // Single atomic dispatch so the worker sees one consistent snapshot.
    const first = sections[0];
    const payload: Record<string, unknown> = {
        sections,
        isMinor,
    };
    if (first?.key && first.key !== 'Random') {
        payload.key = first.key;
    }
    if (first?.timeSignature && first.timeSignature !== 'Random') {
        payload.timeSignature = first.timeSignature;
    }
    dispatch(ACTIONS.LOAD_TEMPLATE, payload);
    clearChordPresetHighlight();
    refreshArrangerUI();
}

function showRollToast(message: string): void {
    showToast({
        message,
        actions: [
            {
                label: 'Reroll',
                onClick: () => {
                    if (!lastRollOptions) {
                        return;
                    }
                    try {
                        const next = generateSong(lastRollOptions);
                        applyRoll(next, lastRollApplyMode, !!lastRollOptions.isMinor);
                        showRollToast('Rerolled');
                    } catch (err) {
                        console.error('Reroll failed:', err);
                        showToast('Reroll failed. Check console.');
                    }
                },
            },
            {
                label: 'Undo',
                onClick: () => undo(refreshArrangerUI),
            },
        ],
    });
}

export function SurpriseMe() {
    const { isOpen, currentKey, currentIsMinor, currentTS, currentBpm, currentGenre, sections } =
        useEnsembleState((s) => ({
            isOpen: s.playback.modals.surpriseMe,
            currentKey: s.arranger.key,
            currentIsMinor: s.arranger.isMinor,
            currentTS: s.arranger.timeSignature,
            currentBpm: s.playback.bpm,
            // #1165: this feeds song-generator's FEEL_BASE_POOL, which is keyed on CANON genre
            // names (GENRE_NAMES). `groove.genreFeel` is the runtime FEEL string, and two of the
            // 13 genres diverge — Bossa's feel is 'Bossa Nova', Ska-Punk's is 'Ska'. Feeding the
            // feel axis made the generator's `!FEEL_BASE_POOL[feel]` guard reroll those two to a
            // uniformly random genre, so "Match my groove" did the opposite of its label.
            // `lastSmartGenre` is the canon-name field (same one InstrumentRail/PacksSettings read).
            currentGenre: s.groove.lastSmartGenre,
            sections: s.arranger.sections ?? [],
        }));

    const [mode, setMode] = useState<Mode>('library');
    const [libraryMode, setLibraryMode] = useState<ApplyMode>('replace');
    const [confirmTemplate, setConfirmTemplate] = useState<string | null>(null);

    // Wizard state — initialized lazily from chart on first open of Roll tab.
    const [wizardKey, setWizardKey] = useState<string>(currentKey || 'C');
    const [wizardTS, setWizardTS] = useState<string>(currentTS || '4/4');
    const [wizardMinor, setWizardMinor] = useState<boolean>(currentIsMinor ?? false);
    const [applyMode, setApplyMode] = useState<ApplyMode>('replace');
    const [seedChords, setSeedChords] = useState<string[]>([]);
    const [seedRole, setSeedRole] = useState<GenerateSongRole>('verse');
    const [seedEditing, setSeedEditing] = useState<boolean>(false);
    const [seedText, setSeedText] = useState<string>('');
    const [pullPickerOpen, setPullPickerOpen] = useState<boolean>(false);
    const [targetMinutes, setTargetMinutes] = useState<number>(3);
    const [form, setForm] = useState<'verse-chorus' | 'loop'>('verse-chorus');
    const [feel, setFeel] = useState<string>(FEEL_GROOVE);

    const overlayRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!isOpen) {
            setConfirmTemplate(null);
            setSeedEditing(false);
            setPullPickerOpen(false);
        } else {
            // Refresh wizard chips from chart whenever modal reopens.
            setWizardKey(currentKey || 'C');
            setWizardTS(currentTS || '4/4');
            setWizardMinor(currentIsMinor ?? false);
        }
    }, [isOpen, currentKey, currentTS, currentIsMinor]);

    const close = () => {
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'surpriseMe', open: false });
    };

    // Focus-trap / focus-restore contract shared by every other modal. The
    // existing role/aria-modal/aria-labelledby JSX stays authoritative, so pass
    // no ariaLabel (the hook would otherwise add a competing aria-label).
    useModalA11y(overlayRef, isOpen, close, undefined);

    const resolveFeel = (): string => {
        if (feel === FEEL_GROOVE) {
            return currentGenre || 'Rock';
        }
        return feel;
    };

    const buildOptions = (): GenerateSongOptions => {
        const opts: GenerateSongOptions = {
            key: wizardKey,
            isMinor: wizardMinor,
            timeSignature: wizardTS,
            bpm: currentBpm,
            targetMinutes,
            form,
            feel: resolveFeel(),
        };
        if (seedChords.length > 0) {
            opts.seed = { chords: seedChords, role: seedRole };
        }
        return opts;
    };

    const rollDice = () => {
        try {
            const opts = buildOptions();
            const newSections = generateSong(opts);
            applyRoll(newSections, applyMode, !!opts.isMinor);
            lastRollOptions = opts;
            lastRollApplyMode = applyMode;
            close();
            setTimeout(
                () =>
                    showRollToast(
                        applyMode === 'append'
                            ? 'Appended a new arrangement'
                            : 'Rolled a new arrangement',
                    ),
                50,
            );
        } catch (e) {
            console.error('SurpriseMe.rollDice failed:', e);
            showToast('Generation failed. Check console.');
        }
    };

    const applyTemplate = (template: any) => {
        if (confirmTemplate !== template.name) {
            setConfirmTemplate(template.name);
            return;
        }
        setConfirmTemplate(null);
        try {
            pushHistory();
            const newSections = template.sections.map((s: any) => ({
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
            setTimeout(() => showToast(`Loaded "${template.name}"`), 50);
            close();
        } catch (e) {
            console.error('SurpriseMe.applyTemplate failed:', e);
            showToast('Template load failed.');
        }
    };

    // --- Seed handlers --------------------------------------------------
    const commitSeedText = () => {
        const parsed = parseSeedText(seedText);
        if (parsed.length > 0) {
            setSeedChords(parsed);
        }
        setSeedEditing(false);
        setSeedText('');
    };

    const applySuggestion = (chords: string[]) => {
        setSeedChords(chords);
        setSeedEditing(false);
        setPullPickerOpen(false);
    };

    const clearSeed = () => {
        setSeedChords([]);
        setSeedText('');
        setSeedEditing(false);
        setPullPickerOpen(false);
    };

    const startEditingSeed = () => {
        setSeedText(seedChords.join(' '));
        setSeedEditing(true);
        setPullPickerOpen(false);
    };

    const pullFromSection = (section: { label?: string; value: string }) => {
        const chords = chordsFromSectionValue(section.value);
        if (chords.length === 0) {
            return;
        }
        setSeedChords(chords);
        // Map section label → role.
        const label = (section.label || '').toLowerCase();
        if (label.startsWith('chorus')) {
            setSeedRole('chorus');
        } else if (label.startsWith('bridge')) {
            setSeedRole('bridge');
        } else if (label.startsWith('pre')) {
            setSeedRole('pre');
        } else {
            setSeedRole('verse');
        }
        setSeedEditing(false);
        setPullPickerOpen(false);
    };

    const resetAnswers = () => {
        setWizardKey(currentKey || 'C');
        setWizardTS(currentTS || '4/4');
        setWizardMinor(currentIsMinor ?? false);
        setApplyMode('replace');
        setSeedChords([]);
        setSeedRole('verse');
        setSeedEditing(false);
        setSeedText('');
        setPullPickerOpen(false);
        setTargetMinutes(3);
        setForm('verse-chorus');
        setFeel(FEEL_GROOVE);
    };

    // Form preview — what structure would generateSong pick right now?
    const predictedLabels = predictStructure(
        targetMinutes,
        currentBpm || 100,
        wizardTS,
        form,
        resolveFeel(),
    );
    const formPreview = predictedLabels
        .map((l) => {
            if (l.startsWith('A')) {
                return 'A';
            }
            if (l === 'Verse') {
                return 'V';
            }
            if (l === 'Chorus') {
                return 'C';
            }
            if (l === 'Bridge') {
                return 'B';
            }
            if (l === 'Pre') {
                return 'P';
            }
            if (l === 'Intro') {
                return 'In';
            }
            if (l === 'Outro') {
                return 'Out';
            }
            if (l === 'Solo') {
                return 'S';
            }
            if (l === 'Main') {
                return 'Loop';
            }
            return l[0];
        })
        .join('-');
    const durationLabel = (() => {
        const mins = Math.floor(targetMinutes);
        const secs = Math.round((targetMinutes - mins) * 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    })();

    if (!isOpen) {
        return null;
    }

    return (
        <div
            id="surpriseMeOverlay"
            ref={overlayRef}
            class={`modal-overlay ${isOpen ? 'active' : ''}`}
            aria-hidden="false"
            role="dialog"
            aria-modal="true"
            aria-labelledby="surprise-me-title"
            onClick={(e: MouseEvent) => {
                if ((e.target as HTMLElement).id === 'surpriseMeOverlay') {
                    close();
                }
            }}
        >
            <div
                class="modal-content settings-content surprise-me-shell"
                onClick={(e: MouseEvent) => e.stopPropagation()}
            >
                <div class="modal-header-shared">
                    <h2 id="surprise-me-title">
                        <Icon name="book" /> Library
                    </h2>
                    <button type="button" class="close-btn" aria-label="Close" onClick={close}>
                        &times;
                    </button>
                </div>
                <div class="surprise-me-mode-switcher">
                    <ButtonGroup
                        className="surprise-me-mode-group"
                        options={[
                            { label: 'Library', value: 'library' },
                            { label: 'Templates', value: 'templates' },
                            { label: 'Roll', value: 'roll' },
                        ]}
                        value={mode}
                        onChange={(v) => setMode(v as Mode)}
                    />
                </div>
                <div class="modal-body surprise-me-body">
                    {mode === 'roll' && (
                        <div class="surprise-me-roll surprise-me-wizard">
                            <div class="surprise-me-top-row">
                                <label class="surprise-me-top-row-field">
                                    <span>Key</span>
                                    <select
                                        value={wizardKey}
                                        onChange={(e) =>
                                            setWizardKey((e.target as HTMLSelectElement).value)
                                        }
                                    >
                                        {KEY_ORDER.map((k) => (
                                            <option key={k} value={k}>
                                                {k}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label class="surprise-me-top-row-field">
                                    <input
                                        type="checkbox"
                                        checked={wizardMinor}
                                        onChange={(e) =>
                                            setWizardMinor((e.target as HTMLInputElement).checked)
                                        }
                                    />
                                    <span>minor</span>
                                </label>
                                <label class="surprise-me-top-row-field">
                                    <span>Time</span>
                                    <select
                                        value={wizardTS}
                                        onChange={(e) =>
                                            setWizardTS((e.target as HTMLSelectElement).value)
                                        }
                                    >
                                        {TIME_SIGNATURE_KEYS.map((t) => (
                                            <option key={t} value={t}>
                                                {t}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                            <button
                                type="button"
                                class="primary-btn surprise-me-dice"
                                onClick={rollDice}
                            >
                                <Icon name="dice" /> Surprise Me
                            </button>
                            <div class="surprise-me-apply">
                                <span class="surprise-me-apply-label">Apply to chart:</span>
                                <ButtonGroup
                                    options={[
                                        { label: 'Replace', value: 'replace' },
                                        { label: 'Append', value: 'append' },
                                    ]}
                                    value={applyMode}
                                    onChange={(v) => setApplyMode(v as ApplyMode)}
                                />
                            </div>

                            <hr class="surprise-me-divider" />

                            {/* Seed row */}
                            <div class="surprise-me-seed-block">
                                <div class="surprise-me-seed-header">
                                    <span class="surprise-me-seed-label">
                                        Seed progression
                                        <em class="surprise-me-optional">(optional)</em>
                                    </span>
                                    {seedChords.length > 0 && (
                                        <label class="surprise-me-role-field">
                                            <span>Role</span>
                                            <select
                                                value={seedRole}
                                                onChange={(e) =>
                                                    setSeedRole(
                                                        (e.target as HTMLSelectElement)
                                                            .value as GenerateSongRole,
                                                    )
                                                }
                                            >
                                                <option value="verse">Verse</option>
                                                <option value="chorus">Chorus</option>
                                                <option value="bridge">Bridge</option>
                                                <option value="pre">Pre-chorus</option>
                                                <option value="unknown">Not sure</option>
                                            </select>
                                        </label>
                                    )}
                                </div>
                                {seedEditing ? (
                                    <div class="surprise-me-seed-edit">
                                        <input
                                            type="text"
                                            class="surprise-me-seed-input"
                                            placeholder="e.g. C Am F G  or  I vi IV V"
                                            value={seedText}
                                            onInput={(e) =>
                                                setSeedText((e.target as HTMLInputElement).value)
                                            }
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    commitSeedText();
                                                }
                                            }}
                                            autoFocus
                                        />
                                        <button
                                            type="button"
                                            class="surprise-me-seed-confirm"
                                            onClick={commitSeedText}
                                        >
                                            OK
                                        </button>
                                    </div>
                                ) : seedChords.length > 0 ? (
                                    <div class="surprise-me-seed-chips">
                                        {seedChords.map((c, i) => (
                                            <span key={`${c}-${i}`} class="surprise-me-seed-chip">
                                                {c}
                                            </span>
                                        ))}
                                        <button
                                            type="button"
                                            class="surprise-me-seed-icon-btn"
                                            aria-label="Edit seed"
                                            onClick={startEditingSeed}
                                        >
                                            <Icon name="edit" />
                                        </button>
                                        <button
                                            type="button"
                                            class="surprise-me-seed-icon-btn"
                                            aria-label="Clear seed"
                                            onClick={clearSeed}
                                        >
                                            <Icon name="close" />
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        class="surprise-me-seed-add"
                                        onClick={() => setSeedEditing(true)}
                                    >
                                        <Icon name="plus" /> Add chords…
                                    </button>
                                )}
                                <div class="surprise-me-seed-suggest">
                                    <span class="surprise-me-suggest-label">
                                        <Icon name="lightbulb" /> Try:
                                    </span>
                                    {SUGGEST_CHIPS.map((s) => (
                                        <button
                                            key={s.label}
                                            type="button"
                                            class="surprise-me-suggest-chip"
                                            onClick={() => applySuggestion(s.chords)}
                                        >
                                            {s.label}
                                        </button>
                                    ))}
                                </div>
                                {sections.length > 0 && (
                                    <div class="surprise-me-seed-pull">
                                        <button
                                            type="button"
                                            class="surprise-me-seed-pull-toggle"
                                            aria-expanded={pullPickerOpen}
                                            onClick={() => setPullPickerOpen((v) => !v)}
                                        >
                                            <Icon name="copy" /> Pull from chart{' '}
                                            <span class="surprise-me-pull-count">
                                                ({sections.length})
                                            </span>{' '}
                                            {pullPickerOpen ? '▾' : '▸'}
                                        </button>
                                        {pullPickerOpen && (
                                            <div class="surprise-me-pull-picker">
                                                {sections.map((s: any, i: number) => (
                                                    <button
                                                        key={s.id ?? i}
                                                        type="button"
                                                        class="surprise-me-pull-item"
                                                        onClick={() => pullFromSection(s)}
                                                    >
                                                        <span class="surprise-me-pull-item-label">
                                                            {s.label || `Section ${i + 1}`}
                                                        </span>
                                                        <span class="surprise-me-pull-item-value">
                                                            {s.value}
                                                        </span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Length slider */}
                            <label class="surprise-me-field surprise-me-length">
                                <span class="surprise-me-field-label">
                                    Length{' '}
                                    <em class="surprise-me-value">
                                        {durationLabel} · {formPreview || '—'}
                                    </em>
                                </span>
                                <input
                                    type="range"
                                    min="1"
                                    max="7"
                                    step="0.1"
                                    value={targetMinutes}
                                    onInput={(e) =>
                                        setTargetMinutes(
                                            parseFloat((e.target as HTMLInputElement).value),
                                        )
                                    }
                                />
                            </label>

                            {/* Form */}
                            <div class="surprise-me-pill-row">
                                <span class="surprise-me-pill-label">Form</span>
                                <ButtonGroup
                                    options={[
                                        { label: 'Verse/Chorus', value: 'verse-chorus' },
                                        { label: 'Loop', value: 'loop' },
                                    ]}
                                    value={form}
                                    onChange={(v) => setForm(v as 'verse-chorus' | 'loop')}
                                />
                            </div>

                            {/* Feel */}
                            <label class="surprise-me-field">
                                <span class="surprise-me-field-label">Feel</span>
                                <select
                                    value={feel}
                                    onChange={(e) => setFeel((e.target as HTMLSelectElement).value)}
                                >
                                    <option value={FEEL_GROOVE}>
                                        My groove ({currentGenre || 'Rock'})
                                    </option>
                                    {GENRE_NAMES.map((g) => (
                                        <option key={g} value={g}>
                                            {g}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <button type="button" class="surprise-me-reset" onClick={resetAnswers}>
                                <Icon name="refresh" /> Reset answers
                            </button>
                        </div>
                    )}
                    {mode === 'templates' && (
                        <div class="surprise-me-templates">
                            <p class="surprise-me-pitch">
                                Curated song forms — pick one to replace your current chart.
                            </p>
                            <div class="template-grid">
                                {SONG_TEMPLATES.map((template: any) => (
                                    <button
                                        key={template.name}
                                        type="button"
                                        class="template-card-btn"
                                        onClick={() => applyTemplate(template)}
                                    >
                                        <div class="generate-template-card-header">
                                            <span>{template.name}</span>
                                            {confirmTemplate === template.name && (
                                                <span class="generate-template-card-confirm">
                                                    Tap again to replace
                                                </span>
                                            )}
                                        </div>
                                        <div class="generate-template-card-meta">
                                            {template.sections.length} sections •{' '}
                                            {template.sections.reduce(
                                                (acc: number, s: any) => acc + (s.repeat || 1),
                                                0,
                                            )}{' '}
                                            blocks
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    {mode === 'library' && (
                        <div class="surprise-me-library">
                            <div class="surprise-me-library-mode">
                                <ButtonGroup
                                    className="surprise-me-library-mode-group"
                                    options={[
                                        { label: 'Replace chart', value: 'replace' },
                                        { label: 'Append as section', value: 'append' },
                                    ]}
                                    value={libraryMode}
                                    onChange={(v) => setLibraryMode(v as ApplyMode)}
                                />
                            </div>
                            <PresetLibrary mode={libraryMode} onSelect={close} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
