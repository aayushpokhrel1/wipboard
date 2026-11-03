import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const TOKEN = "local-dev-token-not-a-real-secret";
const URL = "https://example.com/api/board";

const PAYLOAD = {
  version: 2,
  generated_at: "2026-10-20T12:00:00",
  host: "H",
  projects: [],
};

function post(body: string, headers: Record<string, string> = {}): Promise<Response> {
  return SELF.fetch(URL, { method: "POST", body, headers });
}

function auth(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

describe("POST /api/board", () => {
  it("rejects a request with no token", async () => {
    const res = await post(JSON.stringify(PAYLOAD));
    expect(res.status).toBe(401);
    expect(await env.BOARD.get("board:current")).toBeNull();
  });

  it("rejects a request with a wrong token", async () => {
    const res = await post(JSON.stringify(PAYLOAD), auth("not-the-token"));
    expect(res.status).toBe(401);
    expect(await env.BOARD.get("board:current")).toBeNull();
  });

  it("stores a valid payload and returns 204", async () => {
    const res = await post(JSON.stringify(PAYLOAD), auth(TOKEN));
    expect(res.status).toBe(204);
    const stored = await env.BOARD.get("board:current");
    expect(JSON.parse(stored as string)).toEqual(PAYLOAD);
  });

  it("rejects an unknown payload version", async () => {
    const res = await post(JSON.stringify({ ...PAYLOAD, version: 99 }), auth(TOKEN));
    expect(res.status).toBe(400);
  });

  it("rejects a body over 1 MiB by Content-Length", async () => {
    const res = await post(JSON.stringify(PAYLOAD), {
      ...auth(TOKEN),
      "Content-Length": String(1048576 + 1),
    });
    expect(res.status).toBe(413);
    expect(await env.BOARD.get("board:current")).toBeNull();
  });
});

it("refuses a body with no Content-Length", async () => {
  // Catches the unbounded read: without the header a chunked body would be
  // buffered whole by request.text().
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  void writer.write(new TextEncoder().encode("{}")).then(() => writer.close());
  const response = await SELF.fetch("https://x/api/board", {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: readable,
    duplex: "half",
  } as RequestInit);
  expect(response.status).toBe(411);
});
