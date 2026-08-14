# syntax=docker/dockerfile:1
ARG BASE_IMAGE=python:3.11-slim-bookworm
FROM ${BASE_IMAGE}

LABEL org.opencontainers.image.title="mlops-pipeline" \
      org.opencontainers.image.description="Utilities image for pipeline steps (data prep, validation)"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        jq \
        tini \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 1000 mlops \
    && useradd --uid 1000 --gid mlops --shell /bin/bash --create-home mlops

COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt \
    && rm /tmp/requirements.txt

WORKDIR /workspace
USER mlops

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["python", "--version"]
