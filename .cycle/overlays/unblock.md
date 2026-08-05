Here, the lanes map onto the Status vocabulary directly:
- **desk** = `status:needs-decision`, or a backlog issue carrying a `needs-decision`
  caveat label (status-less idea, needs input before it can even be scheduled).
- **hands-on** = `status:needs-ear`, or a backlog issue carrying a `needs-ear` caveat
  label — but see below, it does not get the generic Works / Doesn't work / Not now menu.

**`status:needs-ear` is not verified through this menu at all.** A synth A/B or a musical
listen pass can't be resolved from a menu, and the audition itself already happens
elsewhere — at `/cycle`'s merge gate (Track-awareness) or `/done`'s deploy-to-test
check-in, once the PR is built and live. `/unblock`'s job for a `status:needs-ear` item is just
to **surface it as a named note** ("still waiting on your ear for #<n>"), never to
present a verdict menu or attempt to verify it live itself.

**The morning-after case:** when following `/nightly`, float `scout`-labelled finds to
the top of their tier and name them ("3 new from last night's a11y lens").

**Ensemble's own desk-verdict vocabulary:** **Promote to Ready** · **Defer** · **Close**
· an item-specific scope choice. When a promote makes the item safe for autonomous
execution, offer a **"Promote to Ready + mark for /burndown"** variant (tags `burndown`).
