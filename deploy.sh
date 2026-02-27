#!/usr/bin/env bash
# =============================================================================
# PLO — Deploy to GCP (Cloud Run + Cloud SQL)
# Usage:
#   ./deploy.sh                 # Build, push, migrate, deploy
#   ./deploy.sh --seed          # Also run seed after migration
#   ./deploy.sh --migrate-only  # Only run Prisma migrations
# =============================================================================

set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────────

INFRA_DIR="$(cd "$(dirname "$0")/infra" && pwd)"
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"

# Read project_id and region from terraform.tfvars
if [[ ! -f "$INFRA_DIR/terraform.tfvars" ]]; then
  echo "Error: infra/terraform.tfvars not found. Copy terraform.tfvars.example and fill in values."
  exit 1
fi

PROJECT_ID=$(grep 'project_id' "$INFRA_DIR/terraform.tfvars" | sed 's/.*= *"\(.*\)"/\1/')
REGION=$(grep 'region' "$INFRA_DIR/terraform.tfvars" | sed 's/.*= *"\(.*\)"/\1/')
REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/plo"
IMAGE="${REGISTRY}/plo:latest"
SERVICE_NAME="plo"

echo "================================================"
echo "  PLO Deploy"
echo "  Project:  ${PROJECT_ID}"
echo "  Region:   ${REGION}"
echo "  Image:    ${IMAGE}"
echo "================================================"

# ── Pre-flight checks ───────────────────────────────────────────────────────

for cmd in gcloud docker; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Error: $cmd is not installed."
    exit 1
  fi
done

# ── Parse flags ──────────────────────────────────────────────────────────────

DO_SEED=false
MIGRATE_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --seed) DO_SEED=true ;;
    --migrate-only) MIGRATE_ONLY=true ;;
  esac
done

# ── Configure Docker auth ───────────────────────────────────────────────────

echo ""
echo "[1/5] Configuring Docker authentication..."
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

# ── Build & Push ─────────────────────────────────────────────────────────────

if [[ "$MIGRATE_ONLY" == false ]]; then
  echo ""
  echo "[2/5] Building Docker image..."
  docker build -t "$IMAGE" "$PROJECT_ROOT"

  echo ""
  echo "[3/5] Pushing image to Artifact Registry..."
  docker push "$IMAGE"
else
  echo ""
  echo "[2/5] Skipping build (--migrate-only)"
  echo "[3/5] Skipping push (--migrate-only)"
fi

# ── Run Prisma Migrations via Cloud SQL Auth Proxy ───────────────────────────

echo ""
echo "[4/5] Running Prisma migrations..."

# Get Cloud SQL connection name from Terraform output
DB_CONNECTION_NAME=$(cd "$INFRA_DIR" && terraform output -raw db_connection_name 2>/dev/null || true)

if [[ -z "$DB_CONNECTION_NAME" ]]; then
  echo "Warning: Could not read db_connection_name from Terraform outputs."
  echo "Skipping migrations. Run them manually:"
  echo "  cloud-sql-proxy ${DB_CONNECTION_NAME} &"
  echo "  DATABASE_URL=... npx prisma migrate deploy"
else
  # Check if cloud-sql-proxy is available
  if command -v cloud-sql-proxy &>/dev/null; then
    DB_PASSWORD=$(grep 'db_password' "$INFRA_DIR/terraform.tfvars" | sed 's/.*= *"\(.*\)"/\1/')

    # Start proxy in background
    cloud-sql-proxy "$DB_CONNECTION_NAME" --port 5433 &
    PROXY_PID=$!
    sleep 3

    export DATABASE_URL="postgresql://plo:${DB_PASSWORD}@127.0.0.1:5433/plo_db?schema=public"

    cd "$PROJECT_ROOT"
    npx prisma migrate deploy

    if [[ "$DO_SEED" == true ]]; then
      echo "Running seed..."
      pnpm seed
    fi

    # Cleanup proxy
    kill "$PROXY_PID" 2>/dev/null || true
    wait "$PROXY_PID" 2>/dev/null || true
    unset DATABASE_URL
  else
    echo "Warning: cloud-sql-proxy not found. Install it from:"
    echo "  https://cloud.google.com/sql/docs/postgres/connect-auth-proxy"
    echo "Skipping migrations."
  fi
fi

# ── Deploy Cloud Run ─────────────────────────────────────────────────────────

if [[ "$MIGRATE_ONLY" == false ]]; then
  echo ""
  echo "[5/5] Deploying to Cloud Run..."
  gcloud run services update "$SERVICE_NAME" \
    --region "$REGION" \
    --image "$IMAGE" \
    --quiet

  echo ""
  echo "================================================"
  CLOUD_RUN_URL=$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --format='value(status.url)')
  echo "  Deployed successfully!"
  echo "  URL: ${CLOUD_RUN_URL}"
  echo ""
  echo "  Test:"
  echo "    curl ${CLOUD_RUN_URL}/health"
  echo "================================================"
else
  echo ""
  echo "[5/5] Skipping deploy (--migrate-only)"
fi
