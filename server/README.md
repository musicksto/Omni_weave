# OmniWeave ADK Agent Server

> Multi-agent backend for OmniWeave, built with **Google ADK (Agent Development Kit) for TypeScript**.

## Architecture

OmniWeave uses a multi-agent architecture powered by the Google ADK:

```
OmniWeaveDirector (Root Agent — gemini-3-flash-preview)
├── Tools:
│   ├── generate_image    → Gemini 3.1 Flash Image Preview (1K, 16:9)
│   ├── generate_speech   → Gemini 2.5 Flash TTS (multi-voice)
│   ├── compute_embedding → Gemini Embedding 2 Preview (multimodal)
│   └── generate_music    → Lyria RealTime (ambient background music)
│
└── Sub-Agents:
    └── StoryPipeline (SequentialAgent)
        ├── StoryWriter   → Writes cinematic scripts with image markers
        └── StoryReviewer  → Polishes and validates consistency
```

### Gemini Models Used (5 on server)

| Model | Purpose |
|-------|---------|
| `gemini-3-flash-preview` | Director agent, story writer, story reviewer |
| `gemini-3.1-flash-image-preview` | 1K resolution image generation |
| `gemini-2.5-flash-preview-tts` | Multi-speaker voice narration |
| `gemini-embedding-2-preview` | Multimodal story fingerprints |
| `lyria-realtime-exp` | Ambient background music |

## Quick Start (Local)

```bash
# 1. Install dependencies
npm install

# 2. Set your API key
cp .env.example .env
# Edit .env and add your GOOGLE_API_KEY

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
| `POST` | `/api/generate` | Stream story generation (SSE) |
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

## Google Cloud Services

- **Cloud Run** — Hosts the ADK agent server
- **Cloud Firestore** — Stores stories, users, and audio cache (via frontend)
- **Firebase Authentication** — Anonymous auth (via frontend)
- **Firebase Hosting** — Serves the frontend static assets

## Tech Stack

- **Framework**: Google ADK for TypeScript (`@google/adk`)
- **Runtime**: Node.js 22 + Express
- **Language**: TypeScript
- **AI SDK**: `@google/genai`
- **Deployment**: Docker → Google Cloud Run
