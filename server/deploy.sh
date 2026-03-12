#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# OmniWeave ADK Server — Google Cloud Run Deployment Script
# 
# This script automates deployment of the OmniWeave agent backend to 
# Google Cloud Run, satisfying the hackathon's infrastructure-as-code bonus.
#
# Prerequisites:
#   - gcloud CLI installed and authenticated
#   - A Google Cloud project with billing enabled
#   - Artifact Registry API & Cloud Run API enabled
#
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# Configuration — edit these for your project
PROJECT_ID="${GCP_PROJECT_ID:-your-project-id}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="omniweave-adk"
REPO_NAME="omniweave"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   🧵 OmniWeave ADK Server — Cloud Run Deployment           ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# 1. Set the project
echo "→ Setting project to ${PROJECT_ID}..."
gcloud config set project "${PROJECT_ID}"

# 2. Enable required APIs
echo "→ Enabling required APIs..."
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  aiplatform.googleapis.com \
  --quiet

# 3. Create Artifact Registry repo (if not exists)
echo "→ Creating Artifact Registry repository..."
gcloud artifacts repositories create "${REPO_NAME}" \
  --repository-format=docker \
  --location="${REGION}" \
  --description="OmniWeave container images" \
  --quiet 2>/dev/null || echo "   (Repository already exists)"

# 4. Configure Docker auth
echo "→ Configuring Docker authentication..."
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

# 5. Build and push the container
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:latest"
echo "→ Building container image..."
gcloud builds submit --tag "${IMAGE_URI}" .

# 6. Deploy to Cloud Run
echo "→ Deploying to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE_URI}" \
  --region "${REGION}" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --set-env-vars "GOOGLE_API_KEY=${GOOGLE_API_KEY:-}" \
  --set-env-vars "GOOGLE_GENAI_USE_VERTEXAI=FALSE" \
  --quiet

# 7. Get the service URL
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --region="${REGION}" \
  --format='value(status.url)')

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   ✅ Deployment Complete!                                   ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║   Service URL: ${SERVICE_URL}"
echo "║   Agent Info:  ${SERVICE_URL}/api/agent-info"
echo "║   Health:      ${SERVICE_URL}/"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Set this in your frontend .env:"
echo "  VITE_ADK_SERVER_URL=${SERVICE_URL}"
