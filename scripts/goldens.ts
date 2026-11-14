// Rewrites the golden takes from what the engine plays now.
// Every run needs a line in DECISIONS.md saying why the output changed.
import { writeFileSync } from "node:fs";
import { GOLDENS, goldenUrl, renderGolden } from "../test/goldens.ts";

for (const golden of GOLDENS) {
  const bytes = renderGolden(golden);
  writeFileSync(goldenUrl(golden), bytes);
  console.log(`${golden.file}: ${bytes.length} bytes`);
}
console.log("Now add a line to DECISIONS.md saying why the goldens changed.");
