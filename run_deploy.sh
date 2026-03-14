#!/bin/bash
# OmniWeave — Windows Git Bash deployment helper
# Copy this file and fill in YOUR values before running.
# NEVER commit a copy with real credentials.

# Add gcloud to PATH (Windows paths — adjust for your install location)
export PATH="/c/Users/$USER/AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin:$PATH"
export PATH="/c/Program Files (x86)/Google/Cloud SDK/google-cloud-sdk/bin:$PATH"

# ─── Required ─────────────────────────────────────────────────────────────────
export GCP_PROJECT_ID="your-gcp-project-id"          # e.g. gen-lang-client-0001923421
export GOOGLE_API_KEY="your-google-api-key"           # Google AI Studio key (for Lyria + Live API)

# ─── Optional ─────────────────────────────────────────────────────────────────
# export VITE_GEMINI_API_KEY=""  # Same or different key for browser-side direct calls
# export GCP_REGION="us-central1"

./deploy-all.sh
