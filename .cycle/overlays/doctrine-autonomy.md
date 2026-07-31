**`verify-on-device` and `verify-by-ear` are a third state between "auto-merge" and
"hard stop."** Both cover work whose *correctness* is knowable from code/test, where
only a real-world sensory glance remains — build + auto-merge it, then attach a
lightweight residual check instead of gating the merge on it:
- `verify-on-device` — a real-device visual glance (mobile safe-area/viewport/touch
  target); lands on `/nightly`'s morning device-verify checklist.
- `verify-by-ear` — a musical-correctness change whose idiom is captured by a critique
  test; ships with a 🎧 listen checklist (genre/setting, what changed, old-vs-new). The
  test is the correctness gate, the listen is *confirmation* — a follow-up tweak if it
  feels off, never a rollback (musical diffs are reversible).

**The hard guardrail: if you cannot write a test that captures the musical claim, that
is the signal the change isn't understood well enough to ship unheard — stop and
surface.** Track `synth` and genuinely-subjective feel (no oracle for "does it sound
good") stay the `Needs-ear` hard stop — never auto-merge those unheard.

**Lifting a `Needs-ear` stop requires an EXPLICIT per-PR go-ahead — warm general praise
is not sign-off.** "Everything's sounding great" is encouragement, not a merge
instruction for a specific parked PR; ask directly before merging. `/cycle #<n> approved`
is the canonical signal.

**Auto-merge now means auto-deploy** (§6 is CD) — an auto-merged PR ships to prod within
minutes. The pre-merge `Needs-ear` stop is what keeps un-auditioned work from shipping,
not a separate deploy gate.
