from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen


@dataclass(frozen=True)
class FetchedReadme:
    repo_id: str
    content: str
    source: str
    fetched_at: str


class GithubReadmeFetcher:
    def __init__(self, token: str | None = None):
        self.token = token

    def fetch(
        self,
        repo_id: str,
        owner: str,
        repo: str,
        readme_path: str | None = None,
        branch: str | None = None,
    ) -> FetchedReadme:
        headers = {
            "Accept": "application/vnd.github.raw+json",
            "User-Agent": "mlops-readme-mcp",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"

        api_path = (
            f"/repos/{owner}/{repo}/contents/{quote(readme_path or '', safe='/')}"
            if readme_path
            else f"/repos/{owner}/{repo}/readme"
        )
        url = f"https://api.github.com{api_path}"
        request = Request(url, headers=headers)

        try:
            with urlopen(request, timeout=30) as response:
                content = response.read().decode("utf-8")
        except HTTPError as error:
            if error.code in (403, 429):
                raise RuntimeError(
                    f"GitHub rate limit reached while fetching {repo_id}. "
                    "Set GITHUB_TOKEN or wait before retrying."
                ) from error
            if error.code == 404:
                raise RuntimeError(
                    f"README not found for {repo_id} ({owner}/{repo})."
                ) from error
            body = error.read().decode("utf-8", errors="replace")
            raise RuntimeError(
                f"GitHub API returned {error.code} for {repo_id}: {body}"
            ) from error

        return FetchedReadme(
            repo_id=repo_id,
            content=content,
            source=url,
            fetched_at=datetime.now(timezone.utc).isoformat(),
        )
