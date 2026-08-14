# images

Container images for the MLOps platform. Each subdirectory is a self-contained image (Dockerfile + optional scripts/config).

## Layout

```
images/
├── base/              # Minimal OS + platform tooling (curl, kubectl-lite helpers)
├── notebook/          # JupyterLab for interactive ML
├── training/          # CPU/GPU training runtime (PyTorch)
├── serving/           # Model serving runtime (FastAPI skeleton)
└── pipeline/          # Lightweight CI/pipeline runner utilities
```

## Build

Registry and tag are controlled via build args / env:

```bash
export REGISTRY=ghcr.io/your-org/mlops-platform
export TAG=0.1.0

# Single image
docker build -t ${REGISTRY}/notebook:${TAG} ./images/notebook

# All images
for img in base notebook training serving pipeline; do
  docker build -t ${REGISTRY}/${img}:${TAG} ./images/${img}
done
```

## Multi-arch (optional)

```bash
docker buildx build --platform linux/amd64,linux/arm64 \
  -t ${REGISTRY}/base:${TAG} --push ./images/base
```

## Conventions

| Item | Convention |
|------|------------|
| User | Non-root `mlops` (uid 1000) where practical |
| Labels | `org.opencontainers.image.*` OCI labels |
| Base | Prefer pinned digest in production; tags used here for bootstrap clarity |
| Secrets | Never bake credentials into images |

## CI

Wire these paths into your pipeline (GitHub Actions / GitLab CI) with path filters so only changed images rebuild.
