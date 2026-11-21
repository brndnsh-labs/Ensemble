// The ensemble command line: `ensemble <command> [arguments]`.
// To add a command, write it under commands/ and list it here.

import type { Command } from "./command.ts";
import { UsageError } from "./command.ts";
import { earsCommand } from "./commands/ears.ts";
import { fmtCommand } from "./commands/fmt.ts";
import { parseCommand } from "./commands/parse.ts";
import { readCommand } from "./commands/read.ts";
import { renderCommand } from "./commands/render.ts";
import { replayCommand } from "./commands/replay.ts";
import { scoreCommand } from "./commands/score.ts";

const commands: Readonly<Record<string, Command>> = {
  parse: parseCommand,
  fmt: fmtCommand,
  render: renderCommand,
  replay: replayCommand,
  read: readCommand,
  score: scoreCommand,
  ears: earsCommand,
};

function usage(): string {
  const width = Math.max(...Object.keys(commands).map((name) => name.length));
  const lines = Object.entries(commands).map(
    ([name, command]) =>
      `  ensemble ${name.padEnd(width)}  ${command.usage}\n      ${command.summary}`,
  );
  return `usage:\n${lines.join("\n")}`;
}

async function main(argv: string[]): Promise<number> {
  const [name, ...args] = argv;
  if (name === undefined || name === "help" || name === "--help" || name === "-h") {
    console.log(usage());
    return name === undefined ? 2 : 0;
  }
  const command = Object.hasOwn(commands, name) ? commands[name] : undefined;
  if (!command) {
    console.error(`ensemble: no command "${name}"\n${usage()}`);
    return 2;
  }
  try {
    return await command.run(args);
  } catch (error) {
    // A bad flag (from parseArgs) or a bad path is the caller's mistake; anything else is ours.
    const badFlag = error instanceof TypeError && "code" in error;
    if (!(error instanceof UsageError) && !badFlag) throw error;
    console.error(`ensemble ${name}: ${error.message}\nusage: ensemble ${name} ${command.usage}`);
    return 2;
  }
}

process.exitCode = await main(process.argv.slice(2));
