---
name: wipboard
description: The whole roll printed on one sheet, read on a phone in the dark.
colors:
  paper: "#eef1f4"
  ink: "#11151a"
  silver: "#5d6671"
  wax: "#a8231a"
  rebate: "#ccd3da"
  d0: "#e4e8ed"
  d1: "#dae0e7"
  d2: "#cdd5de"
  d3: "#bfc8d3"
  d4: "#b2bcc8"
  d5: "#a6b0bb"
  paper-dark: "#0b0d10"
  ink-dark: "#e8edf2"
  silver-dark: "#8a95a3"
  wax-dark: "#ff6250"
  rebate-dark: "#2a313b"
  d0-dark: "#11141a"
  d1-dark: "#171c24"
  d2-dark: "#1f252f"
  d3-dark: "#28303c"
  d4-dark: "#323b49"
  d5-dark: "#3d4757"
typography:
  display:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "clamp(2.3rem, 13vw, 3.4rem)"
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: "-0.035em"
  count:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "1.05rem"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.02em"
  headline:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.78rem"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.18em"
  title:
    fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "normal"
  body:
    fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  label:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.7rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.14em"
  meta:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.68rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.02em"
  micro:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.62rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.18em"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.66rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
rounded:
  none: "0"
spacing:
  hair: "0.15rem"
  xs: "0.25rem"
  sm: "0.45rem"
  gutter: "0.5rem"
  md: "0.6rem"
  lg: "0.9rem"
  xl: "1rem"
  xxl: "1.5rem"
  cut: "2.5rem"
components:
  frame:
    backgroundColor: "{colors.d0}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0.45rem 0.55rem 0.5rem"
  frame-d3:
    backgroundColor: "{colors.d3}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0.45rem 0.55rem 0.5rem"
  frame-d5:
    backgroundColor: "{colors.d5}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0.45rem 0.55rem 0.5rem"
  frame-unexposed:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0.45rem 0.55rem 0.5rem"
  frame-single:
    backgroundColor: "{colors.d0}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0.7rem 0.8rem 0.75rem"
  frame-head:
    textColor: "{colors.ink}"
    typography: "{typography.meta}"
  frame-name:
    textColor: "{colors.ink}"
    typography: "{typography.title}"
  caption:
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0.25rem 0.1rem 0 0.55rem"
  exposure-stamp:
    textColor: "{colors.silver}"
    typography: "{typography.display}"
  exposure-stamp-warn:
    textColor: "{colors.ink}"
    typography: "{typography.display}"
  exposure-stamp-stale:
    textColor: "{colors.wax}"
    typography: "{typography.display}"
  alarm-count:
    textColor: "{colors.wax}"
    typography: "{typography.count}"
  edge-strip:
    textColor: "{colors.silver}"
    typography: "{typography.label}"
    padding: "0 0 0.5rem"
  tally:
    textColor: "{colors.silver}"
    typography: "{typography.label}"
    padding: "0.1rem 0"
  section-rule:
    textColor: "{colors.ink}"
    typography: "{typography.headline}"
    padding: "0 0 0.35rem"
  flag:
    textColor: "{colors.ink}"
    typography: "{typography.meta}"
  log-line:
    textColor: "{colors.silver}"
    typography: "{typography.mono}"
  empty-panel:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "1rem"
  code-inline:
    backgroundColor: "{colors.rebate}"
    textColor: "{colors.ink}"
    typography: "{typography.mono}"
    rounded: "{rounded.none}"
    padding: "0.08rem 0.3rem"
---

# Design System: wipboard

> **Scope: the Worker dashboard only** (`worker/src/render.ts`). The whole system is one
> inline `STYLE` constant in that file: no stylesheet, no framework, no build step, no client
> fetch, no external font. The CLI's terminal table deliberately has no design doc; its column
> rules live beside the code that prints them.

## Overview

**Creative North Star: "The Proof Sheet"**

This is a darkroom contact sheet: the whole roll printed on one sheet, read at arm's length,
with the frames that are lying to you crossed out in grease pencil. A contact sheet exists to
answer one question, "what have I actually got", from a single object rather than from a list,
and it is honest by construction that it is a print of a moment rather than the negatives.
That last part is the product's own confession about staleness, which is why the world fits.

The sheet's tone does the work before any word is read. Every frame prints at a ground set by
how long it has been since that project's last commit, on a fixed six-step density ramp, so
the sheet's overall shade is the board's shape. The sheet is then cut in two: **working on**
leads, **the rest** follows, and the cut is the page's main hierarchy. One saturated ink exists
on the page, a grease-pencil wax, and it carries condition and nothing else. Everything else is
paper, ink, silver and rebate.

Both schemes are first-class and the file carries two full palettes. The light scheme is a
print on the bench; the dark scheme is the same sheet on a light table, where the dense frames
are the ones that glow. Density still means distance from the ground in both, so the sheet's
shape reads identically either way. The dark scheme is the common case: a phone, in the dark,
for about four seconds. The world's earlier warm rendition (cream paper, sepia, beige) was
built and rejected on 2026-11-02; a darkroom is not a beige place, and the shipped rendition
is the cold end of the same room.

**Key Characteristics:**

- Ground tone encodes recency on a fixed six-step ramp; it is never computed from the board.
- One saturated ink (wax), reserved for condition. Everything else is a grey.
- Square corners everywhere. No radius anywhere in the system.
- The rebate is the gap: the page shows through between frames and nothing draws a divider.
- Exactly one text colour inside a frame, at full ink.
- Machine type (monospace) for everything the machine stamped; the UI face for human text.
- One motion in the whole system, and it is the sheet coming up in the developer.

## Colors

Cold darkroom greys with a single saturated mark: unexposed paper, full ink, a silver tier for
anything outside a frame, a rebate hairline, and six grounds that are the same surface at six
exposures.

### Primary

- **Wax** (`#a8231a` light / `#ff6250` dark): grease pencil, the only saturated ink on the
  page. It is the strike through a suspect frame's stage and frame number, the suspect count in
  the stamp block, a stale exposure stamp and its note, the focus ring, and the selection
  highlight. Nothing else is ever this colour. The light value is **measured, not chosen**: the
  strike is a non-text mark and needs 3:1 against whichever ramp step it is drawn on. The
  previous `#c62f22` reached only 2.49:1 on `d5`, which put the weakest mark on the stalest
  frames, the ones likeliest to be suspect. The shipped value clears 3.2:1 on `d5` and 6.3:1 on
  the paper.

### Neutral

- **Paper** (`#eef1f4` light / `#0b0d10` dark): unexposed stock. The page behind everything,
  and the colour showing through the grid gap between frames.
- **Ink** (`#11151a` light / `#e8edf2` dark): the single text colour inside a frame, the
  wordmark, the tally counts, the branch name, and the section rule and its label.
- **Silver** (`#5d6671` light / `#8a95a3` dark): the tier that exists **only outside a frame**,
  where the ground is always the paper: the edge strip, the tally labels, the age note, the
  caption's git line, the commit log, the list dashes, the scrollbar.
- **Rebate** (`#ccd3da` light / `#2a313b` dark): the 1px hairline. The edge strip's underline,
  the project page's block rules, the inset outline on an unexposed frame and the empty panel,
  the underline colour on a frame name, and the fill behind inline `code`.
- **The density ramp** (`d0` through `d5`): six steps away from the paper, fresh to stale.
  `d0` is under a day, `d1` under three days, `d2` under a week, `d3` under a month, `d4` under
  ninety days, `d5` beyond that. The light ramp's dense end stops at a mid grey rather than
  travelling as far as the dark ramp travels light, so there is headroom under both the wax and
  the single text ink at the dense end. A frame with no git, or a repo with no commits, prints
  as `dx`: transparent paper with a rebate outline, because its age is unknown rather than
  late.

### Named Rules

**The One Ink Rule.** There is exactly one saturated colour in the system and it reports a
condition the data actually holds. It is never used for emphasis, branding, a heading, a link,
or because a region looked flat. On a board with nothing suspect and a fresh snapshot, the page
is entirely grey, and that is correct.

**The Density Is Recency Rule.** A frame's ground is a fixed function of its last commit, on a
ramp of six constant steps. It is never a gradient computed across the current board, or the
same project would print differently on a different day, and the sheet would stop being
comparable with itself. Density is also never used to mean anything else: not stage, not
priority, not suspicion.

**The One Text Colour Inside A Frame Rule.** Text on a density ground is full ink, always, and
the six grounds all clear WCAG 2.2 AA against it. A muted grey tier was tried inside frames on
2026-11-02 and removed the same day: a second text colour has to clear all six steps, a grey
that does is no longer muted, and it failed AA at the dense end in both schemes. The silver
tier survives only outside the frames. Do not reintroduce a muted colour inside a frame without
re-checking it against `d5`.

**The No Condition By Colour Alone Rule.** Every condition ships on at least two channels, and
the words are the first one. The suspect state has three: the struck stage, the struck frame
number, and the literal `!` among the flags, with the wax only agreeing. The exposure stamp's
tone is never rendered without its plain-language note. PRODUCT.md holds this page to WCAG 2.2
AA and these states are the entire value of the page.

## Typography

**Display Font:** none purchased or fetched. `ui-monospace, SFMono-Regular, Menlo, monospace`
carries every machine role, including the display role.
**Body Font:** `system-ui, -apple-system, "Segoe UI", sans-serif` at 16px/1.4, with
`font-variant-numeric: tabular-nums` on the whole body so every column of ages lines up.
**Label/Mono Font:** the same monospace stack, at six sizes.

**Character:** two stacks, split by who wrote the text. Machine type is wide-tracked, uppercase
and small for furniture, and large and tight for the one number that matters. Human text (a
project name, a note, a next item) is the device's own UI face, so it reads as writing on the
sheet rather than as more stamped data. System stacks are a **pinned constraint**: the page is
one self-contained HTML response, and an external font would be a fetch it cannot make.

### Hierarchy

- **Display** (mono, 700, `clamp(2.3rem, 13vw, 3.4rem)`, line-height .95, tracking -.035em):
  the exposure stamp, which is the snapshot's age. Nothing else, on any surface, ever.
- **Count** (mono, 700, 1.05rem, tracking .02em): the suspect count under the stamp. One
  element, one per page.
- **Headline** (mono, 700, .78rem, tracking .18em, uppercase): the two section labels, over a
  full-ink rule.
- **Title** (UI face, 650, .95rem, line-height 1.2): a project name. Rises to 1.4rem on a
  project's own page, which is the only size change in the whole type ramp.
- **Body** (UI face, 400, 16px/1.4): the frame's caption note at .82rem/1.35, the project
  page's note at 1rem capped at 42rem, panel prose at full size, next items at .82rem/1.3.
- **Label** (mono, 400, .7rem, tracking .14em, uppercase): the edge strip, the back link, the
  project page's block rules. The tally runs one notch smaller at .72rem/.1em.
- **Meta** (mono, 400, .68rem): a frame's head (number and stage, tracking .1em), its metadata
  line, and the caption's git line.
- **Mono micro** (mono, 400, .66rem/1.45): the recent-commit log, rising to .78rem on a project
  page. Smaller still at .62rem with .18em tracking for the `next` label and the `+2 more`
  line.

### Named Rules

**The Stamp Outranks Everything Rule.** The snapshot age is set larger than the wordmark and
larger than every project name, on every surface that exists, including a single project's
page. A reader who takes one fact away must take this one, because a dashboard that silently
shows yesterday is the exact failure this product exists to prevent. Never let another element
outgrow it, and never render a surface without it.

**The Hierarchy Without A Second Colour Rule.** Inside a frame, rank is carried by size, weight
and tracking only. If something needs to recede, make it smaller or lighter, never greyer.

**The Monospace Means Machine Rule.** Monospace marks what the machine stamped or the reader
must type: ages, frame numbers, stages, flags, branch names, counts, commands. A project name
and a note are human writing and stay in the UI face even though a terminal would set them in
mono.

## Layout

The page is a sheet, not a document. Body padding is `1rem .9rem 2.5rem`, rising to
`1.5rem 1.5rem 3rem` above 48rem, capped at 86rem and centred above 70rem.

The head is an edge strip (wordmark, "contact sheet", host pushed right by `margin-left: auto`)
over a rebate hairline, then the stamp block: the exposure stamp with its note and the suspect
count on the left (`flex: 1 1 11rem`), the stage tally on the right as a column of
label/count rows. Then the two sections, each a full-ink rule carrying its label and its count,
then the sheet itself.

**Flow is columnar, not row-based.** The sheet is a CSS multicolumn list, so it reads top to
bottom down each column. The payload arrives sorted, stalest first, and that order is the thing
telling you which project to pick up; a row-flow grid would put frame 2 beside frame 1 and turn
the ranking into a zigzag. Columns: 2 on any phone from 22rem, 3 at 48rem, 4 at 70rem, with the
lead section one step wider each time (1, 2, 3) because its frames carry depth. Column gap
`.5rem`, `.6rem` in the lead section, `.65rem` above 48rem; cells are `break-inside: avoid`
with `.5rem` (then `.65rem`) below.

Each frame is a fixed stack of furniture in fixed positions: head (number left, stage right,
baseline-aligned), name, metadata line, then in the lead section only a `next` block and a
four-commit log. The caption (note, log, the capped-depth line, git line) prints **below** the
frame in the rebate, the way a caption is written in a proof sheet's margin, indented `.55rem`
from the left, so an absent note never changes the frame's own shape.

Spacing is tight and runs on a sub-rem scale: `.15`, `.25`, `.45`, `.5`, `.6`, `.9`, `1rem`,
with `1.5rem` and `2.5rem` reserved for the two large cuts (the project page's blocks, and the
air above a section rule). Any arbitrary user string, a name, a note, a next item, a commit
subject, an uncommitted path, carries `overflow-wrap: anywhere`.

### Named Rules

**The Column Flow Rule.** The sheet flows down each column, never across rows, at every width.
The payload's order is a ranking and the layout must not scramble it. Multicolumn also commits
to no row count, which is why it survives from 22rem to 86rem without a second layout.

**The Cut Rule.** The sheet is cut into exactly two sections, and the cut is the page's main
hierarchy: what you are inside leads, everything else follows. Both sections keep payload order
internally, and frame numbers are assigned **before** the split, so a frame number always means
the same rank it means in the terminal and moving a project between sections never renumbers
it. The section label is machine type at full ink over an ink rule with air above it: it was
silver at .7rem over a rebate rule until 2026-11-02, which is the edge strip's own treatment,
and made the second section read as the sheet continuing rather than as a second sheet.

**The Stated Cap Rule.** A phone caps a lead frame's depth at two next items and two commits,
because six lead frames at four and four put roughly 3000px between the stamp and "the rest".
The cap is **stated** by a `+2 next · +2 recent` line, never silent: a block that quietly drops
two of its four items is indistinguishable from a project that only had two. Nothing is capped
at 48rem and above, and the line is hidden there.

## Elevation & Depth

Flat, with tone as the entire depth model. There is no drop shadow, no offset shadow and no
blur anywhere in the system. A frame separates from the page because it is printed at a
different density than the paper, and the gap between frames is unexposed paper rather than a
drawn divider.

### Shadow Vocabulary

- **Rebate outline** (`box-shadow: inset 0 0 0 1px var(--rebate)`): the only `box-shadow` in
  the file, used twice. It is a hairline border drawn inside the box, not elevation: on an
  unexposed `dx` frame, and on the empty / mismatch / missing panel.

### Named Rules

**The Density Is Not Elevation Rule.** A denser frame is older, not nearer. Depth must never
become a second channel for condition, and a suspect frame is never raised, outlined or
shadowed; it is struck.

**The Rebate Is The Divider Rule.** Separation is the gap, not a line. No frame draws a border.
The only rules on the page are the edge strip's hairline, the two section rules, and the
project page's block rules.

## Shapes

Square. There is no `border-radius` anywhere in the system, on any element, including inline
`code` and the panels. Frames are rectangles of printed ground; the sheet is a grid of them
separated by paper.

The only non-rectilinear form in the system is the grease-pencil strike: a pseudo-element 2px
tall, inset `-.18em` at both ends so it overhangs the word, sitting at 46% height and rotated
`-1.8deg`. It is drawn rather than a browser `line-through` on purpose. A tidy machine rule
through a word is not a grease pencil, and the point of this world is that the marks on it were
made by hand.

Lists draw their own marker: a dash hung outside the text (`content: "-\00a0"` in silver, with
`padding-left: .95rem` and `text-indent: -.95rem`), in both the frame's `next` block and the
project page's lists. The browser's own marker rendered as hollow rings inside the sheet and
filled discs on the project page, and a small hollow ring is uncomfortably close to the wax
ring this world rejected.

### Named Rules

**The Hand Mark Rule.** Any mark that represents a human judgement is drawn, slightly off-axis,
and overhangs what it marks. Any mark that represents a machine value is square, aligned and
tabular. Do not let the two swap.

**The No Radius Rule.** Nothing in this system is rounded. A rounded corner is a card, and a
card is the vertical stack of status panels this page was redesigned to stop being.

## Components

### The Exposure Stamp

The signature component and the loudest thing on every surface. The snapshot's age at display
size, in one of three ink weights on a single ink rather than three hues: silver when under an
hour, full ink between an hour and a day, wax beyond a day or when the timestamp is unreadable.
Directly beneath it, in the same tone, a plain-language note capped at 34ch ("Nothing has been
pushed since. Every frame below is at least this old."). The fresh state has no note.

- **Tone and words are produced together** by `snapshotAge` in `render.ts` and are never
  rendered apart.
- It leads the board, every project page, and every empty, missing and mismatch state, so the
  page's shape never changes between states and no surface can silently show yesterday.

### The Suspect Count

One line under the stamp, wax, mono, 700 at 1.05rem: `7 of 19 suspect`. An order of magnitude
below the stamp, because the stamp still outranks everything, but loud enough to be read in the
same glance. It is not a second channel for the flag; it is the one place the sheet's own shape
is stated rather than seen. Rendered only when the count is non-zero.

### The Edge Strip and The Tally

The edge strip is the sheet's margin: wordmark, the words "contact sheet", and the host pushed
to the right edge, all silver mono at .7rem with .14em tracking, uppercase, over a rebate
hairline. Machine type here is measurement, not decoration: every value in the strip is
machine-stamped.

The tally is a column of stage/count rows in the same machine type, counts in full ink and
bold, printed in the CLI's fixed stage cycle order rather than payload order, so the rows never
move and a column of counts stays comparable. Counts only: the page is read-only and nothing
filters.

### Frames

The sheet's unit, and the whole system in miniature.

- **Shape:** square, no border, `.45rem .55rem .5rem` padding (`.7rem .8rem .75rem` at single
  width on a project page).
- **Ground:** one of the six ramp steps by recency, or transparent paper with a rebate outline
  when unexposed.
- **Furniture, identical and in the same positions in every frame:** head (zero-padded frame
  number left, stage uppercase right), name at title size, metadata line (time since last
  commit, time in stage, flags).
- **Lead frames** additionally carry a `next` block and up to four recent commits. The compact
  frame is the same frame with those two blocks absent, which is what makes both sections read
  as one sheet.
- **Flags** are full-weight ink, never wax: wax text inside a frame has to clear contrast
  against all six steps and does not at the dense end, and the word itself already carries the
  condition. They use the CLI's exact strings (`!`, `stuck 41d`, `dirty`, `^3`) so the two
  views never need translating.
- **Suspect:** a wax strike through the stage word, and a second through the frame number. The
  number is struck **only on the sheet**: the project page reuses the same slot for the branch
  name, where a line through `main` would read as "this branch is gone". This replaced a drawn
  wax ring around the whole frame on 2026-11-02; six rings on nineteen frames read as damage
  rather than as a flag, and the ring said "something is wrong here" where the strike says the
  specific thing that is wrong. Do not bring the ring back.
- **Motion:** one animation exists in the system. `develop`, 520ms on
  `cubic-bezier(.16, 1, .3, 1)`, staggered 22ms per frame index, fading the ground up from the
  paper. It runs from an already-visible default (only the ground moves, so every word is
  readable from the first frame), and it is wrapped in `prefers-reduced-motion: no-preference`.
  Nothing else on the page transitions.

### Captions

The text below a frame, in the rebate: the note, the recent-commit log, the stated-cap line,
and the git line (branch in full ink, commit subject and changed count in silver). Indented
`.55rem` from the frame's left edge. Nothing here has a ground of its own, which is why silver
is allowed.

### Links

The page was read-only and link-free until 2026-11-02; a frame's name now opens that project's
page, and the project page carries a back link.

- **Default:** colour inherited from the text, underline kept with `.18em` offset and 1px
  thickness, rebate-coloured under a frame name.
- **Hover:** underline thickens to 2px. No colour change, no movement.
- **Focus:** a 2px wax outline at 2px offset, chosen because wax is the one value visible on
  every density step.

### Panels (empty, version mismatch, missing project)

Transparent ground with a rebate inset outline, `1rem` padding, capped at 44ch, square. Each
leads with the exposure stamp so the page's shape never changes, and each states the exact
command that fixes it in inline `code` (rebate fill, no radius).

### The Project Page

One frame at `46rem`, with the name at 1.4rem, then the blocks the board had no room for:
`next` with its provenance line, `recent` uncapped, and `uncommitted` paths. Block headings are
silver label-type rules. Nothing here is capped, because this page exists precisely for the
reader who wanted more than the frame had room for.

## Do's and Don'ts

### Do:

- **Do** keep the exposure stamp the largest element on every surface, larger than the wordmark
  and every project name, and never render a surface without it.
- **Do** keep text inside a frame at full ink, and build hierarchy from size, weight and
  tracking.
- **Do** keep silver for what sits on the paper: edge strip, tally, captions, logs, notes.
- **Do** re-check both the wax and the single text ink against `d5` in both schemes if any ramp
  step moves.
- **Do** give every condition a word. Colour agrees with the words; it never carries them
  alone.
- **Do** flow the sheet down its columns, at every width.
- **Do** state any cap you apply, the way the `+2 next` line does.
- **Do** use the CLI's exact flag strings so the terminal and the sheet never disagree.
- **Do** keep the whole system inline in `render.ts`: no framework, no build step, no client
  fetch, no external font. The page must work with nothing but the HTML that arrives.
- **Do** design dark as its own print. It is the common case, not an inversion.

### Don't:

- **Don't** introduce a second saturated colour, or use wax for anything that is not a
  condition the data holds.
- **Don't** put wax text on a density ground. Wax stays where its ground is known: the strike,
  the focus ring, and the stamp block on the paper.
- **Don't** add a muted text tier inside a frame.
- **Don't** compute the density ramp from the current board, or reuse density to mean anything
  other than recency.
- **Don't** add a drop or offset shadow. The only `box-shadow` permitted is the 1px inset
  rebate hairline.
- **Don't** add a `border-radius` anywhere.
- **Don't** draw a border around a frame. The gap is the divider.
- **Don't** mark a suspect frame with a ring, a tint, or elevation. It is struck.
- **Don't** add a second motion, or let motion start from an invisible state.
- **Don't** re-sort the payload, re-number frames after the section split, or make anything
  interactive beyond the project link. The dashboard is read-only by product decision.
- **Don't** interpolate a value into the markup without `escapeHtml`. The rule lives as a
  comment at that function.
