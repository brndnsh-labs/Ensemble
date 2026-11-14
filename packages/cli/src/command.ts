// What a CLI command is, and the few things commands share.

import { readFileSync } from "node:fs";
import type { Diagnostic } from "@ensemble/engine";

export interface Command {
  /** One line for the command list. */
  readonly summary: string;
  /** The arguments, as shown after `ensemble <name>`. */
  readonly usage: string;
  /** Runs with the arguments after the command name. Returns the exit code. */
  run(args: string[]): number | Promise<number>;
}

/** A mistake in how the command was called. `main` prints it with the usage line. */
export class UsageError extends Error {}

/** The text of a chart file. A file that cannot be read is a usage error, not a crash. */
export function readChart(path: string | undefined): string {
  if (path === undefined) throw new UsageError("which chart? Give a path to a .chart file.");
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new UsageError(`cannot read ${path}: ${reason}`);
  }
}

/** Diagnostics as `file:line:col severity message`, one to a line, on stderr. */
export function reportDiagnostics(path: string, diagnostics: readonly Diagnostic[]): void {
  for (const { severity, message, range } of diagnostics)
    console.error(`${path}:${range.line}:${range.column} ${severity} ${message}`);
}

export const hasErrors = (diagnostics: readonly Diagnostic[]): boolean =>
  diagnostics.some((diagnostic) => diagnostic.severity === "error");
