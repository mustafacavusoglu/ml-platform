from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from .github import FetchedReadme


class ReadmeCache:
    def __init__(self, path: Path, ttl_days: int):
        self.path = path
        self.ttl_days = ttl_days

    def get(self, repo_id: str) -> FetchedReadme | None:
        entries = self._load()
        entry = entries.get(repo_id)
        if not entry:
            return None
        try:
            return FetchedReadme(
                repo_id=entry.get("repo_id") or entry.get("repoId") or repo_id,
                content=entry["content"],
                source=entry.get("source") or "",
                fetched_at=entry.get("fetched_at") or entry.get("fetchedAt") or "",
            )
        except (KeyError, TypeError):
            return None

    def is_stale(self, entry: FetchedReadme | None) -> bool:
        if entry is None:
            return True
        try:
            fetched_at = datetime.fromisoformat(entry.fetched_at)
        except ValueError:
            return True
        age = datetime.now(timezone.utc) - fetched_at
        return age.total_seconds() >= self.ttl_days * 24 * 60 * 60

    def set(self, entry: FetchedReadme) -> None:
        entries = self._load()
        entries[entry.repo_id] = entry.__dict__
        self._save(entries)

    def _load(self) -> dict[str, dict]:
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            return data.get("entries") or {}
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            return {}

    def _save(self, entries: dict[str, dict]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = self.path.with_suffix(".json.tmp")
        tmp_path.write_text(
            json.dumps({"version": 1, "entries": entries}, indent=2) + "\n",
            encoding="utf-8",
        )
        tmp_path.replace(self.path)
