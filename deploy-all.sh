#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# OmniWeave — Full Stack Deployment to Google Cloud
#
# Deploys:
#   1. Frontend → Firebase Hosting
#   2. ADK Agent Server → Google Cloud Run
#
# Prerequisites:
#   - Node.js 20+
#   - gcloud CLI installed & authenticated
#   - firebase CLI installed (npm i -g firebase-tools)
#   - A Google Cloud project with billing enabled
#
# Usage:
#   export GCP_PROJECT_ID="your-project-id"
#   export GOOGLE_API_KEY="your-gemini-api-key"
#   chmod +x deploy-all.sh
#   ./deploy-all.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:?Error: GCP_PROJECT_ID is not set}"
REGION="${GCP_REGION:-us-central1}"
API_KEY="${GOOGLE_API_KEY:?Error: GOOGLE_API_KEY is not set}"
SERVICE_NAME="omniweave-adk"
REPO_NAME="omniweave"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   🧵 OmniWeave — Full Stack Google Cloud Deployment        ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║   Project:  ${PROJECT_ID}"
echo "║   Region:   ${REGION}"
echo "║   Frontend: Firebase Hosting"
echo "║   Backend:  Cloud Run (ADK Agent Server)"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ═══════════════════════════════════════════════════════════════════
# Phase 0: Enable APIs
# ═══════════════════════════════════════════════════════════════════
echo "━━━ Phase 0: Enabling Google Cloud APIs ━━━"
gcloud config set project "${PROJECT_ID}"
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  aiplatform.googleapis.com \
  firestore.googleapis.com \
  firebase.googleapis.com \
  --quiet
echo "✅ APIs enabled"
echo ""

# ═══════════════════════════════════════════════════════════════════
# Phase 1: Deploy ADK Server to Cloud Run
# ═══════════════════════════════════════════════════════════════════
echo "━━━ Phase 1: Deploying ADK Agent Server to Cloud Run ━━━"

# Create Artifact Registry repo
gcloud artifacts repositories create "${REPO_NAME}" \
  --repository-format=docker \
  --location="${REGION}" \
  --description="OmniWeave container images" \
  --quiet 2>/dev/null || echo "   (Repository already exists)"

# Configure Docker auth
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

# Build and push
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:latest"
echo "→ Building container: ${IMAGE_URI}"
cd server
gcloud builds submit --tag "${IMAGE_URI}" .

# Deploy
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
  --set-env-vars "GOOGLE_API_KEY=${API_KEY}" \
  --set-env-vars "GOOGLE_GENAI_USE_VERTEXAI=FALSE" \
  --quiet

BACKEND_URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --region="${REGION}" \
  --format='value(status.url)')

echo "✅ Backend deployed: ${BACKEND_URL}"
cd ..
echo ""

# ═══════════════════════════════════════════════════════════════════
# Phase 2: Build & Deploy Frontend to Firebase Hosting
# ═══════════════════════════════════════════════════════════════════
echo "━━━ Phase 2: Deploying Frontend to Firebase Hosting ━━━"

# Build the frontend with the backend URL
echo "→ Building frontend..."
VITE_ADK_SERVER_URL="${BACKEND_URL}" npm run build

# Deploy to Firebase Hosting
echo "→ Deploying to Firebase Hosting..."
firebase deploy --only hosting --project "${PROJECT_ID}"

FRONTEND_URL="https://${PROJECT_ID}.web.app"
echo "✅ Frontend deployed: ${FRONTEND_URL}"
echo ""

# ═══════════════════════════════════════════════════════════════════
# Phase 3: Verify Deployment
# ═══════════════════════════════════════════════════════════════════
echo "━━━ Phase 3: Verifying Deployment ━━━"

echo "→ Checking backend health..."
HEALTH=$(curl -s "${BACKEND_URL}/" | head -c 200)
echo "   ${HEALTH}"

echo "→ Checking agent info..."
AGENT_INFO=$(curl -s "${BACKEND_URL}/api/agent-info" | head -c 300)
echo "   ${AGENT_INFO}"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   ✅ Full Stack Deployment Complete!                        ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║                                                            ║"
echo "║   🌐 Frontend:  ${FRONTEND_URL}"
echo "║   🤖 Backend:   ${BACKEND_URL}"
echo "║   📊 Agent Info: ${BACKEND_URL}/api/agent-info"
echo "║                                                            ║"
echo "║   Google Cloud Services Used:                              ║"
echo "║   • Cloud Run (ADK agent server)                           ║"
echo "║   • Firebase Hosting (frontend)                            ║"
echo "║   • Cloud Firestore (data persistence)                     ║"
echo "║   • Firebase Authentication (user auth)                    ║"
echo "║   • Artifact Registry (container images)                   ║"
echo "║   • Cloud Build (CI/CD)                                    ║"
echo "║                                                            ║"
echo "╚══════════════════════════════════════════════════════════════╝"
