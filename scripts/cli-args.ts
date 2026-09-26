/**
 * Command-line options for the listening-gate tools: `--key=value` and bare `--flag` arguments,
 * read with a fallback. Options are an own-key record, so `--constructor` reads as an option, not
 * as an `Object` prototype member.
 */
export type CliOptions = Record<string, string | boolean>;

export function parseCliArgs(argv: readonly string[]): CliOptions {
    const options: CliOptions = {};
    for (const arg of argv) {
        if (!arg.startsWith('--')) {
            continue;
        }
        const token = arg.slice(2);
        const separatorIndex = token.indexOf('=');
        if (separatorIndex === -1) {
            options[token] = true;
            continue;
        }
        options[token.slice(0, separatorIndex)] = token.slice(separatorIndex + 1);
    }
    return options;
}

function optionValue<T>(options: CliOptions, key: string, fallback: T): string | boolean | T {
    return Object.hasOwn(options, key) ? options[key] : fallback;
}

export function readBooleanOption(options: CliOptions, key: string, fallback = false): boolean {
    const value = optionValue(options, key, fallback);
    if (typeof value === 'boolean') {
        return value;
    }
    if (value === undefined || value === null) {
        return fallback;
    }
    return !['0', 'false', 'no', 'off'].includes(String(value).toLowerCase());
}

export function readNumberOption<T>(options: CliOptions, key: string, fallback: T): number | T {
    const parsed = Number.parseFloat(String(optionValue(options, key, fallback)));
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function readStringOption<T>(options: CliOptions, key: string, fallback: T): string | T {
    const value = optionValue(options, key, fallback);
    return value === undefined || value === null || value === '' ? fallback : String(value);
}

/** A comma-separated seed sweep, deduplicated; the base seed alone when none is given. */
export function normalizeSeedList(baseSeed: string, sweepOption: string | boolean = ''): string[] {
    const requested = String(sweepOption || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    return [...new Set(requested.length > 0 ? requested : [baseSeed])];
}
