import { TIME_SIGNATURES } from '@engine/config';
import { resolveScoreContext } from '@engine/songbook/score-context';
import type { ScoreSection, SemanticScore } from '@engine/songbook/score-types';
import { useEffect, useState } from 'react';
import { SECTION_NAME_MAX, type SectionChange } from '../lib/documents';
import { defaultGrouping, groupingsFor, groupingText, parseGrouping } from '../lib/grouping';

const KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

interface SectionSettingsProps {
    score: SemanticScore;
    /** The section the settings are for: the one whose letter was pressed (#1726). */
    section: ScoreSection;
    disabled: boolean;
    onChange: (change: SectionChange) => void;
}

/** Which typed field a pending change is from. */
export type SectionField = 'label' | 'repeat';

interface SectionNameFieldsProps extends SectionSettingsProps {
    /** What a field holds that it has not committed yet (null: nothing), so an action pressed
     * while it is being typed can take it with it (`SectionMenu`). */
    onPending: (field: SectionField, change: SectionChange | null) => void;
}

/**
 * A section's name and how many times it plays (#1374), in the section letter's menu since #1726.
 * Each commits on its own through the shell's `updateChart()` → `applyScore`, on blur or Enter,
 * never per keystroke.
 */
export function SectionNameFields({
    section,
    disabled,
    onChange,
    onPending,
}: SectionNameFieldsProps) {
    // Keyed by the section only, so a commit keeps the field (and its focus) where it is.
    return (
        <>
            <CommitField
                key={`name-${section.id}`}
                label="Section name"
                value={section.label}
                maxLength={SECTION_NAME_MAX}
                disabled={disabled}
                change={(label) => ({ label })}
                onCommit={onChange}
                onPending={(change) => onPending('label', change)}
            />
            <CommitField
                key={`plays-${section.id}`}
                label="Section plays"
                value={String(section.repeat)}
                inputMode="numeric"
                disabled={disabled}
                change={(value) => ({ repeat: Number(value) })}
                onCommit={onChange}
                onPending={(change) => onPending('repeat', change)}
            />
        </>
    );
}

/** A section's key, mode, meter and beat grouping, each either the song's or its own (#1374). */
export function SectionSelects({ score, section, disabled, onChange }: SectionSettingsProps) {
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
    change: (text: string) => SectionChange;
    onCommit: (change: SectionChange) => void;
    onPending: (change: SectionChange | null) => void;
}

/**
 * A text field that commits once — on blur or Enter — and only when its value changed. While a
 * change is being made it is read-only, not disabled: a disabled field drops its focus, and Esc
 * and the chart's keys would go with it (#1726).
 */
function CommitField({
    label,
    value,
    maxLength,
    inputMode,
    disabled,
    change,
    onCommit,
    onPending,
}: CommitFieldProps) {
    const [text, setText] = useState(value);
    // An accepted edit (or one made elsewhere) arrives as a new value.
    // biome-ignore lint/correctness/useExhaustiveDependencies: only a new committed value resets it.
    useEffect(() => {
        setText(value);
        onPending(null);
    }, [value]);
    const commit = () => {
        if (disabled || text === value) {
            return;
        }
        onPending(null);
        onCommit(change(text));
        // A refused edit (the shell shows why) must not leave the rejected text looking
        // committed; an accepted one comes back as the new value.
        setText(value);
    };
    return (
        <label>
            {label}
            <input
                value={text}
                maxLength={maxLength}
                inputMode={inputMode}
                readOnly={disabled}
                aria-disabled={disabled || undefined}
                onChange={(event) => {
                    setText(event.target.value);
                    onPending(event.target.value === value ? null : change(event.target.value));
                }}
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
