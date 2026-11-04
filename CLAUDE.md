# Working in this repo

`wipboard` is a single-module Python CLI with no dependencies. It is small on purpose. The
hardest thing about it is not the code, it is resisting the urge to add storage, a server, or
a second source of truth.

## graphify

There is a knowledge graph at `graphify-out/graph.json` (gitignored, rebuilt by the
user-global post-commit hook). For a codebase question, run `graphify query "<question>"`
first, `graphify path "<A>" "<B>"` for a relationship, `graphify explain "<concept>"` for one
concept. Each returns a scoped subgraph, far smaller than grepping the source.

**There is no `GRAPH_REPORT.md` here**, unlike the sibling projects: `graphify .` writes the
graph but not the report, which needs a separate `graphify cluster-only .` and another model
call. Do not send a reader to a file that was never generated. The graph itself is enough for
query/path/explain, which is all this repo's size warrants.

## Where things are written down

| Write it in | When it is |
| --- | --- |
| `README.md` | What it is, install, usage, the flags. The public face |
| `PRODUCT.md` | Who it is for, decisions, what is deferred **and why** |
| `DESIGN.md` | The dashboard's visual system: tokens in the frontmatter, named rules in the prose. Its machine-readable extension is `.impeccable/design.json`. Covers `worker/` only |
| `docs/OPERATIONS.md` | Run, verify, release to PyPI, deploy the Worker, hook setup, environment traps |
| `worker/` | The optional dashboard Worker. Its own tests live in `worker/test/` |
| a **code comment at the site** | A rule about specific code (a git invocation that must stay quiet on a non-repo, a date format the store depends on) |
| the **Obsidian vault** | A lesson that would change how I work on a *different* project |
| `docs/superpowers/specs/` | The design of one feature, written before building it. Tracked: a spec explains why the code is shaped as it is |
| `docs/superpowers/plans/` | The task breakdown for one feature |
| `HANDOVER.md` | **Only** current state: commit, published version, test count, what is half-done, what is next |
| nowhere | A dated narrative of what you did today. `git log` already holds it, in more detail |

`HANDOVER.md` is gitignored and local-only, so nothing durable may live there. Before adding a
line to it, ask: will this still be true in a month? If yes it belongs in a doc above.

**`DESIGN.md` covers the Worker dashboard, and only that.** This file claimed there was no
`DESIGN.md` because there was no UI; that stopped being true when the dashboard shipped on
2026-10-20, and the claim was corrected on 2026-10-31 rather than left for the next reader to
trust. The dashboard's whole design system is one inline `STYLE` constant in
`worker/src/render.ts`, which is small enough to read in full and too easy to extend
inconsistently, which is what the file is for.

The **terminal table still has no design doc**, deliberately. Its column rules live in the
code that prints them, next to the code.

**Do not create a `LESSONS.md`.** A lesson has one home, chosen by reach: a rule about specific
code is a comment at that code, a lesson that generalises goes in the vault, and a dated
narrative goes in `git log`. Two copies drift, and the drift is what causes wrong work.

**Updating docs means making them TRUE, not just appending what shipped.** Correct or strike a
stale claim where it sits rather than adding a newer entry beneath it, because the next reader
may hit the old one first. Cross-check every number against reality rather than trusting the
file. "Update the docs" means sweep all of them.

## Project rules

- **Standard library only.** No dependencies, ever. The install has to be one line for a
  stranger, and a tool that prints a table does not need a package.
- **Nothing is stored that git can tell us.** Branch, last commit time, dirty state and
  unpushed count are derived on every run. The store holds only `stage`, `note`,
  `stage_set_at`, and the list of roots. If you find yourself caching a derived field, you
  have just built the staleness this tool exists to prevent.
- **No second source of truth.** `wipboard md` writes a view, regenerated and never
  hand-edited. It is not a store.
- **The three rules about Worker code live as comments at that code**, not here: the payload
  shape is owned by `board_payload` (`wipboard.py`), every interpolated value goes through
  `escapeHtml` (`worker/src/render.ts`), and the snapshot age header is load-bearing
  (`snapshotAge`, same file). They were restated here until 2026-10-26, which made this file a
  third copy of each. You cannot edit those functions without reading the comment; nobody
  re-reads this list.
- **git failures are normal, not errors.** Three of the folders this was built against have
  no git at all. Every git call degrades to "no git" rather than raising.
- **Verify with `python -m pytest`** (43 tests) and `npm --prefix worker test` (32, plus
  `tsc`). pytest is required; running the test file directly executes nothing and exits 0. The
  drift and sort logic is the only non-trivial code here and it has to stay covered: the `!`
  flag is the entire value proposition, so a test that goes red when it breaks is worth more
  than any doc.
- **Work on `main`.** Solo project. Branch only to let CI gate something risky first.
