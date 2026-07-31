- **`backlog`** — new ideas. May also carry a `needs-ear`/`needs-decision` **caveat
  label** = "needs Brandon's input even to schedule" (a hint, not a blocked story).
- **`inbox`** — raw capture, not yet triaged.
- **`burndown`** — vetted safe for autonomous execution (the safe set); `/burndown`'s
  fast-path fuel. A strong signal, not a blank check — the safe filter still backstops it.
- **`verify-on-device`** — deterministic + safe to build and auto-merge unattended, but
  the deliverable's last residual is a real-device visual glance (e.g. a mobile
  safe-area/viewport/touch-target fix headless CI can't eyeball). Not `needs-ear` — the
  change's *correctness* is knowable from code; only its side-effects need an eyeball.
  `/nightly` lands these on the morning device-verify checklist. Pairs with `burndown`.
- **`verify-by-ear`** — the musical analogue: a musical-correctness change whose idiom
  *is* captured by a critique test, so it builds + auto-merges on green, but its last
  residual is a listen pass (ships with a 🎧 checklist: genre/setting to load, what
  changed, old-vs-new to hear). Not `needs-ear` (reserved for genuinely-subjective work
  no critique test can assert). Pairs with `burndown`.
- **`scout`** — provenance stamp on issues filed by a `/scout` sweep, so `/unblock`
  surfaces last night's finds freshest-first.
- **`area:*`** — surface tags inferring the executor when `agent/*` is unset:
  `area:soloist`, `area:bass`, `area:drums`, `area:chords`, `area:harmony`,
  `area:groove`, `area:synth`, `area:state`, `area:worker`, `area:ui`, `area:infra`.
