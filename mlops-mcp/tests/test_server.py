import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from starlette.testclient import TestClient

from mlops_readme_mcp.config import AppConfig, RepoConfig, load_config
from mlops_readme_mcp.github import FetchedReadme, GithubReadmeFetcher
from mlops_readme_mcp.server import build_http_app

ROOT = Path(__file__).resolve().parents[1]
HEADERS = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
CALLS: list[tuple] = []


def fake_fetch(self, repo_id, owner, repo, readme_path=None, branch=None):
    CALLS.append((repo_id, owner, repo, branch))
    if repo_id == "down":
        raise RuntimeError("GitHub is down")
    return FetchedReadme(repo_id, f"readme of {owner}/{repo}", "test", datetime.now(timezone.utc).isoformat())


def make_client(tmp_path, token=None):
    GithubReadmeFetcher.fetch = fake_fetch
    config = AppConfig(
        repos=[
            RepoConfig("a", "https://github.com/org/a", branch="dev"),
            RepoConfig("b", "https://github.com/org/b"),
        ],
        cache_path=tmp_path / "cache.json",
    )
    return TestClient(build_http_app(config, "0.0.0.0", "/mcp", token))


def call_tool(client, name, arguments=None, headers=None):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": name, "arguments": arguments or {}}}
    response = client.post("/mcp", json=body, headers={**HEADERS, **(headers or {})})
    assert response.status_code == 200, response.text
    return response.json()["result"]


def test_tools_over_stateless_http(tmp_path):
    CALLS.clear()
    with make_client(tmp_path) as client:
        assert client.get("/healthz").json()["status"] == "ok"

        result = call_tool(client, "get_repository_readmes", {"repo_ids": ["a"]})
        text = result["content"][0]["text"]
        assert "readme of org/a" in text and "org/b" not in text
        assert CALLS == [("a", "org", "a", "dev")]

        # Second read is served from cache.
        call_tool(client, "get_repository_readmes", {"repo_ids": ["a"]})
        assert len(CALLS) == 1

        result = call_tool(client, "get_repository_readmes", {"repo_ids": ["nope"]})
        assert result["isError"] and "Unknown repo ids: nope" in result["content"][0]["text"]

        repos = json.loads(call_tool(client, "list_repositories")["content"][0]["text"])
        assert [(r["id"], r["stale"]) for r in repos] == [("a", False), ("b", True)]


def test_bearer_token(tmp_path):
    with make_client(tmp_path, token="s3cret") as client:
        assert client.get("/healthz").status_code == 200
        assert client.post("/mcp", json={}, headers=HEADERS).status_code == 401
        bad = client.post("/mcp", json={}, headers={**HEADERS, "Authorization": "Bearer nope"})
        assert bad.status_code == 401
        call_tool(client, "list_repositories", headers={"Authorization": "Bearer s3cret"})


def test_stale_cache_survives_github_outage(tmp_path):
    from mlops_readme_mcp.cache import ReadmeCache

    GithubReadmeFetcher.fetch = fake_fetch
    ReadmeCache(tmp_path / "cache.json", 7).set(FetchedReadme("down", "old readme", "test", "2000-01-01T00:00:00+00:00"))
    config = AppConfig(repos=[RepoConfig("down", "https://github.com/org/down")], cache_path=tmp_path / "cache.json")
    with TestClient(build_http_app(config, "0.0.0.0", "/mcp", None)) as client:
        assert "old readme" in call_tool(client, "get_repository_readmes")["content"][0]["text"]
        # Without a cached copy the GitHub error must reach the model, not a masked SDK error.
        result = call_tool(client, "refresh_repository_readmes")
        assert result["isError"] and "GitHub is down" in result["content"][0]["text"]


def test_config_from_url():
    config, _ = load_config(config_url=(ROOT / "repos.yml").as_uri())
    assert config.repos and config.ttl_days == 7


def test_stdio_starts():
    proc = subprocess.run(
        [sys.executable, "-m", "mlops_readme_mcp", "--config", str(ROOT / "repos.yml")],
        input=json.dumps(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "t", "version": "0"}},
            }
        )
        + "\n",
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert json.loads(proc.stdout.splitlines()[0])["result"]["serverInfo"]["name"] == "mlops-readmes"
