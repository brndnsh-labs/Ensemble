import { readFileSync } from 'node:fs';

const files = process.argv.slice(2);
if (files.length === 0) {
    process.exit(0);
}

const mutationRegex =
    /(playback|chords|bass|soloist|harmony|groove|midi|vizState)\.[a-zA-Z0-9]+ = /;

let hasError = false;

for (const file of files) {
    if (file.includes('state/') || file.includes('reducer')) {
        continue;
    }

    try {
        const content = readFileSync(file, 'utf8');
        const lines = content.split('\n');

        lines.forEach((line, index) => {
            if (
                mutationRegex.test(line) &&
                !line.includes('@direct-mutation') &&
                !line.includes('@worker-mutation')
            ) {
                console.error(`Mutation violation in ${file}:${index + 1}`);
                console.error(`  > ${line.trim()}`);
                hasError = true;
            }
        });
    } catch (err) {
        console.error(`Error reading ${file}: ${(err as Error).message}`);
    }
}

if (hasError) {
    process.exit(1);
}
