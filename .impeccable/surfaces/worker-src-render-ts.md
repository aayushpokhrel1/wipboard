---
version: 2
slug: "worker-src-render-ts"
primary_target: "worker/src/render.ts"
related_targets: []
---

> Rewritten on 2026-11-07 to describe the Dark-Field Instrument, the world that shipped.
> The Proof Sheet contract this replaced is in git history at `1e40185`. The instrument was
> not assigned by the roll: the author read the shipped proof sheet, said it looked like a
> page and not a dashboard, and chose this from three directions rendered against the live
> board.

# Surface brief: the dashboard page

**Scope:** `worker/src/render.ts`, the whole served page (board, project page, empty, version
mismatch, missing project).
**Visitor mode:** Operate.

**Audience and job.** The author, on a phone, in the dark, for about four seconds, away from
the machine, and on the desktop too. The job: the page must answer **"what have I actually
got"** before a single card is read, render the nineteen projects as **one object** rather
than a list, and **look wrong when a third of the board is suspect**. Seven of nineteen carry
`!` today; a world whose alarm is a thin edge on an otherwise calm page is designing for a
board that does not exist.

**Constraints.** No write path. Payload order is never re-sorted. The CLI's exact flag
strings. No dependencies, no build step, no client fetch, styles inline. Every interpolation
through `escapeHtml`. WCAG 2.2 AA, and no condition by colour alone. Fields available per
project: `name`, `stage`, `note`, `last_commit`, `stage_set_at`, `flags`, `has_git`, `branch`,
`subject`, `changed`, plus `next`, `recent` and `uncommitted` from payload v2.
`stage_set_at` is identical across the whole board and is therefore not a usable visual axis.

**Unresolved:** none blocking. The build path is code-led and the comp round happened in code,
rendered against the live board: three directions, the author picked one. That is stronger
provenance than a mock, because every candidate was the real nineteen projects.

## Direction contract

**THESIS.** A lit instrument panel, not a document about repos. It answers "what have I
actually got" from a readout strip before any card is read, and it is honest by construction
that it reports a snapshot rather than the machines, which is this product's own confession
about staleness. It refuses the vertical stack of status cards, and it refuses the document,
which is the failure the Proof Sheet shipped and the author named: a page, not a dashboard.

**OWN-WORLD.** One scheme, a lit face, no light twin, because a colour decided twice is a
colour kept true once. The ground is a decision and not a default: field `#070b10` through
surface `#101a24` to line `#1d2c3a`, a cool blue-black at hue ~212. It is chosen rather than
inherited, and the reason is that it sits between the two things that must never be confused:
a teal accent and a warm alarm. A neutral or warm ground would push the alarm toward the
furniture; this one holds both at arm's length. One accent `#3ad6c4` for machine-read values
and for warm recency, one alarm `#ff5a42` rationed to conditions the data actually holds, and
nothing else saturated anywhere. Machine type (`ui-monospace`) for everything the machine
produced and proportional type for everything a human wrote; that division is the page's whole
typographic idea. Flat fields, hairlines, one filled tag, one 4px rail. No imitation material
and no paper gestures: the grease-pencil stroke died with the sheet and does not come back.
Recognisable with all content removed by the readout strip, the rail and the tile row.

**STORY.** The visitor sees how old the snapshot is and how much of the board is lying before
they read a name, sees where the mass sits from the tally, and takes away which one project to
open.

**FIRST VIEWPORT.** A chrome strip with the wordmark and the host stamped small. Beneath it
the readout: the snapshot age at stamp scale, the largest thing on the page by a wide margin,
its plain-language note directly under it and never separated from its tone, and the suspect
count as a filled tag. Beside it the tally, all six stages with the zeroes printed, as a row
of tiles with the count above its label. Then the cut, then the field: cards in a row-flow
grid, one at phone width and more above, each carrying its number, its stage as a chip, its
name as a visibly underlined link, its meta line, what git says is happening in one line, and
its depth behind a drawer.

**FORM.** The Dark-Field Instrument, chosen from three directions rendered against the live
board on 2026-11-07, not assigned by the roll. Seed key `93a141b2` belongs to its predecessor,
the Proof Sheet, and is recorded here as history rather than as this world's provenance.
Three properties are carried over from that world because they are still load-bearing:
identical furniture in every card, one ink rationed to total commitment, and recency carried
by the rail rather than by the type.

**FINISH.** unreviewed and undocumented is unfinished; this build ends with the finish review,
the verdict, DESIGN.md, and every shipping raster carrying its provenance
