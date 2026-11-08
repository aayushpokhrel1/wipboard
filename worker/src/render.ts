// The dashboard is server-rendered from the KV blob. No framework, no build
// step, no client-side fetch: the page is read on a phone and must work with
// nothing but the HTML that arrives.
//
// The Worker holds no git knowledge. It renders whatever payload it is given,
// and the payload shape is owned by board_payload in wipboard.py.
//
// The page is a lit instrument panel: a readout strip that answers how old
// this is, how much of it is lying and where the mass sits, then a field of
// cards. It was a darkroom contact sheet until 2026-11-07, printed on paper
// with the suspect frames struck through in grease pencil; that world is gone
// and so are its gestures. The design system is documented in DESIGN.md; the
// rules a reader of this file must not break are comments at the code below.

// The version this Worker prefers, and the one it names when it refuses a
// payload it cannot read.
export const PAYLOAD_VERSION = 3;

// Every version this Worker can still render. The CLI pushes unattended every
// 15 minutes, so a Worker that accepted only the version it prefers would turn
// every scheduled push into a 400 in a log nobody reads the moment the two
// sides were deployed in the wrong order. Accepting both is what lets this
// Worker ship before the CLI that sends version 3.
export const ACCEPTED_PAYLOAD_VERSIONS = [2, 3];

export interface Commit {
  at: string | null;
  subject: string;
}

// One recorded stage change. `inferred` marks the segment the CLI derives from
// the repository's first commit rather than from a `wipboard set`: it is a
// guess about the past and it must never be read as a record.
export interface StageEntry {
  stage: string;
  at: string;          // ISO
  inferred?: boolean;  // true = derived from the first commit, not a recorded change
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
  // Version 3. Optional for the same reason as the block above: a version 2
  // payload is still a version this Worker accepts, and a missing field must
  // render as absent rather than as undefined.
  weeks?: number[];           // commit counts per 7-day bucket, OLDEST FIRST
  week_start?: string | null; // ISO timestamp of the oldest bucket's start
  first_commit?: string | null;
  stage_history?: StageEntry[];
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

// How long since a card's last commit, as one of six steps. The step picks
// the card's rail colour and nothing else; see --r0 through --r5 for which
// direction the ramp runs and why.
//
// The six steps are a fixed ramp, never a gradient computed from the board,
// or the same project would print differently on a different day.
//
// This returned a ground tone for the whole frame until 2026-11-07, and the
// comment here described the opposite rule to the one the code now implements:
// dense-means-stale, from a world where a frame was ink on paper. The rail
// replaced it and runs the other way. Two load-bearing comments disagreeing
// about recency is worse than either rule being wrong, so there is one left.
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
      note: "Nothing has been pushed since. Every card below is at least this old.",
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
  //
  // Every stage in the vocabulary prints, including the ones at zero. An
  // instrument shows a zeroed channel at zero; dropping it makes "no projects
  // in testing" look like "testing is not a stage here", and it changes the
  // number of tiles and their width between loads, which is exactly what the
  // fixed cycle order above exists to prevent.
  const ordered: Array<[string, number]> = [];
  for (const stage of STAGE_CYCLE) {
    ordered.push([stage, counts.get(stage) ?? 0]);
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

// One card of the board. The furniture is identical in every card and in the
// same positions, which is what makes these read across as one instrument
// instead of down as a list: number and stage chip in the head, name, then the
// age line, then what git says is happening in one line. An absent note never
// changes the card's own shape.
//
// `lead` is the in-flight section, where the card also carries what the next
// work is and the recent commit sequence, behind the drawer. The compact card
// is the same card with those two blocks absent, so both sections read as one
// board.
function renderFrame(project: Project, index: number, now: number, lead = false): string {
  const suspect = project.flags.includes("!");
  const lastCommit = parseStamp(project.last_commit);
  const step = density(lastCommit, now);
  const touched = humanAge(lastCommit, now);
  const inStage = humanAge(parseStamp(project.stage_set_at), now);
  const number = String(index + 1).padStart(2, "0");
  const flags = project.flags
    // Only "!" is the suspect flag. "dirty" and "^N" are ordinary states that
    // happen to sit on a suspect card, and painting them in the alarm too put
    // about twenty-five hot chips on a 7-of-19 board: the ink stopped being
    // rationed, and the "!" stopped being findable among four identical red
    // chips, which is the channel that is supposed to carry this without
    // colour.
    .map(
      (flag) =>
        `<span class="flag${flag === "!" ? " bang" : ""}">${escapeHtml(flag)}</span>`,
    )
    .join(" ");
  const caption = project.note
    ? `<p class="note">${escapeHtml(project.note)}</p>`
    : "";
  const nextItems = project.next?.items ?? [];
  // The depth only prints in the lead section. Nineteen cards with four next
  // items and four commits each is the wall of paragraphs this page exists to
  // avoid.
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
  // The drawer, and the reason every card can afford to be short. What is
  // happening now (the branch, the subject, the changed count, the note) is
  // always on the face of the card; the depth behind it is one press away.
  //
  // The summary counts what is inside rather than teasing the first line of
  // it, because a count is the one summary that cannot be misread as the whole
  // thing. This replaced a rule that hid items under 48rem and printed
  // "+2 next": that told the reader what they were missing without offering
  // it, and the full depth was only reachable on another page.
  const counts = [
    nextItems.length ? `${nextItems.length} next` : "",
    commits.length ? `${commits.length} recent` : "",
  ].filter(Boolean);
  const drawer = counts.length
    ? `<details class="drawer">
        <summary>${escapeHtml(counts.join(" \u00b7 "))}</summary>
        ${next}
        ${log}
      </details>`
    : "";
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
          <span class="touched">commit ${escapeHtml(touched)}</span>
          <span class="in-stage">${escapeHtml(inStage)} in stage</span>
          ${flags}
        </p>
      </div>
      <div class="caption">
        ${caption}
        <p class="git">${git}</p>
        ${drawer}
      </div>
    </li>`;
}

const STYLE = `
:root {
  /* One scheme, and it is this one. The proof sheet carried a light palette
     and a dark twin, which meant every colour decision had to be made and
     re-checked twice; that is exactly how --wax was silently lost in the light
     scheme on 2026-11-04 while the dark scheme looked perfect. An instrument
     has a lit face. There is no second palette to keep true. */
  color-scheme: dark;
  --field: #070b10;
  --bar: #0c131b;
  --surface: #101a24;
  --line: #1d2c3a;
  --text: #e8f0f6;
  --dim: #8396a6;
  /* The instrument's own colour. Carries recency on the rail, and marks the
     machine-read values inside a card (branch, commit age). 9.7:1 on a card. */
  --accent: #3ad6c4;
  /* And the alarm. Nothing that is not a condition the data actually holds is
     ever drawn in this. 5.7:1 on a card as a mark, 6.0:1 as text on the bar,
     and far enough from the accent in hue that the two never read as one
     scale. */
  --hot: #ff5a42;
  --on-hot: #120503;
  --chip: #1b2a38;
  --chip-ink: #a9bccb;
  /* Recency, as the rail down the left edge of every card: lit when the work
     is warm, almost out when it is cold.

     That direction is a decision, not an accident, and it was challenged on
     2026-11-07 on good grounds: this tool exists to catch the project you
     abandoned, so lighting the healthy and dimming the neglected can be read
     as inverting its purpose. The author kept it this way deliberately. The
     reason it holds: --hot already owns "look at this", and a bright rail on
     every cold card would put a second competing claim on the same glance,
     against an alarm that is rationed to seven cards out of nineteen. Cold
     work is found by the cut (it is everything under THE REST) and by its own
     printed age, not by being the loudest thing on the page. If --hot ever
     stops being rationed, re-open this.

     The dim end does not meet 3:1 against the card, which is allowed because
     the rail is never the only carrier: the same fact is printed as text
     ("26d since commit") in the card's own meta line. If the rail ever becomes
     the sole channel for something, it has to be re-measured. */
  --r0: #3ad6c4;
  --r1: #2faea0;
  --r2: #2b8b84;
  --r3: #286b69;
  --r4: #244f52;
  --r5: #20383c;
  --develop: 520ms;
}
* { box-sizing: border-box; }
::selection { background: var(--accent); color: var(--field); }
html {
  scrollbar-color: var(--line) var(--field);
  -webkit-text-size-adjust: 100%;
}
body {
  margin: 0;
  padding: 0 0 3rem;
  font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
  font-variant-numeric: tabular-nums;
  background: var(--field);
  color: var(--text);
}

/* The chrome strip. Machine type: every value along here is stamped, not
   written. */
.edge {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: .4rem .9rem;
  padding: .7rem 1.1rem;
  background: var(--bar);
  border-bottom: 1px solid var(--line);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .66rem;
  letter-spacing: .22em;
  text-transform: uppercase;
  color: var(--dim);
}
.edge h1 { font: inherit; letter-spacing: .3em; margin: 0; color: var(--text); }
.edge .host { margin-left: auto; }

/* The readout. This strip is the whole reason the page stopped being a
   document: the three things you can act on (how old this is, how much of it
   is lying, where the mass sits) are answered here as numbers, before a single
   card is read. Everything below it is detail. */
/* Stacked on a phone, side by side from 34rem. Four tally tiles and the stamp
   do not fit across 375px: they fitted at the width this was designed at and
   ran off the right edge on the device the page is most often read on, which
   is the one width that is never optional. */
.stamp {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: .9rem;
  padding: 1rem 1.1rem;
  background: var(--bar);
  border-bottom: 1px solid var(--line);
}
.aged {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding-bottom: .9rem;
  border-bottom: 1px solid var(--line);
}
@media (min-width: 34rem) {
  .stamp { grid-template-columns: auto minmax(0, 1fr); gap: 1.4rem; }
  .aged { padding: 0 1.4rem 0 0; border-bottom: 0; border-right: 1px solid var(--line); }
  .tally { grid-template-columns: repeat(6, minmax(0, 1fr)); }
}
/* The project page, the empty state and both error panels call sheetHead with
   no tally. Without this they drew the divider rule into half a strip of
   nothing, which reads as a panel that failed to load rather than one with
   nothing to show. */
.stamp.lone { grid-template-columns: minmax(0, 1fr); }
.stamp.lone .aged { padding: 0; border: 0; }
/* The exposure stamp, still the largest thing on the page by a wide margin and
   it must stay that way: a reader who takes one fact away takes this one. */
.age {
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: clamp(2rem, 9vw, 2.9rem);
  font-weight: 700;
  line-height: 1;
  letter-spacing: -.04em;
  color: var(--text);
}
/* An hour old is worth noticing; a day old is worth distrusting. Only the
   second one gets the alarm, or the alarm means nothing by the time it is
   earned. */
.age.warn { color: var(--text); }
.age.stale { color: var(--hot); }
.age-note {
  margin: .35rem 0 0;
  max-width: 30ch;
  font-size: .72rem;
  color: var(--dim);
}
.age-note.stale { color: var(--hot); }
/* The suspect count, set as a filled tag rather than coloured words. The page
   the author rejected was one that looks calm while a third of the board is
   lying; a tag is the loudest this can be without outranking the stamp. The
   number and the word carry it, the fill only agrees. */
.alarm {
  margin: .5rem 0 0;
  align-self: flex-start;
  padding: .28rem .5rem;
  background: var(--hot);
  color: var(--on-hot);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .68rem;
  font-weight: 700;
  letter-spacing: .14em;
  text-transform: uppercase;
}

/* The tally as instrument tiles: count above, stage under it, so the counts
   align into one row of numbers that can be read without reading the labels. */
/* Two rows of three on a phone, one row of six from 34rem. Six tiles across
   375px overflowed the viewport by 20px the moment the zeroed stages started
   printing, which is the same width failure the stat bar already had once.
   Wrapping keeps every channel visible; a scroller would hide the zeroes
   again, which is the thing printing them was for. */
.tally {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  margin: 0;
  padding: 0;
  list-style: none;
  background: var(--line);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.tally li {
  display: flex;
  flex-direction: column-reverse;
  justify-content: center;
  gap: .2rem;
  padding: .5rem .7rem;
  background: var(--bar);
}
.tally li span {
  font-size: .58rem;
  letter-spacing: .16em;
  text-transform: uppercase;
  color: var(--dim);
}
.tally b {
  font-size: clamp(1.3rem, 4.5vw, 1.9rem);
  font-weight: 700;
  line-height: 1;
  letter-spacing: -.03em;
  color: var(--text);
}

/* The cut. What you are inside leads; everything else follows. */
.section {
  display: flex;
  align-items: center;
  gap: .6rem;
  margin: 1.4rem 1.1rem .6rem;
  padding-bottom: .4rem;
  border-bottom: 2px solid var(--line);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .66rem;
  font-weight: 700;
  letter-spacing: .24em;
  text-transform: uppercase;
  color: var(--text);
}
.section span { margin-left: auto; color: var(--dim); }

/* A field of cards, not a column of paragraphs.
   This is a row-flow grid, and the proof sheet it replaces used CSS
   multicolumn specifically so that payload rank read straight down each
   column. That property is genuinely lost here: in row flow, card 2 sits
   beside card 1 and the ranking zigzags. It is traded on purpose. Rank is
   still legible because every card prints its own number, and a dashboard that
   reads as one instrument at a glance was worth more to this reader than a
   ranking that survives a column break. If rank ever has to be exact again,
   this is the rule to revisit, not the card. */
.sheet {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  margin: 0 1.1rem;
  padding: 0;
  list-style: none;
}
.sheet-lead { grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
.cell {
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--line);
  /* The rail defaults to the card's own border colour, which is the unexposed
     look. There is deliberately no fresh default: a card that lost its density
     class must read as "age unknown", never as "committed minutes ago", which
     is the one lie this page cannot tell. */
  border-left: 4px solid var(--rail, var(--line));
}
.frame { padding: .6rem .75rem .5rem; }
.cell:has(.d0) { --rail: var(--r0); }
.cell:has(.d1) { --rail: var(--r1); }
.cell:has(.d2) { --rail: var(--r2); }
.cell:has(.d3) { --rail: var(--r3); }
.cell:has(.d4) { --rail: var(--r4); }
.cell:has(.d5) { --rail: var(--r5); }
.cell:has(.dx) { --rail: var(--line); }

.head {
  display: flex;
  align-items: center;
  gap: .5rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .64rem;
  letter-spacing: .1em;
}
.num { font-weight: 700; color: var(--dim); }
/* The stage is a chip, because it is the one field on this page a human typed
   and the only one that can be wrong. Giving it an edge says it is a claim. */
.stage {
  margin-left: auto;
  padding: .14rem .4rem;
  background: var(--chip);
  color: var(--chip-ink);
  font-weight: 700;
  font-size: .58rem;
  letter-spacing: .16em;
  text-transform: uppercase;
}
.name {
  margin: .2rem 0 .25rem;
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -.01em;
  overflow-wrap: anywhere;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: .15rem .45rem;
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .62rem;
  color: var(--dim);
}
/* The two ages sit next to each other and both start or end in a number, so
   "commit 26d" and "35d in stage" ran together as "26d 35d" at phone size on
   2026-11-07. A gap is not enough separation between two values of the same
   shape; the flags after them do not need one because a filled chip already
   separates itself. The divider rides on .in-stage, which is always the second
   span and always present, so it can never lead the line. */
.in-stage::before {
  content: "\\00b7";
  margin-right: .45rem;
  color: var(--line);
}
.flag {
  padding: .06rem .28rem;
  background: var(--chip);
  color: var(--chip-ink);
  font-weight: 700;
  letter-spacing: .06em;
}

/* Suspect: the stage may be a lie, so the claim itself is the thing that
   changes. Three channels and only one of them is colour: the chip inverts to
   a filled alarm tag, the rail goes to alarm regardless of age, and the "!"
   prints among the flags as a word. The proof sheet drew a grease-pencil
   stroke through the stage here; a stroke is a paper gesture and does not
   belong on a lit instrument, but do not drop a channel when replacing it. */
.cell:has(.suspect) { --rail: var(--hot); }
.suspect .stage, .flag.bang { background: var(--hot); color: var(--on-hot); }

/* The drawer. Every card states what is happening in one line; the depth
   behind it opens on press. Nineteen cards with four next items and four
   commits each is the wall of paragraphs this page exists to avoid, and the
   proof sheet answered that by hiding items under 48rem and printing "+2
   next", which told the reader what they were missing without offering it to
   them.
   <details> is the whole mechanism: no script, keyboard-operable, and it
   survives with the summary visible if the element is ever unstyled. */
.drawer { margin: .5rem 0 0; border-top: 1px solid var(--line); }
.drawer > summary {
  /* Tall enough to hit with a thumb. WCAG 2.2 target size (2.5.8) wants 24px
     and this was 21px; the spacing exception technically covered it, since
     nothing sits near it, but a 21px strip is still a miss on a real phone,
     which is the device this board is read on. */
  padding: .55rem 0 .3rem;
  min-height: 24px;
  box-sizing: content-box;
  cursor: pointer;
  list-style: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .6rem;
  letter-spacing: .16em;
  text-transform: uppercase;
  color: var(--dim);
}
.drawer > summary::-webkit-details-marker { display: none; }
.drawer > summary::after {
  content: "+";
  float: right;
  font-weight: 700;
  color: var(--accent);
}
.drawer[open] > summary::after { content: "\\2212"; }
.drawer > summary:hover { color: var(--text); }
.drawer > summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.next { margin: .4rem 0 0; }
.next-head, .block h2 {
  margin: 0 0 .15rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .58rem;
  letter-spacing: .2em;
  text-transform: uppercase;
  color: var(--dim);
}
/* The list marker is drawn, not inherited: a page that themes its selection,
   its scrollbar and its focus ring should not leave its one list marker to the
   browser, which renders it differently in a nested list and a top-level one. */
.next ul, .next-full { list-style: none; margin: .1rem 0 0; padding-left: 0; }
.next li, .next-full li { padding-left: .9rem; text-indent: -.9rem; }
.next li::before, .next-full li::before { content: "\\25B8\\00a0"; color: var(--accent); }
.next li { font-size: .76rem; line-height: 1.35; margin-top: .14rem; overflow-wrap: anywhere; }
/* One commit subject tells you nothing; four read in order tell you whether
   this is being built, documented or nursed. */
.log { margin: .45rem 0 0; padding: 0; list-style: none; }
.log li {
  display: flex;
  gap: .5rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .64rem;
  line-height: 1.45;
  color: var(--dim);
}
.log .when { flex: 0 0 2.6rem; text-align: right; color: var(--accent); }
.log .what { overflow-wrap: anywhere; }

/* Content flows from the top of the card, not the bottom. A grid row
   stretches every card to the tallest in it, and pushing the caption down with
   margin-top:auto then opened a void above a short card the moment a
   neighbour's drawer was opened. Empty space belongs under the last line, not
   over the first. */
.caption { padding: 0 .75rem .6rem; }
.note { margin: .45rem 0 0; font-size: .78rem; line-height: 1.35; color: var(--text); overflow-wrap: anywhere; }
/* The one line every card states without being opened: what git says is
   happening right now. */
.git {
  display: flex;
  flex-wrap: wrap;
  gap: 0 .45rem;
  margin: .45rem 0 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .62rem;
  color: var(--dim);
}
.branch { color: var(--accent); font-weight: 700; }
.subject { overflow-wrap: anywhere; }

a { color: inherit; text-underline-offset: .18em; text-decoration-thickness: 1px; }
a:hover { text-decoration-thickness: 2px; }
a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
/* The card's name is the only route to the project page, and the reader is on
   a phone, so it has to be legible as a link without hover. It was underlined
   in var(--line) until 2026-11-07, which is 1.24:1 on a card: invisible, and
   indistinguishable from antialiasing in a capture. The underline is drawn in
   the accent and sits below the baseline where it cannot touch the glyphs. */
/* The padding is the tap target, not decoration. This link is the only route
   off the board and the stated reader is holding a phone; the text box alone
   measured 21px tall on 2026-11-07, under WCAG 2.5.8's 24px. It passed only on
   the spacing exception, which is a thin thing to rest the page's sole
   navigation on. Padding on an inline box grows the hit area without touching
   line layout, so nothing moves and the background stays transparent. */
.name a { color: var(--text); text-decoration-color: var(--accent); text-underline-offset: .22em; padding-block: .1rem; }
.name a:hover, .name a:focus-visible { color: var(--accent); }

/* A project's own page: one card at full width, then the blocks the board has
   no room for, open rather than behind a drawer, because that is why a reader
   came here. */
.back { margin: 1rem 1.1rem 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .66rem; letter-spacing: .18em; text-transform: uppercase; color: var(--dim); }
/* The only way back on a phone, and it was a 13px-tall strip of text: the
   smallest target on the page sitting on the most-used control. The padding
   brings it to 24px without changing where the line sits, because the negative
   margin gives back what the padding takes. */
.back a { display: inline-block; min-height: 24px; box-sizing: border-box; padding-block: .35rem; margin-block: -.35rem; }
.single { max-width: 46rem; margin: .7rem 1.1rem 0; }
.single .cell { border-left-width: 6px; }
.single .frame { padding: .9rem 1rem .7rem; }
.single .name { font-size: 1.5rem; }
.single > .note { margin: .9rem 0 0; font-size: .95rem; max-width: 42rem; }
.block { margin: 1.3rem 0 0; }
.block h2 { padding-bottom: .3rem; border-bottom: 1px solid var(--line); }
.next-full { margin: 0; }
.next-full li { margin-top: .3rem; font-size: .88rem; line-height: 1.4; overflow-wrap: anywhere; }
.paths { list-style: none; margin: 0; padding-left: 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .78rem; color: var(--dim); }
.paths li { margin-top: .15rem; padding-left: .9rem; text-indent: -.9rem; overflow-wrap: anywhere; }
.paths li::before { content: "\\25B8\\00a0"; color: var(--accent); }
.provenance, .absent { margin: .45rem 0 0; font-size: .78rem; color: var(--dim); }
.single .log li { font-size: .74rem; }
.single .log .when { flex-basis: 3.2rem; }

/* HISTORY: the chart, the stage band and the scale line, all on one axis.
   The chart and the band are separate boxes that share a width and nothing
   else, so the band's segments are positioned as percentages of the same span
   the bars divide evenly. That is what makes "the stage at this week" a
   vertical read rather than an arithmetic one. */
.history { margin-top: 1.6rem; }
/* The heading is the board's own .section rule, so this reads as a third
   section of the same instrument. It keeps that rule's side margins, which
   would inset it from the blocks around it, so they are cancelled here. */
.history > .section { margin: 0 0 .6rem; }
/* The bars sit on a baseline, not in a row of boxes: a bar's height is the
   only thing that carries its value, so the bottom edge has to be exact and
   the gap has to be small enough that 26 buckets still read as one series. */
.hist-chart {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 4.5rem;
  padding-bottom: 1px;
  border-bottom: 1px solid var(--line);
}
/* A zero bucket is a rule, not an absent element. Dropping it would close the
   gap and make a quiet month look like a short project, which is the one
   misreading this chart exists to prevent. */
.hist-bar {
  flex: 1 1 0;
  min-width: 0;
  height: var(--h, 0%);
  min-height: 1px;
  background: var(--accent);
}
.hist-bar.zero { height: 1px; background: var(--line); }
/* The band. --chip with a --line border, never --hot: the alarm colour means
   suspect everywhere on this page, and a stage change is not an alarm. It is
   not --accent either, or the band would read as part of the chart above it. */
.hist-band {
  position: relative;
  height: 2.1rem;
  margin-top: 3px;
}
.hist-seg {
  position: absolute;
  top: 0;
  bottom: 0;
  left: var(--l, 0%);
  width: var(--w, 0%);
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: .05rem;
  padding: 0 .3rem;
  overflow: hidden;
  background: var(--chip);
  border: 1px solid var(--line);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .56rem;
  line-height: 1.15;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--text);
  white-space: nowrap;
}
.hist-seg .hist-for { color: var(--dim); letter-spacing: .04em; }
/* The inferred segment is marked with an asterisk in its own label and a
   footnote under the section, both text. A tint would be the only channel for
   a guess presented as a record, which is the failure the whole tool exists to
   prevent. */
.hist-seg.inferred { border-style: dashed; }
/* The phone list. Below 34rem a segment can be a few pixels wide and a clipped
   label is worse than a list, so the band is hidden and the same entries print
   as lines. Both are in the markup; only one is ever visible. */
.hist-list {
  display: none;
  margin: .5rem 0 0;
  padding: 0;
  list-style: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .66rem;
  color: var(--dim);
}
.hist-list li {
  display: flex;
  flex-wrap: wrap;
  gap: 0 .5rem;
  padding: .18rem 0;
  border-bottom: 1px solid var(--line);
}
.hist-list .hist-stage { color: var(--text); text-transform: uppercase; letter-spacing: .08em; }
.hist-list .hist-at { margin-left: auto; }
/* A project with no chart has no axis for a band to align to, so the list is
   the trail at every width rather than a row of boxes floating on nothing. */
.hist-list.alone { display: block; }
/* The scale line: span, total, now. It is the chart's text twin, which is what
   lets the chart be one role="img" label instead of 26 labelled bars. */
.hist-scale {
  display: flex;
  justify-content: space-between;
  gap: .6rem;
  margin: .35rem 0 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .6rem;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: var(--dim);
}
.hist-note { margin: .4rem 0 0; font-size: .68rem; color: var(--dim); }
@media (max-width: 33.99rem) {
  .hist-band { display: none; }
  .hist-list { display: block; }
}

/* Nothing pushed, or a payload this Worker cannot read. */
.empty {
  margin: 1.2rem 1.1rem 0;
  padding: 1rem;
  max-width: 44ch;
  background: var(--surface);
  border: 1px solid var(--line);
  border-left: 4px solid var(--line);
}
.empty p { margin: 0 0 .6rem; }
.empty p:last-child { margin-bottom: 0; }
code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .85em;
  background: var(--chip);
  color: var(--chip-ink);
  padding: .08rem .3rem;
}

/* The board comes up once, staggered, and only the rail moves: every word is
   readable from the first frame. */
@media (prefers-reduced-motion: no-preference) {
  .cell { animation: develop var(--develop) cubic-bezier(.16, 1, .3, 1) backwards; animation-delay: calc(var(--i) * 22ms); }
  @keyframes develop { from { border-left-color: var(--line); opacity: .4; } }
}

@media (min-width: 48rem) {
  .edge, .stamp { padding-left: 1.5rem; padding-right: 1.5rem; }
  .sheet { margin: 0 1.5rem; gap: 12px; }
  .section { margin: 1.6rem 1.5rem .7rem; }
  .back, .single, .empty { margin-left: 1.5rem; margin-right: 1.5rem; }
}
@media (min-width: 70rem) {
  .stamp { grid-template-columns: auto minmax(0, 46rem); }
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
    <span>status board</span>
    ${host ? `<span class="host">${escapeHtml(host)}</span>` : ""}
  </div>
  <div class="stamp${tally ? "" : " lone"}">
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
  // by small strikes scattered down the board. The number is not a second
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

// A span of time as words, for the scale line and the chart's own label. Days
// rather than weeks once the span stops dividing evenly, because "1.4 weeks"
// is a number nobody reads.
function spanWords(ms: number): string {
  const days = Math.max(0, Math.round(ms / DAY_MS));
  // Under a day, say hours. A stage set an hour ago rounded to "0 days" in the
  // trail while the card above the chart said "1h in stage": the same fact,
  // twice, in units that disagreed. Zero of anything also reads as "never
  // happened", which is the opposite of "just now".
  if (days < 1) {
    const hours = Math.max(0, Math.floor(ms / (60 * 60 * 1000)));
    if (hours < 1) return "under an hour";
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  if (days < 14) return `${days} ${days === 1 ? "day" : "days"}`;
  const weeks = Math.round(days / 7);
  return `${weeks} weeks`;
}

// A date as the band and the phone list print it: "27 Aug", with the year only
// when it is not this one, so a two-year-old project does not read as if it
// started this summer.
function shortDate(ms: number, now: number): string {
  const date = new Date(ms);
  const month = date.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  const sameYear = new Date(now).getUTCFullYear() === date.getUTCFullYear();
  return sameYear ? `${date.getUTCDate()} ${month}` : `${date.getUTCDate()} ${month} ${date.getUTCFullYear()}`;
}

// The HISTORY section of a project page, and the only place on the page where
// the past is drawn rather than stated. It answers three questions the board
// cannot: has this been alive, where does it get stuck, and what was I doing
// last time.
//
// The chart and the band share one horizontal axis on purpose. Two separate
// facts ("here are the commits", "here are the stages") would be a report; the
// point of this section is reading the stage at any week by looking straight
// down from that week's bar, so both are laid out against the same span.
//
// Returns "" when there is nothing to say. A box that says nothing is worse
// than no box, and a project with neither a first commit nor a stage trail has
// no history this page can honestly draw.
function renderHistory(project: Project, now: number): string {
  const weeks = project.weeks ?? [];
  const history = project.stage_history ?? [];
  const firstCommit = parseStamp(project.first_commit ?? null);
  if (firstCommit === null && history.length === 0) return "";

  // The span is the project's own life, not a fixed window: a fixed 26-week
  // axis would draw most pages as a long flat run of nothing, which reads as
  // "dead" when the truth is "did not exist yet".
  const weekStart = parseStamp(project.week_start ?? null);
  const charted = project.has_git && weeks.length > 0;
  const spanStart = charted
    ? weekStart ?? firstCommit ?? now - weeks.length * 7 * DAY_MS
    : firstCommit ?? parseStamp(history[0]?.at ?? null) ?? now;
  const spanEnd = Math.max(now, spanStart + 1);
  const span = spanEnd - spanStart;
  const total = weeks.reduce((sum, count) => sum + count, 0);
  const peak = weeks.reduce((most, count) => Math.max(most, count), 0);
  const spanText = spanWords(span);

  // One bar per bucket, oldest first, scaled to this project's own peak. A
  // zero bucket is a 1px rule rather than an absent element: a gap has to read
  // as a gap, and a missing bar reads as a missing week.
  //
  // The label states the span and the total rather than labelling 26 bars: the
  // scale line below carries the same two facts as text, so the chart can be
  // one image to a screen reader instead of a wall of numbers.
  const bars = charted
    ? `<div class="hist-chart" role="img" aria-label="${escapeHtml(
        `${total} ${total === 1 ? "commit" : "commits"} over ${spanText} since ${shortDate(
          spanStart,
          now,
        )}`,
      )}">${weeks
        .map((count) => {
          const value = Number.isFinite(count) ? Math.max(0, count) : 0;
          const height = peak > 0 ? Math.round((value / peak) * 100) : 0;
          return `<span class="hist-bar${value === 0 ? " zero" : ""}" style="--h:${height}%"></span>`;
        })
        .join("")}</div>`
    : "";

  // The band. Each segment starts where its entry was recorded and runs until
  // the next one, so the last segment runs to now. The left edge and width are
  // computed here rather than in CSS because they are data: a stylesheet
  // cannot know when a stage changed.
  //
  // It is only drawn when there is a chart above it to align to. Without one
  // the band would be a row of boxes on an axis nothing else shares, so the
  // list carries the trail on its own at every width.
  const segments = charted
    ? history
        .map((entry, index) => {
          const at = parseStamp(entry.at);
          if (at === null) return "";
          const nextAt = parseStamp(history[index + 1]?.at ?? null) ?? spanEnd;
          const left = Math.min(100, Math.max(0, ((at - spanStart) / span) * 100));
          const right = Math.min(100, Math.max(left, ((nextAt - spanStart) / span) * 100));
          const duration = spanWords(Math.max(0, nextAt - at));
          const mark = entry.inferred ? "*" : "";
          // A segment narrower than its own label printed one or two clipped
          // glyphs at the band's edge: a stage set an hour ago is a sliver of a
          // 17-week span, and "BUILDING / 1h" came out as "B / 0". The block
          // still shows when the change happened, and the card above the chart
          // already names the current stage and how long it has held, so the
          // label is what gives way rather than the segment.
          const labelled = right - left >= 12;
          const label = labelled
            ? `<span class="hist-stage">${escapeHtml(entry.stage)}${mark}</span>
          <span class="hist-for">${escapeHtml(duration)}</span>`
            : "";
          const title = `${entry.stage}${mark}, ${duration}`;
          return `<span class="hist-seg${entry.inferred ? " inferred" : ""}" style="--l:${left.toFixed(
            2,
          )}%;--w:${(right - left).toFixed(2)}%"${labelled ? "" : ` title="${escapeHtml(title)}"`}>
          ${label}
        </span>`;
        })
        .join("")
    : "";
  // The same entries as lines: "stage — date — duration". This is what a phone
  // gets instead of the band, and what a project with no chart gets at every
  // width.
  const list = history.length
    ? `<ol class="hist-list${charted ? "" : " alone"}">${history
        .map((entry, index) => {
          const at = parseStamp(entry.at);
          const nextAt = parseStamp(history[index + 1]?.at ?? null) ?? spanEnd;
          const mark = entry.inferred ? "*" : "";
          return `<li><span class="hist-stage">${escapeHtml(entry.stage)}${mark}</span>
          <span class="hist-at">${escapeHtml(at === null ? "-" : shortDate(at, now))}</span>
          <span class="hist-for">${escapeHtml(
            at === null ? "-" : spanWords(Math.max(0, nextAt - at)),
          )}</span></li>`;
        })
        .join("")}</ol>`
    : "";
  const band = segments ? `<div class="hist-band">${segments}</div>${list}` : list;

  // The mark is text, never colour: an inferred segment is a guess about the
  // past, and presenting a guess as a record is the failure this whole tool
  // exists to prevent.
  const footnote = history.some((entry) => entry.inferred)
    ? `<p class="hist-note">* Inferred from the first commit. Not a recorded change.</p>`
    : "";

  // The scale line is the chart's text twin, and the reason the chart can be
  // role="img" with one label instead of 26 labelled bars.
  // The left end is the date the axis starts, not its length. It sits opposite
  // "now", so an instant belongs there; a duration there put "18 weeks" a line
  // above a segment labelled "17 weeks", two numbers in the same unit that are
  // not the same measurement.
  const scale = charted
    ? `<p class="hist-scale">
      <span>${escapeHtml(shortDate(spanStart, now))}</span>
      <span>${escapeHtml(`${total} ${total === 1 ? "commit" : "commits"}`)}</span>
      <span>now</span>
    </p>`
    : "";

  // No log here. The project page already has a `recent` section and this one
  // grew a second copy of it, so the page printed the same commits twice. The
  // depth belongs to that section, which now keeps five open and puts the rest
  // behind a drawer.
  //
  // No count on the heading either. The board's cuts count projects, so a
  // number beside this heading reads as a count of the same kind; it was the
  // number of stage changes, which told the reader "HISTORY 3" and meant
  // nothing. The commit total is in the scale line, where it has a unit.
  return `<section class="block history">
    <h2>history</h2>
    ${bars}
    ${band}
    ${scale}
    ${footnote}
  </section>`;
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
    // Only "!" is the suspect flag. "dirty" and "^N" are ordinary states that
    // happen to sit on a suspect card, and painting them in the alarm too put
    // about twenty-five hot chips on a 7-of-19 board: the ink stopped being
    // rationed, and the "!" stopped being findable among four identical red
    // chips, which is the channel that is supposed to carry this without
    // colour.
    .map(
      (flag) =>
        `<span class="flag${flag === "!" ? " bang" : ""}">${escapeHtml(flag)}</span>`,
    )
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
  // The handful stays open and the depth opens on press. This page exists for
  // the reader who wanted more than the board had room for, so burying all of
  // it behind a drawer would take away the thing the page is for; printing
  // twenty entries openly would bury the sections under it instead.
  const commits = project.recent ?? [];
  const entry = (commit: Commit) =>
    `<li><span class="when">${escapeHtml(humanAge(parseStamp(commit.at), nowMs))}</span>
      <span class="what">${escapeHtml(commit.subject)}</span></li>`;
  const rest = commits.slice(5);
  const log = commits.length
    ? `<section class="block">
    <h2>recent</h2>
    <ol class="log">${commits.slice(0, 5).map(entry).join("")}</ol>
    ${
      rest.length
        ? `<details class="drawer">
        <summary>${escapeHtml(`${rest.length} older`)}</summary>
        <ol class="log">${rest.map(entry).join("")}</ol>
      </details>`
        : ""
    }
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
<p class="back"><a href="/">back to the board</a></p>
<article class="single">
  <div class="cell">
  <div class="frame d${step === -1 ? "x" : step}${suspect ? " suspect" : ""}">
    <div class="head">
      <span class="num">${escapeHtml(project.has_git ? project.branch || "?" : "no git")}</span>
      <span class="stage">${escapeHtml(project.stage)}</span>
    </div>
    <h1 class="name">${escapeHtml(project.name)}</h1>
    <p class="meta">
      <span class="touched">commit ${escapeHtml(humanAge(parseStamp(project.last_commit), nowMs))}</span>
      <span class="in-stage">${escapeHtml(humanAge(parseStamp(project.stage_set_at), nowMs))} in stage</span>
      ${flags}
    </p>
  </div>
  </div>
  ${project.note ? `<p class="note">${escapeHtml(project.note)}</p>` : ""}
  ${renderHistory(project, nowMs)}
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
  const body = `${sheetHead({ text: "No such project", tone: "stale", note: "" }, "", "")}
<div class="empty">
  <p>Nothing on this board is called ${escapeHtml(name)}.</p>
  <p>It may have been renamed or dropped since this page was last pushed.</p>
  <p><a href="/">Back to the board</a></p>
</div>`;
  return page("wipboard: no such project", body);
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
