"""Tests for wipboard. Standard library plus pytest, no fixtures beyond tmp_path."""

from __future__ import annotations

import os
import subprocess
from datetime import datetime, timedelta
import codecs
import json
from pathlib import Path

import pytest

import wipboard


def make_repo(path: Path, when: datetime | None = None, message: str = "work") -> None:
    """Create a git repo at path with one commit, optionally dated and messaged."""
    path.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ)
    if when is not None:
        stamp = when.isoformat() + " +0000"
        env["GIT_AUTHOR_DATE"] = stamp
        env["GIT_COMMITTER_DATE"] = stamp
    subprocess.run(
        ["git", "init", "-b", "main"],
        cwd=path,
        check=True,
        capture_output=True,
        env=env,
    )
    subprocess.run(
        [
            "git",
            "-c",
            "commit.gpgsign=false",
            "-c",
            "user.email=t@e.com",
            "-c",
            "user.name=T",
            "commit",
            "--allow-empty",
            # Git refuses an empty message without this, and an empty subject is
            # exactly the case the %cI%x1f%s split has to survive.
            "--allow-empty-message",
            "-m",
            message,
        ],
        cwd=path,
        check=True,
        capture_output=True,
        env=env,
    )


def commit(repo: Path, when: datetime, message: str = "work") -> None:
    """Add one empty commit to an existing repo, dated and messaged."""
    stamp = when.isoformat() + " +0000"
    env = dict(os.environ)
    env["GIT_AUTHOR_DATE"] = stamp
    env["GIT_COMMITTER_DATE"] = stamp
    subprocess.run(
        [
            "git",
            "-c",
            "commit.gpgsign=false",
            "-c",
            "user.email=t@e.com",
            "-c",
            "user.name=T",
            "commit",
            "--allow-empty",
            "--allow-empty-message",
            "-m",
            message,
        ],
        cwd=repo,
        check=True,
        capture_output=True,
        env=env,
    )


def _store(root: Path, projects: dict) -> dict:
    return {"roots": [root.as_posix()], "projects": projects}


def test_bang_fires_when_commit_is_newer_than_stage(tmp_path: Path) -> None:
    """Catches the ! flag silently stopping: it is the entire value of the tool."""
    now = wipboard.utc_now()
    root = tmp_path / "root"
    root.mkdir()
    make_repo(root / "Suspect", when=now - timedelta(hours=1))
    make_repo(root / "Quiet", when=now - timedelta(days=10))

    store = _store(
        root,
        {
            "Suspect": {
                "stage": "building",
                "note": "",
                "stage_set_at": (now - timedelta(days=2)).isoformat(),
            },
            "Quiet": {
                "stage": "building",
                "note": "",
                "stage_set_at": (now - timedelta(days=1)).isoformat(),
            },
        },
    )
    rows = {row.name: row for row in wipboard.build_rows(store, now)}

    assert "!" in rows["Suspect"].flags
    assert "!" not in rows["Quiet"].flags


def test_folder_with_no_git_degrades(tmp_path: Path) -> None:
    """Catches a git call raising on a plain folder instead of degrading to no git."""
    now = wipboard.utc_now()
    root = tmp_path / "root"
    (root / "Plain").mkdir(parents=True)

    rows = wipboard.build_rows(_store(root, {}), now)
    plain = {row.name: row for row in rows}["Plain"]

    assert "no git" in plain.flags
    assert "!" not in plain.flags
    assert plain.has_git is False
    assert plain.last_commit is None


def test_suspect_row_sorts_above_older_quiet_row(tmp_path: Path) -> None:
    """Catches the sort losing the hoist: a suspect row must outrank an older quiet one."""
    now = wipboard.utc_now()
    root = tmp_path / "root"
    root.mkdir()
    make_repo(root / "Suspect", when=now - timedelta(hours=1))
    make_repo(root / "Quiet", when=now - timedelta(days=40))

    store = _store(
        root,
        {
            "Suspect": {
                "stage": "building",
                "note": "",
                "stage_set_at": (now - timedelta(days=2)).isoformat(),
            },
            # Quiet's stage was set AFTER its last commit, so it carries no "!".
            # If this were older than the commit it would be suspect too, and the
            # staler-first rule inside the suspect group would correctly put it first.
            "Quiet": {
                "stage": "building",
                "note": "",
                "stage_set_at": (now - timedelta(days=30)).isoformat(),
            },
        },
    )
    # ParkedNoGit matches both the parked and the no-git group. No git has to
    # win: while it was grouped as parked, its absent commit date read as oldest
    # and hoisted it above the real parked repo.
    (root / "ParkedNoGit").mkdir()
    make_repo(root / "ParkedRepo", when=now - timedelta(days=5))
    store["projects"]["ParkedNoGit"] = {
        "stage": "parked",
        "note": "",
        "stage_set_at": (now - timedelta(days=90)).isoformat(),
    }
    # Stage set AFTER its last commit, so ParkedRepo carries no "!" and the
    # grouping rule is what this assertion actually exercises.
    store["projects"]["ParkedRepo"] = {
        "stage": "parked",
        "note": "",
        "stage_set_at": (now - timedelta(days=1)).isoformat(),
    }
    names = [row.name for row in wipboard.build_rows(store, now)]

    assert names.index("Suspect") < names.index("Quiet")
    assert names.index("ParkedRepo") < names.index("ParkedNoGit")


def test_invalid_stage_exits_two_without_writing(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Catches a rejected stage still rewriting the store."""
    store_file = tmp_path / "projects.json"
    monkeypatch.setattr(wipboard, "store_path", lambda: store_file)
    store_file.write_text('{"roots": [], "projects": {"X": {"stage": "idea"}}}')
    before = store_file.read_bytes()

    code = wipboard.main(["set", "X", "nonsense"])

    assert code == 2
    assert store_file.read_bytes() == before


def test_set_stamps_stage_set_at(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Catches a write path forgetting stage_set_at, which silently kills every flag."""
    store_file = tmp_path / "projects.json"
    monkeypatch.setattr(wipboard, "store_path", lambda: store_file)
    store_file.write_text('{"roots": [], "projects": {"X": {"stage": "idea"}}}')

    code = wipboard.main(["set", "X", "building"])

    assert code == 0
    stored = wipboard.load_store(store_file)["projects"]["X"]
    stamped = datetime.fromisoformat(stored["stage_set_at"])
    assert abs((wipboard.utc_now() - stamped).total_seconds()) < 60


def test_init_persists_the_store(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Catches a mutating command printing success without writing the store."""
    store_file = tmp_path / "projects.json"
    monkeypatch.setattr(wipboard, "store_path", lambda: store_file)
    root = tmp_path / "root"
    (root / "Alpha").mkdir(parents=True)
    (root / ".hidden").mkdir()

    assert wipboard.main(["init", str(root)]) == 0

    saved = json.loads(store_file.read_text(encoding="utf-8"))
    assert root.resolve().as_posix() in saved["roots"]
    assert "Alpha" in saved["projects"]
    assert ".hidden" not in saved["projects"]


def test_git_info_returns_subject_and_changed_count(tmp_path: Path) -> None:
    """Catches a second git process per repo, and a crash on an empty subject."""
    repo = tmp_path / "r"
    make_repo(repo, message="Add the thing")
    info = wipboard.git_info(repo)
    assert info["subject"] == "Add the thing"
    assert info["changed"] == 0


def test_empty_commit_subject_does_not_raise(tmp_path: Path) -> None:
    """Review Focus 2: --format=%cI%x1f%s%x1e yields one field when the subject is empty."""
    repo = tmp_path / "r"
    make_repo(repo, message="")
    info = wipboard.git_info(repo)
    assert info["subject"] == ""


def test_recent_holds_five_commits_newest_first(tmp_path: Path) -> None:
    """Catches the log call going back to -1, or the records arriving oldest first."""
    repo = tmp_path / "r"
    base = datetime(2026, 1, 1, 12, 0)
    make_repo(repo, when=base, message="c0")
    for i in range(1, 7):
        commit(repo, base + timedelta(hours=i), message=f"c{i}")

    info = wipboard.git_info(repo)

    assert len(info["recent"]) == 5
    assert [entry["subject"] for entry in info["recent"]] == ["c6", "c5", "c4", "c3", "c2"]
    # last_commit and subject keep their old meaning: the first record's.
    assert info["recent"][0]["at"] == info["last_commit"]
    assert info["recent"][0]["subject"] == info["subject"] == "c6"
    assert info["last_commit"] == base + timedelta(hours=6)


def test_recent_holds_the_single_commit_of_a_new_repo(tmp_path: Path) -> None:
    """Catches an off-by-one that drops the only record a fresh repo has."""
    repo = tmp_path / "r"
    make_repo(repo, when=datetime(2026, 1, 1, 12, 0), message="only")

    info = wipboard.git_info(repo)

    assert len(info["recent"]) == 1
    assert info["recent"][0]["subject"] == "only"
    assert info["recent"][0]["at"] == info["last_commit"]


def test_multiline_subject_does_not_split_into_extra_records(tmp_path: Path) -> None:
    """Catches %n as the record separator: a subject can contain newlines."""
    repo = tmp_path / "r"
    base = datetime(2026, 1, 1, 12, 0)
    make_repo(repo, when=base, message="first line\nsecond line\nthird line")
    commit(repo, base + timedelta(hours=1), message="later")

    info = wipboard.git_info(repo)

    assert len(info["recent"]) == 2
    assert info["recent"][0]["subject"] == "later"
    # %s is git's *subject*, which is everything up to the first blank line with
    # newlines collapsed to spaces. The point of this test is that the newlines
    # produce no extra records, not that they survive.
    assert info["recent"][1]["subject"] == "first line second line third line"
    assert info["subject"] == "later"


def test_paths_caps_at_eight_but_changed_counts_every_line(tmp_path: Path) -> None:
    """Catches paths truncating the count, or the count truncating paths."""
    repo = tmp_path / "r"
    make_repo(repo)
    for i in range(11):
        (repo / f"file{i:02d}.txt").write_text("x", encoding="utf-8")

    info = wipboard.git_info(repo)

    assert len(info["paths"]) == 8
    assert info["changed"] == 11
    assert info["paths"][0] == "file00.txt"


def test_folder_with_no_git_returns_none(tmp_path: Path) -> None:
    """Catches git_info inventing a dict for a folder that is not a repo."""
    plain = tmp_path / "plain"
    plain.mkdir()

    assert wipboard.git_info(plain) is None


def test_rows_carry_stage_set_at_and_branch(tmp_path: Path) -> None:
    """Catches build_rows dropping the fields the dashboard renders."""
    now = wipboard.utc_now()
    root = tmp_path / "root"
    root.mkdir()
    make_repo(root / "Alpha")
    store = _store(
        root,
        {
            "Alpha": {
                "stage": "building",
                "note": "",
                "stage_set_at": (now - timedelta(days=2)).isoformat(),
            },
        },
    )

    row = {row.name: row for row in wipboard.build_rows(store, now)}["Alpha"]

    assert row.branch == "main"
    assert isinstance(row.stage_set_at, datetime)


def test_board_payload_shape():
    # This dict is the contract the Worker parses. A silent key rename breaks the
    # dashboard with no local failure, so the shape is asserted exactly.
    rows = [
        wipboard.Row(name="alpha", stage="building", note="n",
                     last_commit=datetime(2026, 10, 20, 12, 0), flags=["!"],
                     has_git=True, branch="main", subject="s", changed=2,
                     stage_set_at=datetime(2026, 10, 1, 9, 0)),
        wipboard.Row(name="beta", stage="idea", note="", last_commit=None,
                     flags=["no git"], has_git=False),
    ]
    p = wipboard.board_payload(rows, datetime(2026, 10, 20, 12, 5), "HOST")
    assert p["version"] == 2
    assert p["generated_at"] == "2026-10-20T12:05:00"
    assert p["host"] == "HOST"
    assert p["projects"][0] == {
        "name": "alpha", "stage": "building", "note": "n",
        "last_commit": "2026-10-20T12:00:00", "stage_set_at": "2026-10-01T09:00:00",
        "flags": ["!"], "has_git": True, "branch": "main", "subject": "s", "changed": 2,
        "recent": [], "uncommitted": [], "next": {"items": [], "source": ""},
    }
    assert p["projects"][1]["last_commit"] is None
    assert p["projects"][1]["stage_set_at"] is None


def test_project_next_reads_the_handover_next_section(tmp_path: Path) -> None:
    """Catches the handover source not being read, or its markers surviving."""
    (tmp_path / "HANDOVER.md").write_text(
        "# State\n\n- not this one\n\n## Next\n\n- Ship the thing\n1. Then the other\n",
        encoding="utf-8",
    )

    items, source = wipboard.project_next(tmp_path)

    assert source == "handover"
    assert items == ["Ship the thing", "Then the other"]


def test_project_next_stops_at_the_next_same_or_shallower_heading(tmp_path: Path) -> None:
    """Catches the section swallowing the rest of the file."""
    (tmp_path / "HANDOVER.md").write_text(
        "## Next\n\n- one\n\n## Later\n\n- two\n\n# Appendix\n\n- three\n",
        encoding="utf-8",
    )

    items, source = wipboard.project_next(tmp_path)

    assert source == "handover"
    assert items == ["one"]


def test_project_next_keeps_a_deeper_heading_inside_the_section(tmp_path: Path) -> None:
    """Catches a deeper heading ending the section early."""
    (tmp_path / "HANDOVER.md").write_text(
        "## Next\n\n- one\n\n### detail\n\n- two\n\n## Later\n\n- three\n",
        encoding="utf-8",
    )

    items, source = wipboard.project_next(tmp_path)

    assert source == "handover"
    assert items == ["one", "two"]


def test_project_next_falls_through_to_unchecked_todo_items(tmp_path: Path) -> None:
    """Catches TODO being ignored, or a checked item being offered as next work."""
    (tmp_path / "TODO.md").write_text(
        "- [x] done already\n- [ ] still to do\n- [ ] also to do\n",
        encoding="utf-8",
    )

    items, source = wipboard.project_next(tmp_path)

    assert source == "todo"
    assert items == ["still to do", "also to do"]


def test_project_next_returns_nothing_when_nothing_answers(tmp_path: Path) -> None:
    """Catches an empty folder inventing a source."""
    assert wipboard.project_next(tmp_path) == ([], "")


def test_project_next_on_a_missing_folder_returns_nothing(tmp_path: Path) -> None:
    """Catches a missing folder raising instead of answering nothing."""
    assert wipboard.project_next(tmp_path / "nope") == ([], "")


def test_project_next_caps_items_and_truncates_long_ones(tmp_path: Path) -> None:
    """Catches the caps being dropped: they are a budget for the push body."""
    # The long item goes FIRST. Written seventh it never survives the cap of
    # four, so the truncation half of this test could never have run.
    long_item = "x" * 200
    (tmp_path / "HANDOVER.md").write_text(
        "## Next\n\n"
        + f"- {long_item}\n"
        + "\n".join(f"- item{i}" for i in range(6))
        + "\n",
        encoding="utf-8",
    )

    items, source = wipboard.project_next(tmp_path)

    assert source == "handover"
    assert len(items) == 4
    # One unbroken run of x has no space to back up to, so it cuts at the cap
    # and says so. The ellipsis is the point: a reader cannot otherwise tell a
    # truncated item from a genuinely terse one.
    assert items[0] == "x" * 160 + "…"
    assert items[1] == "item0"


def test_board_payload_carries_recent_uncommitted_and_next() -> None:
    """Catches the v2 keys going missing or arriving in the wrong shape."""
    rows = [
        wipboard.Row(
            name="alpha", stage="building", note="", last_commit=datetime(2026, 10, 20, 12, 0),
            has_git=True,
            recent=[{"at": datetime(2026, 10, 20, 12, 0), "subject": "s" * 200}],
            uncommitted=["p" * 200],
            next_items=["do the thing"],
            next_source="handover",
        ),
    ]

    p = wipboard.board_payload(rows, datetime(2026, 10, 20, 12, 5), "HOST")
    project = p["projects"][0]

    assert p["version"] == 2
    assert project["recent"] == [{"at": "2026-10-20T12:00:00", "subject": "s" * 120}]
    assert project["uncommitted"] == ["p" * 120]
    assert project["next"] == {"items": ["do the thing"], "source": "handover"}


def test_rows_carry_next_items_end_to_end(tmp_path: Path) -> None:
    """Catches build_rows reading the handover but dropping what it found."""
    now = wipboard.utc_now()
    root = tmp_path / "root"
    (root / "Alpha").mkdir(parents=True)
    (root / "Alpha" / "HANDOVER.md").write_text("## Next\n\n- ship it\n", encoding="utf-8")

    row = {row.name: row for row in wipboard.build_rows(_store(root, {}), now)}["Alpha"]

    assert row.next_items == ["ship it"]
    assert row.next_source == "handover"


def test_push_without_config_exits_two_and_leaves_store_alone(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Catches push rewriting or clearing the store on a failure path."""
    store_file = tmp_path / "projects.json"
    monkeypatch.setattr(wipboard, "store_path", lambda: store_file)
    # HOME decides where the config file is looked for, so point it at an empty
    # directory rather than trusting the machine running the tests.
    monkeypatch.setenv("HOME", str(tmp_path / "home"))
    monkeypatch.setenv("USERPROFILE", str(tmp_path / "home"))
    monkeypatch.delenv("WIPBOARD_ENDPOINT", raising=False)
    monkeypatch.delenv("WIPBOARD_TOKEN", raising=False)
    store_file.write_text('{"roots": [], "projects": {"X": {"stage": "idea"}}}')
    before = store_file.read_bytes()

    # No network: _post is replaced, so a push that got this far would fail loudly
    # rather than reach out.
    def explode(url: str, token: str, body: bytes) -> int:
        raise AssertionError("push made a network call with no configuration")

    monkeypatch.setattr(wipboard, "_post", explode)

    assert wipboard.main(["push"]) == 2
    assert store_file.read_bytes() == before


def test_env_overrides_config_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """The scheduled task passes env vars and has no config file."""
    monkeypatch.setenv("HOME", str(tmp_path / "home"))
    monkeypatch.setenv("USERPROFILE", str(tmp_path / "home"))
    monkeypatch.setenv("WIPBOARD_ENDPOINT", "https://e.example/api/board")
    monkeypatch.setenv("WIPBOARD_TOKEN", "t")
    assert wipboard.push_config() == ("https://e.example/api/board", "t")


def test_config_with_a_utf8_bom_is_read(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Catches a BOM making a valid config look absent.

    PowerShell's Set-Content -Encoding utf8 writes one, so this is the normal
    way the file gets created on Windows, not an exotic case.
    """
    cfg = tmp_path / "config.json"
    cfg.write_bytes(
        codecs.BOM_UTF8 + json.dumps({"endpoint": "https://e/api", "token": "t"}).encode()
    )
    monkeypatch.setattr(wipboard, "config_path", lambda: cfg)
    monkeypatch.delenv("WIPBOARD_ENDPOINT", raising=False)
    monkeypatch.delenv("WIPBOARD_TOKEN", raising=False)
    assert wipboard.push_config() == ("https://e/api", "t")


def test_unreadable_config_reports_itself(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Catches a broken config being reported as a missing key."""
    cfg = tmp_path / "config.json"
    cfg.write_text("{not json", encoding="utf-8")
    monkeypatch.setattr(wipboard, "config_path", lambda: cfg)
    monkeypatch.delenv("WIPBOARD_ENDPOINT", raising=False)
    monkeypatch.delenv("WIPBOARD_TOKEN", raising=False)
    with pytest.raises(wipboard.ConfigError, match="Cannot read"):
        wipboard.push_config()


def test_post_sends_a_descriptive_user_agent(monkeypatch: pytest.MonkeyPatch) -> None:
    """Catches the push falling back to urllib's default agent.

    Cloudflare's browser integrity check bans Python-urllib by signature and
    returns 403 error 1010 from the edge, so the bearer token never gets looked
    at and the failure looks like an auth problem instead of a user-agent one.
    """
    seen: dict[str, str] = {}

    class _Response:
        status = 204

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

    def fake_urlopen(request, timeout=None):
        seen.update(request.headers)
        return _Response()

    monkeypatch.setattr(wipboard.urllib.request, "urlopen", fake_urlopen)
    assert wipboard._post("https://e/api", "t", b"{}") == 204
    agent = seen.get("User-agent", "")
    assert agent.startswith("wipboard/")
    assert "Python-urllib" not in agent


def test_documented_test_counts_match_reality() -> None:
    """Catches the docs stating a test count that stopped being true.

    Every sweep of this repo has found a stale count in docs/OPERATIONS.md: it
    said 12 Python tests when there were 15, and 17 Worker tests when there were
    25. A number in prose rots silently because nothing recounts it. This recounts
    it. If it fails, fix the document rather than the number here.
    """
    import re

    root = Path(__file__).resolve().parent
    ops = (root / "docs" / "OPERATIONS.md").read_text(encoding="utf-8")

    actual_py = len(re.findall(r"^def test_", (root / "test_wipboard.py").read_text(encoding="utf-8"), re.M))
    stated_py = int(re.search(r"# (\d+) tests, the whole suite", ops).group(1))
    assert stated_py == actual_py, f"OPERATIONS.md says {stated_py} Python tests, there are {actual_py}"

    worker_tests = sorted((root / "worker" / "test").glob("*.test.ts"))
    assert worker_tests, "no Worker tests found; the glob or the layout changed"
    actual_worker = sum(
        len(re.findall(r"^\s*it\(", f.read_text(encoding="utf-8"), re.M)) for f in worker_tests
    )
    stated_worker = int(re.search(r"^(\d+) tests plus `tsc", ops, re.M).group(1))
    assert stated_worker == actual_worker, (
        f"OPERATIONS.md says {stated_worker} Worker tests, there are {actual_worker}"
    )


def test_handover_stays_a_current_state_note() -> None:
    """Catches HANDOVER.md turning from a current-state note into a log.

    The same file on a sibling project (FamilyRecipes) reached 1,365 lines by
    accumulating everything, began contradicting itself, and a session then acted
    on a superseded line and re-proposed a change that same file recorded as
    already tried and rejected. A doc asking for brevity does not get it.

    When this fails, MOVE the content to its home (README / PRODUCT /
    docs/OPERATIONS / the vault). Never raise MAX_LINES.

    HANDOVER.md is gitignored, so it is absent on a fresh clone and in CI, and
    the test must pass when it is.
    """
    import re

    max_lines = 200
    handover = Path(__file__).resolve().parent / "HANDOVER.md"
    if not handover.exists():
        return

    lines = handover.read_text(encoding="utf-8").splitlines()
    assert len(lines) <= max_lines, (
        f"HANDOVER.md is {len(lines)} lines (max {max_lines}); move content to its home"
    )

    dated = [l for l in lines if re.match(r"^#{1,4} .*\d{4}-\d{2}-\d{2}", l)]
    assert not dated, f"dated headings belong in git log, not the handover: {dated}"


def _cell_row(**kwargs) -> wipboard.Row:
    """A row with the fields the NEXT column reads, overridable per test."""
    fields = {
        "name": "alpha",
        "stage": "building",
        "note": "the curated note",
        "last_commit": datetime(2026, 10, 20, 12, 0),
        "flags": ["!"],
        "has_git": True,
        "branch": "main",
    }
    fields.update(kwargs)
    return wipboard.Row(**fields)


def test_next_column_shows_the_first_next_item_when_it_fits() -> None:
    """Catches the column still printing the note when a next item is in hand."""
    row = _cell_row(next_items=["ship the thing", "then the other"], next_source="handover")

    assert wipboard._note_cell(row) == "!  ship the thing"


def test_next_column_falls_back_to_the_note_when_the_item_is_too_long() -> None:
    """Catches a truncated paragraph: past the cap the author's note wins."""
    long_item = "x" * (wipboard.NEXT_CELL_MAX_CHARS + 1)
    row = _cell_row(next_items=[long_item], next_source="handover")

    assert wipboard._note_cell(row) == "!  the curated note"


def test_next_column_falls_back_to_the_note_with_no_next_items() -> None:
    """Catches an empty next list blanking the column."""
    row = _cell_row(next_items=[], next_source="")

    assert wipboard._note_cell(row) == "!  the curated note"


def test_next_column_keeps_the_flags_first_in_every_case() -> None:
    """Catches the flags being dropped or moved behind the text."""
    fits = _cell_row(next_items=["ship it"], next_source="handover")
    too_long = _cell_row(next_items=["x" * 61], next_source="handover")
    none = _cell_row(next_items=[], next_source="")
    bare = _cell_row(note="", next_items=[], next_source="")

    for row in (fits, too_long, none):
        assert wipboard._note_cell(row).startswith("!  ")
    # No next item and no note leaves just the flags, as before.
    assert wipboard._note_cell(bare) == "!"


def test_both_views_head_the_last_column_next() -> None:
    """Catches the table and the markdown disagreeing about the column."""
    rows = [_cell_row()]

    assert wipboard.render_table(rows, datetime(2026, 10, 20, 14, 0)).splitlines()[0].split()[-1] == "NEXT"
    assert "| PROJECT | STAGE | TOUCHED | NEXT |" in wipboard.render_md(rows).splitlines()


def test_render_project_shows_every_section() -> None:
    """Catches a section going missing from the single-project view."""
    now = datetime(2026, 10, 20, 14, 0)
    row = _cell_row(
        note="CLI and tests done, not published",
        next_items=["Dashboard redesign", "Register the push task"],
        next_source="handover",
        recent=[
            {"at": now - timedelta(hours=2), "subject": "feat(worker): split the sheet"},
            {"at": now - timedelta(hours=3), "subject": "feat(cli): read what is next"},
        ],
        uncommitted=["docs/OPERATIONS.md", "wipboard.py"],
        changed=2,
    )

    out = wipboard.render_project(row, now)

    assert out.splitlines()[0] == "alpha  building  2h"
    assert "main  !" in out
    assert "CLI and tests done, not published" in out
    assert "NEXT  (from HANDOVER.md)" in out
    assert "  - Dashboard redesign" in out
    assert "  - Register the push task" in out
    assert "RECENT" in out
    assert "  2h  feat(worker): split the sheet" in out
    assert "  3h  feat(cli): read what is next" in out
    assert "UNCOMMITTED  (2)" in out
    assert "  docs/OPERATIONS.md" in out
    assert "  wipboard.py" in out


def test_render_project_omits_empty_sections() -> None:
    """Catches a stray heading printed over nothing."""
    now = datetime(2026, 10, 20, 14, 0)
    row = _cell_row(note="", next_items=[], next_source="", recent=[], uncommitted=[], changed=0)

    out = wipboard.render_project(row, now)

    assert "NEXT" not in out
    assert "RECENT" not in out
    assert "UNCOMMITTED" not in out
    assert out.splitlines() == ["alpha  building  2h", "main  !"]


def test_render_project_counts_the_paths_it_did_not_list() -> None:
    """Catches the cap of 8 paths hiding the true total."""
    now = datetime(2026, 10, 20, 14, 0)
    row = _cell_row(uncommitted=[f"file{i}.py" for i in range(8)], changed=11)

    out = wipboard.render_project(row, now)

    assert "UNCOMMITTED  (11)" in out
    assert out.splitlines()[-1] == "  and 3 more"


def test_show_project_returns_one_for_an_unknown_name(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """Catches an unknown name printing an empty block and exiting 0."""
    store_file = tmp_path / "projects.json"
    monkeypatch.setattr(wipboard, "store_path", lambda: store_file)
    store_file.write_text('{"roots": [], "projects": {"Alpha": {"stage": "idea"}}}')

    assert wipboard.main(["show", "Nope"]) == 1
    assert "No project called Nope." in capsys.readouterr().err


def test_show_project_matches_a_name_case_insensitively(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """Catches a typed name in the wrong case failing to find the project."""
    store_file = tmp_path / "projects.json"
    monkeypatch.setattr(wipboard, "store_path", lambda: store_file)
    store_file.write_text('{"roots": [], "projects": {"Alpha": {"stage": "building"}}}')

    assert wipboard.main(["show", "alpha"]) == 0
    assert capsys.readouterr().out.splitlines()[0].startswith("Alpha  building")


def test_uncommitted_keeps_the_whole_first_path(tmp_path: Path) -> None:
    """Catches the fixed line[3:] slice eating a character off the first path.

    _git strips the whole status output, so a " M path" line arrives without its
    leading space and a fixed slice turns wipboard.py into ipboard.py. It is
    only ever wrong on the first line, which is why it survived a review.
    """
    repo = tmp_path / "r"
    make_repo(repo, when=datetime(2026, 1, 1, 12, 0))
    (repo / "wipboard.py").write_text("x\n", encoding="utf-8")
    (repo / "second.py").write_text("y\n", encoding="utf-8")

    info = wipboard.git_info(repo)

    assert "wipboard.py" in info["paths"]
    assert "second.py" in info["paths"]
    assert not any(path.startswith("ipboard") for path in info["paths"])


def test_next_item_cut_lands_on_a_word_boundary(tmp_path: Path) -> None:
    """Catches a cut landing mid-word, which reads as a bug and not as a cut."""
    words = ("alpha " * 60).strip()
    (tmp_path / "HANDOVER.md").write_text(f"## Next\n\n- {words}\n", encoding="utf-8")

    items, _ = wipboard.project_next(tmp_path)

    assert items[0].endswith("…")
    assert items[0][:-1].endswith("alpha")
    assert len(items[0]) <= wipboard.NEXT_MAX_CHARS + 1
