import { env, SELF } from "cloudflare:test";

// The Worker runs in token mode under .dev.vars, so these GET / tests have to
// authenticate like a browser would. They predate the view auth.
const VIEW_COOKIE = { Cookie: "wipboard_view=view-token-for-tests" };
import { describe, expect, it } from "vitest";
import { renderBoard, type Board } from "../src/render";

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
    version: 1,
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
    const sheet = html.slice(html.indexOf('<ol class="sheet"'));
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
    // Three channels, only one of which is colour: the wax ring the class
    // draws, the struck frame number, and the literal flag.
    expect(html).toContain("suspect");
    expect(html).toContain('class="flag">!<');
    expect(html).toContain("<span>building</span> <b>1</b>");
    expect(html).toContain("<span>parked</span> <b>1</b>");
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
