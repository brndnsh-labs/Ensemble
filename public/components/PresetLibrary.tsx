import { useEffect, useMemo, useState } from 'preact/hooks';

import { appendSections, refreshArrangerUI } from '../arranger-controller.js';
import { CHORD_PRESETS } from '../data/chord-presets.js';
import type { Section } from '../state/arranger.js';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { showToast } from '../ui.js';
import { useEnsembleState } from '../ui-bridge.js';
import { decompressSections, generateId, transposeKeyName } from '../utils.js';
import { Icon } from './Icon.jsx';

const USER_PRESETS_STORAGE_KEY = 'ensemble_userPresets';
const FAVORITES_STORAGE_KEY = 'ensemble_presetLibraryFavorites';
const RECENTS_STORAGE_KEY = 'ensemble_presetLibraryRecents';
const RECENT_PRESET_LIMIT = 6;

type PresetSource = 'built-in' | 'user';

interface PresetSettings {
    bpm?: number;
    style?: string;
    timeSignature?: string;
}

interface PresetProvenance {
    variant?: string;
    notes?: string;
    references?: string[];
}

interface PresetSection extends Partial<Section> {
    keyShift?: number;
}

interface LibraryPreset {
    name: string;
    sections: string | Array<PresetSection>;
    category?: string;
    isMinor?: boolean;
    timestamp?: number;
    settings?: PresetSettings;
    provenance?: PresetProvenance;
}

interface LibraryEntry {
    id: string;
    name: string;
    source: PresetSource;
    preset: LibraryPreset;
    category: string;
    searchableText: string;
    isFavorite: boolean;
}

function formatPresetCount(count: number): string {
    return `${count} preset${count === 1 ? '' : 's'}`;
}

function buildPresetId(source: PresetSource, preset: LibraryPreset): string {
    if (source === 'built-in') {
        return `built-in:${preset.name}`;
    }

    return typeof preset.timestamp === 'number'
        ? `user:${preset.timestamp}`
        : `user:${preset.name}`;
}

function loadStoredUserPresets(): LibraryPreset[] {
    const stored = localStorage.getItem(USER_PRESETS_STORAGE_KEY);
    if (!stored) {
        return [];
    }

    try {
        const parsed = JSON.parse(stored);
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed.filter(
            (candidate) =>
                candidate &&
                typeof candidate === 'object' &&
                typeof candidate.name === 'string' &&
                (typeof candidate.sections === 'string' || Array.isArray(candidate.sections)),
        );
    } catch (error) {
        console.warn('[PresetLibrary] Failed to parse stored user presets:', error);
        return [];
    }
}

function loadStoredStringArray(key: string): string[] {
    const stored = localStorage.getItem(key);
    if (!stored) {
        return [];
    }

    try {
        const parsed = JSON.parse(stored);
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed.filter((value) => typeof value === 'string');
    } catch (error) {
        console.warn(`[PresetLibrary] Failed to parse stored value for ${key}:`, error);
        return [];
    }
}

function persistStoredStringArray(key: string, values: string[], failureMessage: string): boolean {
    try {
        localStorage.setItem(key, JSON.stringify(values));
        window.dispatchEvent(new Event('storage_sync'));
        return true;
    } catch (error) {
        console.warn(`[PresetLibrary] Failed to persist ${key}:`, error);
        showToast(failureMessage);
        return false;
    }
}

function getRawPresetSections(preset: LibraryPreset): PresetSection[] {
    if (Array.isArray(preset.sections)) {
        return preset.sections as PresetSection[];
    }

    if (typeof preset.sections !== 'string') {
        return [];
    }

    try {
        const sections = decompressSections(preset.sections);
        return Array.isArray(sections) ? (sections as PresetSection[]) : [];
    } catch (error) {
        console.warn(`[PresetLibrary] Failed to decompress preset "${preset.name}":`, error);
        return [];
    }
}

function getPresetCategory(preset: LibraryPreset, source: PresetSource): string {
    return preset.category || (source === 'user' ? 'Custom' : 'Library');
}

function getPresetSearchText(
    preset: LibraryPreset,
    source: PresetSource,
    sections: PresetSection[],
): string {
    const sectionText = sections
        .flatMap((section) => [section.label, section.value, section.key, section.timeSignature])
        .filter(Boolean)
        .join(' ');
    const referenceText = preset.provenance?.references?.join(' ') || '';
    const qualityText = preset.isMinor ? 'minor' : 'major';

    return [
        preset.name,
        getPresetCategory(preset, source),
        preset.settings?.style || '',
        preset.provenance?.variant || '',
        preset.provenance?.notes || '',
        referenceText,
        sectionText,
        source === 'user' ? 'user saved custom progression' : 'built in library preset',
        qualityText,
    ]
        .join(' ')
        .toLowerCase();
}

function entryMatchesSearch(entry: LibraryEntry, searchTokens: string[]): boolean {
    if (searchTokens.length === 0) {
        return true;
    }
    return searchTokens.every((token) => entry.searchableText.includes(token));
}

interface PresetChipProps {
    entry: LibraryEntry;
    isActive: boolean;
    onSelect: (entry: LibraryEntry) => void;
    onToggleFavorite: (entryId: string) => void;
    onDelete: ((entry: LibraryEntry) => void) | undefined;
}

function PresetChip({ entry, isActive, onSelect, onToggleFavorite, onDelete }: PresetChipProps) {
    return (
        <div
            class={`preset-library-chip${isActive ? ' active' : ''}`}
            data-genre={entry.category}
            data-testid="preset-library-chip"
        >
            <button
                type="button"
                class="preset-library-chip-name"
                aria-label={entry.name}
                aria-current={isActive ? 'true' : undefined}
                onClick={() => onSelect(entry)}
            >
                {entry.name}
            </button>
            <button
                type="button"
                class={`preset-library-chip-pin${entry.isFavorite ? ' active' : ''}`}
                aria-label={`${entry.isFavorite ? 'Remove' : 'Add'} ${entry.name} ${
                    entry.isFavorite ? 'from' : 'to'
                } favorites`}
                aria-pressed={entry.isFavorite}
                title={entry.isFavorite ? 'Unpin' : 'Pin to favorites'}
                onClick={() => onToggleFavorite(entry.id)}
            >
                <Icon name={entry.isFavorite ? 'star' : 'star-outline'} />
            </button>
            {entry.source === 'user' && onDelete && (
                <button
                    type="button"
                    class="preset-library-chip-delete"
                    aria-label={`Delete preset ${entry.name}`}
                    title="Delete preset"
                    onClick={() => onDelete(entry)}
                >
                    ×
                </button>
            )}
        </div>
    );
}

interface ChipRowProps {
    label: string;
    entries: LibraryEntry[];
    matchedIds: Set<string> | null;
    activeName: string | null;
    onSelect: (entry: LibraryEntry) => void;
    onToggleFavorite: (entryId: string) => void;
    onDelete: (entry: LibraryEntry) => void;
}

function ChipRow({
    label,
    entries,
    matchedIds,
    activeName,
    onSelect,
    onToggleFavorite,
    onDelete,
}: ChipRowProps) {
    const visibleEntries = matchedIds
        ? entries.filter((entry) => matchedIds.has(entry.id))
        : entries;

    if (visibleEntries.length === 0) {
        return null;
    }

    return (
        <div
            class="preset-library-chip-row"
            data-row-label={label}
            data-testid="preset-library-chip-row"
        >
            <div class="preset-library-chip-row-label">{label}</div>
            <div class="preset-library-chip-row-chips">
                {visibleEntries.map((entry) => (
                    <PresetChip
                        key={`${label}-${entry.id}`}
                        entry={entry}
                        isActive={activeName === entry.name}
                        onSelect={onSelect}
                        onToggleFavorite={onToggleFavorite}
                        onDelete={entry.source === 'user' ? onDelete : undefined}
                    />
                ))}
            </div>
        </div>
    );
}

/**
 * Wraps a state mutation in document.startViewTransition when available so the
 * resulting layout shift (pinned row appearing, chips reordering) eases in
 * rather than jumping. Falls back to a plain invocation in older browsers.
 */
function withViewTransition(update: () => void): void {
    const doc = document as Document & {
        startViewTransition?: (callback: () => void) => unknown;
    };
    if (typeof doc.startViewTransition === 'function') {
        doc.startViewTransition(update);
    } else {
        update();
    }
}

interface PresetLibraryProps {
    onSelect?: () => void;
    /**
     * `replace` (default) swaps the entire arrangement; `append` pushes the preset's
     * sections onto the end of the current chart so users can audition without
     * losing what they have.
     */
    mode?: 'replace' | 'append';
}

export function PresetLibrary({ onSelect, mode = 'replace' }: PresetLibraryProps) {
    const currentKey = useEnsembleState((state) => state.arranger.key);
    const lastChordPreset = useEnsembleState((state) => state.arranger.lastChordPreset);
    const isDirty = useEnsembleState((state) => state.arranger.isDirty);
    const applyPresetSettings = useEnsembleState((state) => state.playback.applyPresetSettings);

    const [searchQuery, setSearchQuery] = useState('');
    const [userPresets, setUserPresets] = useState<LibraryPreset[]>([]);
    const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
    const [recentIds, setRecentIds] = useState<string[]>([]);

    useEffect(() => {
        const syncStoredLibraryState = () => {
            setUserPresets(loadStoredUserPresets());
            setFavoriteIds(loadStoredStringArray(FAVORITES_STORAGE_KEY));
            setRecentIds(loadStoredStringArray(RECENTS_STORAGE_KEY));
        };

        syncStoredLibraryState();
        window.addEventListener('storage', syncStoredLibraryState);
        window.addEventListener('storage_sync', syncStoredLibraryState);
        return () => {
            window.removeEventListener('storage', syncStoredLibraryState);
            window.removeEventListener('storage_sync', syncStoredLibraryState);
        };
    }, []);

    const favoriteIdSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

    const builtInEntries = useMemo(
        () =>
            (CHORD_PRESETS as LibraryPreset[]).map((preset): LibraryEntry => {
                const presetId = buildPresetId('built-in', preset);
                const sections = getRawPresetSections(preset);
                return {
                    id: presetId,
                    name: preset.name,
                    source: 'built-in',
                    preset,
                    category: getPresetCategory(preset, 'built-in'),
                    searchableText: getPresetSearchText(preset, 'built-in', sections),
                    isFavorite: favoriteIdSet.has(presetId),
                };
            }),
        [favoriteIdSet],
    );

    const userEntries = useMemo(() => {
        const sortedPresets = [...userPresets].sort(
            (left, right) => (right.timestamp || 0) - (left.timestamp || 0),
        );

        return sortedPresets.map((preset): LibraryEntry => {
            const presetId = buildPresetId('user', preset);
            const sections = getRawPresetSections(preset);
            return {
                id: presetId,
                name: preset.name,
                source: 'user',
                preset,
                category: getPresetCategory(preset, 'user'),
                searchableText: getPresetSearchText(preset, 'user', sections),
                isFavorite: favoriteIdSet.has(presetId),
            };
        });
    }, [favoriteIdSet, userPresets]);

    const allEntries = useMemo(
        () => [...builtInEntries, ...userEntries],
        [builtInEntries, userEntries],
    );
    const entryById = useMemo(
        () => new Map(allEntries.map((entry) => [entry.id, entry])),
        [allEntries],
    );

    const groupedBuiltInEntries = useMemo(() => {
        const buckets = new Map<string, LibraryEntry[]>();
        for (const entry of builtInEntries) {
            const list = buckets.get(entry.category);
            if (list) {
                list.push(entry);
            } else {
                buckets.set(entry.category, [entry]);
            }
        }
        for (const list of buckets.values()) {
            list.sort((left, right) => left.name.localeCompare(right.name));
        }
        return Array.from(buckets.entries()).sort(([leftLabel], [rightLabel]) =>
            leftLabel.localeCompare(rightLabel),
        );
    }, [builtInEntries]);

    const searchTokens = useMemo(
        () => searchQuery.toLowerCase().trim().split(/\s+/).filter(Boolean),
        [searchQuery],
    );
    const hasActiveSearch = searchTokens.length > 0;
    const activeName = isDirty ? null : lastChordPreset;

    const matchedIds = useMemo(() => {
        if (!hasActiveSearch) {
            return null;
        }
        const matches = new Set<string>();
        for (const entry of allEntries) {
            if (entryMatchesSearch(entry, searchTokens)) {
                matches.add(entry.id);
            }
        }
        return matches;
    }, [allEntries, hasActiveSearch, searchTokens]);

    const pinnedEntries: LibraryEntry[] = [];
    for (const entryId of favoriteIds) {
        const entry = entryById.get(entryId);
        if (entry) {
            pinnedEntries.push(entry);
        }
    }

    const recentEntries: LibraryEntry[] = [];
    for (const entryId of recentIds) {
        const entry = entryById.get(entryId);
        if (entry && !favoriteIdSet.has(entry.id)) {
            recentEntries.push(entry);
        }
    }

    const filteredEntryCount = matchedIds ? matchedIds.size : allEntries.length;

    const getPresetSections = (preset: LibraryPreset): Section[] => {
        const rawSections = getRawPresetSections(preset);

        return rawSections.map((section, index) => ({
            id: section.id || generateId(),
            label: section.label || `Section ${index + 1}`,
            value: section.value || '',
            repeat: section.repeat || 1,
            key:
                section.key ||
                (typeof section.keyShift === 'number'
                    ? transposeKeyName(currentKey || 'C', section.keyShift)
                    : undefined),
            isMinor: typeof section.isMinor === 'boolean' ? section.isMinor : undefined,
            timeSignature: section.timeSignature,
            seamless: section.seamless,
        }));
    };

    const toggleFavorite = (entryId: string) => {
        const isCurrentlyFavorite = favoriteIdSet.has(entryId);
        const nextFavoriteIds = isCurrentlyFavorite
            ? favoriteIds.filter((id) => id !== entryId)
            : [entryId, ...favoriteIds.filter((id) => id !== entryId)];

        withViewTransition(() => {
            if (
                persistStoredStringArray(
                    FAVORITES_STORAGE_KEY,
                    nextFavoriteIds,
                    'Failed to update favorites.',
                )
            ) {
                setFavoriteIds(nextFavoriteIds);
            }
        });
    };

    const recordRecentPreset = (entryId: string) => {
        const nextRecentIds = [entryId, ...recentIds.filter((id) => id !== entryId)].slice(
            0,
            RECENT_PRESET_LIMIT,
        );

        // Not wrapped in withViewTransition: this fires alongside the modal-close
        // animation, and a concurrent root-level view transition holds the
        // closing modal alive long enough for it to flicker back in.
        if (
            persistStoredStringArray(
                RECENTS_STORAGE_KEY,
                nextRecentIds,
                'Failed to update recents.',
            )
        ) {
            setRecentIds(nextRecentIds);
        }
    };

    const handleSelect = (entry: LibraryEntry) => {
        const preset = entry.preset;
        const sections = getPresetSections(preset);
        if (sections.length === 0) {
            return;
        }

        if (mode === 'append') {
            // Append-as-section flow: keep the user's existing chart intact and
            // tack the preset's sections onto the end. Skip settings overrides
            // (BPM/style/timeSig) since they belong to a "fresh start" gesture.
            appendSections(sections);
            recordRecentPreset(entry.id);
            onSelect?.();
            return;
        }

        dispatch(ACTIONS.SET_ARRANGEMENT, sections);
        dispatch(ACTIONS.SET_IS_MINOR, !!preset.isMinor);

        if (applyPresetSettings) {
            if (preset.settings?.timeSignature) {
                dispatch(ACTIONS.SET_TIME_SIGNATURE, preset.settings.timeSignature);
            }
            if (typeof preset.settings?.bpm === 'number') {
                dispatch(ACTIONS.SET_BPM, preset.settings.bpm);
            }
            if (preset.settings?.style) {
                dispatch(ACTIONS.SET_STYLE, { module: 'chords', style: preset.settings.style });
            }
        }

        dispatch(ACTIONS.SET_PARAM, {
            module: 'arranger',
            param: 'lastChordPreset',
            value: preset.name,
        });
        dispatch(ACTIONS.SET_PARAM, {
            module: 'arranger',
            param: 'isDirty',
            value: false,
        });

        recordRecentPreset(entry.id);
        // #1120 — the canonical resync (validateAndAnalyze → syncWorker →
        // flushBuffers, in that order). See refreshArrangerUI() for why order
        // matters; hand-copying it here is exactly the drift #1128 removed.
        refreshArrangerUI();
        onSelect?.();
    };

    const handleDelete = (entry: LibraryEntry) => {
        if (!confirm(`Delete user preset "${entry.name}"?`)) {
            return;
        }

        const updatedUserPresets = userPresets.filter(
            (candidate) => buildPresetId('user', candidate) !== entry.id,
        );

        try {
            localStorage.setItem(USER_PRESETS_STORAGE_KEY, JSON.stringify(updatedUserPresets));
            const nextFavoriteIds = favoriteIds.filter((id) => id !== entry.id);
            const nextRecentIds = recentIds.filter((id) => id !== entry.id);

            localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(nextFavoriteIds));
            localStorage.setItem(RECENTS_STORAGE_KEY, JSON.stringify(nextRecentIds));
            window.dispatchEvent(new Event('storage_sync'));

            setUserPresets(updatedUserPresets);
            setFavoriteIds(nextFavoriteIds);
            setRecentIds(nextRecentIds);
        } catch (error) {
            console.warn('[PresetLibrary] Failed to delete stored preset:', error);
            alert('Failed to delete user preset.');
        }
    };

    const resultSummary = hasActiveSearch
        ? `Showing ${formatPresetCount(filteredEntryCount)} of ${formatPresetCount(allEntries.length)}`
        : `${formatPresetCount(allEntries.length)} ready to browse`;

    return (
        <div class="preset-library">
            <div class="preset-library-toolbar" data-testid="preset-library-toolbar">
                <div class="preset-library-search-row" role="search">
                    <label class="sr-only" htmlFor="presetLibrarySearch">
                        Search presets
                    </label>
                    <input
                        id="presetLibrarySearch"
                        class="preset-library-search-input"
                        type="search"
                        placeholder="Search presets, genres, styles, or chords"
                        value={searchQuery}
                        autoFocus
                        data-testid="preset-library-search"
                        onInput={(event) =>
                            setSearchQuery((event.currentTarget as HTMLInputElement).value)
                        }
                    />
                    {hasActiveSearch && (
                        <button
                            type="button"
                            class="secondary-btn preset-library-clear-btn"
                            data-testid="preset-library-clear"
                            onClick={() => setSearchQuery('')}
                        >
                            Clear
                        </button>
                    )}
                </div>
                <p
                    class="preset-library-summary"
                    data-testid="preset-library-result-summary"
                    aria-live="polite"
                >
                    {resultSummary}
                </p>
            </div>

            <div class="preset-library-results" data-testid="preset-library-results">
                <ChipRow
                    label="Pinned"
                    entries={pinnedEntries}
                    matchedIds={matchedIds}
                    activeName={activeName}
                    onSelect={handleSelect}
                    onToggleFavorite={toggleFavorite}
                    onDelete={handleDelete}
                />
                <ChipRow
                    label="Recent"
                    entries={recentEntries}
                    matchedIds={matchedIds}
                    activeName={activeName}
                    onSelect={handleSelect}
                    onToggleFavorite={toggleFavorite}
                    onDelete={handleDelete}
                />
                {userEntries.length > 0 && (
                    <ChipRow
                        label="Yours"
                        entries={userEntries}
                        matchedIds={matchedIds}
                        activeName={activeName}
                        onSelect={handleSelect}
                        onToggleFavorite={toggleFavorite}
                        onDelete={handleDelete}
                    />
                )}
                {groupedBuiltInEntries.map(([label, entries]) => (
                    <ChipRow
                        key={label}
                        label={label}
                        entries={entries}
                        matchedIds={matchedIds}
                        activeName={activeName}
                        onSelect={handleSelect}
                        onToggleFavorite={toggleFavorite}
                        onDelete={handleDelete}
                    />
                ))}

                {hasActiveSearch && filteredEntryCount === 0 && (
                    <div class="preset-library-empty-state">
                        <h4>No presets match that search</h4>
                        <p>Try a broader query, or clear to browse the full library.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
