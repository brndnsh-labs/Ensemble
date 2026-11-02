import { SECTION_ROLES, sectionRoleOf } from '@band/index';
import type { ScoreSection, SemanticScore } from '@core/songbook/score-types';
import type { SectionChange, SectionLane } from '../lib/documents';

/** The lanes a section can silence, as the stand names them (`SectionLane`). */
const SECTION_LANE_NAMES: readonly { lane: SectionLane; name: string }[] = [
    { lane: 'groove', name: 'Drums' },
    { lane: 'bass', name: 'Bass' },
    { lane: 'chords', name: 'Comp' },
    { lane: 'soloist', name: 'Lead' },
];

/**
 * The first single capital no section is already named and the band reads no role from, for a
 * section given none (a lone B would read as a Bridge).
 */
function freeLetter(score: SemanticScore): string {
    const taken = new Set(score.sections.map((s) => s.label.trim()));
    return (
        [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].find(
            (letter) => !taken.has(letter) && sectionRoleOf(letter) === null,
        ) ?? `S${score.sections.length + 1}`
    );
}

interface SectionBandFieldsProps {
    score: SemanticScore;
    section: ScoreSection;
    disabled: boolean;
    onChange: (change: SectionChange) => void;
}

/**
 * A section's role and who plays in it (#2021). The role is the one the band reads off the
 * section's name (`sectionRoleOf`), so choosing one names the section for it and "None" gives it
 * a plain letter; a lane left unticked is silent for this section only (the chart's own
 * `instruments`), on top of whatever the band and "your instrument" already have off.
 */
export function SectionBandFields({ score, section, disabled, onChange }: SectionBandFieldsProps) {
    const role = sectionRoleOf(section.label);
    return (
        <>
            <label>
                Section role
                <select
                    value={role ?? ''}
                    disabled={disabled}
                    onChange={(event) => {
                        const chosen = event.target.value;
                        // Same role as it already reads: nothing to rename ("Verse 2" stays).
                        if (chosen !== (role ?? '')) {
                            onChange({ label: chosen || freeLetter(score) });
                        }
                    }}
                >
                    <option value="">None</option>
                    {SECTION_ROLES.map((entry) => (
                        <option key={entry.name} value={entry.name}>
                            {entry.name}
                        </option>
                    ))}
                </select>
            </label>
            <fieldset className="section-lanes">
                <legend>Plays in this section</legend>
                {SECTION_LANE_NAMES.map(({ lane, name }) => (
                    <label key={lane} className="section-lane">
                        <input
                            type="checkbox"
                            checked={section.instruments?.[lane] !== false}
                            aria-disabled={disabled || undefined}
                            onChange={(event) => {
                                if (!disabled) {
                                    onChange({ lane, on: event.target.checked ? null : false });
                                }
                            }}
                        />
                        {name}
                    </label>
                ))}
            </fieldset>
        </>
    );
}

/** What the section letter hints: a role the name doesn't already spell, and lanes left out. */
export function sectionMarks(section: ScoreSection): string {
    const role = sectionRoleOf(section.label);
    const marks: string[] = [];
    // Only a role the name doesn't already spell: "Verse 2" says it, "Hook" or a lone "B" doesn't.
    if (role && !section.label.trim().toLowerCase().startsWith(role.toLowerCase())) {
        marks.push(role);
    }
    const silent = SECTION_LANE_NAMES.filter(({ lane }) => section.instruments?.[lane] === false);
    if (silent.length > 0) {
        marks.push(`no ${silent.map(({ name }) => name.toLowerCase()).join(', ')}`);
    }
    return marks.join(' · ');
}
