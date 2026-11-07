---
name: wipboard
description: A lit instrument panel for every repo you left half-finished, read on a phone in the dark.
colors:
  field: "#070b10"
  bar: "#0c131b"
  surface: "#101a24"
  line: "#1d2c3a"
  text: "#e8f0f6"
  dim: "#8396a6"
  accent: "#3ad6c4"
  hot: "#ff5a42"
  on-hot: "#120503"
  chip: "#1b2a38"
  chip-ink: "#a9bccb"
  r0: "#3ad6c4"
  r1: "#2faea0"
  r2: "#2b8b84"
  r3: "#286b69"
  r4: "#244f52"
  r5: "#20383c"
typography:
  readout:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "clamp(2rem, 9vw, 2.9rem)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.04em"
  tile-count:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "clamp(1.3rem, 4.5vw, 1.9rem)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.03em"
  title:
    fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title-single:
    fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  body:
    fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  note:
    fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 400
    lineHeight: 1.35
    letterSpacing: "normal"
  headline:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.66rem"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.24em"
  tag:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.68rem"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.14em"
  strip:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.66rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.22em"
  stamped:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.64rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.1em"
  meta:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.62rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  micro:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.58rem"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.16em"
  log:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.64rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
rounded:
  none: "0"
spacing:
  hair: "0.15rem"
  xs: "0.2rem"
  sm: "0.4rem"
  gutter: "0.5rem"
  md: "0.6rem"
  card: "0.75rem"
  lg: "0.9rem"
  xl: "1.1rem"
  xxl: "1.4rem"
  edge: "1.5rem"
  foot: "3rem"
components:
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
    padding: "0.6rem 0.75rem 0.5rem"
  card-single:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
    padding: "0.9rem 1rem 0.7rem"
  card-caption:
    textColor: "{colors.dim}"
    rounded: "{rounded.none}"
    padding: "0 0.75rem 0.6rem"
  readout-strip:
    backgroundColor: "{colors.bar}"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
    padding: "1rem 1.1rem"
  readout-age:
    textColor: "{colors.text}"
    typography: "{typography.readout}"
  readout-age-stale:
    textColor: "{colors.hot}"
    typography: "{typography.readout}"
  alarm-tag:
    backgroundColor: "{colors.hot}"
    textColor: "{colors.on-hot}"
    typography: "{typography.tag}"
    rounded: "{rounded.none}"
    padding: "0.28rem 0.5rem"
  tally-tile:
    backgroundColor: "{colors.bar}"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
    padding: "0.5rem 0.7rem"
  edge-strip:
    backgroundColor: "{colors.bar}"
    textColor: "{colors.dim}"
    typography: "{typography.strip}"
    rounded: "{rounded.none}"
    padding: "0.7rem 1.1rem"
  section-rule:
    textColor: "{colors.text}"
    typography: "{typography.headline}"
    padding: "0 0 0.4rem"
  chip-stage:
    backgroundColor: "{colors.chip}"
    textColor: "{colors.chip-ink}"
    typography: "{typography.micro}"
    rounded: "{rounded.none}"
    padding: "0.14rem 0.4rem"
  chip-stage-suspect:
    backgroundColor: "{colors.hot}"
    textColor: "{colors.on-hot}"
    typography: "{typography.micro}"
    rounded: "{rounded.none}"
    padding: "0.14rem 0.4rem"
  chip-flag:
    backgroundColor: "{colors.chip}"
    textColor: "{colors.chip-ink}"
    typography: "{typography.meta}"
    rounded: "{rounded.none}"
    padding: "0.06rem 0.28rem"
  chip-flag-suspect:
    backgroundColor: "{colors.hot}"
    textColor: "{colors.on-hot}"
    typography: "{typography.meta}"
    rounded: "{rounded.none}"
    padding: "0.06rem 0.28rem"
  drawer-summary:
    textColor: "{colors.dim}"
    typography: "{typography.micro}"
    rounded: "{rounded.none}"
    padding: "0.4rem 0 0.1rem"
  log-line:
    textColor: "{colors.dim}"
    typography: "{typography.log}"
  empty-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
    padding: "1rem"
  code-inline:
    backgroundColor: "{colors.chip}"
    textColor: "{colors.chip-ink}"
    typography: "{typography.meta}"
    rounded: "{rounded.none}"
    padding: "0.08rem 0.3rem"
---

# Design System: wipboard

> **Scope: the Worker dashboard only** (`worker/src/render.ts`). The whole system is one inline
> `STYLE` template literal in that file: no stylesheet, no framework, no build step, no client
> fetch, no external font. The CLI's terminal table deliberately has no design doc; its column
> rules live beside the code that prints them.

## Overview

**Creative North Star: "The Control Room"**

This is a dark-field instrument panel, not a document. The page's job is to answer three
questions as numbers before a single project name is read: how old is this snapshot, how much of
the board is lying to you, and where does the mass sit. Those three answers are the readout strip
across the top. Everything under it is detail, laid out as a field of small lit cards rather than
a column of status paragraphs.

**There is one scheme and it is lit.** `color-scheme: dark`, no `prefers-color-scheme` branch, no
light twin. The reason is recorded at the token block and is the strongest rule in the file: two
palettes meant every colour had to be decided and re-checked twice, and that is exactly how the
single saturated ink was silently lost in the light scheme on 2026-11-04 while the dark scheme
looked perfect. An instrument has a lit face. There is no second palette to keep true.

Colour carries meaning and nothing else. The field, bar, surface and line tones are the chassis.
One instrument colour (`accent`, `#3ad6c4`) carries recency on each card's left rail and marks
the values the machine read (branch, commit age, list markers). One alarm (`hot`, `#ff5a42`) is
reserved for a condition the data actually holds, and is far enough from the accent in hue that
the two never read as one scale. On a board with nothing suspect and a fresh snapshot there is no
alarm anywhere, and that is correct.

**Key Characteristics:**

- One scheme, dark, with no light counterpart to keep in sync.
- Recency is a four-pixel rail down a card's left edge on a fixed six-step ramp, never a ground
  tone and never computed from the current board.
- Two meaning colours only: accent for recency and machine values, alarm for conditions.
- Square corners everywhere. No `border-radius` anywhere in the system.
- No shadows at all. Depth is the chassis tone stack: field, bar, surface.
- Machine type (monospace) for every value the machine stamped; the device UI face for human text.
- Every card states what is happening in one line, with its depth behind a plain `<details>`.
- One motion in the system, and it is only the rail coming up.

## Colors

A cold dark chassis in four steps, one instrument colour, one alarm, and a six-step recency rail
that runs from the instrument colour down to nearly the card's own border.

### Primary

- **Instrument Teal** (`#3ad6c4`): the panel's own colour. It is the lit end of the recency rail,
  the branch name, the commit age in a log line, the drawn list markers, the drawer's plus and
  minus marks, the focus ring, and the selection fill. **9.7:1 on a card**, measured. It never
  means "important" and never decorates a heading.

### Secondary

- **Alarm** (`#ff5a42`): the condition colour. It is a stale snapshot's age and note, the suspect
  tag's fill, the inverted stage chip and flags on a suspect card, and that card's rail. Measured
  at **5.7:1 on a card** as a mark and **6.0:1 as text on the bar**. Nothing that is not a
  condition the data holds is ever drawn in it.
- **Alarm Ink** (`#120503`): the only text colour that ever sits on an alarm fill.

### Neutral

- **Field** (`#070b10`): the page behind everything, and the gap showing through between cards.
- **Bar** (`#0c131b`): the chrome strip and the readout strip, and each tally tile. One step up
  from the field, which is how the head reads as the instrument's own housing.
- **Surface** (`#101a24`): a card, and every panel. Two steps up from the field.
- **Line** (`#1d2c3a`): the 1px hairline, the 2px section rule, the tally's 1px grid gaps, the
  scrollbar thumb, a card's border, the rail's own fallback, and the underline under a card name.
- **Text** (`#e8f0f6`): every primary string. The age readout, a tally count, a project name, a
  note, a section label.
- **Dim** (`#8396a6`): the recessed tier. The chrome strip, tally labels, the age note, a card's
  meta line and git line, the drawer summary, commit subjects, provenance lines.
- **Chip** (`#1b2a38`) and **Chip Ink** (`#a9bccb`): the tag pair, used for the stage chip, the
  flags, and inline `code`.
- **The recency rail** (`r0` through `r5`): six fixed steps from the instrument colour to nearly
  the card border. `r0` is under a day since last commit, `r1` under three days, `r2` under a
  week, `r3` under a month, `r4` under ninety days, `r5` beyond that. A card with no git, or a
  repo with no commits, keeps the `line` fallback.

### Named Rules

**The One Scheme Rule.** There is one palette and it is the lit one. Do not add a
`prefers-color-scheme` branch, a light twin, or a per-token light value. Two palettes mean every
colour is decided twice and re-checked twice, and the second one silently rots: that is precisely
how the saturated ink went missing from the light scheme on 2026-11-04. If a value needs changing
there is exactly one place to change it.

**The Alarm Reports, It Never Emphasises.** `hot` is drawn only where the data holds a condition:
a snapshot over a day old, a suspect card. It is never a heading colour, a brand colour, a link
colour, or a way to wake up a region that looked flat.

**The Rail Has No Fresh Fallback Rule.** The rail defaults to the card's own border colour
(`var(--rail, var(--line))`). A card that has lost its density class must read as "age unknown",
never as "committed minutes ago". That is the one lie this page cannot tell, and it is why the
fallback is the dead value rather than `r0`.

**The Dim End Is Exempt Because The Text Carries It.** `r5` sits deliberately close to the card
and does not reach 3:1 against it. This is allowed only because the rail is never the sole
carrier: the same fact is printed as text ("23d") in that card's own meta line. If the rail ever
becomes the only channel for something, it has to be re-measured before it ships.

## Typography

**Display Font:** none purchased or fetched. `ui-monospace, SFMono-Regular, Menlo, monospace`
carries every machine role including the largest one.
**Body Font:** `system-ui, -apple-system, "Segoe UI", sans-serif` at 14px/1.4, with
`font-variant-numeric: tabular-nums` set on the whole body so every column of ages lines up.
**Label/Mono Font:** the same monospace stack, at seven sizes from .68rem down to .58rem.

**Character:** two stacks, split by who wrote the text. Machine type is small, uppercase and
wide-tracked for furniture and large and tight for the numbers in the readout. Human text (a
project name, a note, a next item) is the device's own UI face, so it reads as writing on the
panel rather than as more stamped data. System stacks are a **pinned constraint**: the page is one
self-contained HTML response and an external font would be a fetch it cannot make.

### Hierarchy

- **Readout** (mono, 700, `clamp(2rem, 9vw, 2.9rem)`, line-height 1, tracking -.04em): the
  snapshot's age. Nothing else, on any surface, ever.
- **Tile count** (mono, 700, `clamp(1.3rem, 4.5vw, 1.9rem)`, line-height 1, tracking -.03em): a
  stage count in the tally. Second largest on the page, by design.
- **Title** (UI face, 700, 1rem, line-height 1.2, tracking -.01em): a project name. Rises to
  1.5rem on that project's own page, the only size change in the ramp.
- **Headline** (mono, 700, .66rem, tracking .24em, uppercase): the two section labels, over a 2px
  `line` rule, with the section's count pushed right in `dim`.
- **Tag** (mono, 700, .68rem, tracking .14em, uppercase): the suspect tag under the readout. One
  element, at most one per page.
- **Strip** (mono, .66rem, tracking .22em, uppercase): the chrome strip, where the wordmark runs
  at .3em, and the back link at .18em.
- **Stamped** (mono, .64rem, tracking .1em): a card's head row, number and stage.
- **Meta** (mono, .62rem): a card's meta line (age, time in stage, flags) and its git line.
- **Micro** (mono, 700 or 400, .58rem to .6rem, tracking .16em to .2em, uppercase): the stage
  chip, tally labels, the drawer summary, the `next` heading and the project page's block
  headings.
- **Log** (mono, .64rem/1.45): the commit log, rising to .74rem on a project page.
- **Human text** (UI face): a note at .78rem/1.35 (.95rem on a project page, capped at 42rem), a
  next item at .76rem/1.35 (.88rem/1.4 on a project page), the age note at .72rem capped at 30ch,
  panel prose at the body size.

### Named Rules

**The Readout Outranks Everything Rule.** The snapshot age is set larger than the wordmark and
larger than every project name, on every surface that exists, including a single project's page
and every empty, missing and mismatch state. A reader who takes one fact away must take this one,
because a dashboard that silently shows yesterday is the exact failure this product prevents.
Never let another element outgrow it, and never render a surface without it.

**The Monospace Means Machine Rule.** Monospace marks what the machine stamped or the reader must
type: ages, card numbers, stages, flags, branch names, counts, paths, commands. A project name and
a note are human writing and stay in the UI face even though a terminal would set them in mono.

**The Counts Align Rule.** Tally tiles are `column-reverse`, count above label, so the row of
counts can be read across without reading a single label. Any new tile joins that row rather than
inventing its own stack order.

## Layout

The body has no horizontal padding of its own: each region sets its own `1.1rem` gutter, rising to
`1.5rem` above 48rem, with `3rem` of air under the last card.

The head is two strips stacked. First the chrome strip (wordmark, the panel's subtitle, the host
pushed right by `margin-left: auto`) on `bar` over a `line` hairline. Then the readout strip, also
on `bar`: the age and its note and the suspect tag on the left, the stage tally on the right. That
strip is stacked on a phone (`minmax(0, 1fr)`, `.9rem` gap, with the age block divided by a bottom
hairline) and goes side by side from **34rem** (`auto minmax(0, 1fr)`, `1.4rem` gap, the divider
rotating to a right border). Above **70rem** the tally column is capped at `46rem`. Four tally
tiles plus the age do not fit across 375px, and shipping them side by side at every width ran them
off the right edge of the device this page is most often read on.

The tally is a one-row grid (`grid-auto-flow: column`, `grid-auto-columns: 1fr`) whose 1px gaps
show `line` through from the list background, so the tile dividers are gaps rather than borders.

The board is then cut in two: **working on** leads, **the rest** follows, each introduced by a
section rule carrying its label and count. Each section is a CSS grid,
`repeat(auto-fill, minmax(260px, 1fr))` with a `10px` gap (`300px` and `12px` in the lead
section, `12px` everywhere above 48rem).

Each card is a column flex: the frame block (`.6rem .75rem .5rem`) holding head row, name and meta
line, then the caption block pushed to the bottom with `margin-top: auto` (`0 .75rem .6rem`)
holding the note, the git line and the drawer. The card carries a 1px `line` border and a 4px left
rail (6px at single width). Any arbitrary user string, a name, a note, a next item, a commit
subject, an uncommitted path, carries `overflow-wrap: anywhere`.

Breakpoints: **34rem** (readout goes side by side), **48rem** (gutters to 1.5rem, grid gap to
12px), **70rem** (tally column capped at 46rem).

### Named Rules

**The Readout Strip Is The Hierarchy Rule.** The page's main hierarchy move is the strip, not the
cards: the three facts you can act on are answered as numbers at the top, and everything below is
detail. A new fact that belongs to the whole board goes in the strip, and a new fact about one
project goes on that card, never the reverse.

**The Row Flow Trade Rule.** The board is a row-flow grid, and the multicolumn layout it replaced
read payload rank straight down each column. **That property is genuinely lost**: in row flow card
2 sits beside card 1 and the ranking zigzags. It was traded on purpose. Rank stays legible because
every card prints its own zero-padded number, and a board that reads as one instrument at a glance
was worth more than a ranking that survives a column break. If rank ever has to be exact again,
this grid rule is the thing to revisit, not the card.

**The Cut Rule.** The board is cut into exactly two sections and the cut is a partition, never a
re-sort: both sections keep payload order internally, and numbers are assigned **before** the
split, so a card number always means the same rank it means in the terminal and moving a project
between sections never renumbers it.

## Elevation & Depth

Flat. **There is no `box-shadow` anywhere in the file**, no drop shadow, no offset shadow, no
blur, and no `filter`. Depth is a three-step chassis tone stack: `field` is the page, `bar` is the
housing at the top, `surface` is a card or a panel, each separated by a 1px `line` border where
they meet. A card reads as sitting on the field because it is a lighter chassis tone inside a
hairline, and the gap between cards is field, not a drawn divider.

The only other depth cue in the system is the rail, and it reads as a lit edge rather than a
height.

### Named Rules

**The No Shadow Rule.** This system has no shadow vocabulary at all, not even an inset hairline.
Separation is a tone step plus a 1px border. Do not introduce a shadow token to make a card
"pop", and do not reach for an offset shadow: that is a different world's device, and this one is
not that world.

**The Rail Is Not Elevation Rule.** A brighter rail means more recent, not nearer. Depth must
never become a second channel for recency or for condition, and a suspect card is never raised,
glowed or outlined: its chip inverts, its rail goes to alarm, and its flag prints as a word.

## Shapes

Square, at every scale. There is no `border-radius` anywhere in the system, on any element,
including the chips, the alarm tag, the panels and inline `code`. Every form is a rectangle: a
card is a rectangle of `surface`, a tally tile is a rectangle of `bar`, a chip is a filled
rectangle of text.

The recurring silhouette is **a rectangle with one thick lit edge**: 4px on the board, 6px at
single width, always on the left, always carrying recency or alarm.

Two marks are drawn rather than inherited. Lists set their own marker, a right-pointing small
triangle (`\25B8` plus a non-breaking space) in accent, hung outside the text with
`padding-left: .9rem` and `text-indent: -.9rem`, because the browser's own marker renders
differently in a nested list and a top-level one on a page that already themes its selection, its
scrollbar and its focus ring. The drawer replaces its disclosure triangle with a floated `+` that
becomes a minus sign (`\2212`) when open, in accent.

### Named Rules

**The No Radius Rule.** Nothing in this system is rounded. A rounded corner reads as a soft
content card, and the page is an instrument face made of panels.

**The One Lit Edge Rule.** A rectangle gets at most one coloured edge and it is the left one. Do
not put the rail on another side, do not add a second coloured edge, and do not colour a card's
remaining three borders.

## Components

### The Readout

The signature component and the loudest thing on every surface. The snapshot's age at readout
size, in one of two colours: `text` while it is under a day old, alarm beyond a day or when the
timestamp is unreadable. Directly beneath it, in the same colour, a plain-language note capped at
30ch ("Nothing has been pushed since. Every card below is at least this old."). An hour-old
snapshot gets the note but not the alarm colour, because an hour is worth noticing and a day is
worth distrusting, and an alarm that fires at an hour means nothing by the time it is earned.

- **Colour and words are produced together** by `snapshotAge` in `render.ts` and are never
  rendered apart.
- It leads the board, every project page, and every empty, missing and mismatch state, so the
  page's shape never changes between states and no surface can silently show yesterday.

### The Suspect Tag

One filled alarm tag under the readout: `7 of 19 suspect`, mono 700 at .68rem with .14em
tracking, uppercase, `on-hot` on `hot`, `.28rem .5rem` of padding, square. A filled tag rather
than coloured words, because the page the author rejected is the one that looks calm while a third
of the board is lying, and a tag is the loudest this can be without outranking the readout. The
number and the word carry it; the fill only agrees. Rendered only when the count is non-zero.

### The Chrome Strip and The Tally

The chrome strip is the instrument's housing: wordmark, subtitle, and the host pushed to the right
edge, all `dim` mono at .66rem with .22em tracking, uppercase, on `bar` over a `line` hairline.

The tally is a single row of tiles on `bar`, split by 1px `line` gaps, each tile count above label
(`column-reverse`), counts in `text` and bold at tile-count size, labels in `dim` micro. Printed
in the CLI's fixed stage cycle order rather than payload order, so the rows never move and a row
of counts stays comparable. Counts only: the page is read-only and nothing filters.

### Cards

The board's unit and the whole system in miniature.

- **Shape:** square, `surface` ground, 1px `line` border, 4px left rail, `.6rem .75rem .5rem`
  padding in the frame block (`.9rem 1rem .7rem` and a 6px rail at single width).
- **Rail:** one of the six recency steps by last commit, set through `--rail` by a
  `:has(.d0)`-style hook, or the `line` fallback when the age is unknown.
- **Furniture, identical and in the same positions in every card:** head row (zero-padded number
  left in `dim`, stage chip right), name at title size, meta line (time since last commit, time in
  stage, flags).
- **Stage chip:** `chip-ink` on `chip`, uppercase micro, `.14rem .4rem`. The stage is a chip
  because it is the one field on this page a human typed and the only one that can be wrong:
  giving it an edge says it is a claim.
- **Flags** are chips too, in the CLI's exact strings (`!`, `stuck 41d`, `dirty`, `^3`) so the two
  views never need translating.
- **The git line** is the one line every card states without being opened: branch in accent and
  bold, commit subject and changed count in `dim`, or the words "no git".
- **Suspect** keeps three channels and only one is colour: the stage chip and the flags invert to
  a filled alarm tag, the rail goes to alarm regardless of age, and `!` prints among the flags as
  a word. The suspect rail rule is declared after the recency rules deliberately, so alarm wins.
- **Motion:** one animation exists in the system. `develop`, `520ms` on
  `cubic-bezier(.16, 1, .3, 1)`, staggered `22ms` per card index via an inline `--i`, fading the
  card up from `opacity: .4` with the rail starting at `line`. Only the rail moves in colour, so
  every word is readable from the first frame, and the whole block is wrapped in
  `prefers-reduced-motion: no-preference`. Nothing else on the page animates or transitions.

### The Drawer

Why every card can afford to be short. What is happening now is always on the face of the card;
the depth behind it is one press away, inside a plain `<details>` over a `line` hairline. The
summary is `dim` micro, uppercase, and **counts what is inside** (`2 next · 4 recent`) rather than
teasing the first line of it, because a count is the one summary that cannot be misread as the
whole thing. Its marker is a floated accent `+` that becomes a minus when open, hover lifts the
summary to `text`, and focus draws a 2px accent ring at 2px offset.

`<details>` is the whole mechanism: **no script**, keyboard-operable, and it survives with its
summary visible if the element is ever unstyled. Inside it, the `next` list (accent triangle
markers, .76rem human text) and the commit log (mono .64rem, age in accent in a fixed 2.6rem
right-aligned column, subject in `dim`).

### Links

- **Default:** colour inherited from the text, underline kept at 1px with `.18em` offset, in
  `line` under a card name.
- **Hover:** underline thickens to 2px; a card name shifts to accent. No movement.
- **Focus:** a 2px accent outline at 2px offset, the one ring in the system.

### Panels (empty, version mismatch, missing project)

`surface` ground, 1px `line` border, a 4px `line` left edge so a panel reads as a card with no
age, `1rem` padding, capped at 44ch, square. Each leads with the readout so the page's shape never
changes, and each states the exact command that fixes it in inline `code` (`chip-ink` on `chip`,
no radius).

### The Project Page

One card at full width (`max-width: 46rem`, 6px rail, name at 1.5rem), then the blocks the board
has no room for, open rather than behind a drawer, because that is why the reader came here:
`next` with its provenance line, `recent` uncapped, and `uncommitted` paths. Block headings are
`dim` micro over a `line` hairline. The card's head row reuses the number slot for the branch
name. Nothing here is capped.

## Do's and Don'ts

### Do:

- **Do** keep one palette. All colour decisions live in the single `:root` block and are made
  once.
- **Do** keep the readout the largest element on every surface, larger than the wordmark and every
  project name, and never render a surface without it.
- **Do** keep recency on the rail, on the fixed six-step ramp, computed from the last commit
  alone.
- **Do** leave the rail's fallback at the dead `line` value, so a missing class reads as "age
  unknown".
- **Do** keep accent for recency and machine-read values, and alarm for conditions the data holds.
- **Do** give every condition a word. The suspect state ships on three channels and only one of
  them is colour.
- **Do** state the alarm colour's measured contrast when a value moves: accent is 9.7:1 on a card,
  alarm is 5.7:1 on a card and 6.0:1 as text on the bar.
- **Do** keep a card's face to one line about what is happening, with depth in the `<details>`.
- **Do** use the CLI's exact flag strings so the terminal and the board never disagree.
- **Do** check any new region at 375px before shipping it; that is the width the page is read at.
- **Do** keep the whole system inline in `render.ts`: no framework, no build step, no client
  fetch, no external font. The page must work with nothing but the HTML that arrives.

### Don't:

- **Don't** add a `prefers-color-scheme` branch, a light palette, or a second value per token.
- **Don't** introduce a third meaning colour, or use the alarm for emphasis, branding, a heading
  or a link.
- **Don't** let the rail be the only carrier of a fact; if it ever is, re-measure it against the
  card first.
- **Don't** compute the recency ramp from the current board, or reuse the rail to mean stage,
  priority or anything but recency.
- **Don't** add a shadow of any kind. This system has no shadow vocabulary, and an offset shadow
  belongs to a world this one is not.
- **Don't** add a `border-radius` anywhere.
- **Don't** put a coloured edge anywhere but the card's left side, or add a second one.
- **Don't** mark a suspect card by raising, glowing or outlining it.
- **Don't** add a second animation, add a transition, or let motion start from an invisible state.
- **Don't** add script to the drawer, or to anything else. `<details>` is the mechanism.
- **Don't** re-sort the payload, renumber cards after the section split, or make anything
  interactive beyond the project link and the drawer. The dashboard is read-only by product
  decision.
- **Don't** interpolate a value into the markup without `escapeHtml`. That rule lives as a comment
  at the function.
