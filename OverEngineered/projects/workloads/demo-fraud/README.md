# demo-fraud

Scaffolded ML project workload.

| Item | Value |
|------|--------|
| Catalog source | `catalog/projects/demo-fraud.yaml` |
| Namespace | `proj-demo-fraud` |
| Chart | this directory (Helm) |

## Customize

- `values.yaml` — resources, images, components
- `project.yaml` — metadata (keep name in sync with catalog)
- Templates under `templates/` — Job / Deployment manifests

## Deploy

Managed by Argo CD ApplicationSet (`projects/applications/workloads/`).
Manual:

```bash
helm upgrade --install proj-demo-fraud . -n proj-demo-fraud --create-namespace
```
