#!/usr/bin/env bash
# Scaffold projects/workloads/<name> from catalog/projects/<name>.yaml + templates/ml-project
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CATALOG_DIR="${ROOT}/catalog/projects"
TEMPLATE_DIR="${ROOT}/templates/ml-project"
WORKLOADS_DIR="${ROOT}/projects/workloads"

ONLY_PROJECT=""
SCAFFOLD_ALL=false

usage() {
  cat <<'EOF'
Usage:
  scaffold-project.sh --all
  scaffold-project.sh --project <name>

Reads catalog/projects/<name>.yaml and materializes projects/workloads/<name>/
from templates/ml-project. Skips files starting with '_' and existing workloads
unless --force is set.
EOF
}

FORCE=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --all) SCAFFOLD_ALL=true; shift ;;
    --project) ONLY_PROJECT="${2:-}"; shift 2 ;;
    --force) FORCE=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; usage; exit 1 ;;
  esac
done

if ! command -v yq >/dev/null 2>&1; then
  echo "yq is required (https://github.com/mikefarah/yq)" >&2
  exit 1
fi

mkdir -p "${WORKLOADS_DIR}"

scaffold_one() {
  local catalog_file="$1"
  local base name
  base="$(basename "$catalog_file")"
  name="${base%.*}"

  if [[ "$base" == _* ]]; then
    echo "skip (underscore): ${base}"
    return 0
  fi

  local meta_name
  meta_name="$(yq -r '.metadata.name // ""' "$catalog_file")"
  if [[ -z "$meta_name" || "$meta_name" == "null" ]]; then
    echo "error: metadata.name missing in ${catalog_file}" >&2
    return 1
  fi
  if [[ "$meta_name" != "$name" ]]; then
    echo "error: filename stem '${name}' must match metadata.name '${meta_name}'" >&2
    return 1
  fi

  local dest="${WORKLOADS_DIR}/${name}"
  if [[ -d "$dest" && "$FORCE" != true ]]; then
    echo "exists (skip): projects/workloads/${name}"
    return 0
  fi

  echo "scaffold: projects/workloads/${name}"
  rm -rf "$dest"
  mkdir -p "$dest"
  cp -R "${TEMPLATE_DIR}/." "$dest/"

  local team description environment profile
  local cpu memory gpu
  local training serving notebook mlflow
  local img_train img_serve
  local schedule_enabled schedule_cron
  local owners

  team="$(yq -r '.metadata.team // "default"' "$catalog_file")"
  description="$(yq -r '.spec.description // ""' "$catalog_file")"
  environment="$(yq -r '.spec.environment // "dev"' "$catalog_file")"
  profile="$(yq -r '.spec.profile // "full"' "$catalog_file")"
  cpu="$(yq -r '.spec.resources.cpu // "2"' "$catalog_file")"
  memory="$(yq -r '.spec.resources.memory // "4Gi"' "$catalog_file")"
  gpu="$(yq -r '.spec.resources.gpu // "0"' "$catalog_file")"
  training="$(yq -r '.spec.components.training // true' "$catalog_file")"
  serving="$(yq -r '.spec.components.serving // true' "$catalog_file")"
  notebook="$(yq -r '.spec.components.notebook // false' "$catalog_file")"
  mlflow="$(yq -r '.spec.components.mlflow // true' "$catalog_file")"
  img_train="$(yq -r '.spec.image.training // "ghcr.io/example/mlops-platform/training:latest"' "$catalog_file")"
  img_serve="$(yq -r '.spec.image.serving // "ghcr.io/example/mlops-platform/serving:latest"' "$catalog_file")"
  schedule_enabled="$(yq -r '.spec.schedule.enabled // false' "$catalog_file")"
  schedule_cron="$(yq -r '.spec.schedule.cron // "0 2 * * 1"' "$catalog_file")"
  owners="$(yq -o=json -I=0 '.metadata.owners // []' "$catalog_file")"

  # project.yaml — copy catalog and normalize
  cp "$catalog_file" "${dest}/project.yaml"
  yq -i "
    .metadata.name = \"${name}\" |
    .metadata.team = \"${team}\"
  " "${dest}/project.yaml"

  # values.yaml via yq writes for reliability
  yq -i "
    .project.name = \"${name}\" |
    .project.team = \"${team}\" |
    .project.description = \"${description}\" |
    .project.environment = \"${environment}\" |
    .project.profile = \"${profile}\" |
    .components.training = ${training} |
    .components.serving = ${serving} |
    .components.notebook = ${notebook} |
    .components.mlflow = ${mlflow} |
    .image.training = \"${img_train}\" |
    .image.serving = \"${img_serve}\" |
    .resources.training.requests.cpu = \"${cpu}\" |
    .resources.training.requests.memory = \"${memory}\" |
    .resources.training.limits.cpu = \"${cpu}\" |
    .resources.training.limits.memory = \"${memory}\" |
    .schedule.enabled = ${schedule_enabled} |
    .schedule.cron = \"${schedule_cron}\"
  " "${dest}/values.yaml"

  # GPU limit annotation when requested
  if [[ "$gpu" != "0" && "$gpu" != "null" ]]; then
    yq -i "
      .resources.training.limits.\"nvidia.com/gpu\" = \"${gpu}\" |
      .resources.training.requests.\"nvidia.com/gpu\" = \"${gpu}\"
    " "${dest}/values.yaml"
  fi

  # README placeholders
  if [[ -f "${dest}/README.md" ]]; then
    sed -i.bak "s/{{PROJECT_NAME}}/${name}/g" "${dest}/README.md"
    rm -f "${dest}/README.md.bak"
  fi

  # Keep a copy of the catalog snapshot for audit
  cp "$catalog_file" "${dest}/catalog-source.yaml"

  # For local kind tests without private registry: use public python image for training
  # and leave serving as-is (bootstrap may patch). Marker file for tooling.
  cat > "${dest}/.scaffold-meta" <<EOF
scaffolded_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
catalog=${catalog_file#${ROOT}/}
template=templates/ml-project
EOF

  echo "  ok: ${dest}"
}

if [[ -n "$ONLY_PROJECT" ]]; then
  f="${CATALOG_DIR}/${ONLY_PROJECT}.yaml"
  if [[ ! -f "$f" ]]; then
    f="${CATALOG_DIR}/${ONLY_PROJECT}.yml"
  fi
  if [[ ! -f "$f" ]]; then
    echo "catalog entry not found: ${ONLY_PROJECT}" >&2
    exit 1
  fi
  scaffold_one "$f"
elif [[ "$SCAFFOLD_ALL" == true ]]; then
  shopt -s nullglob
  files=("${CATALOG_DIR}"/*.yaml "${CATALOG_DIR}"/*.yml)
  if [[ ${#files[@]} -eq 0 ]]; then
    echo "no catalog projects found"
    exit 0
  fi
  for f in "${files[@]}"; do
    scaffold_one "$f"
  done
else
  usage
  exit 1
fi
