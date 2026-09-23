import { TIME_SIGNATURES } from '@engine/config';
import { resolveScoreContext } from '@engine/songbook/score-context';
import type { ScoreSection, SemanticScore } from '@engine/songbook/score-types';
import { useState } from 'react';
import { SECTION_NAME_MAX, type SectionChange } from '../lib/documents';
import { defaultGrouping, groupingsFor, groupingText, parseGrouping } from '../lib/grouping';

const KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

interface SectionSettingsProps {
    score: SemanticScore;
    /** The section holding the bar selected in the bar editor. */
    section: ScoreSection;
    disabled: boolean;
    onChange: (change: SectionChange) => void;
}

/**
 * One section settings surface (#1374): the section's name, how many times it plays, and its
 * key / mode / meter as either the song's or its own. Each control commits on its own through the
 * shell's `updateChart()` → `applyScore`; a text field commits on blur or Enter, never per keystroke.
 * Lives in the Edit panel only — the section badge on the stand is reserved for the conductor lens.
 */
export function SectionSettings({ score, section, disabled, onChange }: SectionSettingsProps) {
    // Keyed by the committed values, so an accepted or refused edit resets the field.
    return (
        <details className="measure-editor-settings section-settings">
            <summary>Section settings · {section.label}</summary>
            <div className="measure-editor-settings-grid">
                <CommitField
                    key={`name-${section.id}-${section.label}`}
                    label="Section name"
                    value={section.label}
                    maxLength={SECTION_NAME_MAX}
                    disabled={disabled}
                    onCommit={(label) => onChange({ label })}
                />
                <CommitField
                    key={`plays-${section.id}-${section.repeat}`}
                    label="Section plays"
                    value={String(section.repeat)}
                    inputMode="numeric"
                    disabled={disabled}
                    onCommit={(value) => onChange({ repeat: Number(value) })}
                />
                <SectionSelects
                    score={score}
                    section={section}
                    disabled={disabled}
                    onChange={onChange}
                />
            </div>
            <p className="measure-editor-hint">
                A bar with its own key or meter keeps it. Changing the section's meter re-fits bars
                of equal lengths and resets its beat grouping; chord names are not transposed.
            </p>
        </details>
    );
}

function SectionSelects({ score, section, disabled, onChange }: SectionSettingsProps) {
    const song = resolveScoreContext(score, {});
    const effective = resolveScoreContext(score, section);
    // #1376 — the section's beat grouping, where its meter has more than one idiomatic split.
    // "Song's" is what the section inherits: the song's grouping, unless the section writes its
    // own meter, which resets grouping to that meter's default.
    const groupings = groupingsFor(effective.meter);
    if (
        groupings.length &&
        section.grouping &&
        !groupings.some((g) => groupingText(g) === groupingText(section.grouping ?? []))
    ) {
        groupings.push(section.grouping);
    }
    const inheritedGrouping =
        (section.meter === undefined ? song.grouping : null) ?? defaultGrouping(effective.meter);
    const meters = [...new Set([...Object.keys(TIME_SIGNATURES), section.meter ?? song.meter])];
    const keys = [...new Set([...KEYS, section.key ?? song.key])];
    return (
        <>
            <label>
                Section key
                <select
                    value={section.key ?? ''}
                    disabled={disabled}
                    onChange={(event) => onChange({ key: event.target.value || null })}
                >
                    <option value="">Song's ({song.key})</option>
                    {keys.map((key) => (
                        <option key={key}>{key}</option>
                    ))}
                </select>
            </label>
            <label>
                Section mode
                <select
                    value={section.isMinor === undefined ? '' : section.isMinor ? 'minor' : 'major'}
                    disabled={disabled}
                    onChange={(event) =>
                        onChange({
                            isMinor: event.target.value ? event.target.value === 'minor' : null,
                        })
                    }
                >
                    <option value="">Song's ({song.isMinor ? 'minor' : 'major'})</option>
                    <option value="major">Major</option>
                    <option value="minor">Minor</option>
                </select>
            </label>
            <label>
                Section meter
                <select
                    value={section.meter ?? ''}
                    disabled={disabled}
                    onChange={(event) => onChange({ meter: event.target.value || null })}
                >
                    <option value="">Song's ({song.meter})</option>
                    {meters.map((meter) => (
                        <option key={meter}>{meter}</option>
                    ))}
                </select>
            </label>
            {groupings.length > 0 && (
                <label>
                    Section beat grouping
                    <select
                        value={section.grouping ? groupingText(section.grouping) : ''}
                        disabled={disabled}
                        onChange={(event) =>
                            onChange({
                                grouping: event.target.value
                                    ? parseGrouping(event.target.value)
                                    : null,
                            })
                        }
                    >
                        <option value="">Song's ({groupingText(inheritedGrouping ?? [])})</option>
                        {groupings.map((grouping) => (
                            <option key={groupingText(grouping)}>{groupingText(grouping)}</option>
                        ))}
                    </select>
                </label>
            )}
        </>
    );
}

interface CommitFieldProps {
    label: string;
    value: string;
    maxLength?: number;
    inputMode?: 'numeric';
    disabled: boolean;
    onCommit: (value: string) => void;
}

/** A text field that commits once — on blur or Enter — and only when its value changed. */
function CommitField({ label, value, maxLength, inputMode, disabled, onCommit }: CommitFieldProps) {
    const [text, setText] = useState(value);
    const commit = () => {
        if (text !== value) {
            onCommit(text);
            // An accepted edit re-keys this field with the new value; a refused one (the shell
            // shows why) must not leave the rejected text looking committed.
            setText(value);
        }
    };
    return (
        <label>
            {label}
            <input
                value={text}
                maxLength={maxLength}
                inputMode={inputMode}
                disabled={disabled}
                onChange={(event) => setText(event.target.value)}
                onBlur={commit}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        commit();
                    }
                }}
            />
        </label>
    );
}
