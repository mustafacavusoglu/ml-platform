# projects — Argo CD App of Apps

GitOps root for the MLOps platform.

## Layout

```
projects/
├── bootstrap/root-app.yaml     # one-shot root Application
├── app-of-apps/                # Helm wrapper for root
├── applications/               # synced by mlops-root
│   ├── platform/               # main + monitoring
│   ├── ml-stack/               # mlflow + model-serving
│   ├── tenants/                # ApplicationSet → onBoardingCharts/user
│   └── workloads/              # ApplicationSet → projects/workloads/*
├── charts/                     # component Helm charts
├── environments/{dev,staging,prod}/
├── tenants/                    # user onboarding values
└── workloads/                  # scaffolded ML projects (from catalog)
```

## Project registration flow

1. Add `catalog/projects/<name>.yaml`
2. Run `./scripts/scaffold-project.sh --project <name>` (or merge to main → CI)
3. Commit `projects/workloads/<name>/`
4. ApplicationSet `mlops-workloads` creates Argo Application `proj-<name>`

## Local bootstrap

```bash
./scripts/bootstrap-local.sh
kubectl -n argocd get app
```

See root [README.md](../README.md) for full details.
