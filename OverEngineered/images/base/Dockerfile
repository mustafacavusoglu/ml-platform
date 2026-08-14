# syntax=docker/dockerfile:1
FROM python:3.11-slim-bookworm

LABEL org.opencontainers.image.title="mlops-base" \
      org.opencontainers.image.description="Base runtime for MLOps platform workloads" \
      org.opencontainers.image.source="https://github.com/example/mlops-platform"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        tini \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 1000 mlops \
    && useradd --uid 1000 --gid mlops --shell /bin/bash --create-home mlops

WORKDIR /workspace
USER mlops

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["python", "--version"]
