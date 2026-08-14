# {{PROJECT_NAME}}

Scaffolded ML project workload.

| Item | Value |
|------|--------|
| Catalog source | `catalog/projects/{{PROJECT_NAME}}.yaml` |
| Namespace | `proj-{{PROJECT_NAME}}` |
| Chart | this directory (Helm) |

## Customize

- `values.yaml` — resources, images, components
- `project.yaml` — metadata (keep name in sync with catalog)
- Templates under `templates/` — Job / Deployment manifests

## Deploy

Managed by Argo CD ApplicationSet (`projects/applications/workloads/`).
Manual:

```bash
helm upgrade --install proj-{{PROJECT_NAME}} . -n proj-{{PROJECT_NAME}} --create-namespace
```
