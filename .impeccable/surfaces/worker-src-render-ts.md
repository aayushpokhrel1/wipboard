---
version: 1
slug: "worker-src-render-ts"
primary_target: "worker/src/render.ts"
related_targets: []
---

# Surface brief: the dashboard page

**Scope:** `worker/src/render.ts`, the whole served page (board, empty, version mismatch).
**Visitor mode:** Operate.

**Audience and job.** The author, on a phone, in the dark, for about four seconds, away from
the machine. The job confirmed on 2026-11-02: the page must answer **"what have I actually
got"** before a single row is read, render the nineteen projects as **one compact object**
rather than a list, and **look wrong when a third of the board is suspect**. Six of nineteen
carry `!` today; a world whose alarm is a thin edge on an otherwise calm page is designing for
a board that does not exist.

**Constraints.** Read-only, no interaction. Payload order is never re-sorted. The CLI's exact
flag strings. No dependencies, no build step, no client fetch, styles inline. Every
interpolation through `escapeHtml`. WCAG 2.2 AA, and no condition by colour alone. Fields
available per project: `name`, `stage`, `note`, `last_commit`, `stage_set_at`, `flags`,
`has_git`, `branch`, `subject`, `changed`. `stage_set_at` is identical across the whole board
and is therefore not a usable visual axis.

**Unresolved:** none blocking. Build path is code-led by necessity: this harness has no image
generation, so there is no comp round and the ambition lives in FIRST VIEWPORT below.

## Direction contract

**THESIS.** The whole roll printed on one sheet, six frames crossed out in wax. A contact
sheet exists for exactly one purpose, to answer "what have I actually got" from a single
object, and it is honest by construction that it is a print of a moment rather than the
negatives, which is this product's own confession about staleness. It refuses the vertical
stack of status cards and it refuses the andon board, the industrial status panel one step away
from the SaaS dashboard it would be trying not to be.

**OWN-WORLD.** Silver-gelatin paper (`#e8e2d6` light, near-black light-table ground in dark),
frame ink from `#1c1a17` through a five-step silver ramp, one wax ink (`#d8372a`) and nothing
else saturated anywhere. Sprocket rebate between frames carrying frame numbers in small
tabular type. Frames are square-ish cells printed at a density set by recency, not bordered
cards. Grease-pencil wax marks are drawn strokes, slightly off-axis, never a tidy border.
Recognisable with all content removed by the rebate, the density ramp, and the wax.

**STORY.** The visitor sees a worked-over sheet whose overall tone tells them the board's
shape before they read anything, understands which stage the mass sits in from the tally down
the rebate, believes the age because the sheet states its own printing time at exposure-stamp
scale, and takes away which one frame to pick up.

**FIRST VIEWPORT.** A film-edge rebate strip across the top: the wordmark set as an edge code
at small scale, the host beside it. Immediately beneath, the snapshot age printed at
exposure-stamp scale, the largest thing on the page by a wide margin, with its plain-language
note set directly under it and never separated from its tone. To its right, the stage tally
runs down the rebate as six small rows, count and stage, so "where the mass is" is answered in
the first viewport. Then the sheet: nineteen frames, two columns at phone width and three
above, flowing **down each column** so the payload's ranking survives, every frame carrying
its frame number in the rebate, identical furniture inside (name, stage, flags, note), printed
at its recency density, and the six suspect frames struck through in wax.

**FORM.** The Proof Sheet, candidate 4 of seven on the grounded list, assigned by the roll;
seed key `93a141b2`. Raised by three donations from declined challengers: frame density carries
the ranking the type declines to (star atlas), one ink rationed to total commitment
(monochrome marketing canon), identical fixed furniture in every frame (character roster).

**FINISH.** unreviewed and undocumented is unfinished; this build ends with the finish review,
the verdict, DESIGN.md, and every shipping raster carrying its provenance
