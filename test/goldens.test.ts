import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { GOLDENS, goldenUrl, renderGolden } from "./goldens.ts";

test("the golden takes have not changed (if a change is intended: `pnpm goldens`, and say why in docs/decisions/)", () => {
  for (const golden of GOLDENS) {
    const url = goldenUrl(golden);
    assert.ok(existsSync(url), `${golden.file} is missing: run \`pnpm goldens\``);
    const stored = new Uint8Array(readFileSync(url));
    assert.ok(
      Buffer.compare(renderGolden(golden), stored) === 0,
      `${golden.file} no longer matches what the engine plays`,
    );
  }
});
