# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

The product is a terminal CLI plus one optional web surface: the Cloudflare Worker in
`worker/`, server-rendered and read on a phone. The CLI itself has no visual design surface
beyond the table it prints, whose column rules live in the code that prints them.

## Users

A solo developer or a small team with more repos than attention, working locally, who would
rather run one command than maintain a board. Confirmed on 2026-10-26: the intended audience
is **strangers installing from PyPI**, not only the author. The one-line install, the README
and the pre-release status are a real distribution commitment, so when a stranger's needs and
the author's convenience conflict, the stranger wins.

Not for project management, not for teams tracking each other's work, not for anything with
tickets.

### The problem

A developer with twenty side projects knows the state of two of them. The rest are a folder
of repos whose last commit could be yesterday or last March, half of them with uncommitted
work, several finished but never marked finished, a couple abandoned for a reason nobody
wrote down.

Every tool that addresses this (Notion boards, GitHub Projects, Linear, Trello) asks the
developer to enter status by hand. That is the exact action they have already proven they
will not do. A tracker you have to remember to update becomes one more project you forget
to update.

### The insight

Most of what you want to know is already on disk. Git knows when each repo last moved,
which branch it is on, whether there is uncommitted work, whether anything is unpushed.
None of that needs typing.

Exactly one field needs a human: which cycle the project is in. "Last commit was 3 days ago"
does not distinguish a project in design from one in testing from one that shipped.

## Product Purpose

Derive everything derivable, ask for the one field that is left, and use the derived data to
catch the hand-written field lying. Success is a board a developer trusts without maintaining
it, read in one command, that says which project to pick up today.

## Positioning

The `!` suspect flag is the mechanism a neighbouring tracker cannot truthfully copy. When a
repo has commits newer than its stage, the board marks itself suspect. Every competitor's
status field is hand-entered and therefore silently wrong; this one compares the hand-entered
field against git and says so when the two disagree. A tool that only displayed derived git
state would be a nicer `ls`; a tool that only stored stages would be a worse Trello. The
contradiction between them is the product.

## Operating Context

- **The terminal, unprompted.** The board is useful only if seen without choosing to see it,
  so the intended install is a shell alias, a `SessionStart` hook, or the Claude Code plugin
  (`/wipboard`), not a command remembered.
- **A folder of repos.** `wipboard init <root>` discovers repos one level deep under each
  registered root. Several of the folders it was built against have no git at all.
- **A project may itself be a folder of repos.** If a project folder has no `.git` of its
  own but its immediate children do, those children are merged and the project stays one
  row: newest commit wins, dirty if any is dirty, counts sum, and uncommitted paths carry
  their child's folder name. Added 2026-11-08, because `Budgerr` is three repositories and
  157 commits and the board was calling it an idea with nothing started. A folder that is
  itself a repo is never rescanned, so this costs nothing for the projects that already
  worked. See `docs/superpowers/specs/2026-11-08-multi-repo-projects-design.md`.
- **A phone away from the machine, and the desktop too.** The Worker page is the same board as
  a web page, pushed by `wipboard push`, ideally from a `post-commit` hook. It is a snapshot
  and can be stale, which is why the page leads with its own age. This said "a phone, away
  from the machine" until 2026-11-02, and the design treated the wide layout as an
  afterthought because of it. The author corrected that: they open it on the computer as well,
  so both widths are first-class.
- **Private by construction.** The board is the user's whole project list, so the Worker
  refuses to serve it until either token mode (`VIEW_TOKEN`) or Cloudflare Access is
  configured. A missing or misspelled variable locks the board rather than publishing it.

## Capabilities and Constraints

- **Fixed stage vocabulary:** `idea spec building testing shipped parked`, plus a freeform
  `--note`.
- **The three flags:** `!` (suspect: commits newer than the stage change), `stuck Nd` (stage
  unchanged over 30 days while commits kept landing), `dirty` / `^N` (uncommitted or unpushed
  work).
- **No build step, no client-side fetch, no runtime dependency in the Worker.** What this bans
  is specific: fetching the board's data on the client, because that reintroduces a loading
  state and a failure mode where the frame arrives and the data never does, which for a page
  whose whole thesis is admitting its own age is the same bug twice; a bundler or asset
  pipeline, because `npx wrangler deploy` is the whole deploy and a build artifact is one more
  thing that can be stale than its source; and runtime dependencies in the path that serves a
  private project list. It does not ban more server-rendered routes, inline SVG drawn on the
  server, or a few lines of inline script.
- **The CLI is standard library only**, Python 3.11+. The Worker has its own dev dependencies;
  nothing installed to run `wipboard` does.
- **The store is `~/.config/wipboard/projects.json`** and holds only `stage`, `note`,
  `stage_set_at`, and the list of roots. Branch, last commit time, dirty state and unpushed
  count are derived on every run. No derived field is cached.
- **Nothing runs in the background.** No daemon, no hook writing into the store.
- **git failures are normal, not errors.** Every git call degrades to "no git" rather than
  raising.
- **`wipboard md` writes a view, not a store.** Regenerated, never hand-edited.
- **The dashboard has no write path.** Stages change in the CLI. It said "read-only" until
  2026-11-02, which was read as "nothing may be interactive" and used to argue against links.
  The reasoning was always about writes needing real per-user auth rather than one shared
  token; navigating to a project's own page writes nothing and needs no new auth, so the
  dashboard now has links and still has no write path.
- **One machine, one writer.** Every push overwrites a single KV key.

These describe the product as built on 2026-10-26. The user was asked on that date whether to
pin any of them as binding commitments on future work and answered that **nothing is binding
yet**, so they are recorded as current facts, not as constraints a future decision may not
revisit.

## Evidence on Hand

- `docs/board.svg`: real output from throwaway repos, not a mockup. Regenerated with
  `python scripts/demo_board.py | python scripts/board_svg.py`.
- A live deployment at `https://wipboard.enamelvault.com`, token mode behind Cloudflare Access.
- A covered test suite for both the CLI and the Worker. The counts live in
  `docs/OPERATIONS.md`, where a test recounts them; they are deliberately not repeated here,
  because a number in a second document rots silently.
- Specs for both builds in `docs/superpowers/specs/`.

**Absences future work must not fabricate:** not published to PyPI (version 0.1.0,
pre-release). No users, no testimonials, no adoption numbers, no benchmarks, no press. The
author's own board is the only usage data that exists, and its project count is current state
that belongs in the handover, not here.

## Product Principles

1. **Never ask for what git already knows.** Every field the machine can derive is derived on
   every run. A cached derived field is the staleness this tool exists to prevent.
2. **The board must admit when it is lying.** The `!` flag and the dashboard's age header are
   the same principle on two surfaces: a view that can be wrong says so, prominently.
3. **One source of truth.** The store holds the human field; git holds everything else; every
   other artifact (`wipboard md`, the Worker page) is a regenerated view.
4. **A stranger installs it in one line.** Dependencies, config files and setup steps are each
   a reason someone never runs it.

## Accessibility & Inclusion

The Worker dashboard is held to **WCAG 2.2 AA** (confirmed 2026-10-26). In practice this is
load-bearing for the flags: contrast, visible focus, correct semantics, and never conveying a
flag's meaning by colour alone, since the suspect, stuck, dirty and unpushed states are the
entire value of the page.

## Decisions

- **Fixed stage vocabulary plus a freeform note.** Fixed stages let the tool sort by cycle,
  reject typos, and detect "building for six weeks". A freeform note holds what a stage name
  cannot ("waiting on an API key", "half-migrated"). Freeform-only was considered and
  rejected: it is more honest about messy states but reduces the board to sorting by date,
  which git already does.
- **The store lives at user level**, `~/.config/wipboard/projects.json`, not in any repo.
  A tool must not write into its own install directory, and the board spans repos.
- **The roots list lives in the store**, so there is no separate config file to go stale.
- **Nothing runs in the background.** An early design stamped activity into the store from a
  git `post-commit` hook. That was deleted before it was built: reading `git log` at display
  time gives the same answer with no hook, no write contention, and no possibility of drift.

## Deferred, and why

- ~~**A web UI or hosted dashboard.**~~ **Built on 2026-10-20**, and this entry is kept
  rather than deleted because the reason it changed matters. The deferral named its own
  revisit condition, "only if multi-machine becomes real", and reading the board from a
  phone is that condition. What was actually wrong with the original reasoning: it treated
  "dashboard" and "server to maintain" as the same thing. They are not. The Worker holds one
  KV key and no git knowledge, so there is no second source of truth, only a second view.

  The cost that *was* real is unavoidable and is now paid openly: a Worker cannot read the
  machine's repos, so the page is a snapshot and can be stale, which is the one property the
  CLI was built to eliminate. The design's answer is that the page states its own age. See
  `docs/superpowers/specs/2026-10-20-live-dashboard-design.md`.
- **Per-project history and trend data.** Appealing and useless until there is a question it
  answers. Add when someone asks "how long does a project sit in testing". Every push
  overwrites the single KV key, so the dashboard did not sneak history in.
- **A second machine writing to the board.** One key, one writer. The payload already carries
  `host`, so a per-host key and a merged view is an additive change, but nothing is built for
  it until a second machine exists.
- **Editing stages from the dashboard.** A write path needs real per-user auth rather than one
  shared token, and the CLI is already where stages change. Still deferred after the dashboard
  gained links on 2026-11-02: reading more is not writing, and nothing about that change moved
  this one closer.
- **Remote providers (GitHub issues, PR counts, CI status).** Needs network, auth, and rate
  limits for information that does not change which project you pick up today.
- **`remove` and `rename` commands.** `init` rescans, and the store is readable JSON.
