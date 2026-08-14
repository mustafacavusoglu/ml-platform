from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from mcp.server.mcpserver import MCPServer

from .cache import ReadmeCache
from .config import AppConfig, RepoConfig, load_config, parse_repo_url
from .github import FetchedReadme, GithubReadmeFetcher


def build_app(config: AppConfig) -> MCPServer:
    app = MCPServer("mlops-readmes", version="0.1.0")
    store = ReadmeCache(config.cache_path, config.ttl_days)
    fetcher = GithubReadmeFetcher(os.getenv("GITHUB_TOKEN"))

    def resolve_repos(repo_ids: list[str] | None) -> list[RepoConfig]:
        if not repo_ids:
            return config.repos

        unknown = [
            repo_id for repo_id in repo_ids if not any(repo.id == repo_id for repo in config.repos)
        ]
        if unknown:
            raise ValueError(f"Unknown repo ids: {', '.join(unknown)}")
        return [repo for repo in config.repos if repo.id in selected]

    def read_readme(repo: RepoConfig) -> FetchedReadme:
        cached = store.get(repo.id)
        if not store.is_stale(cached):
            return cached  # type: ignore[return-value]

        owner, repo_name = parse_repo_url(repo.url)
        fetched = fetcher.fetch(
            repo.id,
            owner,
            repo_name,
            repo.readme_path,
            repo.branch,
        )
        store.set(fetched)
        return fetched

    def format_readme(entry: FetchedReadme) -> str:
        return (
            f"# {entry.repo_id}\n\n"
            f"- Source: {entry.source}\n"
            f"- Fetched at: {entry.fetched_at}\n\n"
            f"{entry.content}"
        )

    @app.tool()
    def list_repositories() -> str:
        rows = []
        for repo in config.repos:
            cached = store.get(repo.id)
            rows.append(
                {
                    "id": repo.id,
                    "url": repo.url,
                    "description": repo.description,
                    "fetched_at": cached.fetched_at if cached else None,
                    "stale": store.is_stale(cached),
                }
            )
        return json.dumps(rows, indent=2)

    @app.tool()
    def get_repository_readmes(repo_ids: list[str] | None = None) -> str:
        repos = resolve_repos(repo_ids)
        return "\n\n".join(format_readme(read_readme(repo)) for repo in repos)

    @app.tool()
    def refresh_repository_readmes(repo_ids: list[str] | None = None) -> str:
        repos = resolve_repos(repo_ids)
        refreshed = []
        for repo in repos:
            owner, repo_name = parse_repo_url(repo.url)
            fetched = fetcher.fetch(
                repo.id,
                owner,
                repo_name,
                repo.readme_path,
                repo.branch,
            )
            store.set(fetched)
            refreshed.append(
                {
                    "id": repo.id,
                    "fetched_at": fetched.fetched_at,
                    "bytes": len(fetched.content),
                }
            )
        return json.dumps(refreshed, indent=2)

    @app.resource("readme://{repo_id}")
    def readme_resource(repo_id: str) -> str:
        repo = next((repo for repo in config.repos if repo.id == repo_id), None)
        if repo is None:
            raise ValueError(f"Unknown repo id: {repo_id}")
        return format_readme(read_readme(repo))

    return app


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="MLOps README MCP server")
    parser.add_argument("--config", default=os.getenv("MCP_REPOS_CONFIG", "repos.yml"))
    parser.add_argument("--config-url", default=os.getenv("MCP_REPOS_CONFIG_URL"))
    parser.add_argument(
        "--transport",
        choices=["stdio", "http", "streamable-http"],
        default=os.getenv("MCP_TRANSPORT", "stdio"),
    )
    parser.add_argument("--host", default=os.getenv("MCP_HOST", "0.0.0.0"))
    parser.add_argument("--port", type=int, default=int(os.getenv("PORT", "8080")))
    parser.add_argument("--http-path", default=os.getenv("MCP_HTTP_PATH", "/mcp"))
    args = parser.parse_args(argv)

    config, _config_dir = load_config(args.config, args.config_url)
    app = build_app(config)

    if args.transport in ("http", "streamable-http"):
        app.run(
            transport="streamable-http",
            host=args.host,
            port=args.port,
            streamable_http_path=args.http_path,
        )
    else:
        app.run(transport="stdio")
