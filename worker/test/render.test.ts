import { env, SELF } from "cloudflare:test";

// The Worker runs in token mode under .dev.vars, so these GET / tests have to
// authenticate like a browser would. They predate the view auth.
const VIEW_COOKIE = { Cookie: "wipboard_view=view-token-for-tests" };
import { describe, expect, it } from "vitest";
import { renderBoard, renderEmpty, type Board } from "../src/render";

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
});
