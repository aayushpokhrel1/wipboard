import {
  PAYLOAD_VERSION,
  renderBoard,
  renderEmpty,
  renderProject,
  renderProjectMissing,
  renderVersionMismatch,
} from "./render";
import type { Board } from "./render";

const MAX_BODY_BYTES = 1048576;
const BOARD_KEY = "board:current";
const VIEW_COOKIE = "wipboard_view";
const VIEW_MAX_AGE = 60 * 60 * 24 * 365;

async function digest(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
}

// Constant-time comparison over fixed-length digests: never short-circuits on
// length, and never reveals how much of the token matched.
async function tokenMatches(presented: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([digest(presented), digest(expected)]);
  return crypto.subtle.timingSafeEqual(a, b);
}

function bearerToken(request: Request): string {
  const header = request.headers.get("Authorization") ?? "";
  const prefix = "Bearer ";
  return header.startsWith(prefix) ? header.slice(prefix.length) : "";
}

function unauthorized(): Response {
  return new Response("unauthorized", { status: 401 });
}

// Only the exact string "access" turns the Worker's own check off. Anything
// else, including an absent var, means token mode. The open mode has to be
// opted into by name: a typo or a stripped var must never publish the board.
function usesAccess(env: Env): boolean {
  // Widened on purpose: wrangler types AUTH_MODE as the literal in
  // wrangler.jsonc, which makes a comparison against any other value look like
  // dead code to tsc even though the deployed var can be anything.
  const mode: string = env.AUTH_MODE ?? "";
  return mode === "access";
}

function cookieValue(request: Request, name: string): string {
  const header = request.headers.get("Cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return "";
}

/** Exchange ?k=<token> for a cookie, then redirect away from the URL carrying it. */
async function login(request: Request, env: Env): Promise<Response> {
  const expected = env.VIEW_TOKEN ?? "";
  if (!expected) return viewUnconfigured();
  const presented = new URL(request.url).searchParams.get("k") ?? "";
  if (!(await tokenMatches(presented, expected))) return unauthorized();
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/",
      // The redirect is immediate so the token does not stay in the address
      // bar. It is still in browser history: documented, not solved.
      "Set-Cookie":
        `${VIEW_COOKIE}=${encodeURIComponent(expected)}; Path=/; Max-Age=${VIEW_MAX_AGE}; ` +
        "HttpOnly; Secure; SameSite=Lax",
    },
  });
}

function viewUnconfigured(): Response {
  // Fail closed. Serving the board because configuration is missing is how a
  // private project list ends up indexed.
  return new Response(
    "wipboard is in token mode but VIEW_TOKEN is not set, so it will not serve the " +
      "board. Set it with `wrangler secret put VIEW_TOKEN`, or deploy with " +
      "AUTH_MODE=access if something upstream already authenticates viewers.",
    { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
}

/** Whether this request may see the board. */
async function mayView(request: Request, env: Env): Promise<Response | null> {
  if (usesAccess(env)) return null;
  const expected = env.VIEW_TOKEN ?? "";
  if (!expected) return viewUnconfigured();
  const presented = decodeURIComponent(cookieValue(request, VIEW_COOKIE));
  return (await tokenMatches(presented, expected)) ? null : unauthorized();
}

async function ingest(request: Request, env: Env): Promise<Response> {
  // Size first, before the body is read at all. A missing or unparseable
  // Content-Length is refused rather than defaulted: without it a chunked body
  // would reach request.text() unbounded, which is how a Worker runs out of
  // memory. The pusher always sets it.
  const header = request.headers.get("Content-Length");
  const declared = header === null ? NaN : Number(header);
  if (!Number.isFinite(declared)) {
    return new Response("length required", { status: 411 });
  }
  if (declared > MAX_BODY_BYTES) {
    return new Response("payload too large", { status: 413 });
  }

  if (!(await tokenMatches(bearerToken(request), env.BOARD_TOKEN))) {
    return unauthorized();
  }

  const body = await request.text();

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response("invalid JSON", { status: 400 });
  }

  if (typeof payload !== "object" || payload === null) {
    return new Response("invalid payload: version", { status: 400 });
  }

  const version = (payload as { version?: unknown }).version;
  if (version !== PAYLOAD_VERSION) {
    return new Response(`unsupported payload: version must be ${PAYLOAD_VERSION}`, {
      status: 400,
    });
  }

  await env.BOARD.put(BOARD_KEY, body);
  return new Response(null, { status: 204 });
}

function html(body: string): Response {
  // The charset is explicit: without it a phone guesses, and a non-ASCII name
  // or commit subject arrives as mojibake.
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/** The stored board, or the response that should be served instead of one. */
async function readBoard(env: Env): Promise<Board | Response> {
  const stored = await env.BOARD.get(BOARD_KEY);
  if (stored === null) {
    return html(renderEmpty());
  }

  let payload: unknown;
  try {
    payload = JSON.parse(stored);
  } catch {
    return html(renderEmpty());
  }

  // A version this Worker does not know means the CLI was upgraded and the
  // Worker was not. Say so rather than throwing or rendering half a board.
  const version = (payload as { version?: unknown } | null)?.version;
  if (version !== PAYLOAD_VERSION) {
    return html(renderVersionMismatch(version));
  }

  return payload as Board;
}

async function dashboard(env: Env): Promise<Response> {
  const board = await readBoard(env);
  return board instanceof Response ? board : html(renderBoard(board, new Date()));
}

// Every state of the project route reuses the board's own empty and mismatch
// pages, so the two routes fail identically rather than inventing a second set
// of failure screens to keep in step.
async function projectPage(env: Env, name: string): Promise<Response> {
  const board = await readBoard(env);
  if (board instanceof Response) return board;
  const project = board.projects.find((candidate) => candidate.name === name);
  if (project === undefined) {
    return new Response(renderProjectMissing(name), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  return html(renderProject(board, project, new Date()));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/api/board") {
      return ingest(request, env);
    }
    if (request.method === "GET" && url.pathname === "/login" && !usesAccess(env)) {
      return login(request, env);
    }
    if (request.method === "GET" && url.pathname === "/") {
      const refusal = await mayView(request, env);
      return refusal ?? dashboard(env);
    }
    // A project page shows the same private project list the board does, so it
    // goes through the same gate. A new route that reads BOARD without calling
    // mayView first is how this board gets published by accident.
    if (request.method === "GET" && url.pathname.startsWith("/p/")) {
      const refusal = await mayView(request, env);
      if (refusal) return refusal;
      let name: string;
      try {
        name = decodeURIComponent(url.pathname.slice("/p/".length));
      } catch {
        // A malformed percent-escape is a bad URL, not a server fault.
        return new Response("not found", { status: 404 });
      }
      return projectPage(env, name);
    }
    return new Response("not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

