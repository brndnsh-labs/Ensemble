import { useEffect, useMemo, useState } from 'preact/hooks';

import { validateAndAnalyze } from '../arranger-controller.js';
import { CHORD_PRESETS } from '../data/chord-presets.js';
import { flushBuffers } from '../instrument-controller.js';
import { saveCurrentState } from '../persistence.js';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { showToast } from '../ui.js';
import { useEnsembleState } from '../ui-bridge.js';
import { decompressSections, generateId, transposeKeyName } from '../utils.js';

const USER_PRESETS_STORAGE_KEY = 'ensemble_userPresets';
const FAVORITES_STORAGE_KEY = 'ensemble_presetLibraryFavorites';
const RECENTS_STORAGE_KEY = 'ensemble_presetLibraryRecents';
const ALL_GENRES_LABEL = 'All';
const RECENT_PRESET_LIMIT = 6;

/**
 * @typedef {import('../state/arranger.js').Section} Section
 * @typedef {Partial<Section> & { keyShift?: number }} PresetSection
 * @typedef {{ bpm?: number, style?: string, timeSignature?: string }} PresetSettings
 * @typedef {{ variant?: string, notes?: string, references?: string[] }} PresetProvenance
 * @typedef {{
 *   name: string,
 *   sections: string | Array<PresetSection>,
 *   category?: string,
 *   isMinor?: boolean,
 *   timestamp?: number,
 *   settings?: PresetSettings,
 *   provenance?: PresetProvenance
 * }} LibraryPreset
 * @typedef {'built-in' | 'user'} PresetSource
 * @typedef {{
 *   id: string,
 *   name: string,
 *   source: PresetSource,
 *   preset: LibraryPreset,
 *   category: string,
 *   styleLabel: string,
 *   preview: string,
 *   searchableText: string,
 *   isMinor: boolean,
 *   isFavorite: boolean,
 *   isRecent: boolean
 * }} LibraryEntry
 */

/**
 * @param {string} value
 * @returns {string}
 */
function formatBadgeLabel(value) {
    return value
        .split(/[-_]/g)
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

/**
 * @param {number} count
 * @returns {string}
 */
function formatPresetCount(count) {
    return `${count} preset${count === 1 ? '' : 's'}`;
}

/**
 * @param {PresetSource} source
 * @param {LibraryPreset} preset
 * @returns {string}
 */
function buildPresetId(source, preset) {
    if (source === 'built-in') {
        return `built-in:${preset.name}`;
    }

    return typeof preset.timestamp === 'number'
        ? `user:${preset.timestamp}`
        : `user:${preset.name}`;
}

/**
 * @returns {LibraryPreset[]}
 */
function loadStoredUserPresets() {
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

/**
 * @param {string} key
 * @returns {string[]}
 */
function loadStoredStringArray(key) {
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

/**
 * @param {string} key
 * @param {string[]} values
 * @param {string} failureMessage
 * @returns {boolean}
 */
function persistStoredStringArray(key, values, failureMessage) {
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

/**
 * @param {LibraryPreset} preset
 * @returns {PresetSection[]}
 */
function getRawPresetSections(preset) {
    if (Array.isArray(preset.sections)) {
        return /** @type {PresetSection[]} */ (preset.sections);
    }

    if (typeof preset.sections !== 'string') {
        return [];
    }

    try {
        const sections = decompressSections(preset.sections);
        return Array.isArray(sections) ? /** @type {PresetSection[]} */ (sections) : [];
    } catch (error) {
        console.warn(`[PresetLibrary] Failed to decompress preset "${preset.name}":`, error);
        return [];
    }
}

/**
 * @param {LibraryPreset} preset
 * @param {PresetSource} source
 * @returns {string}
 */
function getPresetCategory(preset, source) {
    return preset.category || (source === 'user' ? 'Custom' : 'Library');
}

/**
 * @param {LibraryPreset} preset
 * @param {PresetSection[]} sections
 * @returns {string}
 */
function getPresetPreview(preset, sections) {
    if (preset.provenance?.variant) {
        return preset.provenance.variant;
    }

    if (preset.provenance?.notes) {
        return preset.provenance.notes;
    }

    const firstSection = sections[0];
    if (firstSection?.value) {
        return firstSection.label
            ? `${firstSection.label}: ${firstSection.value}`
            : firstSection.value;
    }

    return 'Saved progression';
}

/**
 * @param {LibraryPreset} preset
 * @param {PresetSource} source
 * @param {PresetSection[]} sections
 * @returns {string}
 */
function getPresetSearchText(preset, source, sections) {
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

/**
 * @param {LibraryEntry} entry
 * @param {string[]} searchTokens
 * @param {string} activeGenre
 * @param {boolean} favoritesOnly
 * @returns {boolean}
 */
function matchesEntry(entry, searchTokens, activeGenre, favoritesOnly) {
    if (favoritesOnly && !entry.isFavorite) {
        return false;
    }

    if (activeGenre !== ALL_GENRES_LABEL && entry.category !== activeGenre) {
        return false;
    }

    if (searchTokens.length === 0) {
        return true;
    }

    return searchTokens.every((token) => entry.searchableText.includes(token));
}

/**
 * @param {{
 *   entry: LibraryEntry,
 *   isActive: boolean,
 *   onSelect: (entry: LibraryEntry) => void,
 *   onToggleFavorite: (entryId: string) => void,
 *   onDelete: ((entry: LibraryEntry) => void) | undefined
 * }} props
 */
function PresetCard({ entry, isActive, onSelect, onToggleFavorite, onDelete }) {
    return (
        <article
            class={`preset-library-card${isActive ? ' active' : ''}`}
            data-category={entry.category}
            data-source={entry.source}
        >
            <div class="preset-library-card-actions">
                <button
                    type="button"
                    class={`preset-library-pin-btn${entry.isFavorite ? ' active' : ''}`}
                    aria-label={`${
                        entry.isFavorite ? 'Remove' : 'Add'
                    } ${entry.name} ${entry.isFavorite ? 'from' : 'to'} favorites`}
                    aria-pressed={entry.isFavorite}
                    onClick={() => onToggleFavorite(entry.id)}
                >
                    {entry.isFavorite ? 'Pinned' : 'Pin'}
                </button>
                {entry.source === 'user' && onDelete && (
                    <button
                        type="button"
                        class="preset-library-delete-btn"
                        aria-label={`Delete preset ${entry.name}`}
                        onClick={() => onDelete(entry)}
                    >
                        Delete
                    </button>
                )}
            </div>
            <button
                type="button"
                class="preset-library-card-button"
                aria-label={entry.name}
                onClick={() => onSelect(entry)}
            >
                <div class="preset-library-card-header">
                    <span class="preset-library-card-title">{entry.name}</span>
                    {entry.isRecent && <span class="preset-library-badge">Recent</span>}
                </div>
                <div class="preset-library-card-badges">
                    <span class="preset-library-badge">{entry.category}</span>
                    {entry.styleLabel && (
                        <span class="preset-library-badge">{entry.styleLabel}</span>
                    )}
                    <span class="preset-library-badge">{entry.isMinor ? 'Minor' : 'Major'}</span>
                    {entry.source === 'user' && <span class="preset-library-badge">User</span>}
                </div>
                <p class="preset-library-card-preview">{entry.preview}</p>
            </button>
        </article>
    );
}

/**
 * @param {{ onSelect?: (() => void) | undefined }} props
 */
export function PresetLibrary({ onSelect }) {
    const currentKey = useEnsembleState(
        (/** @type {import('../types.js').EnsembleState} */ state) => state.arranger.key,
    );
    const lastChordPreset = useEnsembleState(
        (/** @type {import('../types.js').EnsembleState} */ state) =>
            state.arranger.lastChordPreset,
    );
    const isDirty = useEnsembleState(
        (/** @type {import('../types.js').EnsembleState} */ state) => state.arranger.isDirty,
    );
    const applyPresetSettings = useEnsembleState(
        (/** @type {import('../types.js').EnsembleState} */ state) =>
            state.playback.applyPresetSettings,
    );

    const [searchQuery, setSearchQuery] = useState('');
    const [activeGenre, setActiveGenre] = useState(ALL_GENRES_LABEL);
    const [favoritesOnly, setFavoritesOnly] = useState(false);
    const [userPresets, setUserPresets] = useState(/** @type {LibraryPreset[]} */ ([]));
    const [favoriteIds, setFavoriteIds] = useState(/** @type {string[]} */ ([]));
    const [recentIds, setRecentIds] = useState(/** @type {string[]} */ ([]));

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
    const recentIdSet = useMemo(() => new Set(recentIds), [recentIds]);

    /** @type {LibraryEntry[]} */
    const builtInEntries = useMemo(
        () =>
            /** @type {LibraryEntry[]} */ (
                CHORD_PRESETS.map((preset) => {
                    const presetId = buildPresetId('built-in', preset);
                    const sections = getRawPresetSections(preset);
                    return {
                        id: presetId,
                        name: preset.name,
                        source: /** @type {PresetSource} */ ('built-in'),
                        preset,
                        category: getPresetCategory(preset, 'built-in'),
                        styleLabel: preset.settings?.style
                            ? formatBadgeLabel(preset.settings.style)
                            : '',
                        preview: getPresetPreview(preset, sections),
                        searchableText: getPresetSearchText(preset, 'built-in', sections),
                        isMinor: Boolean(preset.isMinor),
                        isFavorite: favoriteIdSet.has(presetId),
                        isRecent: recentIdSet.has(presetId),
                    };
                })
            ),
        [favoriteIdSet, recentIdSet],
    );

    /** @type {LibraryEntry[]} */
    const userEntries = useMemo(() => {
        const sortedPresets = [...userPresets].sort(
            (left, right) => (right.timestamp || 0) - (left.timestamp || 0),
        );

        return /** @type {LibraryEntry[]} */ (
            sortedPresets.map((preset) => {
                const presetId = buildPresetId('user', preset);
                const sections = getRawPresetSections(preset);
                return {
                    id: presetId,
                    name: preset.name,
                    source: /** @type {PresetSource} */ ('user'),
                    preset,
                    category: getPresetCategory(preset, 'user'),
                    styleLabel: preset.settings?.style
                        ? formatBadgeLabel(preset.settings.style)
                        : '',
                    preview: getPresetPreview(preset, sections),
                    searchableText: getPresetSearchText(preset, 'user', sections),
                    isMinor: Boolean(preset.isMinor),
                    isFavorite: favoriteIdSet.has(presetId),
                    isRecent: recentIdSet.has(presetId),
                };
            })
        );
    }, [favoriteIdSet, recentIdSet, userPresets]);

    /** @type {LibraryEntry[]} */
    const allEntries = useMemo(
        () => [...builtInEntries, ...userEntries],
        [builtInEntries, userEntries],
    );
    const entryById = useMemo(
        () => new Map(allEntries.map((entry) => [entry.id, entry])),
        [allEntries],
    );

    const genres = useMemo(() => {
        /** @type {string[]} */
        const nextGenres = [];
        for (const entry of allEntries) {
            if (entry.category === 'Custom' || nextGenres.includes(entry.category)) {
                continue;
            }
            nextGenres.push(entry.category);
        }
        return nextGenres;
    }, [allEntries]);

    const searchTokens = useMemo(
        () => searchQuery.toLowerCase().trim().split(/\s+/).filter(Boolean),
        [searchQuery],
    );

    const filteredBuiltInEntries = useMemo(
        () =>
            builtInEntries.filter((entry) =>
                matchesEntry(entry, searchTokens, activeGenre, favoritesOnly),
            ),
        [activeGenre, builtInEntries, favoritesOnly, searchTokens],
    );
    const filteredUserEntries = useMemo(
        () =>
            userEntries.filter((entry) =>
                matchesEntry(entry, searchTokens, activeGenre, favoritesOnly),
            ),
        [activeGenre, favoritesOnly, searchTokens, userEntries],
    );

    const filteredEntryCount = filteredBuiltInEntries.length + filteredUserEntries.length;
    const hasActiveFilters =
        searchTokens.length > 0 || activeGenre !== ALL_GENRES_LABEL || favoritesOnly;
    const activeName = isDirty ? null : lastChordPreset;

    /** @type {LibraryEntry[]} */
    const pinnedEntries = [];
    for (const entryId of favoriteIds) {
        const entry = entryById.get(entryId);
        if (entry) {
            pinnedEntries.push(entry);
        }
    }

    /** @type {LibraryEntry[]} */
    const recentEntries = [];
    for (const entryId of recentIds) {
        const entry = entryById.get(entryId);
        if (entry && !favoriteIdSet.has(entry.id)) {
            recentEntries.push(entry);
        }
    }

    /**
     * @param {LibraryPreset} preset
     * @returns {Section[]}
     */
    const getPresetSections = (preset) => {
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

    /**
     * @param {string} entryId
     */
    const toggleFavorite = (entryId) => {
        const isCurrentlyFavorite = favoriteIdSet.has(entryId);
        const nextFavoriteIds = isCurrentlyFavorite
            ? favoriteIds.filter((id) => id !== entryId)
            : [entryId, ...favoriteIds.filter((id) => id !== entryId)];

        if (
            persistStoredStringArray(
                FAVORITES_STORAGE_KEY,
                nextFavoriteIds,
                'Failed to update favorites.',
            )
        ) {
            setFavoriteIds(nextFavoriteIds);
        }
    };

    /**
     * @param {string} entryId
     */
    const recordRecentPreset = (entryId) => {
        const nextRecentIds = [entryId, ...recentIds.filter((id) => id !== entryId)].slice(
            0,
            RECENT_PRESET_LIMIT,
        );

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

    /**
     * @param {LibraryEntry} entry
     */
    const handleSelect = (entry) => {
        const preset = entry.preset;
        const sections = getPresetSections(preset);
        if (sections.length === 0) {
            return;
        }

        flushBuffers();
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

        validateAndAnalyze();
        recordRecentPreset(entry.id);
        saveCurrentState();
        onSelect?.();
    };

    /**
     * @param {LibraryEntry} entry
     */
    const handleDelete = (entry) => {
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

    const resultSummary = hasActiveFilters
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
                        data-testid="preset-library-search"
                        onInput={(event) =>
                            setSearchQuery(
                                /** @type {HTMLInputElement} */ (event.currentTarget).value,
                            )
                        }
                    />
                    {(searchQuery || hasActiveFilters) && (
                        <button
                            type="button"
                            class="secondary-btn preset-library-clear-btn"
                            data-testid="preset-library-clear"
                            onClick={() => {
                                setSearchQuery('');
                                setActiveGenre(ALL_GENRES_LABEL);
                                setFavoritesOnly(false);
                            }}
                        >
                            Clear
                        </button>
                    )}
                </div>

                <div class="preset-library-toolbar-meta">
                    <p
                        class="preset-library-summary"
                        data-testid="preset-library-result-summary"
                        aria-live="polite"
                    >
                        {resultSummary}
                    </p>
                    <button
                        type="button"
                        class={`button-group-btn preset-library-favorites-toggle${
                            favoritesOnly ? ' active' : ''
                        }`}
                        data-testid="preset-library-favorites-only"
                        aria-pressed={favoritesOnly}
                        onClick={() => setFavoritesOnly((currentValue) => !currentValue)}
                    >
                        Favorites only
                    </button>
                </div>

                <div class="preset-library-filter-group">
                    <span class="preset-library-filter-label">Genre</span>
                    <div
                        class="button-group preset-library-filter-chips"
                        role="group"
                        aria-label="Genre filters"
                    >
                        <button
                            type="button"
                            class={`button-group-btn${activeGenre === ALL_GENRES_LABEL ? ' active' : ''}`}
                            aria-pressed={activeGenre === ALL_GENRES_LABEL}
                            onClick={() => setActiveGenre(ALL_GENRES_LABEL)}
                        >
                            {ALL_GENRES_LABEL}
                        </button>
                        {genres.map((genre) => (
                            <button
                                type="button"
                                key={genre}
                                class={`button-group-btn${activeGenre === genre ? ' active' : ''}`}
                                aria-pressed={activeGenre === genre}
                                onClick={() => setActiveGenre(genre)}
                            >
                                {genre}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div class="preset-library-results" data-testid="preset-library-results">
                {!hasActiveFilters && pinnedEntries.length > 0 && (
                    <div class="preset-library-section">
                        <div class="preset-library-section-header">
                            <h4>Pinned favorites</h4>
                            <p>Keep the progressions you reach for most right at the top.</p>
                        </div>
                        <div class="preset-library-card-grid">
                            {pinnedEntries.map((entry) => (
                                <PresetCard
                                    key={`pinned-${entry.id}`}
                                    entry={entry}
                                    isActive={activeName === entry.name}
                                    onSelect={handleSelect}
                                    onToggleFavorite={toggleFavorite}
                                    onDelete={entry.source === 'user' ? handleDelete : undefined}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {!hasActiveFilters && recentEntries.length > 0 && (
                    <div class="preset-library-section">
                        <div class="preset-library-section-header">
                            <h4>Recent picks</h4>
                            <p>Jump back into the last progressions you loaded.</p>
                        </div>
                        <div class="preset-library-card-grid">
                            {recentEntries.map((entry) => (
                                <PresetCard
                                    key={`recent-${entry.id}`}
                                    entry={entry}
                                    isActive={activeName === entry.name}
                                    onSelect={handleSelect}
                                    onToggleFavorite={toggleFavorite}
                                    onDelete={entry.source === 'user' ? handleDelete : undefined}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {filteredBuiltInEntries.length > 0 && (
                    <div class="preset-library-section">
                        <div class="preset-library-section-header">
                            <h4>Library</h4>
                            <p>
                                Browse the built-in progressions by style, genre, and harmonic
                                character.
                            </p>
                        </div>
                        <div class="preset-library-card-grid">
                            {filteredBuiltInEntries.map((entry) => (
                                <PresetCard
                                    key={entry.id}
                                    entry={entry}
                                    isActive={activeName === entry.name}
                                    onSelect={handleSelect}
                                    onToggleFavorite={toggleFavorite}
                                    onDelete={undefined}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {filteredUserEntries.length > 0 && (
                    <div class="preset-library-section">
                        <div class="preset-library-section-header">
                            <h4>Your presets</h4>
                            <p>
                                Saved charts stay searchable and can be pinned alongside the
                                built-ins.
                            </p>
                        </div>
                        <div class="preset-library-card-grid">
                            {filteredUserEntries.map((entry) => (
                                <PresetCard
                                    key={entry.id}
                                    entry={entry}
                                    isActive={activeName === entry.name}
                                    onSelect={handleSelect}
                                    onToggleFavorite={toggleFavorite}
                                    onDelete={handleDelete}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {filteredEntryCount === 0 && (
                    <div class="preset-library-empty-state">
                        <h4>No presets match that search</h4>
                        <p>
                            Try a broader genre, clear the favorites toggle, or search by style or
                            chord symbols.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
