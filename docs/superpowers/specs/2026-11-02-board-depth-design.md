# Board depth: what is happening here, and what is next

**Date:** 2026-11-02
**Status:** design, not approved, nothing built
**Supersedes in part:** `2026-11-01-dashboard-redesign.md`, which stays the authority on the
visual world. This document changes what the board knows and how many surfaces it has.

## Intent

The board is accurate and does not help you choose.

Everything it shows is derived from git: when a repo last moved, which branch, how dirty, how
far ahead. That is a readout of mechanics. You can read that a project moved yesterday and
still have no idea what it is, what state the work is in, or what you would be walking into if
you opened it. The author's words on 2026-11-02: "I just got the git status of the project and
nothing more. I want to know what is actually happening here and what my future work for the
project is gonna look like."

So the board should tell you two things git cannot: **what is actually going on in a project
right now**, and **what the next stretch of work looks like**.

### Why this does not break the product's first principle

`PRODUCT.md` principle 1 is "never ask for what git already knows", and its corollary is that a
cached derived field is the staleness this tool exists to prevent.

Depth does not violate either, because the text already exists on disk and is read fresh on
every run. The author's own working convention, recorded in their global instructions, is that
every project keeps a `HANDOVER.md` whose job is "what is half-done, what is next", plus
`docs/superpowers/plans/` for feature breakdowns. The CLI already walks every one of those
repos on every run and reads none of it. The board is not acquiring a new source of truth; it
is reading writing the author already maintains, and storing none of it.

**If you find yourself caching any of this in the store, stop.** The store still holds only
`stage`, `note`, `stage_set_at` and the roots.

## Goals

1. A project on the board says what is happening in it and what is next, without the author
   typing anything new.
2. The dashboard leads with what the author is actually in the middle of. The rest of the board
   is present and honest but does not have to deliver its full payload at a glance.
3. Fuller information on one project is one click away, on a page of its own.
4. The dashboard is a desktop surface as well as a phone surface.
5. The terminal keeps its single-line glance and gets a little more useful, at near zero cost.

## Non-goals

- **History, trends, and how a project has evolved over time.** Named by the author on
  2026-11-02 as the thing to add *after* this ("later on I'll add more features to it like the
  history and how it's evolved"). It is out of scope here, and the payload change below must
  not block it.
- **A write path.** Stages still change in the CLI. Unchanged from `PRODUCT.md`.
- **Remote providers**, a second machine, or anything needing network and auth.
- **Reshaping the terminal table into per-project blocks.** The author said the CLI does not
  matter much to them; the cheap version is specified below and nothing more.

## Anti-goals

Things that would make this a failure even if it technically worked:

- **A board that renders a shell and then populates.** A board that can show you an empty page
  and a board that can show you yesterday are the same bug. See the constraint below.
- **Depth that makes the glance slower.** If reading the board takes longer after this than
  before, the depth was put in the wrong place.
- **Nineteen paragraphs.** The author was explicit: "I don't want all 19 at once."
- **Anything derived being written down.** A second source of truth is the failure this whole
  project is a complaint about.
- **A warm beige page.** See Rendition.

## What the CLI derives, per project

All of it on every run, from the repo on disk. Nothing stored, nothing cached, nothing asked
for. Every one of these degrades to absent rather than raising, because three of the folders
this was built against have no git at all and several have no docs either.

**1. `next` — what the future work looks like.**

Resolved by the first source that answers, so a project that writes nothing still works:

1. `HANDOVER.md` in the repo root: the content under the first heading matching `next`,
   case-insensitively. Take the first few items.
2. `TODO.md` or `TODO`: the first few unchecked items.
3. The most recently modified file in `docs/superpowers/plans/`: its title.
4. Nothing. The dashboard then falls back to the hand-typed `note`, which is what it shows
   today.

**2. `recent` — what is actually happening.**

The last few commit subjects with their dates, in sequence. One subject tells you nothing; five
read in order tell you whether this project is being built, documented, or nursed.

**3. `uncommitted` — what you were in the middle of.**

The changed paths, not just the count the board already carries. Capped.

### This costs no new git processes

Checked on 2026-11-02 rather than assumed. `build_rows` already runs four git calls per repo:
`log -1`, `rev-parse`, `status --porcelain`, and `rev-list --count`. `recent` extends the
existing `log -1` to ask for more entries, and `uncommitted` reads paths out of the
`status --porcelain` output already being parsed for the changed count. Neither is a new
process.

`next` adds file reads, not processes: at most one `HANDOVER.md`, one `TODO`, and one directory
listing per repo. Against roughly eighty subprocess spawns per run, which dominate the runtime
on Windows, that is noise. Do not turn the plans-directory lookup into a recursive walk, which
is the one way this stops being true.

### Truncation is a budget, not a preference

`MAX_BODY_BYTES` in `worker/src/index.ts` is 1 MiB and the ingest endpoint enforces it against
the declared content length. Every new field is unbounded user prose, so the caps are what keep
a board of nineteen projects from being rejected at push time by a single long handover. Pick
them so that a board several times the current size still fits, and make the CLI's push fail
loudly rather than silently truncating the board itself.

### The payload becomes version 2

`PAYLOAD_VERSION` goes to 2, `board_payload` in `wipboard.py` owns the new shape, and
`renderVersionMismatch` carries the upgrade. This is the three-part change the redesign spec
anticipated and explicitly allowed.

Leave room for the history work named as the next feature: adding fields later should be
another additive bump, not a reshape of what this one introduces.

## The two surfaces

### `/` the board

The page splits, and **the split is a partition of payload order, not a re-sort.** Both halves
keep `_sort_key` order internally. This matters because "do not re-sort" exists so the terminal
and the page never disagree about what matters, and a partition preserves that where a re-sort
would not.

- **In flight.** The projects the author is currently inside. Leads the page and carries the
  depth: what is next, the recent commit sequence, what is uncommitted.
- **The rest.** Everything else, in payload order, as the compact frames of the redesign.
  Present, honest, not shouting.

The definition of "in flight" is left to the builder, with one constraint: it is derived, never
hand-set, and it must be small. Two to four projects, not nine. Uncommitted work, unpushed
commits, or a very recent commit are the obvious inputs.

### `/p/<project>` a project

One project in full: its `next`, its recent commit sequence, its uncommitted paths, its flags
explained rather than abbreviated. This is where the history work will land when it comes.

Linked from every frame on the board. Served from the same KV read; no new storage and no new
auth, because the whole board is already behind the same token or Access policy.

## Constraints

Unchanged and binding:

- **Standard library only** in the CLI. No dependencies, ever.
- **The Worker has no runtime dependencies**, and the page must work from the HTML that
  arrives. See the reworded rule below.
- **Every interpolated value goes through `escapeHtml`.** The board is user text in a browser,
  and this change adds commit subjects, file paths and handover prose to what gets interpolated.
- **WCAG 2.2 AA, and no condition signalled by colour alone.**
- **The snapshot age stays the loudest element on the page**, on every surface including the
  project page.
- **git failures are normal, not errors.** Every new call degrades to absent.
- **Verify with `python -m pytest` and `npm --prefix worker test`.** The drift and sort logic
  stays covered.

### The "no build step, no client fetch" rule, reworded

It survives, and it does not block anything in this document. What it actually bans:

- fetching the board's data on the client, because that reintroduces a loading state, a
  spinner, and a failure mode where the frame arrives and the data never does;
- a bundler or asset pipeline, because `npx wrangler deploy` is the whole deploy and a build
  artifact is one more thing that can be stale than its source;
- runtime dependencies in the path that serves a private project list.

What it does not ban: more server-rendered routes, inline SVG drawn on the server, or a few
lines of inline script. Reword it in `PRODUCT.md` to say that.

## Rules this rewrites

These are not incidental. Each is written down somewhere and must be corrected where it sits,
not contradicted silently.

| Where | What it says now | What is true after this |
| --- | --- | --- |
| `PRODUCT.md` | "The dashboard is read-only" | No write path, unchanged. Navigation and disclosure are not writes, need no new auth, and are now expected |
| `PRODUCT.md` | Operating context is "a phone, away from the machine" | Phone **and** desktop. The author opens it on the computer too |
| `DESIGN.md` | Narrow is the base layout, wide is "the afterthought" | Both widths are first-class |
| redesign spec | "Nothing becomes interactive" | Withdrawn. The reasoning behind it was about a write path and survives; the wording did not |
| redesign spec | "Do not re-sort" | Stands. The board partitions payload order and never reorders within a partition |

## Rendition

The visual world stays the contact sheet chosen on 2026-11-02. Its *rendition* does not.

The first build came out warm: paper cream, sepia, beige. The author rejected it, and they were
right to. A darkroom is not a beige place, and warm paper is the single most predictable
rendition of that world, reached for when nothing in the brief asked for it. The world's own
material range runs much colder: the light table, the cold-tone bromide print, the negative,
the safelight.

The replacement rendition is the cold end of that same room. Specific values are the builder's,
subject to: the one-ink rule survives (a single saturated ink carries condition and nothing
else is coloured), the density ramp survives and still clears AA against a single text colour
inside a frame, and desktop is designed as a first-class width rather than a widened phone.

Show it before building the rest of it.

## The terminal

The cheap half, and no more.

1. **The last column carries `next` instead of the hand-typed note**, falling back to the note
   when a project has no handover to read. Same height, same 80-column scan, a line that now
   says something the author did not already know.
2. **A new `wipboard show <project>` command** prints one project in full. The table stays the
   thing that runs on every shell session and never gets taller or slower.

The table's shape is otherwise untouched.

## Left to the builder

- The exact "in flight" predicate, within the constraint above.
- Truncation limits for handover text, commit subjects and path lists. They must exist: a
  handover is prose of unbounded length and the payload crosses a network.
- The URL shape for a project page and how a name becomes a slug, including collisions.
- The cold palette's actual values, shown before the rest is built.
- The project page's composition.
- Whether `recent` carries dates as well as subjects, or subjects alone.

## Calls settled while writing this

A reviewer read this document and asked fourteen questions. These are the ones settled here, so
the builder does not have to re-derive them. Each was the author's to overrule and none of them
changes what the feature is.

- **`next` is parsed as items, not raw markdown.** Match `^#{1,6}\s*next\b` case-insensitively,
  take the content until the next heading at the same or a higher level, strip list markers,
  keep the items as strings. The payload carries the items plus which source answered, so the
  dashboard can say where it got them and the terminal can use one line of them.
- **The in-flight split is computed in the Worker**, not the CLI. It is a presentation decision
  for one surface, and the terminal is not splitting.
- **Frame numbers run continuously across both partitions.** They carry payload rank; restarting
  them in "the rest" would break the one thing they exist to preserve.
- **A project page exists for every project**, including ones with no git. It shows what it has
  and says plainly what it does not.
- **The project page reuses the empty and version-mismatch panels** rather than inventing its
  own, so every route fails the same way.
- **The project page shows the hand-typed note as well as `next`.** The note is the author's own
  sentence about the project and is not redundant with derived text.
- **`wipboard show <project>` prints the same information as the project page**, in terminal
  form. One model, two renderings.
- **The terminal's last column falls back to the note when `next` will not fit the column.** The
  point of that column is a line you can scan, and a curated note beats a truncated paragraph.
- **The cold rendition is shown before the rest of the build**, but the CLI work does not wait
  on it. They are independent.
- **The rule rewrites in the table above ship with this feature.** The wider documentation
  sweep, including the test counts in `docs/OPERATIONS.md` that a test enforces, follows it.

## A deliberate decision worth stating

Handover files are gitignored and local. After this change their text leaves the machine and
sits in KV behind the Worker's auth. The board already carried project names, hand-typed notes
and commit subjects, so this widens an existing exposure rather than opening a new category,
and the board is private by construction: it refuses to serve until token mode or Access is
configured.

**Put to the author on 2026-11-02 and approved**, against the two narrower alternatives of
pushing only the parsed Next items or not reading handovers at all. It is a widening, made on
purpose rather than by accident. Truncation limits are part of the answer, not a detail.
