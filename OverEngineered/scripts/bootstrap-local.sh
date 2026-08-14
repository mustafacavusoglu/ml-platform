#!/usr/bin/env bash
# Local MLOps platform bootstrap: kind + Argo CD + in-cluster git + App of Apps smoke test
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLUSTER_NAME="${CLUSTER_NAME:-mlops}"
ARGO_NS="${ARGO_NS:-argocd}"
GIT_NS="${GIT_NS:-git}"
LOCAL_GIT_HOST="${LOCAL_GIT_HOST:-gitea-http.git.svc.cluster.local}"
# In-cluster clone URL used by Argo (HTTP, no auth for local demo)
REPO_URL="${REPO_URL:-http://${LOCAL_GIT_HOST}:3000/mlops/mlops-platform.git}"
GITEA_ADMIN_USER="${GITEA_ADMIN_USER:-mlops}"
GITEA_ADMIN_PASS="${GITEA_ADMIN_PASS:-mlopsadmin}"
SKIP_IMAGES="${SKIP_IMAGES:-false}"

log() { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
err() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; }

need() {
  command -v "$1" >/dev/null 2>&1 || { err "missing dependency: $1"; exit 1; }
}

need docker
need kubectl
need helm
need kind
need git

if ! docker info >/dev/null 2>&1; then
  err "Docker is not running. Start OrbStack/Docker Desktop and re-run."
  exit 1
fi

# ---------------------------------------------------------------------------
# 1. kind cluster
# ---------------------------------------------------------------------------
log "Ensuring kind cluster '${CLUSTER_NAME}'"
if ! kind get clusters 2>/dev/null | grep -qx "${CLUSTER_NAME}"; then
  kind create cluster --name "${CLUSTER_NAME}" --config "${ROOT}/hack/kind-config.yaml"
else
  log "Cluster already exists"
fi
kubectl cluster-info --context "kind-${CLUSTER_NAME}" >/dev/null
kubectl config use-context "kind-${CLUSTER_NAME}" >/dev/null

# ---------------------------------------------------------------------------
# 2. Build & load local images (fast path for serving smoke test)
# ---------------------------------------------------------------------------
if [[ "${SKIP_IMAGES}" != "true" ]]; then
  log "Building local images and loading into kind"
  docker build -t mlops/serving:local "${ROOT}/images/serving"
  docker build -t mlops/training:local "${ROOT}/images/training" || {
    log "training image build failed (optional for smoke) — continuing"
  }
  kind load docker-image mlops/serving:local --name "${CLUSTER_NAME}"
  if docker image inspect mlops/training:local >/dev/null 2>&1; then
    kind load docker-image mlops/training:local --name "${CLUSTER_NAME}" || true
  fi
fi

# ---------------------------------------------------------------------------
# 3. Scaffold catalog projects
# ---------------------------------------------------------------------------
if command -v yq >/dev/null 2>&1; then
  log "Scaffolding projects from catalog"
  bash "${ROOT}/scripts/scaffold-project.sh" --all
else
  log "yq not found — skip scaffold (install yq for full flow)"
fi

# Patch demo workload to use local images when present
if command -v yq >/dev/null 2>&1; then
  shopt -s nullglob
  for vf in "${ROOT}"/projects/workloads/*/values.yaml; do
    yq -i '
      .image.serving = "mlops/serving:local" |
      .image.training = "mlops/training:local" |
      .image.pullPolicy = "IfNotPresent" |
      .training.command = ["python","-c","print(\"local training ok\")"]
    ' "$vf"
  done
  shopt -u nullglob
fi

# ---------------------------------------------------------------------------
# 4. Install Argo CD
# ---------------------------------------------------------------------------
log "Installing Argo CD"
kubectl create namespace "${ARGO_NS}" --dry-run=client -o yaml | kubectl apply -f -
# Server-side apply avoids CRD annotation size limit on large Argo CRDs
kubectl apply --server-side --force-conflicts -n "${ARGO_NS}" \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

log "Waiting for Argo CD server"
kubectl -n "${ARGO_NS}" rollout status deployment/argocd-server --timeout=300s
kubectl -n "${ARGO_NS}" rollout status deployment/argocd-repo-server --timeout=300s
kubectl -n "${ARGO_NS}" rollout status deployment/argocd-applicationset-controller --timeout=300s
kubectl -n "${ARGO_NS}" rollout status statefulset/argocd-application-controller --timeout=300s

# kind/OrbStack: default Argo NetworkPolicies frequently break CoreDNS resolution
log "Removing Argo CD NetworkPolicies (local/dev)"
kubectl -n "${ARGO_NS}" delete networkpolicy --all --ignore-not-found

# ---------------------------------------------------------------------------
# 5. Platform foundations (main chart) — creates AppProject mlops
# ---------------------------------------------------------------------------
log "Installing onBoardingCharts/main"
# Release lives in argocd so chart-owned mlops-* namespaces are created by Helm
# without conflicting with --create-namespace on the release namespace.
helm upgrade --install mlops-main "${ROOT}/onBoardingCharts/main" \
  -f "${ROOT}/projects/environments/dev/main-values.yaml" \
  --namespace argocd \
  --wait --timeout 120s || true

# AppProject may target argocd ns; ensure it exists
if ! kubectl -n argocd get appproject mlops >/dev/null 2>&1; then
  log "Creating AppProject mlops (fallback)"
  cat <<EOF | kubectl apply -f -
apiVersion: argoproj.io/v1alpha1
kind: AppProject
metadata:
  name: mlops
  namespace: argocd
spec:
  description: MLOps platform
  sourceRepos:
    - "*"
  destinations:
    - namespace: "*"
      server: https://kubernetes.default.svc
  clusterResourceWhitelist:
    - group: "*"
      kind: "*"
  namespaceResourceWhitelist:
    - group: "*"
      kind: "*"
EOF
fi

# ---------------------------------------------------------------------------
# 6. In-cluster Gitea + push monorepo
# ---------------------------------------------------------------------------
log "Deploying Gitea for local GitOps source"
kubectl create namespace "${GIT_NS}" --dry-run=client -o yaml | kubectl apply -f -
kubectl -n "${GIT_NS}" apply -f "${ROOT}/hack/gitea.yaml"
kubectl -n "${GIT_NS}" rollout status deployment/gitea --timeout=180s

log "Waiting for Gitea HTTP"
for i in $(seq 1 60); do
  if kubectl -n "${GIT_NS}" exec deploy/gitea -- wget -qO- http://127.0.0.1:3000/ >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

# Port-forward Gitea for API + git push from host
log "Port-forward Gitea :3000"
kubectl -n "${GIT_NS}" port-forward svc/gitea-http 3000:3000 >/tmp/gitea-pf.log 2>&1 &
PF_PID=$!
cleanup() { kill "${PF_PID}" 2>/dev/null || true; }
trap cleanup EXIT
sleep 3

log "Creating Gitea admin user (idempotent)"
# Container process must not run gitea CLI as root
kubectl -n "${GIT_NS}" exec deploy/gitea -- \
  su git -s /bin/sh -c \
  "gitea admin user create --username '${GITEA_ADMIN_USER}' --password '${GITEA_ADMIN_PASS}' --email mlops@example.com --admin --must-change-password=false" \
  2>/dev/null || \
kubectl -n "${GIT_NS}" exec deploy/gitea -- \
  su-exec git gitea admin user create \
    --username "${GITEA_ADMIN_USER}" \
    --password "${GITEA_ADMIN_PASS}" \
    --email mlops@example.com \
    --admin \
    --must-change-password=false 2>/dev/null || true

# Create access token via API
log "Creating Gitea API token"
TOKEN=""
for attempt in 1 2 3 4 5; do
  TOKEN="$(curl -sf -u "${GITEA_ADMIN_USER}:${GITEA_ADMIN_PASS}" \
    -H "Content-Type: application/json" \
    -X POST "http://127.0.0.1:3000/api/v1/users/${GITEA_ADMIN_USER}/tokens" \
    -d "{\"name\":\"bootstrap-$(date +%s)-${attempt}\",\"scopes\":[\"write:repository\",\"write:user\",\"write:organization\",\"read:repository\",\"read:user\"]}" \
    | python3 -c 'import sys,json; print(json.load(sys.stdin).get("sha1",""))' 2>/dev/null || true)"
  [[ -n "${TOKEN}" ]] && break
  sleep 2
done

if [[ -z "${TOKEN}" ]]; then
  err "Could not create Gitea token — check port-forward / Gitea install"
  cat /tmp/gitea-pf.log || true
  kubectl -n "${GIT_NS}" logs deploy/gitea --tail=50 || true
  exit 1
fi

# Create repo under admin user (org name collides with username)
curl -sf -X POST "http://127.0.0.1:3000/api/v1/user/repos" \
  -H "Authorization: token ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"name":"mlops-platform","private":false,"auto_init":false}' >/dev/null 2>&1 || true

# Rewrite repo URLs in a temp copy for in-cluster Gitea
WORKDIR="$(mktemp -d)"
log "Preparing git content in ${WORKDIR}"
rsync -a --exclude .git --exclude dist "${ROOT}/" "${WORKDIR}/"

# Point all Argo manifests at in-cluster Gitea
find "${WORKDIR}/projects" -type f \( -name '*.yaml' -o -name '*.yml' \) -print0 \
  | xargs -0 sed -i.bak \
    's|https://github.com/example/mlops-platform.git|http://gitea-http.git.svc.cluster.local:3000/mlops/mlops-platform.git|g'
find "${WORKDIR}/projects" -name '*.bak' -delete

# Disable heavy external images for local smoke: monitoring + mlflow optional soft-fail
# model-serving uses local image via values patch
if [[ -f "${WORKDIR}/projects/environments/dev/model-serving-values.yaml" ]] && command -v yq >/dev/null 2>&1; then
  yq -i '
    .image.repository = "mlops/serving" |
    .image.tag = "local" |
    .image.pullPolicy = "IfNotPresent"
  ' "${WORKDIR}/projects/environments/dev/model-serving-values.yaml"
fi

# Push to Gitea
git -C "${WORKDIR}" init -b main
git -C "${WORKDIR}" config user.email "mlops@example.com"
git -C "${WORKDIR}" config user.name "mlops-bootstrap"
git -C "${WORKDIR}" add -A
git -C "${WORKDIR}" commit -m "bootstrap: local platform snapshot"
git -C "${WORKDIR}" remote add origin "http://${GITEA_ADMIN_USER}:${GITEA_ADMIN_PASS}@127.0.0.1:3000/mlops/mlops-platform.git"
git -C "${WORKDIR}" push -u origin main --force

# ---------------------------------------------------------------------------
# 7. Register repo in Argo CD (insecure HTTP ok for local)
# ---------------------------------------------------------------------------
log "Registering repository with Argo CD"
kubectl -n "${ARGO_NS}" apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: repo-mlops-platform
  namespace: ${ARGO_NS}
  labels:
    argocd.argoproj.io/secret-type: repository
stringData:
  type: git
  url: http://gitea-http.git.svc.cluster.local:3000/mlops/mlops-platform.git
  password: "${GITEA_ADMIN_PASS}"
  username: "${GITEA_ADMIN_USER}"
  insecure: "true"
EOF

# ---------------------------------------------------------------------------
# 8. Root Application (App of Apps)
# ---------------------------------------------------------------------------
log "Applying root Application"
kubectl apply -f - <<EOF
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: mlops-root
  namespace: argocd
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: mlops
  source:
    repoURL: http://gitea-http.git.svc.cluster.local:3000/mlops/mlops-platform.git
    targetRevision: HEAD
    path: projects/applications
    directory:
      recurse: true
      include: "{*.yaml,*.yml}"
  destination:
    server: https://kubernetes.default.svc
    namespace: argocd
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
EOF

# ---------------------------------------------------------------------------
# 9. Wait for child apps
# ---------------------------------------------------------------------------
log "Waiting for ApplicationSet / Applications to appear"
for i in $(seq 1 60); do
  count="$(kubectl -n argocd get applications.argoproj.io --no-headers 2>/dev/null | wc -l | tr -d ' ')"
  if [[ "${count}" -ge 2 ]]; then
    break
  fi
  sleep 5
done

log "Argo Applications:"
kubectl -n argocd get applications.argoproj.io -o wide || true

log "Triggering refresh/sync on root"
kubectl -n argocd annotate application mlops-root \
  argocd.argoproj.io/refresh=hard --overwrite 2>/dev/null || true

# Soft wait — some apps (mlflow pull) may stay Progressing
sleep 15
kubectl -n argocd get applications.argoproj.io || true

log "Namespaces:"
kubectl get ns | grep -E 'mlops|proj-|argocd|git' || true

log "Bootstrap complete"
cat <<EOF

Next steps:
  # Argo CD UI
  kubectl -n argocd port-forward svc/argocd-server 8080:443
  # password:
  kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d; echo

  # Status
  kubectl -n argocd get app
  kubectl get applicationset -n argocd

  # Add a project:
  #   1) create catalog/projects/my-proj.yaml
  #   2) ./scripts/scaffold-project.sh --project my-proj
  #   3) re-push to Gitea (or re-run bootstrap push section)

Cluster: kind-${CLUSTER_NAME}
Git:     http://127.0.0.1:3000/mlops/mlops-platform (admin ${GITEA_ADMIN_USER})
EOF
