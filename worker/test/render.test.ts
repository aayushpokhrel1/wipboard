import { env, SELF } from "cloudflare:test";

// The Worker runs in token mode under .dev.vars, so these GET / tests have to
// authenticate like a browser would. They predate the view auth.
const VIEW_COOKIE = { Cookie: "wipboard_view=view-token-for-tests" };
import { describe, expect, it } from "vitest";
import { renderBoard, renderEmpty, renderProject, type Board } from "../src/render";

const NOW = new Date("2026-10-20T12:00:00Z");

function project(overrides: Partial<Board["projects"][number]> = {}) {
  return {
    name: "alpha",
    stage: "building",
    note: "",
    last_commit: "2026-10-20T11:58:00",
    stage_set_at: "2026-10-01T09:00:00",
    flags: [] as string[],
    has_git: true,
    branch: "main",
    subject: "Add the thing",
    changed: 0,
    ...overrides,
  };
}

function board(overrides: Partial<Board> = {}): Board {
  return {
    version: 2,
    generated_at: "2026-10-20T11:59:00",
    host: "HOST",
    projects: [project()],
    ...overrides,
  };
}

describe("renderBoard", () => {
  it("renders every project name and the snapshot age", () => {
    const html = renderBoard(
      board({
        projects: [
          project({ name: "alpha" }),
          project({ name: "beta", stage: "parked" }),
          project({ name: "gamma", stage: "idea", has_git: false, flags: ["no git"] }),
        ],
      }),
      NOW,
    );
    expect(html).toContain("alpha");
    expect(html).toContain("beta");
    expect(html).toContain("gamma");
    // generated_at is one minute before now.
    expect(html).toContain("1m ago");
  });

  it("escapes HTML in a name, note and subject", () => {
    // Review Focus 1: a note is user text read in a browser.
    const html = renderBoard(
      board({
        projects: [
          project({
            name: "<script>x</script>",
            note: 'a & b "quoted"',
            subject: "<b>bold</b>",
          }),
        ],
      }),
      NOW,
    );
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(html).toContain("a &amp; b &quot;quoted&quot;");
    expect(html).not.toContain("<b>bold</b>");
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;");
  });

  it("shows a future generated_at as 'just now'", () => {
    // Review Focus 3: clock skew must never read as a negative age.
    const html = renderBoard(board({ generated_at: "2026-10-20T12:05:00" }), NOW);
    expect(html).toContain("just now");
    // Not a blanket ban on "-": class names contain hyphens. What must never
    // appear is a negative duration in any unit.
    expect(html).not.toMatch(/-\d+[mhdy]/);
  });

  // The stale note says only that nothing has been pushed. It claimed the
  // machine had "probably been off" until 2026-11-02, by which point it had
  // fired twice and been wrong both times.
  it("marks a snapshot over 24h old as stale, without guessing why", () => {
    const html = renderBoard(board({ generated_at: "2026-10-19T11:00:00" }), NOW);
    expect(html).toContain("1d ago");
    expect(html).toContain("Nothing has been pushed since");
    expect(html).toContain("stale");
    expect(html).not.toContain("probably been off");
  });

  it("marks a snapshot over an hour old as amber", () => {
    const html = renderBoard(board({ generated_at: "2026-10-20T10:00:00" }), NOW);
    expect(html).toContain("2h ago");
    expect(html).toContain("warn");
    expect(html).not.toContain("Nothing has been pushed since");
  });

  it("keeps payload order rather than re-sorting", () => {
    const html = renderBoard(
      board({
        projects: [
          project({ name: "zeta", flags: ["!"] }),
          project({ name: "alpha" }),
          project({ name: "mid" }),
        ],
      }),
      NOW,
    );
    // Search the sheet, not the whole document. Searching raw substrings over
    // the page meant any word appearing in the stylesheet above could fail
    // this: the comment "a mid grey" broke it on 2026-11-02, which is a false
    // failure about a real rule and the worst kind to debug.
    const sheet = html.slice(html.indexOf('<ol class="sheet'));
    expect(sheet.indexOf("zeta")).toBeLessThan(sheet.indexOf("alpha"));
    expect(sheet.indexOf("alpha")).toBeLessThan(sheet.indexOf("mid"));
  });

  it("gives a '!' row visual emphasis and counts stages", () => {
    const html = renderBoard(
      board({
        projects: [
          project({ name: "suspect", flags: ["!", "dirty"] }),
          project({ name: "calm", stage: "parked" }),
        ],
      }),
      NOW,
    );
    // Three channels, only one of which is colour: the struck stage, the
    // struck frame number, and the literal flag.
    expect(html).toContain("suspect");
    // The alarm is rationed to the "!" itself. "dirty" sits on the same card
    // and is an ordinary state, so painting it in the alarm too would both
    // unration the ink and bury the one channel that carries this without
    // colour among identical red chips.
    expect(html).toContain('class="flag bang">!<');
    expect(html).toContain('class="flag">dirty<');
    // And the count at the top. The failure the author named for this page is
    // one that looks calm when a third of the board is suspect, so the sheet
    // says how many are before a single frame is read. Counted from the "!"
    // flag, never from the in-flight split, which counts something else.
    expect(html).toContain('class="alarm">1 of 2 suspect<');
    expect(html).toContain("<span>building</span> <b>1</b>");
    expect(html).toContain("<span>parked</span> <b>1</b>");
  });

  // The card states what is happening and hides the depth behind a press. The
  // counts in the summary are the whole contract: a drawer that says "4 next"
  // and opens on two items is worse than no drawer, because the reader stops
  // looking. A project with nothing to disclose gets no drawer at all rather
  // than an empty one.
  it("counts what is in the drawer, and omits it when there is nothing", () => {
    const html = renderBoard(
      board({
        projects: [
          project({
            name: "deep",
            changed: 2, // in flight, so this one leads and carries depth
            next: { items: ["one", "two", "three"], source: "HANDOVER.md" },
            recent: [
              { at: "2026-10-20T11:00:00", subject: "a" },
              { at: "2026-10-19T11:00:00", subject: "b" },
            ],
          }),
          project({ name: "bare", last_commit: "2026-01-01T09:00:00" }),
        ],
      }),
      NOW,
    );
    const cards = html.split('<li class="cell');
    const deep = cards.find((card) => card.includes("deep")) ?? "";
    const bare = cards.find((card) => card.includes("bare")) ?? "";
    expect(deep).toContain("<summary>3 next · 2 recent</summary>");
    expect(deep).toContain("three");
    expect(bare).not.toContain("<details");
  });

  it("shows branch, subject, changed count and time in stage", () => {
    const html = renderBoard(
      board({
        projects: [
          project({ branch: "feature/x", subject: "Fix it", changed: 3 }),
        ],
      }),
      NOW,
    );
    expect(html).toContain("feature/x");
    expect(html).toContain("Fix it");
    expect(html).toContain("3 changed");
    expect(html).toContain("19d in stage");
  });
});

// The HISTORY section. Every one of these is a regression that would otherwise
// be caught only by opening a page: a chart that silently vanished, a guess
// presented as a record, or a stage name from the payload reaching the browser
// unescaped.
describe("renderProject history", () => {
  const full = () =>
    project({
      name: "alpha",
      weeks: [0, 3, 7, 0, 2, 5, 1, 0, 4, 6],
      week_start: "2026-08-11T12:00:00",
      first_commit: "2026-08-11T12:00:00",
      stage_history: [
        { stage: "idea", at: "2026-08-11T12:00:00", inferred: true },
        { stage: "building", at: "2026-09-01T12:00:00" },
      ],
      recent: [{ at: "2026-10-20T11:00:00", subject: "Add the thing" }],
    });

  it("renders a chart, a band and a scale line for a project with all fields", () => {
    const html = renderProject(board(), full(), NOW);
    expect(html).toContain("history");
    expect(html).toContain('class="hist-chart"');
    // One bar per bucket, and a zero bucket is a rule rather than nothing.
    expect(html.match(/class="hist-bar/g)?.length).toBe(10);
    expect(html.match(/class="hist-bar zero"/g)?.length).toBe(3);
    expect(html).toContain('class="hist-band"');
    expect(html.match(/class="hist-seg/g)?.length).toBe(2);
    expect(html).toContain('class="hist-scale"');
    // The chart is one labelled image, not 26 labelled bars.
    expect(html).toContain('role="img"');
    expect(html).toContain("28 commits over 10 weeks");
  });

  it("drops the label from a segment too narrow to hold it, keeping a title", () => {
    // A stage set minutes ago is a sliver of a ten-week span, and its label
    // used to clip to one or two stray glyphs at the band's right edge.
    const html = renderProject(
      board(),
      project({
        weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        week_start: "2026-08-11T12:00:00",
        first_commit: "2026-08-11T12:00:00",
        stage_history: [
          { stage: "idea", at: "2026-08-11T12:00:00", inferred: true },
          { stage: "building", at: "2026-10-20T11:30:00" },
        ],
      }),
      NOW,
    );
    // The list below the band carries every entry's label, so the slice has to
    // stop where the band does or it counts those too.
    const band = html.slice(html.indexOf('class="hist-band"'), html.indexOf('class="hist-list'));
    expect(band.match(/class="hist-seg/g)?.length).toBe(2);
    // The wide one keeps its label; the sliver carries a title instead.
    expect(band.match(/class="hist-stage"/g)?.length).toBe(1);
    expect(band).toContain('title="building, ');
  });

  it("says hours, not 0 days, for a stage set within the day", () => {
    // The card above the chart says "1h in stage". The trail said "0 days" for
    // the same fact, and zero of anything reads as "never happened".
    const html = renderProject(
      board(),
      project({
        weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        week_start: "2026-08-11T12:00:00",
        first_commit: "2026-08-11T12:00:00",
        stage_history: [
          { stage: "idea", at: "2026-08-11T12:00:00", inferred: true },
          { stage: "building", at: "2026-10-20T11:00:00" },
        ],
      }),
      NOW,
    );
    expect(html).not.toContain("0 days");
    expect(html).toContain("1 hour");
  });

  it("labels the left end of the scale with a date, not a duration", () => {
    // It sits opposite "now", so an instant belongs there. A duration there
    // read as a second, disagreeing copy of the segment's own length.
    const html = renderProject(board(), full(), NOW);
    const scale = html.slice(html.indexOf('class="hist-scale"'));
    expect(scale.slice(0, 200)).not.toContain("weeks");
    expect(scale).toContain("11 Aug");
  });

  it("renders the stage trail but no chart for a project with no git", () => {
    // For these projects the hand-set stage is the only history that will ever
    // exist, so the section must survive without a chart, and the trail prints
    // as a list because there is no axis for a band to align to.
    const html = renderProject(
      board(),
      project({
        has_git: false,
        weeks: [1, 2, 3],
        first_commit: "2026-08-11T12:00:00",
        stage_history: [{ stage: "idea", at: "2026-08-11T12:00:00" }],
      }),
      NOW,
    );
    expect(html).toContain("history");
    expect(html).not.toContain('class="hist-chart"');
    expect(html).not.toContain('class="hist-scale"');
    expect(html).not.toContain('class="hist-band"');
    expect(html).toContain('class="hist-list alone"');
    expect(html).toContain("idea");
  });

  it("renders no section at all when there is neither a first commit nor a stage trail", () => {
    // An empty box saying nothing is worse than no box.
    const html = renderProject(board(), project(), NOW);
    // The heading and the markup, not the word: the stylesheet always carries
    // .history rules, so a bare search for "history" can never pass.
    expect(html).not.toContain(">HISTORY<");
    expect(html).not.toContain('class="hist-');
  });

  it("marks an inferred entry with an asterisk and a footnote", () => {
    // Anti-goal one: a date that was invented and not marked. The mark has to
    // be text, because colour alone is not a channel.
    const html = renderProject(board(), full(), NOW);
    expect(html).toContain('class="hist-seg inferred"');
    expect(html).toContain("idea*");
    expect(html).toContain("Inferred from the first commit");
    expect(html).toContain("Not a recorded change");
  });

  it("escapes a stage name that contains HTML", () => {
    const html = renderProject(
      board(),
      project({
        first_commit: "2026-08-11T12:00:00",
        stage_history: [{ stage: "<script>x</script>", at: "2026-08-11T12:00:00" }],
      }),
      NOW,
    );
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
  });

  it("renders a version 2 payload exactly as before, with no history section", () => {
    // The Worker accepts version 2 while the CLI still sends it, so a payload
    // with none of the new fields must not grow a section.
    const html = renderProject(
      board({ version: 2 }),
      project({ recent: [{ at: "2026-10-20T11:58:00", subject: "Add the thing" }] }),
      NOW,
    );
    expect(html).toContain("alpha");
    // The drawer still renders from a version 2 payload's own fields. The
    // fixture has to carry a commit for that to mean anything; without one this
    // asserted the absence of a drawer nothing had asked for.
    expect(html).toContain("Add the thing");
    expect(html).not.toContain(">HISTORY<");
  });
});

describe("GET /", () => {
  it("reports an unknown payload version instead of rendering", async () => {
    // Review Focus 4: the CLI was upgraded and the Worker was not.
    await env.BOARD.put(
      "board:current",
      JSON.stringify({ ...board(), version: 99 }),
    );
    const res = await SELF.fetch("https://example.com/", { headers: VIEW_COOKIE });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("older than the CLI");
    expect(html).toContain("redeploy");
    expect(html).not.toContain("alpha");
    expect(html).not.toContain('class="row');
  });

  it("serves non-ASCII text with a utf-8 charset", async () => {
    // Review Focus 5: the charset has to be explicit or the phone guesses.
    await env.BOARD.put(
      "board:current",
      JSON.stringify(
        board({
          projects: [project({ name: "café", subject: "日本語のコミット" })],
        }),
      ),
    );
    const res = await SELF.fetch("https://example.com/", { headers: VIEW_COOKIE });
    expect(res.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    const html = await res.text();
    expect(html).toContain("café");
    expect(html).toContain("日本語のコミット");
  });

  it("renders the empty state when KV is empty", async () => {
    const res = await SELF.fetch("https://example.com/", { headers: VIEW_COOKIE });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    const html = await res.text();
    expect(html).toContain("wipboard push");
    expect(html).not.toContain('class="row');
  });
});

// A prose typo in the stylesheet is not a cosmetic problem. An unopened `*/`
// in :root on 2026-11-04 made the CSS parser swallow the --wax declaration
// that followed it, so the suspect strike vanished from the light scheme
// while tsc and every other test stayed green; only a screenshot caught it.
// This is the cheapest mechanical version of that screenshot.
describe("the stylesheet", () => {
  it("has no unbalanced comment delimiter eating the declaration after it", () => {
    const html = renderEmpty();
    const css = html.slice(html.indexOf("<style>") + 7, html.indexOf("</style>"));
    expect(css.replace(/\/\*[\s\S]*?\*\//g, "")).not.toContain("*/");
    // A token from the end of :root, so a declaration swallowed anywhere in
    // the block fails this. --hot is the one the whole page's alarm is drawn
    // in; it was --wax until the sheet became an instrument on 2026-11-04.
    expect(css).toMatch(/:root\s*\{[\s\S]*?--hot:/);
    expect(css).toMatch(/:root\s*\{[\s\S]*?--develop:/);
  });

  // Both of these are invisible in the markup, so no other test can see them
  // go. They were added on 2026-11-07 after a phone pass: the two ages ran
  // together as "26d 35d" without the divider, and the only link off the
  // board measured 21px tall without the padding, under WCAG 2.5.8's 24.
  it("keeps the divider between the two ages and the link's tap padding", () => {
    const css = renderEmpty().match(/<style>([\s\S]*?)<\/style>/)![1];
    expect(css).toMatch(/\.in-stage::before\s*\{[\s\S]*?content:/);
    expect(css).toMatch(/\.name a\s*\{[^}]*padding-block:/);
  });

  // Found by measuring the live page at 375px on 2026-11-08, not by reading
  // it: "back to the board" was a 13px strip and the drawer's summary 21px,
  // both under WCAG 2.5.8's 24. The back link is the only way off a project
  // page on a phone, which is the device this board exists to be read on.
  it("gives the back link and the drawer summary a 24px tap target", () => {
    const css = renderEmpty().match(/<style>([\s\S]*?)<\/style>/)![1];
    expect(css).toMatch(/\.back a\s*\{[^}]*min-height:\s*24px/);
    expect(css).toMatch(/\.drawer > summary\s*\{[^}]*min-height:\s*24px/);
  });

  // The HISTORY rules are CSS-only facts: no markup assertion can see a bar
  // that lost its height, a zero bucket that stopped being a rule, or a band
  // that stopped collapsing on a phone. Each of these is the rule that carries
  // one of those, so a swallowed declaration fails here rather than on a
  // screenshot.
  it("keeps the history chart, band and phone list rules", () => {
    const css = renderEmpty().match(/<style>([\s\S]*?)<\/style>/)![1];
    expect(css).toMatch(/\.hist-chart\s*\{[^}]*align-items:\s*flex-end/);
    expect(css).toMatch(/\.hist-bar\s*\{[^}]*height:\s*var\(--h/);
    expect(css).toMatch(/\.hist-bar\.zero\s*\{[^}]*height:\s*1px/);
    expect(css).toMatch(/\.hist-band\s*\{[^}]*position:\s*relative/);
    expect(css).toMatch(/\.hist-seg\s*\{[^}]*left:\s*var\(--l/);
    expect(css).toMatch(/\.hist-seg\s*\{[^}]*width:\s*var\(--w/);
    expect(css).toMatch(/\.hist-list\s*\{[^}]*display:\s*none/);
    // The band collapses to the list below the breakpoint the tally already
    // uses, or a short segment clips its label at phone width.
    expect(css).toMatch(/@media \(max-width: 33\.99rem\)\s*\{[\s\S]*?\.hist-band\s*\{\s*display:\s*none/);
    expect(css).toMatch(/@media \(max-width: 33\.99rem\)\s*\{[\s\S]*?\.hist-list\s*\{\s*display:\s*block/);
    // The alarm colour means suspect and nothing else, so the band must never
    // be drawn in it.
    // Comments stripped first. The history block carries a comment saying the
    // band must never be --hot, and a raw substring search matches the warning
    // itself, so the guard failed on the very rule it was written to protect.
    const history = css
      .slice(css.indexOf(".history {"))
      .replace(/\/\*[\s\S]*?\*\//g, "");
    expect(history).not.toContain("--hot");
  });
});
