# Operations

## Run

```bash
python wipboard.py            # straight from source, no install
uv tool install .             # install the console script locally
wipboard                      # then this works anywhere
```

## Verify

```bash
python -m pytest              # 54 tests, the whole suite
```

**pytest is required.** `python test_wipboard.py` runs nothing and exits 0, because the tests
take pytest fixtures and the file has no `__main__` block. This file claimed otherwise until
2026-10-21, which is worse than saying nothing: it hands you a green exit code from a command
that tested none of the code.

The suite builds throwaway git repos in a temp directory and commits to them, so it needs
`git` on PATH and a committer identity. CI sets one; locally your global `user.name` and
`user.email` cover it. If a test fails with "Author identity unknown", that is the cause.

## Release

PyPI, when the tool is ready to publish:

```bash
uv build
uv publish                    # needs a PyPI token in UV_PUBLISH_TOKEN
```

Bump `version` in `pyproject.toml` first. Tag the commit to match.

## Make the board unavoidable

The tool only fixes forgetting if you see the board without deciding to. Two ways:

**Shell profile.** PowerShell (`$PROFILE`):

```powershell
function projects { wipboard }
```

Bash or zsh:

```bash
alias projects=wipboard
```

**Claude Code SessionStart hook.** Prints the board every time a session opens, in any
project. In `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      { "matcher": "startup", "hooks": [{ "type": "command", "command": "wipboard" }] }
    ]
  }
}
```

This hook belongs in your own settings, not in this repo. A tool that edits a stranger's
Claude config on install would be a bad citizen.

## The dashboard Worker

Optional. `worker/` holds a Cloudflare Worker that stores one pushed board in KV and serves it
as a web page. The CLI does not need it and sends nothing anywhere until `endpoint` is set.

### Verify the Worker

```bash
npm --prefix worker test
```

34 tests plus `tsc --noEmit`, run in the real Workers runtime via
`@cloudflare/vitest-pool-workers`, not a mock.

### First deploy

Run from `worker/`. **These steps were run end to end on 2026-10-22** and the commands below
are the ones that actually worked, not the ones first written down.

```bash
npx wrangler login
```

The KV namespace already exists and its id is in `worker/wrangler.jsonc`. Recreate it only for
a fresh account:

```bash
npx wrangler kv namespace create BOARD
```

Generate a token and set it as a secret. Use a real random value, not a memorable one: it is
the only thing standing between the internet and your board.

Generate a token, then set it **with `secret bulk`, not `secret put`**. Piping a value into
`secret put` from PowerShell appends a line ending, and the stored secret silently stops
matching what you wrote down; that cost an hour of 401s on the first deploy.

```powershell
$t = python -c "import secrets; print(secrets.token_urlsafe(32))"
$enc = New-Object System.Text.UTF8Encoding $false
$tmp = Join-Path $env:TEMP 'wb-secrets.json'
[System.IO.File]::WriteAllText($tmp, (@{ BOARD_TOKEN = $t } | ConvertTo-Json -Compress), $enc)
npx wrangler secret bulk $tmp
Remove-Item $tmp -Force
```

Then deploy, **from inside `worker/`**:

```bash
npx wrangler deploy
```

From the repo root, use the script rather than reaching for `npm --prefix worker exec`:

```bash
npm --prefix worker run deploy
```

`--prefix` tells npm where to resolve the package, not where to run it, so `exec` leaves
wrangler in the repo root with no `wrangler.jsonc` beside it. It does not say the config is
missing. It guesses you meant a static site and fails with **"Could not detect a directory
containing static files (e.g. html, css and js) for the project"**, which sends you looking at
the Worker instead of at your working directory. `npm run` executes in the package directory,
so the script form is correct from anywhere. Hit on 2026-11-07.

No `--var` flag: this deployment runs in **token mode** with Access in front, which is the
tracked default, so there is nothing to override and nothing to forget on a later deploy. Set
`VIEW_TOKEN` the same way as above. Deploy creates the DNS record for
`wipboard.enamelvault.com` and prints it.

### Lock it down BEFORE pushing a real board

Your board is a complete list of your projects with candid notes on each, so access control
comes **before** the first `wipboard push`, not after. The empty page is harmless; the
populated one is not.

**Cloudflare Access cannot protect a `*.workers.dev` hostname.** Access applications are
defined against hostnames in a zone on your account, and `workers.dev` belongs to Cloudflare.
This is why `wrangler.jsonc` deploys to `wipboard.enamelvault.com` and sets
`workers_dev: false`. Leaving `workers_dev: true` would keep an unauthenticated copy of the
board answering at `wipboard.aayus-pok.workers.dev`, straight around the policy you are about
to write.

In the Zero Trust dashboard, <https://one.dash.cloudflare.com>:

1. **Access, Applications, Add an application, Self-hosted.**
2. Name `wipboard`. Session duration is how often your phone re-authenticates; a month is
   reasonable for a board only you read.
3. Public hostname: subdomain `wipboard`, domain `enamelvault.com`, path empty.
4. Policy: name it, Action **Allow**, Include **Emails**, your address. Save.
5. **Add a second application** for the same hostname with path `api/board`, and give it one
   policy with Action **Bypass** and Include **Everyone**.

Step 5 is not optional and is the easiest thing to get wrong. Access authenticates humans
through an email round trip, which a scheduled task cannot complete, so an application
covering the whole hostname locks out your own pusher. Access matches the most specific path
first, so the `api/board` application wins there. That path is protected by the bearer token
instead, compared in constant time in `worker/src/index.ts`.

Confirm both halves before trusting it:

```powershell
curl.exe -sI https://wipboard.enamelvault.com/ | Select-Object -First 1
```

**`curl.exe`, not `curl`.** In PowerShell the bare name is an alias for `Invoke-WebRequest`,
which rejects curl's flags with a misleading "Missing an argument for parameter
'SessionVariable'". Use `NUL`, not `/dev/null`, for the same reason.

That should be a `302` to a login, not a `200`. And `wipboard push` must still succeed: it is
the Bypass policy on `api/board` that keeps it working.

Verified on 2026-10-26: `GET /` returns 302, `POST /api/board` without a token returns 401
from the Worker rather than a login redirect, and `wipboard.aayus-pok.workers.dev` returns
404, so `workers_dev: false` is holding. Re-verified on 2026-11-07 after deploying
`3753ab2e`.

#### Tightening `api/board` from Bypass to Service Auth

**Bypass means Everyone.** Access waves every request on that path straight through to the
Worker, so the bearer token is the only thing standing in front of the ingest route. That is
a real gate, not a hole, but it is one gate where the rest of the hostname has two. A service
token closes the difference: Access checks a credential at the edge before the Worker is ever
reached, and the bearer still decides whether the body may be written.

**Do it in this order, and the push never breaks.** A service token sent to a Bypass policy
is ignored, so the CLI can be carrying one long before the policy changes.

1. **Zero Trust, Access, Service Auth, Create Service Token.** Name it `wipboard-push`. The
   Client Secret is shown once.
2. Add `access_client_id` and `access_client_secret` to `~/.config/wipboard/config.json`.
   That one file covers both callers: `wipboard-push.cmd` sets no environment variables, so
   the scheduled task reads the same config as your shell. The `WIPBOARD_ACCESS_CLIENT_ID`
   and `WIPBOARD_ACCESS_CLIENT_SECRET` variables exist and override the file, but nothing
   here needs them.
3. Run `wipboard push` and confirm it still succeeds. It is still going through Bypass here;
   this step only proves the headers do no harm.
4. **Only now** edit the `api/board` application: replace the Bypass policy with one whose
   Action is **Service Auth** and whose Include is **Service Token**, `wipboard-push`.
5. Run `wipboard push` again. A success means the token is being read.

Both halves or neither: the CLI refuses a half-configured token by name rather than letting
Access reject it.

Done on 2026-11-08 through the API rather than the dashboard. The Bypass policy was
**detached, not deleted**: it is a reusable account-level policy, so `DELETE` on the app's
policy endpoint returns 12130 "can not delete reusable policies through this endpoint". It
still exists at account level and re-attaching it is the rollback.

**Rollback:** attach the account-level Bypass policy back to the `api/board` application.
That returns the endpoint to its pre-2026-11-08 state and the push works again at once. The
CLI needs no change; a service token sent to a Bypass policy is ignored.

#### What a rejection actually looks like, measured

Worth knowing before you debug one, because Access does not answer the same way every time.
Measured on 2026-11-08 against this endpoint:

| Request | Access answers | `wipboard push` |
| --- | --- | --- |
| Correct service token | passes to the Worker | `Pushed N project(s)`, exit 0 |
| Wrong Client Secret | `401` | `failed: HTTP 401`, exit 2 |
| No token at all, Service Auth policy | `403` | `failed: HTTP 403`, exit 2 |
| No token where an **identity** policy matches | `302` to the login page | `Push was redirected to ...`, exit 2 |

Only the last row is the dangerous one, and only the guard in `_post` makes it safe. urllib
follows a redirected POST as a GET, so without that check the push fetches the login page,
sees `200`, and prints `Pushed N project(s)` having delivered nothing. It needs an identity
policy to match, which is not the case today but becomes the case the moment the `api/board`
application is deleted or its path edited, because then the hostname-wide `wipboard`
application takes over that path. That is an ordinary mistake with a silent, permanent
consequence on an unattended 15-minute schedule.

**Check the failure, not just the success,** and check the right one. The first three rows
are ordinary HTTP errors. To exercise the guard itself, point the CLI at the hostname root
with no service token configured:

```bash
WIPBOARD_ENDPOINT=https://wipboard.enamelvault.com/ wipboard push
```

It must exit 2 saying the push was redirected, and the message must name the origin only. An
Access login URL carries a per-request JWT hundreds of characters long, and this message
lands in an append-only log every 15 minutes. If it instead prints `Pushed N project(s)`, the
guard is gone; a test covers it and the comment at `_post` in `wipboard.py` says why.

### Point the CLI at it

`~/.config/wipboard/config.json`:

```json
{
  "endpoint": "https://wipboard.enamelvault.com/api/board",
  "token": "the same value you gave wrangler secret put",
  "access_client_id": "optional, only with an Access Service Auth policy",
  "access_client_secret": "optional, the other half of the same token"
}
```

`WIPBOARD_ENDPOINT` and `WIPBOARD_TOKEN` override the file, which is how a scheduled task
passes them without one, and so do `WIPBOARD_ACCESS_CLIENT_ID` and
`WIPBOARD_ACCESS_CLIENT_SECRET`. The two Access values are optional and must be set together;
see the Service Auth section above. Then:

```bash
wipboard push
```

### Keep it fresh

The page is only as current as the last push, so push on events rather than hoping.

**On every commit, in any repo.** Append to the user-global hook at
`~/.config/git/hooks/post-commit` (the one `core.hooksPath` already points at):

```bash
wipboard push >/dev/null 2>&1 &
```

Backgrounded and silenced on purpose: a commit must never wait on, or fail because of, the
network.

**After a stage change.** `wipboard set ...; wipboard push`.

**Every 15 minutes**, to catch dirty trees and elapsed time, via Task Scheduler:

```powershell
$action = New-ScheduledTaskAction -Execute 'wipboard' -Argument 'push'
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
  -RepetitionInterval (New-TimeSpan -Minutes 15)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'wipboard push' -Action $action -Trigger $trigger `
  -Settings $settings
```

The settings are not optional on a laptop: without them the task is suspended on battery,
which is exactly when the machine is away from the desk and the board is being read on a
phone.

Check it with `(Get-ScheduledTaskInfo -TaskName 'wipboard push').LastTaskResult`. **0 is
success**; anything else means the board is quietly freezing while the task reports itself
as scheduled, so this is worth looking at once rather than trusting.

#### Register it through a windowless launcher, or it pops a terminal every 15 minutes

A task that runs as the logged-on user gets a real console window whenever its action is
`wipboard`, a `.cmd`, `cmd.exe` or `powershell.exe`, so the desktop flashes a terminal four
times an hour. PowerShell's own `-WindowStyle Hidden` does not prevent it: the console is
created before the style is applied. Measured on 2026-11-07, when this task was the window
and the other 15-minute task on the same machine was only a flash.

Give the task `wscript.exe` and a launcher instead, which creates the process with no window
at all:

```vb
' run-hidden.vbs -- usage: wscript.exe run-hidden.vbs "<exe>" "<arg>" ...
Set sh = CreateObject("WScript.Shell")
cmd = """" & WScript.Arguments(0) & """"
For i = 1 To WScript.Arguments.Count - 1
  cmd = cmd & " """ & WScript.Arguments(i) & """"
Next
WScript.Quit sh.Run(cmd, 0, True)
```

```powershell
$action = New-ScheduledTaskAction -Execute 'wscript.exe' `
  -Argument '"C:\path\to\run-hidden.vbs" "C:\path\to\wipboard-push.cmd"'
```

`sh.Run(..., 0, True)` waits and returns the child's exit code, so `LastTaskResult` stays
meaningful. The windowless alternative is an S4U principal ("run whether user is logged on or
not"), which runs in session 0: it needs elevation to register, and it cannot decrypt
DPAPI-protected user secrets, so a task that reads Windows Credential Manager breaks there.
This task does not, since the push token comes from a plain config file.

#### If `-Execute 'wipboard'` fails under the task but works in your shell

Symptom: `LastTaskResult` is 1 and the task writes
`uv trampoline failed to canonicalize script path`, while the identical command run by hand
from any directory succeeds.

Cause: `wipboard.exe` in `~/.local/bin` is a uv trampoline that points at its tool venv, and
if `uv tool install` was run **from inside a containerised app** (the Claude desktop app, a
Store-packaged terminal) then that venv does not live where it appears to. It is redirected
into the app's MSIX container, at
`%LOCALAPPDATA%\Packages\<AppId>\LocalCache\Roaming\uv\tools\wipboard`, and Task Scheduler
runs outside the container and cannot see it. `Get-Item <path> | Select Target` reveals the
redirection; the path looks perfectly normal otherwise, which is what makes this expensive.

Two fixes, both verified on 2026-11-07:

1. Re-run `uv tool install <repo>` from an ordinary terminal, so the venv lands in the real
   `AppData`, and keep the simple action above.
2. Skip the trampoline. wipboard is standard library only, so the system interpreter can run
   the script with no venv at all:

```bat
"C:\Python314\python.exe" "C:\path\to\whereami\wipboard.py" push >> "%LOCALAPPDATA%\Temp\wipboard-push.log" 2>&1
```

   Put that in a `.cmd` and point the task at the file. This ties the scheduled push to the
   checkout, which is the trade. Put the command in a file rather than in the task's argument
   string either way: nested quotes in a Task Scheduler `cmd.exe /c` argument fail as
   **"The system cannot find the path specified"**, which names neither the path nor the
   quoting and sends you hunting for a missing file that is not missing.

None of this is installed for you. A tool that edits a stranger's git hooks or schedules tasks
on install would be a bad citizen, which is the same reason the `SessionStart` hook lives in
your Claude settings and not in this repo.

### The two auth modes

`AUTH_MODE` decides who guards the board, and the Worker refuses to serve it until one of
them is configured.

| Mode | Who authenticates | Needs |
| --- | --- | --- |
| `token` (default) | The Worker, via a `VIEW_TOKEN` cookie | nothing but a secret |
| `access` | Cloudflare Access, upstream | a domain in a zone you own |

Only the exact string `access` turns the Worker's own check off. A typo, a stripped var or a
missing one all mean token mode, so a misconfiguration locks the board rather than publishing
it. In token mode with no `VIEW_TOKEN` set, `GET /` returns 503 naming the fix.

For token mode, set the secret and visit the login URL once per device:

```bash
npx wrangler secret put VIEW_TOKEN
```

Then open `https://<your-worker>/login?k=<token>`. It sets an HttpOnly, Secure, SameSite=Lax
cookie good for a year and redirects to `/`, so the token does not sit in the address bar. It
is still in browser history: that is a known limitation, not an oversight.

Token mode has no sessions, no per-device revocation and no MFA, and rotating `VIEW_TOKEN`
signs out every device at once. It exists so the Worker is useful to someone without a domain.
If you have a domain, `access` is strictly better.

### Rotating BOARD_TOKEN

The naive order leaves a window where every push fails. There is no two-token support in the
Worker, so keep the window short and do it in this order:

1. `npx wrangler secret put BOARD_TOKEN --config worker/wrangler.jsonc` with the new value.
2. Immediately update `token` in `~/.config/wipboard/config.json`.
3. `wipboard push` to confirm.

Pushes between 1 and 2 return 401 and exit 2. Nothing is lost: the next push sends the whole
board, since every push is a full snapshot rather than a delta.

## Environment traps

- **Not every folder is a repo.** Four of the twenty folders this is used against have
  no `.git`. Every git call has to degrade to "no git" rather than raising, and the test
  suite covers that case specifically.
- **`git` must be on PATH.** There is no bundled fallback. If it is missing, every project
  reads as "no git" and the board is useless but does not crash.
- **Windows paths in the store are JSON strings**, so backslashes are escaped. Read them back
  through `pathlib` rather than string-splitting.
- **The store is rewritten whole on every write.** It is a few kilobytes, so this is fine, but
  it means two concurrent `set` commands can lose one of the two. Not worth locking for a
  single-user tool; worth knowing if that ever stops being true.
- **`stage_set_at` is the hinge of the `!` flag.** If a write path ever forgets to update it,
  the flag silently stops firing and the tool quietly becomes a worse `ls`. The test for this
  is the most important one in the suite.
- **The local test runtime caps the compatibility date.** `wrangler.jsonc` sets
  `compatibility_date` to the date the Worker was created, but the installed `workerd` only
  supports up to its own build date and prints `Falling back to "2025-10-11"` on every test
  run. That warning is local only; the deployed Worker honours the configured date. Do not
  "fix" it by lowering the date.
- **`wrangler types` only sees bindings declared in `wrangler.jsonc`.** Secrets are not
  declared there, so `BOARD_TOKEN` reaches the generated `Env` only because it is listed in
  `worker/.dev.vars`, which is gitignored. On a fresh clone, `npm --prefix worker test` fails
  to type-check until you create that file. Its value is a local dev token and has nothing to
  do with the real secret.
- **npm blocks postinstall scripts by default here.** A fresh `npm install` in `worker/`
  leaves `workerd` and `esbuild` without their binaries, and every test fails confusingly.
  Run `npm install-scripts approve workerd esbuild` once, then install again.
- **Cloudflare bans `Python-urllib` by signature.** A push with urllib's default User-Agent
  comes back `403` with `error code: 1010` from the edge, before the Worker sees the bearer
  token, so it reads as an auth failure when it is nothing of the kind. `wipboard.py` sets a
  descriptive `USER_AGENT` for exactly this reason; a test pins it.
- **Do not pipe a secret into `wrangler secret put` from PowerShell.** The pipeline appends a
  line ending and the stored value stops matching what you wrote down, which surfaces as a
  `401` on every push with no hint why. Either type it at the prompt, or use
  `wrangler secret bulk <file.json>` with a file written as UTF-8 **without a BOM**.
- **PowerShell's `Set-Content -Encoding utf8` writes a BOM.** `config.json` written that way
  used to read as absent, so the CLI reported "Missing endpoint, token" about a file that
  contained both. The config loader now reads `utf-8-sig` and reports an unreadable file
  instead of silently treating it as missing, but prefer
  `[System.IO.File]::WriteAllText($p, $json, (New-Object System.Text.UTF8Encoding $false))`.
- **`uv tool install` copies the module, it does not link it.** After changing `wipboard.py`,
  run `uv tool install . --force` or the installed `wipboard` keeps running the old code. A
  new subcommand appearing as "invalid choice" is this, every time. After a `PAYLOAD_VERSION`
  bump it shows up as `wipboard push` failing with **HTTP 400** against a Worker you just
  deployed: the Worker is current, the CLI on `PATH` is not, and it is still sending the old
  version. Reinstall before you go looking at the Worker. Hit on 2026-11-04 with v1 to v2.
