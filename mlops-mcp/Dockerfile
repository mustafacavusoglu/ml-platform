# Base images are overridable for mirrors (e.g. Nexus):
#   docker build --build-arg UV_IMAGE=nexus.example.com/astral-sh/uv:python3.13-bookworm-slim ...
ARG UV_IMAGE=ghcr.io/astral-sh/uv:python3.13-bookworm-slim
ARG PYTHON_IMAGE=python:3.13-slim-bookworm

FROM ${UV_IMAGE} AS build
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-dev --no-install-project
COPY src ./src
RUN uv sync --frozen --no-dev --no-editable

FROM ${PYTHON_IMAGE}
WORKDIR /app
COPY --from=build /app/.venv /app/.venv
COPY repos.yml ./repos.yml
# OpenShift runs containers with a random UID in group 0.
RUN chgrp -R 0 /app && chmod -R g=u /app
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    MCP_TRANSPORT=http \
    MCP_REPOS_CONFIG=/app/repos.yml
USER 1001
EXPOSE 8080
ENTRYPOINT ["mlops-readme-mcp"]
