#!/usr/bin/env bash
# =============================================================================
# PLO — Deploy to GCP (LMES conventions: Turbine + Vault)
# Usage:
#   ./deploy.sh <env>                 # Build, push, terraform apply
#   ./deploy.sh <env> --migrate       # Also run Prisma migrations
#   ./deploy.sh <env> --seed          # Also run seed after migration
#   ./deploy.sh <env> --build-only    # Only build and push image
#
# Example:
#   ./deploy.sh dev --migrate --seed
# =============================================================================

set -euo pipefail

# ── Arguments ────────────────────────────────────────────────────────────────

if [[ $# -lt 1 ]]; then
  echo "Usage: ./deploy.sh <env> [--migrate] [--seed] [--build-only]"
  echo "  env: dev | uat | prep | prod"
  exit 1
fi

ENV="$1"
shift

INFRA_DIR="$(cd "$(dirname "$0")/infra" && pwd)"
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
COMPONENT_NAME="lmes-plo"

# ── Parse flags ──────────────────────────────────────────────────────────────

DO_MIGRATE=false
DO_SEED=false
BUILD_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --migrate) DO_MIGRATE=true ;;
    --seed) DO_SEED=true; DO_MIGRATE=true ;;
    --build-only) BUILD_ONLY=true ;;
  esac
done

# ── Pre-flight checks ───────────────────────────────────────────────────────

for cmd in gcloud docker terraform; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Error: $cmd is not installed."
    exit 1
  fi
done

# ── Read GCP project from Terraform state ────────────────────────────────────

echo ""
echo "================================================"
echo "  PLO Deploy — ${ENV}"
echo "  Component: ${COMPONENT_NAME}"
echo "================================================"

# Get GCP project and region from Terraform outputs
cd "$INFRA_DIR"
GCP_PROJECT=$(terraform output -raw gcp_project 2>/dev/null || echo "")
if [[ -z "$GCP_PROJECT" ]]; then
  echo "Warning: Cannot read gcp_project from Terraform. Run 'terraform apply' first."
  echo "Attempting to continue with gcloud defaults..."
  GCP_PROJECT=$(gcloud config get-value project 2>/dev/null)
fi

REGION="europe-west1"
REGISTRY="${REGION}-docker.pkg.dev/${GCP_PROJECT}/${COMPONENT_NAME}"
IMAGE="${REGISTRY}/plo:latest"

echo "  Project:  ${GCP_PROJECT}"
echo "  Region:   ${REGION}"
echo "  Image:    ${IMAGE}"
echo "================================================"

# ── Step 1: Configure Docker auth ───────────────────────────────────────────

echo ""
echo "[1/4] Configuring Docker authentication..."
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

# ── Step 2: Build & Push ────────────────────────────────────────────────────

echo ""
echo "[2/4] Building Docker image..."
docker build -t "$IMAGE" "$PROJECT_ROOT"

echo ""
echo "[3/4] Pushing image to Artifact Registry..."
docker push "$IMAGE"

if [[ "$BUILD_ONLY" == true ]]; then
  echo ""
  echo "Build complete. Skipping deploy (--build-only)."
  exit 0
fi

# ── Step 3: Migrations (optional) ───────────────────────────────────────────

if [[ "$DO_MIGRATE" == true ]]; then
  echo ""
  echo "[3b] Running Prisma migrations..."

  DB_CONNECTION_NAME=$(terraform output -raw db_connection_name 2>/dev/null || true)

  if [[ -n "$DB_CONNECTION_NAME" ]] && command -v cloud-sql-proxy &>/dev/null; then
    cloud-sql-proxy "$DB_CONNECTION_NAME" --port 5433 &
    PROXY_PID=$!
    sleep 3

    # DATABASE_URL is read from Vault by the infra — for local migration,
    # we reconstruct it via the proxy
    cd "$PROJECT_ROOT"
    echo "  Running: npx prisma migrate deploy"
    npx prisma migrate deploy

    if [[ "$DO_SEED" == true ]]; then
      echo "  Running: pnpm seed"
      pnpm seed
    fi

    kill "$PROXY_PID" 2>/dev/null || true
    wait "$PROXY_PID" 2>/dev/null || true
  else
    echo "  Warning: cloud-sql-proxy not available or no DB connection name."
    echo "  Run migrations manually via Cloud SQL Auth Proxy."
  fi
fi

# ── Step 4: Terraform apply (triggers Turbine deploy) ───────────────────────

echo ""
echo "[4/4] Deploying via Terraform (Turbine)..."
cd "$INFRA_DIR"
terraform apply -var="env=${ENV}" -var="component_name=${COMPONENT_NAME}" -auto-approve

echo ""
ENDPOINT=$(terraform output -raw turbine_endpoint 2>/dev/null || echo "<pending>")
echo "================================================"
echo "  Deployed successfully!"
echo "  Endpoint: ${ENDPOINT}"
echo ""
echo "  Test:"
echo "    curl ${ENDPOINT}/health"
echo "================================================"
