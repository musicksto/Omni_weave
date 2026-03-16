<div align="center">

# OmniWeave

**A multimodal creative director that weaves text, AI-generated images, multi-voice narration, and ambient music into cinematic stories — with real-time voice interaction via the Gemini Live API.**

*Built for the Gemini Live Agent Challenge · Creative Storyteller Category*

[Live Demo](https://gen-lang-client-0001923421.web.app) · [ADK Agent Server](https://omniweave-adk-54597885936.us-central1.run.app/api/agent-info) · [Demo Video](#demo-video)

</div>

---

## What it does

OmniWeave offers two modes of creation:

### Live Mode (Gemini Live API)

Speak directly to OmniWeave through bidirectional WebSocket streaming. Your voice is captured at 16kHz, streamed to Gemini Live via a Node.js WebSocket proxy on Cloud Run, and the AI responds with expressive narration (24kHz audio), real-time text, and tool-generated illustrations — all in a continuous, interruptible conversation. Save the session as a full story when done.

### Compose Mode (ADK Pipeline)

Type a single prompt and the full production pipeline handles everything:

1. **Story Writing** — A Google ADK `StoryPipeline` (`SequentialAgent`) streams a cinematic script through `StoryWriter` (`gemini-2.5-flash`) and `StoryReviewer` (`gemini-2.5-flash-lite`), preserving speaker labels and `[IMAGE:]` markers
2. **1K Illustrations** — Each marker triggers `gemini-3.1-flash-image-preview` to generate a 1K resolution, 16:9 illustration with Ken Burns cinematic animation and frame numbering (FRM 001, FRM 002...)
3. **Video Story Mode** — Toggle to Video Story and each scene generates a cinematic video clip via `veo-3.1-generate-preview`, with auto-loop playback in the cinematic player
4. **Multi-Voice Narration** — Cloud TTS Chirp 3 HD provides 28 gender/age-matched voices for primary narration, with `gemini-2.5-pro-preview-tts` as fallback. The system detects character gender from names (50+ name database + suffix heuristics) and streams audio in real-time via WebAudio API
5. **Ambient Score** — `lyria-realtime-exp` generates mood-aware ambient background music that plays under narration (14 mood categories matched from story keywords)
6. **Story DNA** — `gemini-embedding-2-preview` creates a multimodal vector from prompt + lead image for similarity-based "More Like This" discovery in your private library
7. **Graph RAG Memory Bank** — `gemini-2.5-flash` extracts entities and relationships from each story, building a persistent knowledge graph in Firestore for cross-story character continuity
8. **Public Story Gallery** — Zero-friction anonymous auth via Firebase lets anyone create and save stories. All stories are visible to all users, creating a shared gallery of AI-generated cinematic narratives
9. **Audiobook Export** — Download the full narration as a single WAV file for offline listening

---

## Architecture

<p align="center">
  <img src="server/architecture-adk.png" alt="OmniWeave System Architecture" width="800"/>
</p>

### Multi-Agent System (Google ADK for TypeScript)

```
Cloud Run Runtime
├── StoryPipeline (SequentialAgent)        ← /api/generate (SSE)
│   ├── StoryWriter    — gemini-2.5-flash
│   └── StoryReviewer  — gemini-2.5-flash-lite
│
├── Live API WebSocket Proxy               ← /api/live (bidi-streaming)
│   └── gemini-2.5-flash-native-audio-preview-12-2025
│       ├── Voice I/O (16kHz in → 24kHz out)
│       └── Server-side tool execution (image gen, music)
│
├── REST Tool Endpoints
│   ├── /api/generate-image  → gemini-3.1-flash-image-preview
│   ├── /api/generate-video  → veo-3.1-generate-preview
│   ├── /api/tts             → Cloud TTS Chirp 3 HD (fallback: gemini-2.5-pro-preview-tts)
│   ├── /api/embed           → gemini-embedding-2-preview
│   ├── /api/music           → lyria-realtime-exp (SSE)
│   └── /api/memory-bank     → gemini-2.5-flash (Graph RAG)
│
└── OmniWeaveDirector (Root LlmAgent — gemini-3-flash-preview)
    └── 5 FunctionTools (generate_image, generate_video, generate_speech, compute_embedding, generate_music)
```

### Gemini Models (9) + Cloud TTS

| Model | Purpose |
|-------|---------|
| `gemini-2.5-flash` | Story writing (StoryWriter — cinematic scripts with image markers) |
| `gemini-2.5-flash-lite` | Story review (StoryReviewer — narrative consistency validation) |
| `gemini-3-flash-preview` | Director agent / orchestration (OmniWeaveDirector) |
| `gemini-3.1-flash-image-preview` | 1K resolution image generation (16:9 aspect) |
| `veo-3.1-generate-preview` | Video Story mode — cinematic video clips per scene |
| `Chirp 3 HD` (Cloud TTS) | Primary narration — 28 gender/age-matched voices |
| `gemini-2.5-pro-preview-tts` | Fallback TTS when Cloud TTS unavailable |
| `gemini-2.5-flash-native-audio-preview-12-2025` | Live API bidi-streaming (voice-in, multimodal-out) |
| `gemini-embedding-2-preview` | Multimodal story fingerprints (text + image embedding) |
| `lyria-realtime-exp` | Mood-aware ambient background music (14 mood categories) |

### Google Cloud Services (8)

| Service | Usage |
|---------|-------|
| **Cloud Run** | ADK agent server backend (all models proxied) |
| **Cloud Firestore** | Story storage, user data, memory bank graph |
| **Firebase Storage** | Full-resolution images and audio assets |
| **Firebase Authentication** | Anonymous auth (zero-friction, no sign-in) |
| **Firebase Hosting** | Frontend static assets (React SPA) |
| **Cloud Text-to-Speech** | Chirp 3 HD voices (28 voices, gender/age-matched) |
| **Artifact Registry** | Docker container images |
| **Cloud Build** | CI/CD pipeline |

---

## Quick Start

### Prerequisites
- Node.js 20+
- A Gemini API key ([Get one here](https://ai.google.dev/))

### Run Locally

```bash
# 1. Clone the repo
git clone https://github.com/musicksto/Omni_weave.git
cd Omni_weave

# 2. Install dependencies
npm install

# 3. Configure
cp .env.example .env.local
# Edit .env.local → set VITE_GEMINI_API_KEY for browser-side narration/music if needed

# 4. Start the frontend
npm run dev
# → http://localhost:3000

# 5. (Optional) Start the ADK agent server for full pipeline
cd server
npm install
cp .env.example .env
# Edit .env → set GEMINI_API_KEY
npm run dev
# → http://localhost:8080
# Then set VITE_ADK_SERVER_URL=http://localhost:8080 in root .env.local
```

Notes:
- Without the ADK server, the frontend falls back to direct Gemini API calls for story generation and images.
- With the ADK server (`VITE_ADK_SERVER_URL`), all models route through Cloud Run — story gen, images, video, TTS, music, embeddings, memory bank, and Live mode.
- `npm run lint` checks the frontend. Use `npm run lint:all` to verify the full stack.

### Deploy to Google Cloud

#### Option A — One-command shell script (recommended)

```bash
export GCP_PROJECT_ID="your-project-id"
export GOOGLE_API_KEY="your-key"
chmod +x deploy-all.sh
./deploy-all.sh
```

`deploy-all.sh` handles: Cloud Run deployment (Docker build → Artifact Registry → Cloud Run), Firebase Hosting, and maps the API key to ADK-compatible runtime env vars. The backend URL is retrieved dynamically via `gcloud run services describe` — no hardcoding needed.

#### Option B — Terraform infrastructure-as-code

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
# Fill in project_id and google_api_key
terraform init
terraform apply
```

The `terraform/` directory provisions all Google Cloud resources via IaC: Artifact Registry, Cloud Run, IAM roles (Vertex AI + Firestore), Firestore database, and Cloud Build trigger. See [terraform/README.md](terraform/README.md) for full details.

#### Option C — Cloud Build CI/CD

Triggered automatically on every push to `main` via `cloudbuild.yaml` (6-step pipeline: build → push → deploy Cloud Run → install → build frontend → deploy Hosting).

See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for detailed instructions.

---

## Project Structure

```
omniweave/
├── src/                    # React frontend
│   ├── App.tsx             # Main app (generation, TTS, playback, library)
│   ├── adkClient.ts        # ADK server API client
│   ├── liveClient.ts       # Live API WebSocket client
│   ├── storyStream.js      # Streaming story parser
│   ├── firebase.ts         # Firebase config
│   └── components/         # Icons, ErrorBoundary
├── server/                 # ADK agent backend (Cloud Run)
│   ├── agent.ts            # Multi-agent definition (3 agents + 4 tools)
│   ├── server.ts           # Express API server (REST + SSE + WebSocket)
│   ├── liveSession.ts      # Live API WebSocket proxy (with personality greeting)
│   ├── Dockerfile          # Cloud Run container
│   ├── architecture-adk.svg # System architecture diagram
│   └── deploy.sh           # Server deployment script
├── terraform/              # Infrastructure-as-Code (Terraform)
│   ├── main.tf             # Cloud Run, Artifact Registry, Firestore, IAM
│   ├── variables.tf        # Input variables
│   ├── outputs.tf          # Output values (Cloud Run URL, etc.)
│   └── terraform.tfvars.example  # Variable template
├── firestore.rules         # Firestore security rules
├── firebase.json           # Firebase Hosting config
├── cloudbuild.yaml         # CI/CD pipeline (Cloud Build)
├── deploy-all.sh           # One-command full-stack deployment
└── DEPLOYMENT_GUIDE.md     # Deployment + proof instructions
```

---

## Grounding & Safety

- **Visual grounding**: Every `[IMAGE:]` prompt is fully self-contained — restating the art style, character appearances, and setting to prevent visual drift
- **Narrative grounding**: The `StoryReviewer` agent validates speaker label consistency, image prompt coherence, and narrative quality
- **System instructions**: Explicit grounding directives enforce internally consistent world-building across all generated content
- **Safety filters**: Gemini's built-in safety filters are active on all model calls
- **Data isolation**: Firestore security rules enforce per-user data isolation and strict input validation

---

## Tech Stack

**Frontend**: React 19, Vite, Framer Motion, TypeScript
**Backend**: Google ADK for TypeScript (`@google/adk`), Express, Node.js 22
**AI**: Google GenAI SDK (`@google/genai`), 9 Gemini models + Cloud TTS Chirp 3 HD orchestrated via ADK
**Cloud**: Cloud Run, Cloud Firestore, Firebase Storage, Firebase Auth, Firebase Hosting, Cloud Text-to-Speech, Artifact Registry, Cloud Build

---

## Category

**Creative Storyteller** — Multimodal storytelling with interleaved output. Two creation modes (Live voice + Compose pipeline) seamlessly weave text, images, multi-voice audio, ambient music, and semantic embeddings in a single fluid experience.

#GeminiLiveAgentChallenge
