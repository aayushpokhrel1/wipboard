"""wipboard: a board for the repos you forgot about.

Everything git can answer is derived on every run. The store holds only the one
field a machine cannot infer: which cycle a project is in.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import socket
import subprocess
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

STAGES = ("idea", "spec", "building", "testing", "shipped", "parked")
STUCK_DAYS = 30

# The store is user level, not inside any repo: the board spans repos and a tool
# must not write into its own install directory.
STORE_RELATIVE = (".config", "wipboard", "projects.json")

# Every timestamp in the store is a naive UTC ISO string written with
# utc_now().isoformat() and read back with datetime.fromisoformat. Keep every
# comparison naive-UTC-to-naive-UTC; mixing in an aware datetime raises.


def utc_now() -> datetime:
    """Now, as naive UTC.

    Go through this rather than utc_now(), which is deprecated from 3.12
    and warns on 3.14. Every stored timestamp and every comparison in this module
    is naive UTC, so the tzinfo must be stripped after converting.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)


class StoreError(Exception):
    """The store file exists but cannot be read as a store."""


class ConfigError(Exception):
    """Push configuration is missing or unusable. The message names the cause."""


# The push is the only part of the tool that makes a network call, so it is the
# only part that can hang. Ten seconds, then treat it as an ordinary failure.
PUSH_TIMEOUT = 10
# urllib's default User-Agent is "Python-urllib/3.x", which Cloudflare's browser
# integrity check bans outright: the push comes back 403 with error code 1010,
# from the edge, before the Worker ever sees the bearer token. Any descriptive
# agent passes. Do not remove this and do not let it fall back to the default.
USER_AGENT = "wipboard/0.1.0 (+https://github.com/aayushpokhrel1/wipboard)"

# The config file is user level, next to the store, and holds a bearer token.
CONFIG_RELATIVE = (".config", "wipboard", "config.json")


@dataclass
class Row:
    name: str
    stage: str
    note: str
    last_commit: datetime | None  # None when there is no git
    flags: list[str] = field(default_factory=list)
    has_git: bool = False
    branch: str = ""
    subject: str = ""
    changed: int = 0
    stage_set_at: datetime | None = None
    recent: list[dict] = field(default_factory=list)      # [{"at": datetime, "subject": str}, ...]
    uncommitted: list[str] = field(default_factory=list)  # changed paths, already capped at 8
    next_items: list[str] = field(default_factory=list)
    next_source: str = ""


def store_path() -> Path:
    """~/.config/wipboard/projects.json, on every platform."""
    return Path.home().joinpath(*STORE_RELATIVE)


def load_store(path: Path) -> dict:
    """Read the store. Raise StoreError rather than repairing a corrupt file."""
    if not path.exists():
        return {"roots": [], "projects": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise StoreError(str(exc)) from exc
    if not isinstance(data, dict):
        raise StoreError("top level is not an object")
    # The store is hand-editable, so a key may be present but null or the wrong
    # type. Coerce rather than crash later in build_rows.
    if not isinstance(data.get("roots"), list):
        data["roots"] = []
    if not isinstance(data.get("projects"), dict):
        data["projects"] = {}
    return data


def save_store(path: Path, store: dict) -> None:
    """Rewrite the store whole. Creates the parent directory on first write."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(store, indent=2) + "\n", encoding="utf-8")


def _git(repo: Path, *args: str) -> str | None:
    """Run git in repo. Return stripped stdout, or None on ANY failure.

    Returning None rather than raising is load-bearing: three of the folders this
    was built against have no .git at all, and a missing git binary must degrade
    the board rather than crash it. Do not let this propagate an exception.
    """
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=repo,
            capture_output=True,
            text=True,
            # errors="replace" plus the ValueError catch below are what make the
            # docstring's "None on ANY failure" true: on Windows a non-ASCII
            # filename in git status output decodes under the ANSI codepage and
            # would otherwise raise UnicodeDecodeError, which is not an OSError.
            errors="replace",
            check=False,
        )
    except (OSError, ValueError):
        return None
    if result.returncode != 0:
        return None
    return result.stdout.strip()


def _parse_commit_time(raw: str) -> datetime | None:
    """Parse git's ISO 8601 output into a naive UTC datetime."""
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def git_info(repo: Path) -> dict | None:
    """Derived git state for repo, or None when the folder is not a usable repo."""
    if not (repo / ".git").exists():
        return None
    # One log call, not two: the subject rides along on the same invocation
    # because twenty repos times an extra process spawn is paid on every run.
    # %x1f and %x1e, not %n: a commit subject can contain newlines, so only
    # control characters that cannot appear in a subject can separate records
    # and fields.
    raw = _git(repo, "log", "-5", "--format=%cI%x1f%s%x1e")
    if raw is None:
        return None
    # An empty subject yields one field, not two, so the second part defaults.
    # Strip each record: git puts a newline between log entries as well as the
    # %x1e we asked for, so every record after the first arrives with a leading
    # newline that would make its timestamp unparseable.
    records = [record.strip() for record in raw.split("\x1e") if record.strip()]
    if not records:
        return None
    stamp, _, subject = records[0].partition("\x1f")
    last_commit = _parse_commit_time(stamp)
    # A first record with an unparseable timestamp means the repo is not usable,
    # not that it has no commits: returning a dict here would flip has_git on.
    if last_commit is None:
        return None
    recent: list[dict] = []
    for record in records[:5]:
        record_stamp, _, record_subject = record.partition("\x1f")
        record_time = _parse_commit_time(record_stamp)
        # A later record that will not parse is skipped, not fatal: the first
        # record already decided the repo is usable.
        if record_time is None:
            continue
        recent.append({"at": record_time, "subject": record_subject})
    branch = _git(repo, "rev-parse", "--abbrev-ref", "HEAD") or "?"
    status = _git(repo, "status", "--porcelain")
    # One porcelain line per changed path, so the count comes free with dirty.
    changed = len([line for line in (status or "").splitlines() if line.strip()])
    # The first 8 paths ride along on the same status output. changed still
    # counts every line; paths is only what a dashboard has room to show.
    paths: list[str] = []
    for line in (status or "").splitlines():
        if not line.strip():
            continue
        path = line[3:].strip()
        # A rename reads "old -> new"; the destination is the path that exists.
        if " -> " in path:
            path = path.split(" -> ", 1)[1].strip()
        if path:
            paths.append(path)
        if len(paths) == 8:
            break
    # No upstream is the normal case for a local repo, not an error: the command
    # fails and the count is zero.
    ahead_raw = _git(repo, "rev-list", "--count", "@{u}..HEAD")
    try:
        ahead = int(ahead_raw) if ahead_raw else 0
    except ValueError:
        ahead = 0
    return {
        "last_commit": last_commit,
        "branch": branch,
        "dirty": bool(status),
        "ahead": ahead,
        "subject": subject,
        "changed": changed,
        "recent": recent,
        "paths": paths,
    }


# What the next work looks like is read fresh on every run from files the author
# already maintains, and is never written to the store. The caps are a budget:
# this rides in the push body, which the Worker limits to 1 MiB.
NEXT_MAX_ITEMS = 4
NEXT_MAX_CHARS = 160

# A list marker at the start of a line: -, *, +, or 1. / 1) numbering.
_LIST_MARKER = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+")
_HEADING = re.compile(r"^(#{1,6})\s")
_NEXT_HEADING = re.compile(r"^#{1,6}\s*next\b", re.IGNORECASE)
_CHECKLIST = re.compile(r"^\[[ xX]\]\s*")


def _strip_marker(line: str) -> str:
    """Drop a leading list marker, and a checklist box if one follows it."""
    stripped = _LIST_MARKER.sub("", line, count=1).strip()
    return _CHECKLIST.sub("", stripped, count=1).strip()


def _read_lines(path: Path) -> list[str] | None:
    """Read a text file as lines, or None when it cannot be read."""
    try:
        return path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeDecodeError, ValueError):
        return None


def _next_from_handover(folder: Path) -> list[str]:
    """The lines under the first "next" heading, up to the next same-or-shallower one."""
    lines = _read_lines(folder / "HANDOVER.md")
    if lines is None:
        return []
    start = None
    level = 0
    for index, line in enumerate(lines):
        if _NEXT_HEADING.match(line):
            start = index + 1
            level = len(_HEADING.match(line).group(1))
            break
    if start is None:
        return []
    items: list[str] = []
    for line in lines[start:]:
        heading = _HEADING.match(line)
        # A deeper heading is part of this section; the same or a shallower one
        # ends it, so the rest of the file is never swallowed.
        if heading and len(heading.group(1)) <= level:
            break
        # A deeper heading is structure inside the section, not a thing to do.
        # Without this it arrives on the board as an item reading "### detail".
        if heading:
            continue
        if not line.strip():
            continue
        item = _strip_marker(line)
        if item:
            items.append(item)
    return items


def _next_from_todo(folder: Path) -> list[str]:
    """Unchecked checklist items from TODO.md or TODO, else its plain list items."""
    lines: list[str] | None = None
    for name in ("TODO.md", "TODO"):
        lines = _read_lines(folder / name)
        if lines is not None:
            break
    if lines is None:
        return []
    unchecked: list[str] = []
    plain: list[str] = []
    for line in lines:
        if not _LIST_MARKER.match(line):
            continue
        body = _LIST_MARKER.sub("", line, count=1).strip()
        if _CHECKLIST.match(body):
            # A checked box is done, so it is never offered as next work.
            if not body.lower().startswith("[x]"):
                unchecked.append(_CHECKLIST.sub("", body, count=1).strip())
            continue
        plain.append(_strip_marker(line))
    # Unchecked items win when there are any; otherwise the plain list is the todo.
    items = unchecked or plain
    return [item for item in items if item]


def _next_from_plan(folder: Path) -> list[str]:
    """The newest plan's first heading, or its filename stem when it has none."""
    plans = folder / "docs" / "superpowers" / "plans"
    try:
        if not plans.is_dir():
            return []
        # iterdir, not rglob: this runs on every shell session, and a recursive
        # walk is how it stops being cheap.
        candidates = [path for path in plans.iterdir() if path.suffix == ".md" and path.is_file()]
        if not candidates:
            return []
        newest = max(candidates, key=lambda path: path.stat().st_mtime)
    except (OSError, UnicodeDecodeError, ValueError):
        return []
    lines = _read_lines(newest)
    if lines is not None:
        for line in lines:
            heading = _HEADING.match(line)
            if heading:
                text = line[len(heading.group(1)):].strip()
                if text:
                    return [text]
    return [newest.stem]


def project_next(folder: Path) -> tuple[list[str], str]:
    """What the next work on this project looks like, and where it was read from.

    Returns (items, source). source is "handover", "todo", "plan", or "" when
    nothing answered. Never raises: an unreadable file degrades to the next
    source, the same way git_info degrades to no-git.
    """
    try:
        if not folder.is_dir():
            return ([], "")
    except (OSError, ValueError):
        return ([], "")
    for source, reader in (
        ("handover", _next_from_handover),
        ("todo", _next_from_todo),
        ("plan", _next_from_plan),
    ):
        try:
            items = reader(folder)
        except (OSError, UnicodeDecodeError, ValueError):
            items = []
        if items:
            return ([item[:NEXT_MAX_CHARS] for item in items[:NEXT_MAX_ITEMS]], source)
    return ([], "")


def _parse_stage_set_at(raw: object) -> datetime | None:
    if not isinstance(raw, str) or not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def _find_project_dir(name: str, roots: list[str]) -> Path | None:
    """Reconstruct a project's path by searching each root. First match wins."""
    for root in roots:
        candidate = Path(root) / name
        if candidate.is_dir():
            return candidate
    return None


def _flags_for(
    has_git: bool,
    missing: bool,
    stage_set_at: datetime | None,
    info: dict | None,
    now: datetime,
) -> list[str]:
    flags: list[str] = []
    if has_git and info is not None and stage_set_at is not None:
        last_commit = info["last_commit"]
        if last_commit > stage_set_at:
            flags.append("!")
            # stuck is tied to commits having landed since the stage was set, so
            # it only ever appears alongside "!".
            days = (now - stage_set_at).days
            if days > STUCK_DAYS:
                flags.append(f"stuck {days}d")
    if has_git and info is not None:
        if info["dirty"]:
            flags.append("dirty")
        if info["ahead"] > 0:
            flags.append(f"^{info['ahead']}")
    if missing:
        flags.append("missing")
    elif not has_git:
        flags.append("no git")
    return flags


def _sort_key(row: Row) -> tuple[int, datetime, str]:
    """Suspect rows first, then active, then parked, then no git. Stalest first."""
    # Test has_git BEFORE parked: a parked folder with no git matches both, and
    # the no-git group has to win or it sorts above every active repo.
    if "!" in row.flags:
        group = 0
    elif not row.has_git:
        group = 3
    elif row.stage != "parked":
        group = 1
    else:
        group = 2
    # A row with no commit has no signal to rank by, so it reads as oldest.
    stamp = row.last_commit or datetime.min
    return (group, stamp, row.name)


def build_rows(store: dict, now: datetime) -> list[Row]:
    """Build the board. `now` is a parameter so tests can pin time."""
    roots = [str(root) for root in store.get("roots", [])]
    projects = store.get("projects", {})
    rows: list[Row] = []

    seen: set[str] = set()
    for name in sorted(projects):
        seen.add(name)
        entry = projects[name] or {}
        stage = entry.get("stage", "idea")
        note = entry.get("note", "") or ""
        stage_set_at = _parse_stage_set_at(entry.get("stage_set_at"))
        folder = _find_project_dir(name, roots)
        missing = folder is None
        info = git_info(folder) if folder is not None else None
        has_git = info is not None
        # A missing project has no folder to read, so it answers nothing rather
        # than being asked.
        next_items, next_source = project_next(folder) if folder is not None else ([], "")
        rows.append(
            Row(
                name=name,
                stage=stage,
                note=note,
                last_commit=info["last_commit"] if info else None,
                flags=_flags_for(has_git, missing, stage_set_at, info, now),
                has_git=has_git,
                branch=info["branch"] if info else "",
                subject=info["subject"] if info else "",
                changed=info["changed"] if info else 0,
                stage_set_at=stage_set_at,
                recent=info["recent"] if info else [],
                uncommitted=info["paths"] if info else [],
                next_items=next_items,
                next_source=next_source,
            )
        )

    for root in roots:
        root_path = Path(root)
        if not root_path.is_dir():
            continue
        for child in sorted(root_path.iterdir()):
            if not child.is_dir() or child.name in seen:
                continue
            if child.name.startswith(".") or child.name.startswith("__"):
                continue
            seen.add(child.name)
            info = git_info(child)
            has_git = info is not None
            next_items, next_source = project_next(child)
            rows.append(
                Row(
                    name=child.name,
                    stage="idea",
                    note="",
                    last_commit=info["last_commit"] if info else None,
                    flags=_flags_for(has_git, False, None, info, now),
                    has_git=has_git,
                    branch=info["branch"] if info else "",
                    subject=info["subject"] if info else "",
                    changed=info["changed"] if info else 0,
                    recent=info["recent"] if info else [],
                    uncommitted=info["paths"] if info else [],
                    next_items=next_items,
                    next_source=next_source,
                )
            )

    rows.sort(key=_sort_key)
    return rows


# The payload shape is owned here, not in the Worker: the Worker stores and
# renders whatever it is given. Bump this when the shape changes, and redeploy
# the Worker first, or it will refuse a version it does not know.
PAYLOAD_VERSION = 2


def board_payload(rows: list[Row], generated_at: datetime, host: str) -> dict:
    """Serialize the board for the Worker.

    Pure: no I/O and no clock read, so a test can pin both inputs. Row order is
    preserved as given, which is _sort_key order, so the Worker inherits the
    terminal's ordering for free.
    """

    def stamp(value: datetime | None) -> str | None:
        return value.isoformat() if value is not None else None

    return {
        "version": PAYLOAD_VERSION,
        "generated_at": generated_at.isoformat(),
        "host": host,
        "projects": [
            {
                "name": row.name,
                "stage": row.stage,
                "note": row.note,
                "last_commit": stamp(row.last_commit),
                "stage_set_at": stamp(row.stage_set_at),
                "flags": list(row.flags),
                "has_git": row.has_git,
                "branch": row.branch,
                "subject": row.subject,
                "changed": row.changed,
                # Additive on purpose: a later feature adds history fields with
                # another additive bump rather than reshaping these.
                "recent": [
                    {"at": stamp(entry["at"]), "subject": entry["subject"][:120]}
                    for entry in row.recent
                ],
                "uncommitted": [path[:120] for path in row.uncommitted],
                "next": {"items": list(row.next_items), "source": row.next_source},
            }
            for row in rows
        ],
    }


def human_age(then: datetime | None, now: datetime) -> str:
    """Largest whole unit: just now, Nm, Nh, Nd, Ny. None reads as '-'."""
    if then is None:
        return "-"
    seconds = (now - then).total_seconds()
    if seconds < 60:
        return "just now"
    minutes = int(seconds // 60)
    if minutes < 60:
        return f"{minutes}m"
    hours = minutes // 60
    if hours < 24:
        return f"{hours}h"
    days = hours // 24
    if days <= 365:
        return f"{days}d"
    return f"{days // 365}y"


def _note_cell(row: Row) -> str:
    parts = list(row.flags)
    if row.note:
        parts.append(row.note)
    return "  ".join(parts)


def render_table(rows: list[Row], now: datetime | None = None) -> str:
    """Four left-aligned columns, widths from the content, two spaces between."""
    now = now or utc_now()
    headers = ("PROJECT", "STAGE", "TOUCHED", "NOTE")
    body = [
        (row.name, row.stage, human_age(row.last_commit, now), _note_cell(row))
        for row in rows
    ]
    widths = [
        max([len(headers[i])] + [len(line[i]) for line in body])
        for i in range(len(headers))
    ]
    lines = ["  ".join(h.ljust(widths[i]) for i, h in enumerate(headers)).rstrip()]
    for line in body:
        lines.append("  ".join(cell.ljust(widths[i]) for i, cell in enumerate(line)).rstrip())
    return "\n".join(lines)


def render_md(rows: list[Row], now: datetime | None = None) -> str:
    """A GitHub markdown table, regenerated and never hand-edited."""
    now = now or utc_now()
    lines = [
        "# Projects",
        "",
        "| PROJECT | STAGE | TOUCHED | NOTE |",
        "| --- | --- | --- | --- |",
    ]
    for row in rows:
        note = _note_cell(row).replace("|", "\\|")
        lines.append(
            f"| {row.name} | {row.stage} | {human_age(row.last_commit, now)} | {note} |"
        )
    lines.append("")
    lines.append("Generated by wipboard.")
    return "\n".join(lines)


def _discover(root: Path) -> list[str]:
    """Immediate child directories, skipping dotfiles and __dunder__ folders."""
    if not root.is_dir():
        return []
    names = []
    for child in sorted(root.iterdir()):
        if not child.is_dir():
            continue
        if child.name.startswith(".") or child.name.startswith("__"):
            continue
        names.append(child.name)
    return names


def cmd_show(store: dict) -> int:
    rows = build_rows(store, utc_now())
    print(render_table(rows))
    return 0


def cmd_init(store: dict, path: str) -> int:
    root = Path(path).resolve()
    posix = root.as_posix()
    roots = store.setdefault("roots", [])
    if posix not in roots:
        roots.append(posix)
    projects = store.setdefault("projects", {})
    for name in _discover(root):
        if name not in projects:
            projects[name] = {"stage": "idea", "note": "", "stage_set_at": None}
    # Every command that mutates the store must save it here. init printed a
    # success line without writing once, which made the tool look like it worked
    # and left show reporting an empty board.
    save_store(store_path(), store)
    print(f"Root {posix}: {len(projects)} project(s) tracked.")
    return 0


def cmd_set(store: dict, project: str, stage: str, note: str | None) -> int:
    if stage not in STAGES:
        print(
            f"Unknown stage: {stage}. Valid stages: {', '.join(STAGES)}",
            file=sys.stderr,
        )
        return 2
    projects = store.get("projects", {})
    if project not in projects:
        print(f"Unknown project: {project}", file=sys.stderr)
        return 2
    entry = projects[project] or {}
    entry["stage"] = stage
    entry["stage_set_at"] = utc_now().isoformat()
    if note is not None:
        entry["note"] = note
    projects[project] = entry
    store["projects"] = projects
    save_store(store_path(), store)
    print(f"{project}: {stage} ({entry['stage_set_at']})")
    return 0


def cmd_md(store: dict, target: str) -> int:
    rows = build_rows(store, utc_now())
    out = Path(target)
    out.write_text(render_md(rows) + "\n", encoding="utf-8")
    print(out)
    return 0


def config_path() -> Path:
    """~/.config/wipboard/config.json, on every platform."""
    return Path.home().joinpath(*CONFIG_RELATIVE)


def _config_file() -> dict:
    """Read the config file, or an empty dict when it is absent.

    A file that exists but cannot be read is an error, not an absence. Treating
    the two alike produced "Missing endpoint, token" about a file containing
    both, which sends you looking in the wrong place entirely.

    utf-8-sig, not utf-8: PowerShell's `Set-Content -Encoding utf8` writes a BOM
    on Windows, and json.loads rejects it. That is the most likely way this file
    gets written on the platform this tool is used on most.
    """
    path = config_path()
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, ValueError) as exc:
        raise ConfigError(f"Cannot read {path}: {exc}") from exc
    if not isinstance(data, dict):
        raise ConfigError(f"{path} does not contain a JSON object.")
    return data


def push_config() -> tuple[str, str]:
    """The endpoint and token to push to.

    Environment first, so a scheduled task can pass them without a file, then
    ~/.config/wipboard/config.json. Either missing raises ConfigError naming
    which one is absent and how to set it.
    """
    file_config = _config_file()
    values: dict[str, str] = {}
    for key, env in (("endpoint", "WIPBOARD_ENDPOINT"), ("token", "WIPBOARD_TOKEN")):
        raw = os.environ.get(env) or file_config.get(key)
        values[key] = raw.strip() if isinstance(raw, str) else ""

    missing = [key for key in ("endpoint", "token") if not values[key]]
    if missing:
        env_names = " and ".join(f"WIPBOARD_{key.upper()}" for key in missing)
        raise ConfigError(
            f"Missing {', '.join(missing)}. Set {env_names}, "
            f"or add {', '.join(missing)} to {config_path()}."
        )
    return values["endpoint"], values["token"]


def _post(url: str, token: str, body: bytes) -> int:
    """POST body to url with a bearer token. Return the status code.

    Module level and taking everything it needs as arguments so a test can
    replace it and no test ever reaches the network. Raises urllib.error.URLError
    and TimeoutError, which cmd_push turns into an ordinary failure.
    """
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
        },
    )
    with urllib.request.urlopen(request, timeout=PUSH_TIMEOUT) as response:
        return response.status


def cmd_push(store: dict) -> int:
    """Post the board to the Worker. Strictly read-only with respect to the store."""
    try:
        endpoint, token = push_config()
    except ConfigError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    # One instant for both, or the ages in the rows and the snapshot age on the
    # dashboard are measured from different clocks readings.
    now = utc_now()
    rows = build_rows(store, now)
    payload = board_payload(rows, now, socket.gethostname())
    # ensure_ascii=False keeps non-ASCII names and subjects as characters rather
    # than escapes; the Worker decodes the body as UTF-8.
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")

    try:
        status = _post(endpoint, token, body)
    except urllib.error.HTTPError as exc:
        # HTTPError is a URLError subclass, so it must be caught first.
        print(f"Push to {endpoint} failed: HTTP {exc.code}", file=sys.stderr)
        return 2
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        reason = getattr(exc, "reason", exc)
        print(f"Push to {endpoint} failed: {reason}", file=sys.stderr)
        return 2

    if not 200 <= status < 300:
        print(f"Push to {endpoint} failed: HTTP {status}", file=sys.stderr)
        return 2
    print(f"Pushed {len(rows)} project(s) to {endpoint}")
    return 0


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="wipboard", description=__doc__)
    sub = parser.add_subparsers(dest="command")

    sub.add_parser("show", help="print the board, stalest first")

    init = sub.add_parser("init", help="register a root and discover its folders")
    init.add_argument("path", nargs="?", default=".")

    setter = sub.add_parser("set", help="set a project's stage")
    setter.add_argument("project")
    setter.add_argument("stage")
    setter.add_argument("--note", default=None)

    md = sub.add_parser("md", help="write the board as a markdown table")
    md.add_argument("file")

    sub.add_parser("push", help="post the board to the dashboard Worker")

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    command = args.command or "show"

    path = store_path()
    try:
        store = load_store(path)
        if command == "show":
            if not path.exists():
                print("No projects yet. Run: wipboard init <path>")
                return 0
            return cmd_show(store)
        if command == "init":
            return cmd_init(store, args.path)
        if command == "set":
            return cmd_set(store, args.project, args.stage, args.note)
        if command == "md":
            return cmd_md(store, args.file)
        if command == "push":
            return cmd_push(store)
    except StoreError as exc:
        # Never repair a corrupt store: losing the one hand-entered field in the
        # system would be worse than stopping.
        print(f"Corrupt store at {path}: {exc}", file=sys.stderr)
        return 2
    except ConfigError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    except OSError as exc:
        print(f"Cannot write store at {path}: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
