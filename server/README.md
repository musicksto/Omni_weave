# OmniWeave ADK Agent Server

> Multi-agent backend for OmniWeave, built with **Google ADK (Agent Development Kit) for TypeScript**.

## Architecture

OmniWeave uses a multi-agent architecture powered by the Google ADK:

```
Live Runtime
└── StoryPipeline (SequentialAgent)
    ├── StoryWriter    (gemini-3.1-pro-preview) → Writes cinematic scripts
    └── StoryReviewer  (gemini-3.1-flash-lite-preview) → Validates consistency

Expansion Scaffold
└── OmniWeaveDirector (Root Agent — gemini-3-flash-preview)
    ├── generate_image    → Gemini 3.1 Flash Image Preview (1K, 16:9)
    ├── generate_speech   → Gemini 2.5 Flash TTS (multi-voice)
    ├── compute_embedding → Gemini Embedding 2 Preview (multimodal)
    └── generate_music    → Lyria RealTime (ambient background music)
```

### Gemini Models Used (6 on server)

| Model | Purpose |
|-------|---------|
| `gemini-3.1-pro-preview` | Story writer |
| `gemini-3-flash-preview` | Director/orchestration scaffold |
| `gemini-3.1-flash-lite-preview` | Story reviewer |
| `gemini-3.1-flash-image-preview` | 1K resolution image generation |
| `gemini-2.5-pro-preview-tts` | Multi-speaker voice narration |
| `gemini-embedding-2-preview` | Multimodal story fingerprints |
| `lyria-realtime-exp` | Ambient background music |

## Quick Start (Local)

```bash
# 1. Install dependencies
npm install

# 2. Set your API key
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY

# 3. Run the server
npm run dev
# → Server starts at http://localhost:8080

# 4. Or test with ADK Dev UI
npm run adk:web
# → ADK Dev UI at http://localhost:8000
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Health check + agent info |
| `POST` | `/api/generate` | Stream story generation from `StoryWriter → StoryReviewer` (SSE) |
| `POST` | `/api/generate-image` | Direct image generation |
| `POST` | `/api/embed` | Compute multimodal embedding |
| `GET` | `/api/agent-info` | Full agent architecture details |

## Deploy to Cloud Run

```bash
# Set your project ID and API key
export GCP_PROJECT_ID="your-project-id"
export GOOGLE_API_KEY="your-api-key"

# Run the automated deployment
chmod +x deploy.sh
./deploy.sh
```

The deploy scripts accept `GOOGLE_API_KEY` for convenience and propagate it to the ADK-compatible runtime env vars.

## Google Cloud Services

- **Cloud Run** — Hosts the ADK agent server
- **Cloud Firestore** — Stores per-user stories and generated media metadata (via frontend)
- **Firebase Authentication** — Anonymous auth (via frontend)
- **Firebase Hosting** — Serves the frontend static assets

## Tech Stack

- **Framework**: Google ADK for TypeScript (`@google/adk`)
- **Runtime**: Node.js 22 + Express
- **Language**: TypeScript
- **AI SDK**: `@google/genai`
- **Deployment**: Docker → Google Cloud Run
