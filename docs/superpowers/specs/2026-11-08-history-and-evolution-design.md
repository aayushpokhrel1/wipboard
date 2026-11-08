# History and evolution on the project page

**Status:** designed 2026-11-08, not built. Every decision below was made by the author in
conversation on 2026-11-08 unless marked as the designer's call.

## Why

The board answers "what is the state of this right now". It cannot answer "has this been
alive", "where does this get stuck", or "what was I doing before I walked away". Named by the
author on 2026-11-02 as the feature to build after board depth, and deliberately excluded
from that spec so its payload change could be additive.

Three questions, all wanted:

1. **Have I actually worked on this?** Commit activity over time.
2. **How long has it sat at each stage?** The stage trail.
3. **What was I doing last time?** A deeper commit log than the board's handful.

## Goals

- A project page answers all three without the author opening a terminal.
- The chart and the stage trail are readable **against each other**, not as two separate facts.
- The board itself is unchanged.

## Non-goals

- **Anything on the main board.** No sparklines on cards. Decided against: nineteen of them
  would compete with an alarm that was deliberately rationed to seven.
- **A write path.** Stages still change in the CLI.
- **Reshaping the terminal table.** `wipboard show` gains nothing.
- **Trends, predictions, velocity, or any derived judgement.** The page shows what happened.

## Anti-goals

- **A date that was invented and not marked.** The stage trail has almost no real data on day
  one. Presenting a guess as a record is the failure this whole tool exists to prevent.
- **A chart that reads "dead" when the truth is "did not exist yet".** Measured on 2026-11-08:
  only 2 of 16 git projects have any commit older than 26 weeks, so a fixed 26-week axis would
  render most pages as a long flat empty run.
- **A second meaning for `--hot`.** The alarm colour means suspect. A stage change is not an
  alarm.
- **Storing anything git can tell us.** The one new stored thing is the stage trail, which is
  precisely what git cannot tell us.

## Constraints

- Standard library only in the CLI. No dependencies in the Worker, no build step, no client
  fetch, styles inline.
- Every interpolated value in the Worker goes through `escapeHtml`.
- WCAG 2.2 AA, and no condition conveyed by colour alone.
- The store holds `stage`, `note`, `stage_set_at`, the roots, and now `stage_history`.
- **`PAYLOAD_VERSION` must rise to 3, and the Worker must be deployed before the CLI ships.**
  The Worker rejects an unknown version with HTTP 400 on ingest. Since 2026-11-08 the push
  also runs unattended every 15 minutes under Cloudflare Access, so a CLI-first deploy means
  every scheduled push fails into a log nobody reads. `wipboard.py` already carries this
  warning at the version constant; this change makes it expensive to ignore.

## The design

### What the CLI derives and sends

Three additions per project in the payload, all additive.

**`weeks`** — a list of integers, commit counts per 7-day bucket, **oldest first**. Buckets
are 7 days wide measured back from the snapshot instant, not calendar weeks: calendar weeks
drag in timezone and ISO-week-numbering questions that buy nothing here.

**`week_start`** — the ISO timestamp of the oldest bucket's start, so the Worker can label the
axis without recomputing it.

**`first_commit`** — the ISO timestamp of the repository's first commit, or null.

The span of `weeks` is **the project's own life**, not a fixed window: from `first_commit` to
now, so the bars fill the width on every page. Clamped to **at most 26 buckets** and **at
least 8** (designer's call: a three-week-old project otherwise gets three enormously fat bars,
and a 26-bucket cap keeps the payload and the bar width sane for the two projects older than
that). Two projects' charts are therefore not comparable by eye; accepted, because the author
reads one project page at a time.

Get the first commit with `git rev-list --max-parents=0` rather than `git log --reverse`,
which walks all of history to answer.

**For a multi-repo project** (see `2026-11-08-multi-repo-projects-design.md`), `weeks` sums
the children bucket by bucket and `first_commit` is the earliest across children. A merged
project's chart is the whole project's activity, which is the point of merging it at all.

**The deeper log.** `git_info` currently takes `log -5`. Raise it to 20 and let each surface
show what it has room for. Designer's call: one field rather than two, since 19 projects times
20 subjects is well inside the Worker's 1 MiB ingest limit, and a second field would mean two
caps to keep in step.

### What the store remembers

`wipboard set` appends `{"stage": <new stage>, "at": <iso>}` to a per-project `stage_history`
list. That is the entire storage change. It is sent in the payload as-is.

A project with no `stage_history` is normal, not broken: it is every project today.

### The inferred first segment

**Not stored.** Derived at push time, because a repository's first commit is something git can
tell us and the storage rule forbids keeping it.

At push time, prepend one entry `{"stage": ..., "at": first_commit, "inferred": true}`:

- carrying the **first recorded stage** when `stage_history` has entries, running until that
  first recorded change;
- carrying the **current stage** when `stage_history` is empty, running the whole span.

The second case is every project for the next few weeks, and it still truthfully answers how
long this has been its stage. Omit the entry entirely when there is no `first_commit`.

**The inferred entry must be visibly marked** and the mark must not be colour: an asterisk on
the label and a footnote reading that it was inferred from the first commit and is not a
recorded change. This is anti-goal one and is not negotiable.

### What the project page shows

A full-width `HISTORY` section on the project page only, below the card, containing:

1. **The bar chart.** One bar per bucket, in `--accent`. A zero week is a 1px `--line` rule,
   not an absent bar, so the gaps are visible as gaps. Bars scale to the project's own peak.
2. **The stage band**, directly beneath the chart and **on the same time axis**, so the stage
   at any week is read by looking straight down from a bar. One segment per stage, labelled
   with the stage and its duration. This alignment is the feature; three chart variants were
   rendered against the real board on 2026-11-08 and this one was chosen because the other two
   annotate the chart rather than relate to it.
3. **A scale line**: the span at the left, the commit total in the middle, "now" at the right.
4. **The deeper log**, the project's recent commits, behind the existing `<details class="drawer">`.

**Colour:** the band uses `--chip` with a `--line` border. Not `--hot`, which keeps meaning
suspect everywhere. Not `--accent`, which would make the band indistinguishable from the bars.

**Below 34rem** (the breakpoint the tally already uses), the band becomes a plain list of stage
changes beneath the chart. A short segment cannot hold a label at phone width, and a clipped
label is worse than a list.

**Degradation**, which is most of this tool's character:

- **No git** (two projects genuinely, plus any folder that loses its repo): no chart, no scale
  line. The section still renders with the stage band or list, because for those projects the
  hand-set stage is the only history that will ever exist.
- **No commits in the span, but git exists:** the chart renders all-zero rules. That is a true
  statement and the thing the author most wants to see.
- **No `first_commit` and no `stage_history`:** omit the section entirely. There is nothing to
  say and an empty box saying nothing is worse than no box.

### Accessibility

The chart is decorative only if the same facts are available as text, and they must be. The
scale line already carries the span and the total as text, and the stage band is text. Give the
chart `role="img"` with an `aria-label` stating the span and total, rather than labelling 26
individual bars. The inferred mark is an asterisk and a footnote, both text, satisfying "no
condition by colour alone".

## What is left to the builder

- Function names and where the bucketing lives.
- Whether `renderHistory` is one function or several in `worker/src/render.ts`.
- The exact bar gap, height and label sizes, within the existing design tokens.
- How `weeks` is computed for a multi-repo project without spawning a git process per child
  per bucket (one `git log` per child, bucketed in Python, is expected).

## Verification

Tests that go red if this breaks, not a manual look:

**CLI**
- Buckets are oldest-first and a commit lands in the right bucket.
- The span clamps to 26 and floors at 8.
- A multi-repo project's `weeks` is the bucket-wise sum of its children, and `first_commit` the
  earliest.
- `wipboard set` appends to `stage_history` and never rewrites earlier entries.
- The inferred entry is prepended at push time, carries `inferred: true`, and is **absent from
  the store** after a push.
- `PAYLOAD_VERSION` is 3.

**Worker**
- The section renders with a chart, a band and a scale line.
- A no-git project renders the band and no chart.
- A project with neither first commit nor stage history renders no section at all.
- The inferred segment carries its mark and footnote.
- A stage name is escaped (it comes from the payload).
- The stylesheet guard covers the new rules, as it does the others: these are CSS-only facts
  that no markup assertion can see.

**Then, by eye, once:** a project page at 375px and at desktop width, confirming the band
collapses and nothing overflows.

## Order of work

1. Worker render and tests, accepting payload v3 **and still accepting v2**, so the deployed
   Worker keeps working while the CLI is unchanged.
2. Deploy the Worker.
3. CLI derivation, store change and payload bump to 3.
4. Push, and confirm the scheduled task still succeeds.

Steps 1 and 2 before 3 is the constraint above, not a preference.
