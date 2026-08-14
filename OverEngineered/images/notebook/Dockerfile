# syntax=docker/dockerfile:1
ARG BASE_IMAGE=python:3.11-slim-bookworm
FROM ${BASE_IMAGE}

LABEL org.opencontainers.image.title="mlops-notebook" \
      org.opencontainers.image.description="JupyterLab environment for interactive ML"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    JUPYTER_ENABLE_LAB=yes

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        curl \
        git \
        tini \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 1000 mlops \
    && useradd --uid 1000 --gid mlops --shell /bin/bash --create-home mlops

COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt \
    && rm /tmp/requirements.txt

WORKDIR /home/mlops/work
USER mlops

EXPOSE 8888
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["jupyter", "lab", "--ip=0.0.0.0", "--port=8888", "--no-browser", \
     "--ServerApp.token=", "--ServerApp.password=", \
     "--ServerApp.root_dir=/home/mlops/work"]
