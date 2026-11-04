// The dashboard is server-rendered from the KV blob. No framework, no build
// step, no client-side fetch: the page is read on a phone and must work with
// nothing but the HTML that arrives.
//
// The Worker holds no git knowledge. It renders whatever payload it is given,
// and the payload shape is owned by board_payload in wipboard.py.
//
// The page is a darkroom contact sheet: the whole roll printed on one sheet,
// the frames that are lying to you crossed out in grease pencil. The design
// system is documented in DESIGN.md; the rules a reader of this file must not
// break are comments at the code below.

export const PAYLOAD_VERSION = 2;

export interface Commit {
  at: string | null;
  subject: string;
}

export interface Project {
  name: string;
  stage: string;
  note: string;
  last_commit: string | null;
  stage_set_at: string | null;
  flags: string[];
  has_git: boolean;
  branch: string;
  subject: string;
  changed: number;
  // Version 2. Every one is optional at the type level because a payload
  // written by an older CLI than this Worker is a version the Worker accepts,
  // and a missing field must render as absent rather than as undefined.
  recent?: Commit[];
  uncommitted?: string[];
  next?: { items: string[]; source: string };
}

export interface Board {
  version: number;
  generated_at: string;
  host: string;
  projects: Project[];
}

const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;

// The fixed stage vocabulary, in cycle order. The tally is printed in this
// order rather than in the order the stages happen to appear in the payload,
// because the tally's whole job is showing where the mass sits: a column of
// counts you can compare only reads if the rows never move.
const STAGE_CYCLE = ["idea", "spec", "building", "testing", "shipped", "parked"];

// Every interpolated value goes through this, with no exceptions. A project
// name and a note are user text read in a browser; one unescaped value is an
// injected script.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Naive UTC ISO strings, matching the store. A trailing Z is tolerated so a
// hand-written payload does not silently read as local time.
function parseStamp(raw: string | null): number | null {
  if (!raw) return null;
  const text = /[zZ]|[+-]\d\d:?\d\d$/.test(raw) ? raw : `${raw}Z`;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : null;
}

// Largest whole unit, matching human_age in wipboard.py so the two views never
// disagree about how old something is. Clamped at zero: clock skew and a VM
// resuming from sleep must read "just now", never "-3m".
function humanAge(then: number | null, now: number): string {
  if (then === null) return "-";
  const seconds = Math.max(0, (now - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days <= 365) return `${days}d`;
  return `${Math.floor(days / 365)}y`;
}

// A frame's density. This is the load-bearing visual decision on the page: the
// ink a frame prints at is how long since its last commit, so the sheet's own
// tone answers "what have I actually got" before a single name is read.
//
// Density means distance from the paper, in both colour schemes. A fresh frame
// nearly vanishes into the sheet; a stale one is dense and is what you see
// first. The six steps are a fixed ramp, never a gradient computed from the
// board, or the same project would print differently on a different day.
//
// Contrast is not on the ramp. There is exactly one text colour inside a
// frame, full ink, and the six grounds all clear WCAG 2.2 AA against it;
// hierarchy inside a frame is carried by size, weight and tracking instead.
// A muted grey tier was tried here on 2026-11-02 and removed the same day: a
// second text colour has to clear the whole ramp, and a grey that does is no
// longer muted, so it bought nothing and failed AA at the dense end in both
// schemes. The silver tier survives only outside the frames, where the ground
// is always the paper. Do not reintroduce a muted colour inside a frame
// without re-checking it against d5.
function density(lastCommit: number | null, now: number): number {
  if (lastCommit === null) return -1; // never exposed: no git, or no commits
  const days = Math.max(0, now - lastCommit) / DAY_MS;
  if (days < 1) return 0;
  if (days < 3) return 1;
  if (days < 7) return 2;
  if (days < 30) return 3;
  if (days < 90) return 4;
  return 5;
}

// The snapshot's age is the most important element on the page: a dashboard
// that silently shows yesterday is the failure this project exists to prevent.
//
// The tone and the words are produced together and are never rendered apart.
// The tone is one of three ink weights on a single ink, not three hues: silver
// for fresh, full ink for getting old, wax for stale. The words are what
// actually carries the condition.
function snapshotAge(generatedAt: number | null, now: number): {
  text: string;
  tone: string;
  note: string;
} {
  if (generatedAt === null) {
    return { text: "unknown", tone: "stale", note: "The snapshot has no readable timestamp." };
  }
  const elapsed = Math.max(0, now - generatedAt);
  // "just now ago" is not a thing anyone says.
  const age = humanAge(generatedAt, now);
  const text = age === "just now" ? age : `${age} ago`;
  if (elapsed > DAY_MS) {
    // This said "This machine has probably been off" until 2026-11-02. It had
    // fired twice by then and been wrong both times: the machine was fine and
    // nothing was pushing it. Say what is true, which is only that the sheet
    // below is at least this old.
    return {
      text,
      tone: "stale",
      note: "Nothing has been pushed since. Every frame below is at least this old.",
    };
  }
  if (elapsed > HOUR_MS) {
    return { text, tone: "warn", note: "The snapshot is getting old." };
  }
  return { text, tone: "fresh", note: "" };
}

function stageCounts(projects: Project[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const project of projects) {
    counts.set(project.stage, (counts.get(project.stage) ?? 0) + 1);
  }
  // Cycle order first, then anything the CLI's vocabulary has grown since this
  // Worker was deployed, so a new stage appears rather than disappearing.
  const ordered: Array<[string, number]> = [];
  for (const stage of STAGE_CYCLE) {
    const count = counts.get(stage);
    if (count !== undefined) ordered.push([stage, count]);
  }
  for (const [stage, count] of counts) {
    if (!STAGE_CYCLE.includes(stage)) ordered.push([stage, count]);
  }
  return ordered;
}

// A project's own page. The name is encoded whole rather than slugged: a slug
// needs a collision rule, and two projects called "api" and "API" would need
// one. encodeURIComponent round-trips to the exact name, so the lookup is an
// equality check and there is nothing to collide.
//
// Still escaped for the attribute: encodeURIComponent leaves ' and & alone,
// and this is interpolated into HTML, not just into a URL.
export function projectHref(name: string): string {
  return escapeHtml(`/p/${encodeURIComponent(name)}`);
}

// Is this a project you are currently inside? Derived, never hand-set, and
// deliberately narrow: this decides what leads the page, and a section holding
// half the board leads with nothing. Uncommitted work and unpushed commits are
// the strongest signals, because both mean you stopped mid-thing; a commit in
// the last three days is the weaker one that catches a project you left clean.
function inFlight(project: Project, now: number): boolean {
  if (project.changed > 0) return true;
  if (project.flags.some((flag) => flag.startsWith("^"))) return true;
  const last = parseStamp(project.last_commit);
  return last !== null && now - last < 3 * DAY_MS;
}

// One frame of the sheet. The furniture is identical in every frame and in the
// same positions, which is what makes these read across as one object instead
// of down as a list: number and stage in the frame's head, name, then the age
// line. The note and the git line print in the rebate below the frame, the way
// a caption is written in a proof sheet's margin, so an absent note never
// changes the frame's own shape.
//
// `lead` is the in-flight section, where the frame also carries what the next
// work is and the recent commit sequence. The compact frame is the same frame
// with those two blocks absent, so both sections read as one sheet.
function renderFrame(project: Project, index: number, now: number, lead = false): string {
  const suspect = project.flags.includes("!");
  const lastCommit = parseStamp(project.last_commit);
  const step = density(lastCommit, now);
  const touched = humanAge(lastCommit, now);
  const inStage = humanAge(parseStamp(project.stage_set_at), now);
  const number = String(index + 1).padStart(2, "0");
  const flags = project.flags
    .map((flag) => `<span class="flag">${escapeHtml(flag)}</span>`)
    .join(" ");
  const caption = project.note
    ? `<p class="note">${escapeHtml(project.note)}</p>`
    : "";
  const nextItems = project.next?.items ?? [];
  // The depth only prints in the lead section. Nineteen of these at once is
  // the wall of paragraphs this redesign exists to avoid.
  const next =
    lead && nextItems.length
      ? `<div class="next">
        <p class="next-head">next</p>
        <ul>${nextItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </div>`
      : "";
  const commits = lead ? (project.recent ?? []).slice(0, 4) : [];
  const log = commits.length
    ? `<ol class="log">${commits
        .map(
          (commit) =>
            `<li><span class="when">${escapeHtml(humanAge(parseStamp(commit.at), now))}</span>
            <span class="what">${escapeHtml(commit.subject)}</span></li>`,
        )
        .join("")}</ol>`
    : "";
  // What the phone's capped depth is not showing. Stated rather than silent:
  // a block that quietly drops two of its four items is indistinguishable from
  // a project that only had two. Hidden above 48rem, where nothing is capped.
  const hidden = lead
    ? [
        nextItems.length > 2 ? `+${nextItems.length - 2} next` : "",
        commits.length > 2 ? `+${commits.length - 2} recent` : "",
      ].filter(Boolean)
    : [];
  const more = hidden.length ? `<p class="more">${escapeHtml(hidden.join(" · "))}</p>` : "";
  const git = project.has_git
    ? `<span class="branch">${escapeHtml(project.branch || "?")}</span>
        <span class="subject">${escapeHtml(project.subject)}</span>
        <span class="changed">${escapeHtml(String(project.changed))} changed</span>`
    : `<span class="subject">no git</span>`;
  // --i staggers the develop animation. It is set here rather than with an
  // nth-child rule because the board's length is data, not a constant.
  return `<li class="cell${lead ? " lead" : ""}" style="--i:${index}">
      <div class="frame d${step === -1 ? "x" : step}${suspect ? " suspect" : ""}">
        <div class="head">
          <span class="num">${number}</span>
          <span class="stage">${escapeHtml(project.stage)}</span>
        </div>
        <p class="name"><a href="${projectHref(project.name)}">${escapeHtml(project.name)}</a></p>
        <p class="meta">
          <span class="touched">${escapeHtml(touched)}</span>
          <span class="in-stage">${escapeHtml(inStage)} in stage</span>
          ${flags}
        </p>
        ${next}
      </div>
      <div class="caption">
        ${caption}
        ${log}
        ${more}
        <p class="git">${git}</p>
      </div>
    </li>`;
}

const STYLE = `
:root {
  color-scheme: light dark;
  /* Unexposed paper. The grid gap is the rebate, so the page itself shows
     through between the frames and no element has to draw one. */
  --paper: #eef1f4;
  --ink: #11151a;
  --silver: #5d6671;
  /* The one saturated ink on the page. Grease pencil, and nothing else.
     Anything here that is not a condition the data actually holds is grey.

     This is darker than a grease pencil really is, and it is measured rather
     than chosen: the wax strike is a non-text mark and needs 3:1 against the
     ground it is drawn on, which is any step of the ramp. #c62f22 was used
     until 2026-11-02 and reached only 2.49:1 on d5, so the suspect mark was
     at its weakest on the stalest frames, which are the likeliest to be
     suspect. This clears 3.2:1 on d5 and 6.3:1 on the paper. */
  --wax: #a8231a;
  --rebate: #ccd3da;
  /* The density ramp: six steps away from the paper, fresh to stale.
     The light scheme's dense end stops at a mid grey rather than going as dark
     as the dark scheme's goes light, so there is headroom under the wax and
     under the single text ink at the dense end. Re-check both if d5 moves. */
  --d0: #e4e8ed;
  --d1: #dae0e7;
  --d2: #cdd5de;
  --d3: #bfc8d3;
  --d4: #b2bcc8;
  --d5: #a6b0bb;
  --develop: 520ms;
}
* { box-sizing: border-box; }
::selection { background: var(--wax); color: var(--paper); }
html {
  scrollbar-color: var(--silver) var(--paper);
  -webkit-text-size-adjust: 100%;
}
body {
  margin: 0;
  padding: 1rem .9rem 2.5rem;
  font: 16px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
  font-variant-numeric: tabular-nums;
  background: var(--paper);
  color: var(--ink);
}

/* The sheet's own margin: an edge strip of machine type, the way a print
   carries its stock and its frame codes along the rebate. Monospace here is
   measurement, not decoration: every value in this strip is machine-stamped. */
.edge {
  display: flex;
  flex-wrap: wrap;
  gap: .5rem .9rem;
  align-items: baseline;
  padding-bottom: .5rem;
  border-bottom: 1px solid var(--rebate);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .7rem;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--silver);
}
.edge h1 { font: inherit; margin: 0; color: var(--ink); }
.edge .host { margin-left: auto; }

.stamp { display: flex; flex-wrap: wrap; gap: 0 1.6rem; margin: .9rem 0 0; }
.aged { flex: 1 1 11rem; margin: 0; }
/* The exposure stamp. The largest thing on the page by a wide margin, and it
   must stay that way: a reader who takes one fact away must take this one. */
.age {
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: clamp(2.3rem, 13vw, 3.4rem);
  font-weight: 700;
  line-height: .95;
  letter-spacing: -.035em;
  color: var(--silver);
}
.age.warn { color: var(--ink); }
.age.stale { color: var(--wax); }
.age-note {
  margin: .5rem 0 0;
  max-width: 34ch;
  font-size: .88rem;
  color: var(--silver);
}
.age-note.stale { color: var(--wax); }
/* The suspect count. Wax, and loud enough to be read from the same glance as
   the stamp, but an order of magnitude below it: the snapshot's age still
   outranks everything on this page. The word carries the condition; the colour
   only agrees with it. */
.alarm {
  margin: .55rem 0 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: .02em;
  color: var(--wax);
}

/* The tally down the rebate. A column of counts in one place, so where the
   mass sits is answered in the first viewport without reading a frame. */
.tally {
  flex: 0 0 auto;
  margin: 1rem 0 0;
  padding: 0;
  list-style: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .72rem;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--silver);
}
.tally li { display: flex; gap: .6rem; justify-content: space-between; padding: .1rem 0; }
.tally b { color: var(--ink); font-weight: 700; }

/* Column flow, not row flow. The payload arrives sorted, stalest first, and
   that order is the thing telling you which project to pick up; a row-flow
   grid would put frame 2 beside frame 1 and turn the ranking into a zigzag.
   CSS multicolumn reads top to bottom down each column, so the ranking
   survives at every width with no committed row count. */
/* The sheet is cut into two, and the cut is the page's main hierarchy: what
   you are inside leads, everything else follows. The label sits in the rebate
   as machine type, not as a title, because it is a caption on a sheet and not
   a heading on a document.

   The label was silver at .7rem over a rebate rule until 2026-11-02, which is
   exactly the edge strip's own treatment, so the second section read as the
   sheet continuing rather than as a second sheet. It is the same machine type,
   at full ink over an ink rule, with air above it that no other rule has. */
.section {
  display: flex;
  align-items: baseline;
  gap: .6rem;
  margin: 2.5rem 0 .6rem;
  padding-bottom: .35rem;
  border-bottom: 1px solid var(--ink);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .78rem;
  font-weight: 700;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: var(--ink);
}
.section span { margin-left: auto; color: var(--silver); font-weight: 400; }

.sheet {
  margin: 0;
  padding: 0;
  list-style: none;
  column-gap: .5rem;
}
/* The lead section's frames carry the depth, so they are wider and fewer to a
   row. The compact section below runs at the sheet's full density. */
.sheet-lead { column-gap: .6rem; }
.next { margin: .45rem 0 0; }
.next-head {
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .62rem;
  letter-spacing: .18em;
  text-transform: uppercase;
  opacity: .75;
}
/* The list marker is drawn, not inherited. A page that themes its selection,
   its scrollbar, its focus ring and its underlines should not leave its one
   list marker to the browser, which rendered these as hollow rings inside the
   sheet (a nested ul) and as filled discs on the project page (a top-level
   one). A small hollow ring is also uncomfortably close to the wax ring the
   author rejected. A dash, hung outside the text, in both places. */
.next ul, .next-full { list-style: none; margin: .15rem 0 0; padding-left: 0; }
.next li, .next-full li { padding-left: .95rem; text-indent: -.95rem; }
.next li::before, .next-full li::before { content: "-\\00a0"; color: var(--silver); }
.next li { font-size: .82rem; line-height: 1.3; margin-top: .12rem; overflow-wrap: anywhere; }
/* The recent commit sequence. One subject tells you nothing; four read in
   order tell you whether this is being built, documented or nursed. */
.log { margin: .3rem 0 0; padding: 0; list-style: none; }
.log li {
  display: flex;
  gap: .5rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .66rem;
  line-height: 1.45;
  color: var(--silver);
}
.log .when { flex: 0 0 2.6rem; text-align: right; }
.log .what { overflow-wrap: anywhere; }
/* The phone caps a lead frame's depth at two of each. Six lead frames at four
   next items and four commits put roughly 3000px between the exposure stamp
   and "the rest", which is the vertical stack of status cards this page was
   redesigned to stop being, on the one device it is most often read on. The
   cap is stated by the .more line, and the full depth is one tap away on the
   project's own page. Nothing is capped at 48rem and above. */
.sheet-lead .next li:nth-child(n+3),
.sheet-lead .log li:nth-child(n+3) { display: none; }
.more {
  margin: .3rem 0 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .62rem;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--silver);
}
.cell { break-inside: avoid; margin-bottom: .5rem; }
.frame {
  position: relative;
  padding: .45rem .55rem .5rem;
  background: var(--d0);
}
.frame.d0 { background: var(--d0); }
.frame.d1 { background: var(--d1); }
.frame.d2 { background: var(--d2); }
.frame.d3 { background: var(--d3); }
.frame.d4 { background: var(--d4); }
.frame.d5 { background: var(--d5); }
/* A frame that was never exposed: no git, or a repo with no commits. It is
   paper with a rebate outline rather than a density, because its age is not
   late, it is unknown, and printing it as stale would be a guess. */
.frame.dx { background: transparent; box-shadow: inset 0 0 0 1px var(--rebate); }

.head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: .5rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .68rem;
  letter-spacing: .1em;
}
.num { font-weight: 700; }
.stage { text-transform: uppercase; }
.name {
  margin: .25rem 0 0;
  font-size: .95rem;
  font-weight: 650;
  line-height: 1.2;
  overflow-wrap: anywhere;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: .1rem .5rem;
  margin: .2rem 0 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .68rem;
  letter-spacing: .02em;
}
/* Flags are ink at full weight, not wax. Wax text inside a frame has to clear
   contrast against all six density steps and does not at the dense end, and
   the alarm is already carried by the ring, the struck number and the word
   itself. The wax stays where its ground is known: the ring, the strike, and
   the stale stamp on the paper. */
.flag { font-weight: 700; }

/* The grease pencil. A suspect frame is one whose stage may be a lie, so the
   mark goes through the stage word and says exactly that. Three channels, only
   one of which is colour: the struck stage, the struck frame number, and the
   literal "!" among the flags.

   This was a drawn wax ring around the whole frame until 2026-11-02. It was
   unmissable and it was too much: six rings on nineteen frames read as damage
   rather than as a flag, and the ring said "something is wrong here" where the
   strike says the specific thing that is wrong. Do not bring the ring back
   without re-reading what the "!" actually means.

   The stroke is drawn rather than a browser line-through: a tidy machine rule
   through a word is not a grease pencil, and the whole point of this world is
   that the marks on it were made by hand. One pseudo-element, two degrees off
   axis, overhanging the word at both ends.

   The number is struck only on the sheet. The project page reuses .num for the
   branch name, where a wax line through "main" reads as "this branch is gone"
   rather than as "this stage may be a lie". */
.frame.suspect .stage,
.sheet .frame.suspect .num {
  position: relative;
}
.frame.suspect .stage::after,
.sheet .frame.suspect .num::after {
  content: "";
  position: absolute;
  left: -.18em;
  right: -.18em;
  top: 46%;
  height: 2px;
  background: var(--wax);
  transform: rotate(-1.8deg);
}

/* Links. The page was read-only and link-free until 2026-11-02; a frame's name
   now opens that project. Underlines are offset rather than removed, and the
   focus ring is wax so it is visible on every density step. */
a { color: inherit; text-underline-offset: .18em; text-decoration-thickness: 1px; }
a:hover { text-decoration-thickness: 2px; }
a:focus-visible { outline: 2px solid var(--wax); outline-offset: 2px; }
.name a { text-decoration-color: var(--rebate); }

/* A project's own page. One frame at sheet width, then the blocks the board
   had no room for. */
.back { margin: 1rem 0 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .7rem; letter-spacing: .14em; text-transform: uppercase; }
.single { max-width: 46rem; margin: .6rem 0 0; }
.single .frame { padding: .7rem .8rem .75rem; }
.single .name { font-size: 1.4rem; }
.single > .note { margin: .8rem 0 0; font-size: 1rem; max-width: 42rem; }
.block { margin: 1.4rem 0 0; }
.block h2 {
  margin: 0 0 .4rem;
  padding-bottom: .3rem;
  border-bottom: 1px solid var(--rebate);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .7rem;
  font-weight: 400;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: var(--silver);
}
.next-full { margin: 0; }
.next-full li { margin-top: .3rem; line-height: 1.4; overflow-wrap: anywhere; }
.paths { list-style: none; margin: 0; padding-left: 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .8rem; }
.paths li { margin-top: .15rem; padding-left: .95rem; text-indent: -.95rem; overflow-wrap: anywhere; }
.paths li::before { content: "-\\00a0"; color: var(--silver); }
.provenance, .absent { margin: .45rem 0 0; font-size: .8rem; color: var(--silver); }
.single .log { font-size: .78rem; }
.single .log li { font-size: .78rem; }
.single .log .when { flex-basis: 3.2rem; }

.caption { padding: .25rem .1rem 0 .55rem; }
.note { margin: 0; font-size: .82rem; line-height: 1.35; overflow-wrap: anywhere; }
.git {
  display: flex;
  flex-wrap: wrap;
  gap: 0 .5rem;
  margin: .15rem 0 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .68rem;
  color: var(--silver);
}
.branch { color: var(--ink); }
.subject { overflow-wrap: anywhere; }

/* Nothing pushed, or a payload this Worker cannot read: one unexposed frame at
   sheet width, so the page's shape never changes between its states. */
.empty {
  margin: 1.25rem 0 0;
  padding: 1rem;
  max-width: 44ch;
  box-shadow: inset 0 0 0 1px var(--rebate);
}
.empty p { margin: 0 0 .6rem; }
.empty p:last-child { margin-bottom: 0; }
code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .85em;
  background: var(--rebate);
  padding: .08rem .3rem;
}

/* The sheet comes up in the developer: the frames rise to their density once,
   staggered down the sheet, from an already-visible default. Only the ground
   moves, so every word on the page is readable from the first frame. */
@media (prefers-reduced-motion: no-preference) {
  .frame { animation: develop var(--develop) cubic-bezier(.16, 1, .3, 1) backwards; animation-delay: calc(var(--i) * 22ms); }
  @keyframes develop { from { background-color: var(--paper); } }
}

/* This page is read on a phone, usually in the dark. The light scheme is a
   print on the bench; the dark scheme is the same sheet on a light table,
   where the dense frames are the ones that glow. Density still means distance
   from the ground, so the sheet's shape reads identically in both. */
@media (prefers-color-scheme: dark) {
  :root {
    --paper: #0b0d10;
    --ink: #e8edf2;
    --silver: #8a95a3;
    --wax: #ff6250;
    --rebate: #2a313b;
    --d0: #11141a;
    --d1: #171c24;
    --d2: #1f252f;
    --d3: #28303c;
    --d4: #323b49;
    --d5: #3d4757;
  }
}

/* Two columns on every phone. One column of nineteen frames is the scrolling
   list this page was redesigned to stop being, and 22rem is below the
   narrowest phone still shipping. */
@media (min-width: 22rem) { .sheet { columns: 2; } .sheet-lead { columns: 1; } }
@media (min-width: 48rem) {
  body { padding: 1.5rem 1.5rem 3rem; }
  .sheet { columns: 3; column-gap: .65rem; }
  .sheet-lead { columns: 2; }
  .cell { margin-bottom: .65rem; }
  .sheet-lead .next li:nth-child(n+3) { display: list-item; }
  .sheet-lead .log li:nth-child(n+3) { display: flex; }
  .more { display: none; }
}
@media (min-width: 70rem) {
  body { max-width: 86rem; margin: 0 auto; }
  .sheet { columns: 4; }
  .sheet-lead { columns: 3; }
}
`;

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body>
${body}
</body>
</html>`;
}

// The sheet's margin strip plus the exposure stamp. Shared by every state of
// the page so a reader always knows how old what they are looking at is, even
// when there is nothing to look at.
function sheetHead(
  age: { text: string; tone: string; note: string },
  host: string,
  tally: string,
  alarm = "",
): string {
  return `<header>
  <div class="edge">
    <h1>wipboard</h1>
    <span>contact sheet</span>
    ${host ? `<span class="host">${escapeHtml(host)}</span>` : ""}
  </div>
  <div class="stamp">
    <div class="aged">
      <p class="age ${age.tone}">${escapeHtml(age.text)}</p>
      ${age.note ? `<p class="age-note ${age.tone}">${escapeHtml(age.note)}</p>` : ""}
      ${alarm}
    </div>
    ${tally}
  </div>
</header>`;
}

export function renderBoard(payload: Board, now: Date): string {
  const nowMs = now.getTime();
  const generatedAt = parseStamp(payload.generated_at);
  const age = snapshotAge(generatedAt, nowMs);
  const counts = stageCounts(payload.projects)
    .map(([stage, count]) => `<li><span>${escapeHtml(stage)}</span> <b>${escapeHtml(String(count))}</b></li>`)
    .join("");
  const tally = counts ? `<ul class="tally">${counts}</ul>` : "";
  // How many frames are lying to you, counted once at the top. The failure the
  // author named for this page is one that looks calm when a third of the board
  // is suspect, and after the wax ring was dropped that fact was carried only
  // by small strikes scattered down the sheet. The number is not a second
  // channel for the flag: it is the one place the sheet's own shape is stated
  // rather than seen. It is not WORKING ON, which counts something else.
  const suspects = payload.projects.filter((project) => project.flags.includes("!")).length;
  const alarm = suspects
    ? `<p class="alarm">${escapeHtml(String(suspects))} of ${escapeHtml(
        String(payload.projects.length),
      )} suspect</p>`
    : "";
  // Payload order is _sort_key order from the CLI. Re-sorting here would make
  // the two views disagree about what matters, which is worse than one view.
  //
  // So the page partitions rather than sorts. Both sections keep payload order
  // internally and the frame numbers are assigned before the split, so a frame
  // number still means the same rank it does in the terminal. Moving a project
  // between sections never changes its number.
  const numbered = payload.projects.map((project, index) => ({ project, index }));
  const lead = numbered.filter(({ project }) => inFlight(project, nowMs));
  const rest = numbered.filter(({ project }) => !inFlight(project, nowMs));
  const section = (
    entries: typeof numbered,
    label: string,
    isLead: boolean,
  ): string =>
    entries.length
      ? `<h2 class="section">${escapeHtml(label)} <span>${entries.length}</span></h2>
<ol class="sheet${isLead ? " sheet-lead" : ""}">
${entries.map(({ project, index }) => renderFrame(project, index, nowMs, isLead)).join("\n")}
</ol>`
      : "";
  const body = `${sheetHead(age, payload.host, tally, alarm)}
${section(lead, "working on", true)}
${section(rest, "the rest", false)}`;
  return page("wipboard", body);
}

// One project in full. Everything the payload holds about it, with nothing
// capped for space the way the board caps things, because this page exists
// precisely for the reader who wanted more than the frame had room for.
//
// The exposure stamp leads here too. A project page read on its own is just as
// capable of silently showing yesterday as the board is, so the age outranks
// the project's name on this surface as well.
export function renderProject(payload: Board, project: Project, now: Date): string {
  const nowMs = now.getTime();
  const age = snapshotAge(parseStamp(payload.generated_at), nowMs);
  const suspect = project.flags.includes("!");
  const step = density(parseStamp(project.last_commit), nowMs);
  const flags = project.flags
    .map((flag) => `<span class="flag">${escapeHtml(flag)}</span>`)
    .join(" ");
  const nextItems = project.next?.items ?? [];
  const sourceLabel: Record<string, string> = {
    handover: "read from HANDOVER.md",
    todo: "read from the TODO file",
    plan: "read from the newest plan",
  };
  const next = nextItems.length
    ? `<section class="block">
    <h2>next</h2>
    <ul class="next-full">${nextItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    <p class="provenance">${escapeHtml(sourceLabel[project.next?.source ?? ""] ?? "")}</p>
  </section>`
    : `<section class="block">
    <h2>next</h2>
    <p class="absent">This project has no HANDOVER.md, TODO or plan for the board to read.</p>
  </section>`;
  const commits = project.recent ?? [];
  const log = commits.length
    ? `<section class="block">
    <h2>recent</h2>
    <ol class="log">${commits
      .map(
        (commit) =>
          `<li><span class="when">${escapeHtml(humanAge(parseStamp(commit.at), nowMs))}</span>
          <span class="what">${escapeHtml(commit.subject)}</span></li>`,
      )
      .join("")}</ol>
  </section>`
    : "";
  const paths = project.uncommitted ?? [];
  const uncommitted = paths.length
    ? `<section class="block">
    <h2>uncommitted</h2>
    <ul class="paths">${paths.map((path) => `<li>${escapeHtml(path)}</li>`).join("")}</ul>
    ${
      project.changed > paths.length
        ? `<p class="provenance">and ${escapeHtml(String(project.changed - paths.length))} more</p>`
        : ""
    }
  </section>`
    : "";
  const body = `${sheetHead(age, payload.host, "")}
<p class="back"><a href="/">back to the sheet</a></p>
<article class="single">
  <div class="frame d${step === -1 ? "x" : step}${suspect ? " suspect" : ""}">
    <div class="head">
      <span class="num">${escapeHtml(project.has_git ? project.branch || "?" : "no git")}</span>
      <span class="stage">${escapeHtml(project.stage)}</span>
    </div>
    <p class="name">${escapeHtml(project.name)}</p>
    <p class="meta">
      <span class="touched">${escapeHtml(humanAge(parseStamp(project.last_commit), nowMs))}</span>
      <span class="in-stage">${escapeHtml(humanAge(parseStamp(project.stage_set_at), nowMs))} in stage</span>
      ${flags}
    </p>
  </div>
  ${project.note ? `<p class="note">${escapeHtml(project.note)}</p>` : ""}
  ${next}
  ${log}
  ${uncommitted}
</article>`;
  return page(`wipboard: ${project.name}`, body);
}

// A name in the URL that is not on the board. It is a 404 and it says which
// name it looked for, because the usual cause is a project renamed in the CLI
// since the link was opened.
export function renderProjectMissing(name: string): string {
  const body = `${sheetHead({ text: "No such frame", tone: "stale", note: "" }, "", "")}
<div class="empty">
  <p>Nothing on this board is called ${escapeHtml(name)}.</p>
  <p>It may have been renamed or dropped since this page was last pushed.</p>
  <p><a href="/">Back to the sheet</a></p>
</div>`;
  return page("wipboard: no such frame", body);
}

// An unknown version means the CLI was upgraded and the Worker was not. Say so
// rather than throwing or rendering half a board.
export function renderVersionMismatch(version: unknown): string {
  const age = { text: "Worker out of date", tone: "stale", note: "This Worker is older than the CLI that pushed the board." };
  const body = `${sheetHead(age, "", "")}
<div class="empty">
  <p>The stored payload has version ${escapeHtml(String(version))}, and this Worker only
  understands version ${escapeHtml(String(PAYLOAD_VERSION))}.</p>
  <p>Redeploy the Worker with <code>npx wrangler deploy</code> from <code>worker/</code>.</p>
</div>`;
  return page("wipboard: redeploy the Worker", body);
}

export function renderEmpty(): string {
  const age = { text: "No board yet", tone: "fresh", note: "" };
  const body = `${sheetHead(age, "", "")}
<div class="empty">
  <p>Nothing has been pushed to this dashboard.</p>
  <p>Run <code>wipboard push</code> on the machine that holds the repos.</p>
</div>`;
  return page("wipboard: no board yet", body);
}
