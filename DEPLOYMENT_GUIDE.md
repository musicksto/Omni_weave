# OmniWeave — Google Cloud Deployment Guide

## Quick Reference

| Component | Service | URL Pattern |
|-----------|---------|-------------|
| Frontend | Firebase Hosting | `https://<project-id>.web.app` |
| ADK Server | Cloud Run | `https://omniweave-adk-<hash>-uc.a.run.app` |
| Database | Cloud Firestore | Console → Firestore |
| Auth | Firebase Auth | Console → Authentication |

---

## Step-by-Step Deployment

### Prerequisites

```bash
# Install tools
npm install -g firebase-tools
# Install gcloud CLI: https://cloud.google.com/sdk/docs/install

# Authenticate
gcloud auth login
firebase login
```

### 1. Deploy ADK Server to Cloud Run

```bash
cd server

# Set your project
export GCP_PROJECT_ID="gen-lang-client-0001923421"
export GOOGLE_API_KEY="your-gemini-api-key"

# Run the automated deployment
chmod +x deploy.sh
./deploy.sh
```

**What this does:**
- Enables Cloud Run, Artifact Registry, Cloud Build APIs
- Builds Docker container from the ADK server
- Pushes to Artifact Registry
- Deploys to Cloud Run with your API key
- Returns the service URL

### 2. Deploy Frontend to Firebase Hosting

```bash
# From the project root
cd ..

# Build the frontend
npm run build

# Initialize Firebase (first time only)
firebase init hosting
# Select: Use an existing project → gen-lang-client-0001923421
# Public directory: dist
# Single-page app: Yes
# Don't overwrite index.html

# Deploy
firebase deploy --only hosting
```

### 3. Deploy Firestore Rules

```bash
firebase deploy --only firestore:rules
```

---

## Deployment Verification

### Option A: Screen Recording

Record a short screen capture showing:

1. **Google Cloud Console** → Cloud Run → `omniweave-adk` service
   - Shows: service name, region, URL, status "Active"
   - Shows: the container image from Artifact Registry
   
2. **Hit the health endpoint** in your browser:
   ```
   https://omniweave-adk-<hash>.a.run.app/
   ```
   - Shows JSON response with agent name, models, framework
   
3. **Hit the agent-info endpoint**:
   ```
   https://omniweave-adk-<hash>.a.run.app/api/agent-info
   ```
   - Shows the full multi-agent architecture

4. **Cloud Run Logs** (optional but impressive):
   - Console → Cloud Run → Logs tab
   - Shows the agent server startup message

### Option B: Code Files

Key infrastructure files:
- `server/deploy.sh` — Automated Cloud Run deployment script
- `server/Dockerfile` — Container definition
- `server/agent.ts` — ADK agent using `@google/adk`
- `server/server.ts` — Express server with Gemini API calls

---

## Verification Commands

After deployment, run these to verify everything works:

```bash
# Backend health check
curl https://omniweave-adk-<hash>.a.run.app/

# Agent architecture info
curl https://omniweave-adk-<hash>.a.run.app/api/agent-info

# Test image generation
curl -X POST https://omniweave-adk-<hash>.a.run.app/api/generate-image \
  -H "Content-Type: application/json" \
  -d '{"prompt": "A magical library in 3D Pixar style"}'

# Test embedding
curl -X POST https://omniweave-adk-<hash>.a.run.app/api/embed \
  -H "Content-Type: application/json" \
  -d '{"text": "A story about dragons"}'

# Frontend
open https://gen-lang-client-0001923421.web.app
```

---

## Google Cloud Services Checklist

- [x] **Gemini Models** (7 models via Google GenAI SDK + ADK)
- [x] **Google GenAI SDK** (`@google/genai` in frontend)
- [x] **Google ADK** (`@google/adk` in server)
- [x] **Cloud Run** (ADK agent server)
- [x] **Cloud Firestore** (stories, users, audio cache)
- [x] **Firebase Authentication** (anonymous auth)
- [x] **Firebase Hosting** (frontend static assets)
- [x] **Artifact Registry** (Docker images)
- [x] **Cloud Build** (container builds)

---

## Troubleshooting

**"Permission denied" on Cloud Run:**
```bash
gcloud run services add-iam-policy-binding omniweave-adk \
  --region=us-central1 \
  --member="allUsers" \
  --role="roles/run.invoker"
```

**Firebase Hosting shows old version:**
```bash
firebase hosting:channel:deploy preview --expires 7d
# Then: firebase deploy --only hosting
```

**API key not working on Cloud Run:**
```bash
gcloud run services update omniweave-adk \
  --region=us-central1 \
  --set-env-vars "GOOGLE_API_KEY=your-new-key"
```
