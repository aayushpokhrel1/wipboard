# Dashboard redesign: make it a proper dashboard

**Date:** 2026-11-01
**Status:** approved, not yet built. One attempt on 2026-11-01 was rejected in full; read
"What was tried" below before starting another.
**Scope:** `worker/src/render.ts` only. The CLI and its terminal table are untouched.

## Problem

The dashboard shipped on 2026-10-20 and was documented on 2026-10-31. Looking at it after
that, the author's verdict was that it "looks so bland".

That is a fair reading of what is there. The page is a vertical list of bordered cards
descended directly from the terminal table: system fonts, flat surfaces, 1px hairlines, one
accent colour used only for alarms. Nothing is wrong with it and nothing about it says
"dashboard" either. At desktop width, 19 cards in one column is roughly two viewports of
scrolling for a page whose entire purpose is to be taken in at a glance.

The ask is a page that reads as a designed dashboard, and the author wants it designed with
Impeccable rather than hand-tuned.

## This is a redesign, not a refinement

This matters because it picks the command. `bolder` amplifies the world that already exists,
which would produce a louder version of the list. The brief is a *different* world.

In Impeccable's terms that is a redesign: it keeps product truth, content, function and
constraints, but treats the incumbent look as evidence and **anti-reference**, chooses a
replacement world through `new-work`, and replaces `DESIGN.md`. Its guidance is explicit that
you must not split the difference and polish the look being discarded.

So the route is:

```
/impeccable new-work worker/src/render.ts
```

Name the file on every Impeccable command. The skill's scanner reports zero UI targets for
this repo and `impeccable context` reports no visual implementation, because the entire UI is
a template literal inside a `.ts` file and the `src/`-and-`.html` discovery misses it. Both
are wrong; `worker/src/render.ts` is the target.

`DESIGN.md` as it stands documents the outgoing implementation. Read it as evidence of what is
being replaced, not as a constraint, with the exception of the invariants below.

## What the redesign must keep

These are not stylistic preferences. Each one comes from `PRODUCT.md` or from a comment at the
code, and each survives any visual world.

- **The snapshot age stays the loudest element on the page.** A dashboard that silently shows
  yesterday is the precise failure this product exists to prevent, so the age outranks the
  wordmark and every project. Its tone and its plain-language note are produced together by
  `snapshotAge`; never render the tone without the words.
- **No condition is signalled by colour alone.** `PRODUCT.md` commits the page to WCAG 2.2 AA,
  and the flags are the page's whole value. Check contrast in both schemes for anything new.
- **Dark mode is a first-class scheme.** The page is read on a phone, at night. Not an
  inversion, not an afterthought.
- **Nothing becomes interactive.** Read-only is a product decision, not a layout one: there is
  no write path, and `PRODUCT.md` defers one because it needs real per-user auth.
- **Do not re-sort.** Payload order is `_sort_key` order from the CLI, and a comment at that
  code says why: re-sorting makes the two views disagree about what matters.
- **The flags keep the CLI's exact strings** (`!`, `stuck Nd`, `dirty`, `^N`), so the terminal
  and the page never need translating.
- **No dependencies, no build step, no client-side fetch.** The page must work from the HTML
  that arrives. Styles stay inline in `render.ts`.
- **Every interpolated value goes through `escapeHtml`.** Project names and notes are user text
  rendered in a browser. The rule lives as a comment at that function.

### The payload is a versioned contract

Worth knowing before designing anything that needs data the page does not already have. The
payload shape is owned by `board_payload` in `wipboard.py`, `PAYLOAD_VERSION` is 1, and the
Worker refuses an unknown version rather than rendering half a board.

The page currently receives, per project: `name`, `stage`, `note`, `last_commit`,
`stage_set_at`, `flags`, `has_git`, `branch`, `subject`, `changed`. Plus `generated_at` and
`host` for the board.

A design wanting anything beyond that list (commit counts over time, language, size, a
sparkline) is a three-part change: the CLI adds the field, `PAYLOAD_VERSION` goes to 2, and
the mismatch path in `renderVersionMismatch` carries the upgrade. That is allowed but it is no
longer a `render.ts`-only change, so prefer a world that is expressive with the fields above.

## What is explicitly open

- **The entire visual world.** Palette values, type, density, shapes, elevation, motion. The
  current palette was inherited from GitHub's interface by accident rather than chosen, and
  `DESIGN.md` already records the hex values as replaceable.
- **Motion.** The `DESIGN.md` bullet forbidding it was inferred from the absence of
  transitions in the stylesheet, not decided. Withdrawn.
- **Layout above 40rem.** See below.

## The column question

The One Column Rule in `DESIGN.md` is **withdrawn**. It was inferred from the single
breakpoint in the stylesheet (which only changes padding, gap and measure) and then given a
justification nobody asked for. The author has rejected it.

Below 40rem single column is arithmetic, not a rule. Above it, a multi-column grid serves the
glance better than scrolling does.

There is one real constraint on how, and it is specific to this page. The board arrives
sorted, stalest first, and that order is the thing telling you which project to pick up. A
row-flow CSS grid fills left to right, so card 2 lands beside card 1 and the ranking becomes a
zigzag. Three ways to handle it:

1. **Column-flow** (`grid-auto-flow: column` with a row count, or CSS multicolumn). Reading
   runs top to bottom down each column, so the ranking survives. Needs a committed row count.
2. **Row-flow grid plus explicit rank numbers** on the cards. Simpler CSS, and the number
   carries the order that position no longer does. Arguably clearer than today, since nothing
   currently tells a reader the list is ranked at all.
3. **Shorter cards in one column**, so the board fits a screen without a grid.

Recommended: option 1, two columns at 40rem and three at a wider stop. It keeps the ranking
intact without adding an element to the card. Not binding; the world chosen in `new-work`
may argue for another.

## What was tried on 2026-11-01, and why it was rejected

The first attempt at this spec produced four rounds of options and the author rejected all of
them. That is recorded here because the failure was in how the options were generated, and the
next attempt will repeat it unless it is read.

Each round was a set of built, served prototypes rather than descriptions, which was right.
What was wrong is what they contained. Round one varied the skin (a timetable, a deck log, a
gate board) over the same structure: one row per project, nineteen deep. The author's verdict
was "all the same list but with simple different css". Round two varied the composition and
the author liked one of them but said it had "no soul" and the colours were wrong. Round three
re-rolled the visual world inside that composition. Round four rolled structure again and
offered a radar dial, a triage split, and a wall of equal tiles.

The brief asked for a dashboard. Every round answered with nineteen projects arranged
differently. Four rounds of that is a failure to hear the brief, not a failure of the options
to be interesting enough, and no further re-roll of worlds or structures would have fixed it,
because the thing being re-rolled was not the thing that was wrong. A dashboard is not a
prettier enumeration of the rows; it is a page that answers a question before you read any
row. The next attempt should start from what the page should tell you in four seconds, and let
the treatment of the nineteen projects fall out of that, rather than starting from the
nineteen and arranging them.

### Two data facts the attempt established

Both are properties of the real board, and both constrain any design:

- **`stage_set_at` is identical across every project** (all `2026-10-02` at the time of
  writing, since that is when the stages were first set). "Time in stage" is therefore not a
  usable visual axis: any plot against it degenerates to a flat line. A design that wants a
  second dimension has to find it elsewhere.
- **6 of 19 projects are suspect.** The alarm treatment lands on roughly a third of the board,
  not on one row. Any world whose alarm is a thin red edge on an otherwise calm page is
  designing for a board that does not exist.

Nothing from the attempt was committed. The prototypes were scratchpad files and the repo was
never touched.

## Done looks like

- The page reads as a deliberately designed dashboard, at phone width first and then wide.
- The snapshot age still dominates, and every condition still reads without colour.
- `DESIGN.md` and `.impeccable/design.json` describe the new world, not the old one. Regenerate
  both with `/impeccable document` rather than hand-editing, and strike the superseded claims
  where they sit. The current Overview argues that the restraint is load-bearing and that "a
  board that looked expensive would be a board you distrust"; if the redesign disproves that,
  say so in the file rather than leaving the claim standing.
- This spec gets its `Status` line updated when the work lands.

## Verification

```bash
npm --prefix worker test     # 25 tests plus tsc, in the real Workers runtime
python -m pytest             # 17 tests
npx wrangler dev             # from worker/, to see the real page against local KV
```

Look at the running page at phone width and desktop width, in both colour schemes, before
calling it done. The render tests assert on markup, so a structural change will need them
updated; that is expected, and they must end green rather than deleted.

## Deliberately excluded

- **A write path.** Stages change in the CLI. Deferred in `PRODUCT.md` for auth reasons.
- **History, trends, sparklines over time.** `PRODUCT.md` defers these until there is a
  question they answer, and every push overwrites the single KV key, so the data does not
  exist.
- **A second machine's board.** One key, one writer.
- **Remote providers** (GitHub issues, PR counts, CI status). Needs network and auth for
  information that does not change which project you pick up today.
- **Any dependency, framework or build step** in the Worker's rendering path.
