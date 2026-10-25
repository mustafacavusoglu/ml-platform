from __future__ import annotations

import argparse
import hmac
import json
import logging
import os
from urllib.error import URLError

from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ResourceError, ToolError
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from . import __version__
from .cache import ReadmeCache
from .config import AppConfig, RepoConfig, load_config, parse_repo_url
from .github import FetchedReadme, GithubReadmeFetcher

log = logging.getLogger("mlops_readme_mcp")

HEALTH_PATH = "/healthz"

INSTRUCTIONS = """\
Bu server şirket içi MLOps platform repolarının dokümantasyonunu sunar: proje/kullanıcı
onboarding chart'ları, ml/batch/vllm/custom-serve template'leri, notebook ve uygulama
image'ları ve platform araçları.

Kullanıcı platformda bir işin nasıl yapılacağını sorduğunda (ör. "batch model nasıl
deploy edilir?", "build nasıl aldırılır?", "yeni proje nasıl açılır?"):
1. list_repositories ile repoları ve açıklamalarını gör, soruyla ilgili olanları seç.
2. get_repository_readmes ile yalnızca o repoların dokümanını al.
3. Cevabı bu dokümana dayandır, hangi repodan aldığını belirt. Dokümanda olmayan adımı uydurma.
"""


def build_app(config: AppConfig) -> MCPServer:
    app = MCPServer("mlops-readmes", version=__version__, instructions=INSTRUCTIONS)
    store = ReadmeCache(config.cache_path, config.ttl_days)
    fetcher = GithubReadmeFetcher(os.getenv("GITHUB_TOKEN"))

    def resolve_repos(repo_ids: list[str] | None) -> list[RepoConfig]:
        if not repo_ids:
            return config.repos

        known = {repo.id for repo in config.repos}
        unknown = [repo_id for repo_id in repo_ids if repo_id not in known]
        if unknown:
            raise ToolError(f"Unknown repo ids: {', '.join(unknown)}")
        return [repo for repo in config.repos if repo.id in repo_ids]

    def fetch(repo: RepoConfig) -> FetchedReadme:
        owner, repo_name = parse_repo_url(repo.url)
        try:
            fetched = fetcher.fetch(repo.id, owner, repo_name, repo.readme_path, repo.branch)
        except (RuntimeError, URLError) as error:
            # ToolError messages reach the model; other exceptions are masked by the SDK.
            raise ToolError(f"Could not fetch README for {repo.id}: {error}") from error
        store.set(fetched)
        return fetched

    def read_readme(repo: RepoConfig) -> FetchedReadme:
        cached = store.get(repo.id)
        if not store.is_stale(cached):
            return cached  # type: ignore[return-value]
        try:
            return fetch(repo)
        except ToolError as error:
            # A stale README beats no README when GitHub is down or rate limited.
            if cached is None:
                raise
            log.warning("Serving stale README for %s: %s", repo.id, error)
            return cached

    def format_readme(entry: FetchedReadme) -> str:
        return (
            f"# {entry.repo_id}\n\n"
            f"- Source: {entry.source}\n"
            f"- Fetched at: {entry.fetched_at}\n\n"
            f"{entry.content}"
        )

    @app.tool()
    def list_repositories() -> str:
        """List the internal MLOps platform repos (templates, charts, images, tools) with a
        description of what each covers. Call this first to pick the repos relevant to the question."""
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
        """Return the documentation (README) of the given repo ids: how to deploy, build, onboard
        and configure with that template or tool. Pass only the relevant ids; omitting them returns all."""
        repos = resolve_repos(repo_ids)
        return "\n\n".join(format_readme(read_readme(repo)) for repo in repos)

    @app.tool()
    def refresh_repository_readmes(repo_ids: list[str] | None = None) -> str:
        """Re-fetch READMEs from GitHub now, ignoring the cache TTL."""
        refreshed = []
        for repo in resolve_repos(repo_ids):
            fetched = fetch(repo)
            refreshed.append(
                {"id": repo.id, "fetched_at": fetched.fetched_at, "bytes": len(fetched.content)}
            )
        return json.dumps(refreshed, indent=2)

    @app.resource("readme://{repo_id}")
    def readme_resource(repo_id: str) -> str:
        repo = next((repo for repo in config.repos if repo.id == repo_id), None)
        if repo is None:
            raise ResourceError(f"Unknown repo id: {repo_id}")
        try:
            return format_readme(read_readme(repo))
        except ToolError as error:
            raise ResourceError(str(error)) from error

    @app.custom_route(HEALTH_PATH, methods=["GET"])
    async def healthz(_request: Request) -> Response:
        return JSONResponse({"status": "ok", "version": __version__})

    return app


def require_bearer_token(asgi_app, token: str):
    """Reject HTTP requests without `Authorization: Bearer <token>`; the health path stays open."""
    expected = f"Bearer {token}".encode()

    async def wrapped(scope, receive, send):
        if scope["type"] == "http" and scope["path"] != HEALTH_PATH:
            provided = dict(scope["headers"]).get(b"authorization", b"")
            if not hmac.compare_digest(provided, expected):
                await JSONResponse({"error": "unauthorized"}, status_code=401)(scope, receive, send)
                return
        await asgi_app(scope, receive, send)

    return wrapped


def build_http_app(config: AppConfig, host: str, http_path: str, auth_token: str | None):
    # Stateless + JSON responses: no sticky sessions or SSE buffering behind the
    # OpenShift router, so the Deployment can scale past one replica.
    asgi_app = build_app(config).streamable_http_app(
        streamable_http_path=http_path,
        stateless_http=True,
        json_response=True,
        host=host,
    )
    return require_bearer_token(asgi_app, auth_token) if auth_token else asgi_app


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
    parser.add_argument("--log-level", default=os.getenv("LOG_LEVEL", "INFO"))
    args = parser.parse_args(argv)

    logging.basicConfig(level=args.log_level.upper(), format="%(asctime)s %(levelname)s %(name)s %(message)s")
    config, _config_dir = load_config(args.config, args.config_url)

    if args.transport == "stdio":
        build_app(config).run(transport="stdio")
        return

    import uvicorn

    auth_token = os.getenv("MCP_AUTH_TOKEN") or None
    if not auth_token:
        log.warning("MCP_AUTH_TOKEN is not set; the HTTP endpoint accepts unauthenticated requests")
    uvicorn.run(
        build_http_app(config, args.host, args.http_path, auth_token),
        host=args.host,
        port=args.port,
        log_level=args.log_level.lower(),
        proxy_headers=True,
        forwarded_allow_ips="*",
    )
