import { globSync, readFileSync } from 'node:fs';

const args = process.argv.slice(2);
if (args.length === 0) {
    process.exit(0);
}

const files = args.flatMap((arg) => (arg.includes('*') ? globSync(arg) : [arg]));

// The `(?<!graph\.)` anchor keeps AUDIO-NODE writes off the state-mutation radar:
// `conductor.ts` aliases `playback.audioGraph` to `graph`, so `graph.bass.eq.type = 'highpass'`
// matched the bare slice-name alternation and read as a `bass` state mutation. A
// `state.<slice>.field =` write is still caught — only the `graph.` alias is excluded.
const mutationRegex =
    /(?<!graph\.)\b(playback|chords|bass|soloist|harmony|groove|midi|vizState|arranger|conductor)(\.[a-zA-Z0-9_]+)+ = /;

let hasError = false;

for (const file of files) {
    if (file.includes('state/') || file.includes('reducer')) {
        continue;
    }

    try {
        const content = readFileSync(file, 'utf8');
        const lines = content.split('\n');

        lines.forEach((line, index) => {
            if (!mutationRegex.test(line)) {
                return;
            }
            const prev = lines[index - 1] ?? '';
            const isAnnotated =
                line.includes('@direct-mutation') ||
                line.includes('@worker-mutation') ||
                prev.includes('@direct-mutation') ||
                prev.includes('@worker-mutation');
            if (isAnnotated) {
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
