import { globSync, readFileSync } from 'node:fs';

const args = process.argv.slice(2);
if (args.length === 0) {
    process.exit(0);
}

const files = args.flatMap((arg) => (arg.includes('*') ? globSync(arg) : [arg]));

const SLICES = 'playback|chords|bass|soloist|harmony|groove|midi|vizState|arranger|conductor';

// Three write idioms reach a slice. The guard has to see all three, because the
// slices are `readonly` in `types.ts` — a bare `slice.field = x` doesn't even
// typecheck in `public/`, so every REAL write in the tree uses a cast and the
// bare-only regex fired on nothing.
//
// 1. bare        `playback.step = 4`  (still possible through a loosely-typed handle)
// 2. cast        `(playback as Mutable<typeof playback>).step = 4`
// 3. aliased     `const p = playback as Mutable<typeof playback>;  p.step = 4`
//
// The `(?<!graph\.)` anchor keeps AUDIO-NODE writes off the state-mutation radar:
// `conductor.ts` aliases `playback.audioGraph` to `graph`, so `graph.bass.eq.type =`
// matched the bare slice-name alternation and read as a `bass` state mutation. A
// `state.<slice>.field =` write is still caught — only the `graph.` alias is excluded.
const bareRegex = new RegExp(String.raw`(?<!graph\.)\b(${SLICES})(\.[a-zA-Z0-9_]+)+ = `);
const castRegex = new RegExp(
    String.raw`\(\s*(${SLICES})(\.[a-zA-Z0-9_]+)*\s+as\s+[^)]*\)(\.[a-zA-Z0-9_]+)+ = `,
);
// Aliased handles are collected per-file in a first pass; `const graph = playback.audioGraph`
// is NOT an alias of a slice cast, so the audio-graph exclusion above survives.
const aliasDeclRegex = new RegExp(
    String.raw`\b(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*(?::[^=]+)?=\s*\(?\s*(${SLICES})(\.[a-zA-Z0-9_]+)*\s+as\s+`,
);

const MARKER_SOURCE = '@(?:direct|worker)-mutation';
const MARKER = new RegExp(MARKER_SOURCE);
const STANDALONE_MARKER_COMMENT = new RegExp(
    String.raw`^\s*(?://.*${MARKER_SOURCE}.*|/\*.*${MARKER_SOURCE}.*\*/|\*.*${MARKER_SOURCE}.*\*/)\s*$`,
);
// A marker trails the STATEMENT, not the line: multi-line writes such as
//   (playback as Mutable<typeof playback>).currentLoopCount = Math.floor(
//       globalStep / this.totalStepsOneLoop,
//   ); // @worker-mutation
// put the marker several lines below the `=`. Scan a standalone comment on the
// previous line (the comment-above form) plus forward to the end of the statement.
// A trailing marker on the preceding statement belongs only to that statement.
const MAX_STATEMENT_LINES = 12;

function isAnnotated(lines: string[], index: number): boolean {
    if (STANDALONE_MARKER_COMMENT.test(lines[index - 1] ?? '')) {
        return true;
    }
    for (let i = index; i < Math.min(lines.length, index + MAX_STATEMENT_LINES); i++) {
        const line = lines[i];
        if (MARKER.test(line)) {
            return true;
        }
        // Statement end: a `;` outside of a trailing comment.
        if (/;\s*(\/\/.*)?$/.test(line)) {
            return false;
        }
    }
    return false;
}

let hasError = false;

// The exemption is for files that DECLARE a slice — those are the legitimate
// state writers. It is deliberately CONTENT-based, not path-based: a blanket
// `state/` path skip silently exempts every non-slice module that happens to
// live alongside the slices (`state/state-hydration.ts`, `state/history.ts`,
// `state/persistence.ts`, `state/share-codec.ts` — consumers that must
// dispatch, one of them carrying nine `@direct-mutation` markers). Keying on
// `deepSignal<` is self-maintaining in both directions: a new slice is exempt
// the moment it declares its signal, and a new non-slice landing in `state/`
// is scanned from the moment it lands.
const SLICE_DECL = /deepSignal</;

for (const file of files) {
    if (file.includes('reducer')) {
        continue;
    }

    try {
        const content = readFileSync(file, 'utf8');
        if (SLICE_DECL.test(content)) {
            continue;
        }
        const lines = content.split('\n');

        const aliases = new Set<string>();
        for (const line of lines) {
            const m = aliasDeclRegex.exec(line);
            if (m) {
                aliases.add(m[1]);
            }
        }
        const aliasRegex = aliases.size
            ? new RegExp(String.raw`\b(${[...aliases].join('|')})(\.[a-zA-Z0-9_]+)+ = `)
            : null;

        lines.forEach((line, index) => {
            // A comment ABOUT a mutation is not a mutation. Prose quoting the
            // idiom it just removed (`… used to force playback.sustainActive =
            // false …`) otherwise trips the guard, which teaches people to
            // reword explanations instead of writing them. Only whole-line
            // comments are skipped — a trailing `// …` still leaves real code
            // on the line, which is exactly how the annotation markers work.
            const trimmed = line.trim();
            if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
                return;
            }
            const hit =
                bareRegex.test(line) || castRegex.test(line) || (aliasRegex?.test(line) ?? false);
            if (!hit) {
                return;
            }
            if (isAnnotated(lines, index)) {
                return;
            }
            console.error(`Mutation violation in ${file}:${index + 1}`);
            console.error(`  > ${line.trim()}`);
            hasError = true;
        });
    } catch (err) {
        console.error(`Error reading ${file}: ${(err as Error).message}`);
    }
}

if (hasError) {
    process.exit(1);
}
