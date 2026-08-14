# onBoardingCharts

Helm charts that bootstrap the MLOps platform and onboard tenants (users/teams).

| Chart | Path | Purpose |
|-------|------|---------|
| **main** | `main/` | Cluster-level foundations: system namespaces, platform RBAC, quotas, Argo CD `AppProject` |
| **user** | `user/` | Per-user/team tenant: namespace, workload SA, quotas, network policy, optional workspace PVC |

## Prerequisites

- Kubernetes 1.27+
- Helm 3.12+
- Argo CD installed (for `AppProject` and GitOps flow)

## Install main platform

```bash
helm upgrade --install mlops-main ./onBoardingCharts/main \
  --namespace mlops-system \
  --create-namespace \
  --set platform.environment=dev
```

## Onboard a user

```bash
helm upgrade --install user-ada ./onBoardingCharts/user \
  -f ./onBoardingCharts/user/values-examples/data-scientist.yaml
```

Or inline:

```bash
helm upgrade --install user-bob ./onBoardingCharts/user \
  --set user.name=bob \
  --set user.team=ml-eng \
  --set user.email=bob@example.com
```

## Uninstall a user

```bash
helm uninstall user-ada
# Namespace is owned by the release; remove leftovers if needed:
# kubectl delete ns mlops-ada-lovelace
```

## Suggested order

1. `main` chart → platform namespaces + Argo project  
2. Argo App of Apps bootstrap (`projects/bootstrap/`)  
3. `user` chart(s) for each tenant  
