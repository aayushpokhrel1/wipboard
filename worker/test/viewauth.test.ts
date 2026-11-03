import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import worker from "../src/index";

const VIEW_TOKEN = "view-token-for-tests";
const BOARD = {
  version: 2,
  generated_at: "2026-10-22T12:00:00",
  host: "H",
  projects: [
    {
      name: "alpha", stage: "building", note: "", last_commit: "2026-10-22T11:00:00",
      stage_set_at: "2026-10-01T09:00:00", flags: [], has_git: true,
      branch: "main", subject: "s", changed: 0,
    },
  ],
};

// Config reaches the Worker through env, never through the request. A header
// that selected the auth mode would let any caller ask for the unprotected one.
function withEnv(overrides: Record<string, unknown>): Env {
  return { ...env, ...overrides } as Env;
}

// The handler takes (request, env) and schedules no background work, so there
// is no ExecutionContext to create or wait on.
async function get(path: string, overrides: Record<string, unknown>, headers: HeadersInit = {}) {
  return worker.fetch(new Request(`https://x${path}`, { headers }), withEnv(overrides));
}

beforeEach(async () => {
  await env.BOARD.put("board:current", JSON.stringify(BOARD));
});

describe("token mode", () => {
  it("refuses the dashboard without a cookie", async () => {
    const response = await get("/", { AUTH_MODE: "token", VIEW_TOKEN });
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("alpha");
  });

  it("refuses a login with the wrong token", async () => {
    const response = await get("/login?k=wrong", { AUTH_MODE: "token", VIEW_TOKEN });
    expect(response.status).toBe(401);
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });

  it("sets a hardened cookie on a correct login and redirects away from the token", async () => {
    const response = await get(`/login?k=${VIEW_TOKEN}`, { AUTH_MODE: "token", VIEW_TOKEN });
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/");
    const cookie = response.headers.get("Set-Cookie") ?? "";
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("serves the board once the cookie is presented", async () => {
    const login = await get(`/login?k=${VIEW_TOKEN}`, { AUTH_MODE: "token", VIEW_TOKEN });
    const cookie = (login.headers.get("Set-Cookie") ?? "").split(";")[0];
    const response = await get("/", { AUTH_MODE: "token", VIEW_TOKEN }, { Cookie: cookie });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("alpha");
  });

  it("fails CLOSED when VIEW_TOKEN is not set", async () => {
    // The most important test here. Someone who deploys without reading the
    // README must get a locked board, not their project list on the internet.
    const response = await get("/", { AUTH_MODE: "token", VIEW_TOKEN: undefined });
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("alpha");
  });

  it("treats an absent AUTH_MODE as token mode, not as access", async () => {
    // Fail-closed on a missing var too: the open mode must be opted into.
    const response = await get("/", { AUTH_MODE: undefined, VIEW_TOKEN });
    expect(response.status).toBe(401);
  });
});

describe("access mode", () => {
  it("serves the board directly, since Access is in front", async () => {
    const response = await get("/", { AUTH_MODE: "access" });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("alpha");
  });

  it("has no login route, since the cookie means nothing here", async () => {
    const response = await get(`/login?k=${VIEW_TOKEN}`, { AUTH_MODE: "access", VIEW_TOKEN });
    expect(response.status).toBe(404);
  });
});

// The project route reads the same private project list the board does. A new
// route that reaches KV without going through mayView first is how this board
// gets published by accident, so it is tested the same way the board is.
describe("the project route", () => {
  beforeEach(async () => {
    await env.BOARD.put("board:current", JSON.stringify(BOARD));
  });

  it("refuses a viewer with no cookie, in token mode", async () => {
    const response = await get("/p/alpha", { VIEW_TOKEN, AUTH_MODE: "token" });
    expect(response.status).toBe(401);
    const body = await response.text();
    expect(body).not.toContain("alpha");
  });

  it("refuses to serve when VIEW_TOKEN is unset rather than opening up", async () => {
    const response = await get("/p/alpha", { VIEW_TOKEN: "", AUTH_MODE: "token" });
    expect(response.status).toBe(503);
  });

  it("serves the project once the cookie is presented", async () => {
    const response = await get(
      "/p/alpha",
      { VIEW_TOKEN, AUTH_MODE: "token" },
      { Cookie: `wipboard_view=${encodeURIComponent(VIEW_TOKEN)}` },
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("alpha");
  });

  it("404s a name that is not on the board, without leaking the board", async () => {
    const response = await get(
      "/p/nope",
      { VIEW_TOKEN, AUTH_MODE: "token" },
      { Cookie: `wipboard_view=${encodeURIComponent(VIEW_TOKEN)}` },
    );
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("alpha");
  });

  it("round-trips a name needing encoding, so the link is the lookup", async () => {
    await env.BOARD.put(
      "board:current",
      JSON.stringify({
        ...BOARD,
        projects: [{ ...BOARD.projects[0], name: "a b & c" }],
      }),
    );
    const response = await get(
      `/p/${encodeURIComponent("a b & c")}`,
      { VIEW_TOKEN, AUTH_MODE: "token" },
      { Cookie: `wipboard_view=${encodeURIComponent(VIEW_TOKEN)}` },
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("a b &amp; c");
  });

  it("404s a malformed percent-escape rather than throwing", async () => {
    const response = await get(
      "/p/%E0%A4%A",
      { VIEW_TOKEN, AUTH_MODE: "token" },
      { Cookie: `wipboard_view=${encodeURIComponent(VIEW_TOKEN)}` },
    );
    expect(response.status).toBe(404);
  });
});
