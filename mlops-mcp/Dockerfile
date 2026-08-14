FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim

WORKDIR /app

COPY pyproject.toml uv.lock README.md ./
COPY src ./src
COPY repos.yml ./repos.yml

RUN uv sync --frozen --no-dev

ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8080

CMD ["mlops-readme-mcp", "--transport", "http", "--port", "8080", "--host", "0.0.0.0", "--config", "repos.yml"]
