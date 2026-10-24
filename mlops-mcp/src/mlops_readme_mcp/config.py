from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

import yaml


@dataclass(frozen=True)
class RepoConfig:
    id: str
    url: str
    branch: str | None = None
    readme_path: str | None = None
    description: str | None = None


@dataclass(frozen=True)
class AppConfig:
    repos: list[RepoConfig]
    ttl_days: int = 7
    cache_path: Path = Path(".cache/readmes.json")


def parse_repo_url(url: str) -> tuple[str, str]:
    parsed = urlparse(url)
    if parsed.hostname != "github.com":
        raise ValueError(f"Unsupported GitHub repo URL: {url}")

    parts = [part for part in parsed.path.split("/") if part]
    if len(parts) < 2:
        raise ValueError(f"Unsupported GitHub repo URL: {url}")

    repo = parts[1].removesuffix(".git")
    return parts[0], repo


def _parse_config(raw: str) -> AppConfig:
    data = yaml.safe_load(raw) or {}
    cache = data.get("cache") or {}
    raw_repos = data.get("repos") or []

    if not isinstance(raw_repos, list) or not raw_repos:
        raise ValueError("YAML config must define at least one repo")

    repos: list[RepoConfig] = []
    for item in raw_repos:
        if not isinstance(item, dict) or not item.get("id") or not item.get("url"):
            raise ValueError("Each repo needs an id and url")

        repo = RepoConfig(
            id=str(item["id"]),
            url=str(item["url"]),
            branch=str(item["branch"]) if item.get("branch") else None,
            readme_path=str(item["readme_path"]) if item.get("readme_path") else None,
            description=str(item["description"]) if item.get("description") else None,
        )
        parse_repo_url(repo.url)
        repos.append(repo)

    return AppConfig(
        repos=repos,
        ttl_days=int(cache.get("ttl_days", 7)),
        cache_path=Path(str(cache.get("path", ".cache/readmes.json"))),
    )


def load_config(
    config_path: str | Path | None = None,
    config_url: str | None = None,
) -> tuple[AppConfig, Path]:
    if config_url:
        request = Request(
            config_url,
            headers={
                "Accept": "text/yaml, text/plain, */*",
                "User-Agent": "mlops-readme-mcp",
            },
        )
        with urlopen(request, timeout=30) as response:
            raw = response.read().decode("utf-8")
        config_dir = Path.cwd()
    else:
        path = Path(config_path or "repos.yml")
        raw = path.read_text(encoding="utf-8")
        config_dir = path.resolve().parent

    config = _parse_config(raw)
    cache_path = config.cache_path
    if not cache_path.is_absolute():
        cache_path = config_dir / cache_path

    return AppConfig(
        repos=config.repos,
        ttl_days=config.ttl_days,
        cache_path=cache_path,
    ), config_dir
