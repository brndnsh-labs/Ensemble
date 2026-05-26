import { useEffect, useRef, useState } from 'preact/hooks';
import { clearChordPresetHighlight, refreshArrangerUI } from '../arranger-controller.js';
import { SONG_TEMPLATES } from '../data/song-templates.js';
import { pushHistory } from '../history.js';
import { generateSong } from '../song-generator.js';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { showToast } from '../ui.js';
import { useEnsembleState } from '../ui-bridge.js';
import { generateId } from '../utils.js';
import { PresetLibrary } from './PresetLibrary.jsx';
import { ButtonGroup } from './UIControls.jsx';

/**
 * Consolidated inspiration affordance. Replaces the prior
 * Generate Song + Inspiration Hub + Library Drawer trio with one 🎲 entry point
 * that hosts three flows: roll-the-dice (instant random arrangement), curated
 * templates, and the chord-progression library (replace or append).
 *
 * Mounted via `Modals.tsx` when `playback.modals.surpriseMe` is true.
 */

type Mode = 'roll' | 'templates' | 'library';

export function SurpriseMe() {
    const { isOpen, currentKey, currentIsMinor, currentTS } = useEnsembleState((s) => ({
        isOpen: s.playback.modals.surpriseMe,
        currentKey: s.arranger.key,
        currentIsMinor: s.arranger.isMinor,
        currentTS: s.arranger.timeSignature,
    }));

    const [mode, setMode] = useState<Mode>('library');
    const [libraryMode, setLibraryMode] = useState<'replace' | 'append'>('replace');
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [structure, setStructure] = useState<'random' | 'pop' | 'jazz' | 'blues' | 'ballad'>(
        'random',
    );
    const [complexity, setComplexity] = useState(0.3);
    const [confirmTemplate, setConfirmTemplate] = useState<string | null>(null);
    const overlayRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!isOpen) {
            setConfirmTemplate(null);
        }
    }, [isOpen]);

    const close = () => {
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'surpriseMe', open: false });
    };

    const rollDice = () => {
        try {
            const newSections = generateSong({
                key: currentKey,
                isMinor: currentIsMinor,
                timeSignature: currentTS,
                structure,
                complexity,
            });
            pushHistory();
            // Single atomic dispatch so the worker sees one consistent snapshot
            // (chart + key + time-sig) — not a half-applied chart with the old
            // key briefly visible between dispatches.
            const first = newSections[0];
            const payload: any = {
                sections: newSections,
                isMinor: currentIsMinor,
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
            setTimeout(() => showToast('🎲 Rolled a new arrangement'), 50);
            close();
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
            setTimeout(() => showToast(`✨ Loaded "${template.name}"`), 50);
            close();
        } catch (e) {
            console.error('SurpriseMe.applyTemplate failed:', e);
            showToast('Template load failed.');
        }
    };

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
                    <h2 id="surprise-me-title">📚 Library</h2>
                    <button type="button" class="close-btn" aria-label="Close" onClick={close}>
                        &times;
                    </button>
                </div>
                <div class="surprise-me-mode-switcher">
                    <ButtonGroup
                        className="surprise-me-mode-group"
                        options={[
                            { label: '🎵 Library', value: 'library' },
                            { label: '📚 Templates', value: 'templates' },
                            { label: '🎲 Roll', value: 'roll' },
                        ]}
                        value={mode}
                        onChange={(v) => setMode(v as Mode)}
                    />
                </div>
                <div class="modal-body surprise-me-body">
                    {mode === 'roll' && (
                        <div class="surprise-me-roll">
                            <p class="surprise-me-pitch">
                                Generate a fresh chord chart in your current key (
                                <strong>{currentKey || 'C'}</strong>
                                {currentIsMinor ? ' minor' : ''}, {currentTS}).
                            </p>
                            <button
                                type="button"
                                class="primary-btn surprise-me-dice"
                                onClick={rollDice}
                            >
                                🎲 Roll the Dice
                            </button>
                            <button
                                type="button"
                                class="surprise-me-advanced-toggle"
                                aria-expanded={advancedOpen}
                                onClick={() => setAdvancedOpen((v) => !v)}
                            >
                                {advancedOpen ? '▾ Hide advanced' : '▸ Advanced…'}
                            </button>
                            {advancedOpen && (
                                <div class="surprise-me-advanced">
                                    <label class="surprise-me-field">
                                        <span>Structure</span>
                                        <select
                                            value={structure}
                                            onChange={(e: any) =>
                                                setStructure(e.target.value as any)
                                            }
                                        >
                                            <option value="random">Random</option>
                                            <option value="pop">Pop 🎤</option>
                                            <option value="jazz">Jazz 🎷</option>
                                            <option value="blues">Blues 🎸</option>
                                            <option value="ballad">Ballad 🎹</option>
                                        </select>
                                    </label>
                                    <label class="surprise-me-field">
                                        <span>
                                            Complexity{' '}
                                            <em class="surprise-me-value">
                                                {Math.round(complexity * 100)}%
                                            </em>
                                        </span>
                                        <input
                                            type="range"
                                            min="0"
                                            max="1"
                                            step="0.1"
                                            value={complexity}
                                            onInput={(e: any) =>
                                                setComplexity(parseFloat(e.target.value))
                                            }
                                        />
                                    </label>
                                </div>
                            )}
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
                                    onChange={(v) => setLibraryMode(v as 'replace' | 'append')}
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
