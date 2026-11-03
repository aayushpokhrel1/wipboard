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

export const PAYLOAD_VERSION = 1;

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

// One frame of the sheet. The furniture is identical in every frame and in the
// same positions, which is what makes nineteen of these read across as one
// object instead of down as nineteen things: number and stage in the frame's
// head, name, then the age line. The note and the git line print in the
// rebate below the frame, the way a caption is written in a proof sheet's
// margin, so an absent note never changes the frame's own shape.
function renderFrame(project: Project, index: number, now: number): string {
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
  const git = project.has_git
    ? `<span class="branch">${escapeHtml(project.branch || "?")}</span>
        <span class="subject">${escapeHtml(project.subject)}</span>
        <span class="changed">${escapeHtml(String(project.changed))} changed</span>`
    : `<span class="subject">no git</span>`;
  // --i staggers the develop animation. It is set here rather than with an
  // nth-child rule because the board's length is data, not a constant.
  return `<li class="cell" style="--i:${index}">
      <div class="frame d${step === -1 ? "x" : step}${suspect ? " suspect" : ""}">
        <div class="head">
          <span class="num">${number}</span>
          <span class="stage">${escapeHtml(project.stage)}</span>
        </div>
        <p class="name">${escapeHtml(project.name)}</p>
        <p class="meta">
          <span class="touched">${escapeHtml(touched)}</span>
          <span class="in-stage">${escapeHtml(inStage)} in stage</span>
          ${flags}
        </p>
      </div>
      <div class="caption">
        ${caption}
        <p class="git">${git}</p>
      </div>
    </li>`;
}

const STYLE = `
:root {
  color-scheme: light dark;
  /* Unexposed paper. The grid gap is the rebate, so the page itself shows
     through between the frames and no element has to draw one. */
  --paper: #f4f0e6;
  --ink: #1c1a17;
  --silver: #6f695d;
  /* The one saturated ink on the page. Grease pencil, and nothing else.
     Anything here that is not a condition the data actually holds is grey. */
  --wax: #b8312a;
  --rebate: #d9d2c1;
  /* The density ramp: six steps away from the paper, fresh to stale. */
  --d0: #eae3d4;
  --d1: #ded6c4;
  --d2: #cec4ae;
  --d3: #bbb09a;
  --d4: #a99d87;
  --d5: #978b76;
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
.sheet {
  margin: 1.25rem 0 0;
  padding: 0;
  list-style: none;
  column-gap: .5rem;
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
.flag { font-weight: 700; color: var(--wax); }

/* The grease pencil. A suspect frame is marked three ways at once, only one of
   which is colour: a drawn wax ring, the frame number struck through, and the
   literal "!" among the flags. The ring is deliberately off-square and
   off-axis, and it is drawn clear of the type: a mark through a repo name is
   a mark that costs you the name. */
.frame.suspect::before {
  content: "";
  position: absolute;
  inset: -2px -3px -3px -2px;
  border: 3px solid var(--wax);
  border-radius: 46% 54% 49% 51% / 52% 47% 53% 48%;
  transform: rotate(-1.4deg);
  opacity: .92;
  pointer-events: none;
}
.frame.suspect .num {
  color: var(--wax);
  text-decoration: line-through 2px var(--wax);
}

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
    --paper: #100f0c;
    --ink: #ece6d9;
    --silver: #968d7b;
    --wax: #ff6a5c;
    --rebate: #35312a;
    --d0: #16140f;
    --d1: #1f1c15;
    --d2: #29241b;
    --d3: #342e23;
    --d4: #3f382a;
    --d5: #4a4234;
  }
}

/* Two columns on every phone. One column of nineteen frames is the scrolling
   list this page was redesigned to stop being, and 22rem is below the
   narrowest phone still shipping. */
@media (min-width: 22rem) { .sheet { columns: 2; } }
@media (min-width: 48rem) {
  body { padding: 1.5rem 1.5rem 3rem; }
  .sheet { columns: 3; column-gap: .65rem; }
  .cell { margin-bottom: .65rem; }
}
@media (min-width: 70rem) {
  body { max-width: 86rem; margin: 0 auto; }
  .sheet { columns: 4; }
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
function sheetHead(age: { text: string; tone: string; note: string }, host: string, tally: string): string {
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
  // Payload order is _sort_key order from the CLI. Re-sorting here would make
  // the two views disagree about what matters, which is worse than one view.
  // The frame numbers carry that order, so it survives the column flow.
  const frames = payload.projects
    .map((project, index) => renderFrame(project, index, nowMs))
    .join("\n");
  const body = `${sheetHead(age, payload.host, tally)}
<ol class="sheet">
${frames}
</ol>`;
  return page("wipboard", body);
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
