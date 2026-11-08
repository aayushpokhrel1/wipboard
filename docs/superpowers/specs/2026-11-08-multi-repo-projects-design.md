# Multi-repo projects: a folder of repos is still one project

**Status:** designed 2026-11-08, not built.

## Why

`Budgerr` has three git repositories inside it: `Budgerr/Budgerr` (84 commits),
`Budgerr/budgerr-app` (33) and `Budgerr/budgerr-web` (40), all starting 10 July 2026. The
board reports it as `idea`, `no git`, with the note "three subfolders scaffolded, no git yet".

That is 157 commits the board cannot see, and the row is actively false rather than merely
empty. This tool exists to stop a project going quietly stale without you noticing; a project
it declares dead while you commit to it weekly is the exact failure in reverse.

The cause is an assumption, not a bug: `git_info` checks for `.git` in the project folder
itself, so a folder that *contains* repositories reads as having none. The assumption has been
right eighteen times out of nineteen, which is why it survived.

Found while designing the history feature, where the blindness would have been most visible.
Split out deliberately: this changes what a project *is*, and that deserves reviewing apart
from what a page *shows*.

## Goals

- `Budgerr` becomes one ordinary row on the board, carrying the real activity of its children.
- Nothing changes for the other eighteen projects, including the two genuinely bare folders.
- No new storage, no new config, no new command.

## Non-goals

- **History, trends and evolution.** The next spec. This one only makes its data true first.
- **Descending more than one level.** A repo inside a repo inside a folder is not a case that
  exists here, and guessing at arbitrary depth is how a board tool becomes a disk crawler.
- **Splitting a multi-repo project into several rows.** Decided against on 2026-11-08: the
  author thinks of Budgerr as one thing, and a board of 21 rows where they expect 19 is worse
  than a merged row.
- **A write path, remote providers, or reshaping the terminal table.** Unchanged.

## Anti-goals

Things that would make this a failure even if it technically worked:

- **Rescanning folders that already work.** Eighteen projects are correct today. A change that
  makes them slower, or changes a single field on any of them, has failed regardless of what
  it fixed for Budgerr.
- **Inventing a value that no repository reports.** A merged project genuinely has no single
  branch. Printing one that is not any child's real branch would be the same class of lie this
  change exists to remove.
- **A path that does not resolve.** `uncommitted` lists paths the author may open. A path
  relative to a child repo, printed under the parent project, points at nothing.

## Constraints

- Standard library only. No dependencies, ever.
- Nothing is stored that git can tell us. This change stores nothing at all.
- git failures are normal, not errors. Every git call already degrades to "no git" rather than
  raising, and that must survive: a child that fails to read is skipped, never fatal.
- `git_info` returns a dict consumed by `build_rows`, `_flags_for`, `board_payload`,
  `render_table` and `render_project`. The merged result must be the **same shape**, so that
  none of those learn about multi-repo projects at all.

## The design

### Detection

Only a project folder with **no `.git` of its own** is examined further. For those, list one
level down and collect the children that are repositories.

- No children are repositories: the project stays exactly as it is today, `has_git` false.
  This is `PrettyGoodAIProject` and `copilot-worktrees`, and they must not change.
- One or more are: the project is multi-repo.

A folder that is itself a repository is **never** rescanned. That is what keeps the eighteen
untouched and the cost at one directory listing for the handful that report no git.

### Merging

One new function wrapping the existing one. It returns `git_info(folder)` unchanged when the
folder is a repository, so the common path is identical. Otherwise it calls `git_info` on each
child repository and merges, newest child first:

| Field | Merged as |
| --- | --- |
| `last_commit` | the newest across children |
| `branch` | the branch of the child with the newest commit |
| `subject` | the subject of the child with the newest commit |
| `dirty` | true if any child is dirty |
| `ahead` | the sum across children |
| `changed` | the sum across children |
| `recent` | all children's recent commits, sorted newest first, capped at 5 |
| `paths` | all children's uncommitted paths, **each prefixed with its child folder name**, capped at 8 |

Children whose `git_info` returns `None` are skipped. If every child fails, the project is
`has_git` false, exactly as today.

**The path prefix is correctness, not decoration** (anti-goal three). `src/app.ts` inside
`budgerr-app` is `budgerr-app/src/app.ts` from `Budgerr`, and the unprefixed form resolves to
nothing from the project folder.

**`branch` taken from the newest child** is the decision that pays the "invent nothing"
anti-goal. A merged project has no single branch, and the newest child's is the only candidate
that is a real branch somewhere and is also the one the author last worked on.

### The stale note

`Budgerr`'s note says "three subfolders scaffolded, no git yet", which stops being true the
moment this ships. The author chose on 2026-11-08 to clear such a note automatically.

Scoped narrowly, because "clear a note the data contradicts" cannot be implemented honestly in
general: a note is prose, and deciding whether prose contradicts a field is guesswork. The only
version that is mechanical:

- Fires **only** on the transition where a project that previously reported no git starts
  reporting repositories through the multi-repo path.
- **Prints the cleared text** to the terminal, so it is recoverable by eye.
- Records that it has fired for that project, so it never runs twice and never fights a note
  the author writes afterwards.

This is the only part of the change that writes to the store, and it writes only to clear.

## What is left to the builder

- Where the merging function lives and what it is called.
- How "it has already fired" is recorded for a project. A boolean beside the project entry is
  fine; it is not derived state, so it does not break the storage rule.
- Whether `build_rows`'s two call sites share a helper or call the new function directly.

## Verification

A test that fails if this breaks, not a manual check:

- A folder with child repositories reports merged activity, and the fields follow the table.
- An uncommitted path from a child carries its child folder name.
- A folder that is itself a repository produces **identical** output to today, and is not
  rescanned.
- A folder whose children are all bare stays `has_git` false.
- A child whose git call fails is skipped rather than fatal.
- The note clears once on the transition, prints what it cleared, and does not clear again.

Then, against the real board: `Budgerr` shows roughly 157 commits of history and stops saying
no git, and the other eighteen rows are byte-identical to before.
