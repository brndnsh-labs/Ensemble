import { keyNamesFor } from '@core/utils';

/**
 * The keys a section or bar key select offers (#2068): the picker's major names, plus the key the
 * chart already holds when it is none of them (a `Gb` from an import), so a written key is shown
 * as written and never swapped for a listed one.
 */
export function keyChoices(...held: (string | null | undefined)[]): string[] {
    return [...new Set([...keyNamesFor(false), ...held.filter((key): key is string => !!key)])];
}
