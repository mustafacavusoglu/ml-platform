# mlops-platform

Kubernetes-native MLOps monorepo: **onboarding Helm charts**, **container images**, **Argo CD App of Apps**, and a **project catalog → scaffold → GitOps** flow.

## Architecture

```
catalog/projects/<name>.yaml     ← you register a project here
        │
        │  CI: scaffold-project  OR  scripts/scaffold-project.sh
        ▼
projects/workloads/<name>/       ← Helm chart from templates/ml-project
        │
        │  Argo ApplicationSet (mlops-workloads)
        ▼
cluster: proj-<name> namespace    ← training Job + serving Deployment
```

```
                    ┌─────────────────────┐
                    │  Argo CD            │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  mlops-root (App)   │  path: projects/applications
                    └──────────┬──────────┘
     ┌─────────────┬───────────┼───────────┬──────────────┐
     ▼             ▼           ▼           ▼              ▼
 platform/*    ml-stack/*  tenants/*  workloads/*     (AppSets)
 (main, mon)   (mlflow..)  users      ML projects
```

| Path | Role |
|------|------|
| `onBoardingCharts/main` | Platform namespaces, RBAC, Argo `AppProject` |
| `onBoardingCharts/user` | Per-tenant isolation (namespace, quota, SA) |
| `images/*` | base / notebook / training / serving / pipeline |
| `catalog/projects` | **Project registration** (source of truth) |
| `templates/ml-project` | Scaffold template for new ML projects |
| `projects/workloads` | Scaffolded project instances (GitOps) |
| `projects/applications` | Child Argo Applications + ApplicationSets |
| `projects/charts` | Platform component charts (mlflow, serving, …) |
| `projects/environments` | dev / staging / prod values |

## GitHub Actions

| Workflow | Path | Purpose |
|----------|------|---------|
| Chart Release | `.github/workflows/chart-release.yml` | Lint + package onboarding/platform charts → GHCR OCI (`oci://ghcr.io/<org>/charts`) |
| Images Build | `.github/workflows/images-build.yml` | Matrix build `images/*` → GHCR |
| Scaffold Project | `.github/workflows/scaffold-project.yml` | Catalog → `projects/workloads/<name>` |
| CI Lint | `.github/workflows/ci-lint.yml` | Helm lint + catalog name checks |

Tags:

- `charts-vX.Y.Z` — chart package version override  
- `images-vX.Y.Z` or `vX.Y.Z` — image tags  

## Add a new ML project

1. Copy catalog template:

```bash
cp catalog/projects/_example.yaml catalog/projects/my-model.yaml
# edit metadata.name == my-model
```

2. Scaffold workload (local or via CI on merge):

```bash
./scripts/scaffold-project.sh --project my-model
# creates projects/workloads/my-model/ from templates/ml-project
```

3. Commit & push. Argo ApplicationSet `mlops-workloads` deploys `proj-my-model`.

4. Customize `projects/workloads/my-model/values.yaml` (images, resources, schedule).

## Local bootstrap (kind + Argo CD)

Prerequisites: Docker (OrbStack/Desktop), `kind`, `kubectl`, `helm`, `yq`, `git`, `curl`.

```bash
./scripts/bootstrap-local.sh
# SKIP_IMAGES=true ./scripts/bootstrap-local.sh   # reuse already-built images
```

What it does:

1. Creates kind cluster `mlops`  
2. Builds/loads `mlops/serving:local` (+ training)  
3. Scaffolds catalog projects  
4. Installs Argo CD (server-side apply) and **removes NetworkPolicies** (kind DNS)  
5. Installs `onBoardingCharts/main`  
6. Runs in-cluster Gitea, pushes monorepo  
7. Registers repo + applies App of Apps root  

Useful commands after bootstrap:

```bash
kubectl config use-context kind-mlops
kubectl -n argocd get app
kubectl -n argocd get applicationset

# Argo UI
kubectl -n argocd port-forward svc/argocd-server 8080:443
# password:
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d; echo

# Demo project serving
kubectl -n proj-demo-fraud port-forward svc/demo-fraud-serving 8080:8080
curl localhost:8080/health
```

Tear down:

```bash
kind delete cluster --name mlops
```

## Production notes

1. Replace `https://github.com/example/mlops-platform.git` in `projects/**` with your real remote.  
2. Use GHCR images from the Images Build workflow.  
3. Keep Argo NetworkPolicies in production; only the local bootstrap strips them.  
4. Secrets: External Secrets / Sealed Secrets — never commit credentials.  
5. Chart installs: prefer OCI (`helm install oci://ghcr.io/<org>/charts/mlops-user`).  

## Suggested delivery order

1. Bootstrap platform (`main` chart + Argo root)  
2. Wire GHCR workflows  
3. Register first project in catalog → scaffold → sync  
4. Add MLflow/monitoring for real (replace placeholders)  
5. GPU training image variant + CI path filters  
