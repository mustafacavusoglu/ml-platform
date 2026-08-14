# syntax=docker/dockerfile:1
# CPU training image. For GPU, switch base to a CUDA-enabled PyTorch image.
ARG BASE_IMAGE=python:3.11-slim-bookworm
FROM ${BASE_IMAGE}

LABEL org.opencontainers.image.title="mlops-training" \
      org.opencontainers.image.description="Training runtime (PyTorch CPU by default)"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        curl \
        git \
        libgomp1 \
        tini \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 1000 mlops \
    && useradd --uid 1000 --gid mlops --shell /bin/bash --create-home mlops

COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt \
    && rm /tmp/requirements.txt

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

WORKDIR /workspace
USER mlops

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["python", "-c", "import torch; print(torch.__version__)"]
