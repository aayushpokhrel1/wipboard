# wipboard

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python 3.11+](https://img.shields.io/badge/python-3.11%2B-blue.svg)](https://www.python.org/)
![CLI dependencies: none](https://img.shields.io/badge/CLI%20dependencies-0-brightgreen.svg)
[![Claude Code plugin](https://img.shields.io/badge/Claude%20Code-plugin-6E56CF.svg)](#use)

**A board for the repos you forgot about.**

Every other project tracker asks you to type your status in. This one reads it out of git.
Branch, last commit, uncommitted work, unpushed commits: all derived on every run, so the
board physically cannot be stale about activity. The only thing you ever type is the one
field a machine cannot infer, which cycle a project is in.

> **Status: pre-release.** Not yet published to PyPI. Install from source (see below).

<img src="https://raw.githubusercontent.com/aayushpokhrel1/wipboard/main/docs/board.svg" alt="wipboard printing a board of eight projects, each with a stage, how long ago it was last committed to, and flags for suspect, stuck, uncommitted and unpushed work" width="717">

*Real output from throwaway repos, not a mockup. Regenerate with*
*`python scripts/demo_board.py | python scripts/board_svg.py > docs/board.svg`.*

## Install

```bash
uv tool install wipboard        # once published
pipx install wipboard           # or this
```

From source:

```bash
git clone https://github.com/aayushpokhrel1/wipboard && cd wipboard && uv tool install .
```

Python 3.11+. The CLI has no dependencies, standard library only. (The optional Worker in
`worker/` has its own dev dependencies; nothing you install to run `wipboard` does.)

## Use

```bash
wipboard init ~/code            # register a folder of repos, discover them one level deep
                                # a project that is itself a folder of repos counts as one
wipboard                        # the board, stalest first
wipboard set Budgerr spec --note "waiting on an API key"
wipboard md PROJECTS.md         # write a markdown board for GitHub or your phone
```

Stages are fixed: `idea spec building testing shipped parked`. The freeform `--note` holds
the messy truth that a stage name cannot.

## The three flags

| Flag | Means |
| --- | --- |
| `!` | The repo has commits newer than the last stage change. The stage you are reading may be a lie. |
| `stuck Nd` | The stage has not changed in over 30 days while commits kept landing. |
| `dirty` / `^N` | Uncommitted or unpushed work, the kind that actually gets lost. |

The `!` flag is the point of the tool. A board you have to remember to update is a board
that lies to you; this one tells you when it is lying.

## Read it from your phone

The board is a terminal tool, and a terminal is not on your phone. `worker/` is an optional
Cloudflare Worker that gives you the same board as a web page:

```bash
wipboard push          # sends the current board to your Worker
```

Tapping a project opens its own page: what is next, the recent commits with the older ones
behind a drawer, any uncommitted paths, and a history section with a weekly commit chart
spanning the project's own life and the trail of its stage changes.

Push from your `post-commit` hook and it updates on every commit in any repo. Deployment,
the token, and access control are in [docs/OPERATIONS.md](docs/OPERATIONS.md). Nothing in the
CLI needs it, and nothing is sent anywhere until you configure an endpoint.

**Two ways to keep it private.** The board is your whole project list, so the Worker refuses
to serve it until one of them is configured.

- `AUTH_MODE: "token"`, the default. The Worker guards the board itself. Set a `VIEW_TOKEN`
  secret, open `https://your-worker/login?k=<token>` once on each device, and a hardened
  cookie does the rest. Works on a free `workers.dev` subdomain with no domain of your own.
- `AUTH_MODE: "access"`. The Worker checks nothing and trusts whatever is in front of it,
  which must actually be there. Cloudflare Access gives you real identity, MFA and an audit
  log, but it only protects hostnames in a zone you own, so this path needs a domain.

If `AUTH_MODE` is anything other than the exact string `access`, token mode applies, and if
`VIEW_TOKEN` is unset the board returns 503 rather than rendering. A missing or misspelled
variable locks the board; it never publishes it.

Token mode is deliberately modest: no sessions, no per-device revocation, no MFA, and
rotating `VIEW_TOKEN` signs out every device at once. The login URL carries the token, so it
lands in browser history even though you are redirected away from it immediately. If you want
more than that, use Access.

**It is a snapshot, deliberately.** A Worker cannot read your machine, so the page shows the
last board you pushed. That is the one way this tool can lie to you, so the page leads with
its own age: normal under an hour, amber over an hour, and over a day it says plainly that
the machine has probably been off. Treat it as a report you refresh, not a live view.

## Make it unavoidable

The board is only useful if you see it without choosing to. Add it to your shell profile:

```bash
alias projects=wipboard
```

Claude Code users: the repo is also a plugin, so `/wipboard` reads and updates the board
mid-conversation. See [docs/OPERATIONS.md](docs/OPERATIONS.md) for a `SessionStart` hook that
prints the board every time you open a session.

## Where things are written down

| File | What it holds |
| --- | --- |
| `README.md` | This file: what it is, install, usage |
| `PRODUCT.md` | Who it is for, decisions, what is deferred and why |
| `DESIGN.md` | The dashboard's visual system. The CLI's table is not covered; its rules live in the code |
| `docs/OPERATIONS.md` | Run, verify, release, deploy the dashboard, hook setup, traps |
| `worker/` | The optional Cloudflare Worker behind the phone dashboard |
| `docs/superpowers/specs/` | The design of one feature, written before building it |
| `CLAUDE.md` | How to work in this repo |

## Licence

MIT.
