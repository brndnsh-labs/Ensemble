'use client';

import { TIME_SIGNATURES } from '@engine/config';
import type { resolveScoreContext } from '@engine/songbook/score-context';
import type { ScoreContext } from '@engine/songbook/score-types';
import { defaultGrouping, groupingsFor, groupingText, parseGrouping } from '../lib/grouping';

const KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

interface BarContextFieldsProps {
    /** What the bar itself writes: an empty field is "Continue". */
    context: ScoreContext;
    /** What the bar inherits from the bars before it, for the "Continue (…)" choices. */
    inherited: ReturnType<typeof resolveScoreContext>;
    /** The meter the bar reads in, its own change counted. */
    meter: string;
    disabled: boolean;
    className: string;
    onChange: (context: ScoreContext) => void;
}

/**
 * A bar's "Key or meter from here" selects, in the bar menu (#1725): they write the bar's draft,
 * as typing in its field does.
 */
export function BarContextFields({
    context,
    inherited,
    meter,
    disabled,
    className,
    onChange,
}: BarContextFieldsProps) {
    const keys = [...new Set([...KEYS, context.key].filter((key): key is string => Boolean(key)))];
    const meters = [...new Set([...Object.keys(TIME_SIGNATURES), meter])];
    // #1376 — offered only where the bar's meter has more than one idiomatic split. What
    // "Continue" plays: the grouping this bar inherits, unless it writes a meter, which resets
    // grouping to the meter's own default.
    const written = context.grouping;
    const groupings = groupingsFor(meter);
    // An imported grouping the table does not list is still shown, never silently swapped.
    if (
        groupings.length &&
        written &&
        !groupings.some((g) => groupingText(g) === groupingText(written))
    ) {
        groupings.push(written);
    }
    const continuedGrouping =
        (context.meter === undefined ? inherited.grouping : null) ?? defaultGrouping(meter);
    return (
        <div className={className}>
            <label>
                Key from this bar
                <select
                    aria-label="Key from this bar"
                    value={context.key ?? ''}
                    disabled={disabled}
                    onChange={(event) => {
                        const next = { ...context };
                        if (event.target.value) {
                            next.key = event.target.value;
                        } else {
                            delete next.key;
                        }
                        onChange(next);
                    }}
                >
                    <option value="">Continue ({inherited.key})</option>
                    {keys.map((key) => (
                        <option key={key}>{key}</option>
                    ))}
                </select>
            </label>
            <label>
                Mode from this bar
                <select
                    aria-label="Mode from this bar"
                    value={context.isMinor === undefined ? '' : context.isMinor ? 'minor' : 'major'}
                    disabled={disabled}
                    onChange={(event) => {
                        const next = { ...context };
                        if (event.target.value) {
                            next.isMinor = event.target.value === 'minor';
                        } else {
                            delete next.isMinor;
                        }
                        onChange(next);
                    }}
                >
                    <option value="">Continue ({inherited.isMinor ? 'minor' : 'major'})</option>
                    <option value="major">Major</option>
                    <option value="minor">Minor</option>
                </select>
            </label>
            <label>
                Meter from this bar
                <select
                    aria-label="Meter from this bar"
                    value={context.meter ?? ''}
                    disabled={disabled}
                    onChange={(event) => {
                        const next = { ...context };
                        if (event.target.value) {
                            next.meter = event.target.value;
                        } else {
                            delete next.meter;
                        }
                        delete next.grouping;
                        onChange(next);
                    }}
                >
                    <option value="">Continue ({inherited.meter})</option>
                    {meters.map((value) => (
                        <option key={value}>{value}</option>
                    ))}
                </select>
            </label>
            {groupings.length > 0 && (
                <label>
                    Beat grouping from this bar
                    <select
                        aria-label="Beat grouping from this bar"
                        value={context.grouping ? groupingText(context.grouping) : ''}
                        disabled={disabled}
                        onChange={(event) => {
                            const next = { ...context };
                            if (event.target.value) {
                                next.grouping = parseGrouping(event.target.value);
                            } else {
                                delete next.grouping;
                            }
                            onChange(next);
                        }}
                    >
                        <option value="">Continue ({groupingText(continuedGrouping ?? [])})</option>
                        {groupings.map((grouping) => (
                            <option key={groupingText(grouping)}>{groupingText(grouping)}</option>
                        ))}
                    </select>
                </label>
            )}
        </div>
    );
}
