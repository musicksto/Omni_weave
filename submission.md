# OmniWeave — Devpost Submission

## Project Name
OmniWeave

## Elevator Pitch
A multimodal creative director that weaves text, AI-generated images, and multi-voice narration into cinematic stories — powered by Gemini's interleaved output and Google ADK.

---

## Text Description

### Inspiration

The "text box" is the bottleneck of creative AI. You type a prompt, get a wall of text back, then manually copy it into other tools to generate images, voices, or presentations. The creative process is fragmented.

We asked: what if an AI could think like a creative director — planning the visuals, writing the script, casting the voices, and delivering a complete multimodal experience in a single fluid output stream?

OmniWeave is our answer. It's an AI agent that doesn't just write stories — it *produces* them, seamlessly interleaving cinematic text, AI-generated illustrations, and multi-voice narration into a cohesive, immersive experience.

### What it does

OmniWeave takes a simple text prompt and produces a complete multimodal story:

1. **Story Generation** — Gemini 3.1 Pro writes a cinematic script with speaker labels and image markers, streaming in real-time.

2. **Image Generation** — Each [IMAGE:] marker triggers Gemini 3.1 Flash Image Preview to generate a 1K resolution, 16:9 illustration. Every image prompt is fully self-contained with art style and character descriptions restated for visual consistency. When the ADK server is connected, image generation routes through Cloud Run, keeping the API key server-side.

3. **Multi-Voice Narration** — Gemini 2.5 Flash TTS reads the script with distinct character voices. The system parses speaker labels, maps characters to voice presets (Zephyr, Kore, Fenrir, Puck, Charon), and chunks dialogue to handle multi-speaker conversations. Audio streams in real-time via WebAudio API.

4. **Multimodal Fingerprinting** — Gemini Embedding 2 Preview generates a high-dimensional vector from both the text prompt and the lead image together. This powers a "More Like This" similarity search across the user's story library using cosine similarity. When the ADK server is available, embeddings compute through Cloud Run.

5. **Story Library** — Users sign in via Firebase Authentication, save stories to Cloud Firestore (images in subcollections to handle size limits), write reviews, and discover similar stories via embedding-based retrieval.

6. **Presentation Mode** — "Play Full Story" auto-advances through every text segment with narration, creating a continuous, live-feeling cinematic experience.

### How we built it

**Frontend**: React 19 + Vite + Tailwind CSS v4 + Framer Motion. The frontend connects to the ADK agent server via `src/adkClient.ts`, which routes image generation and embedding computation through Cloud Run when available, with graceful fallback to direct client-side Gemini calls.

**Backend (ADK Agent Server)**: Built with Google ADK for TypeScript (`@google/adk`). The server implements a multi-agent architecture:

- **OmniWeaveDirector** — Root `LlmAgent` orchestrating the entire creative pipeline with three `FunctionTool` implementations for image generation, text-to-speech, and embedding computation.
- **StoryPipeline** — `SequentialAgent` chaining two specialized sub-agents:
  - **StoryWriter** — Generates cinematic scripts with image markers
  - **StoryReviewer** — Validates speaker labels, image prompt consistency, and narrative quality
- The Express server exposes REST and SSE endpoints, deployed to Cloud Run via Docker.
- The frontend shows a real-time "ADK Agent Pipeline" activity log when the server is connected, making the multi-agent orchestration visible to users and judges.

**Google Cloud Services (6)**:
- Cloud Run — ADK agent server
- Cloud Firestore — Stories, users, audio cache
- Firebase Authentication — Google sign-in
- Firebase Hosting — Frontend static assets
- Artifact Registry — Docker images
- Cloud Build — CI/CD pipeline

**Gemini Models (4)**:
- `gemini-3.1-pro-preview` / `gemini-2.5-flash` — Story generation and agent reasoning
- `gemini-3.1-flash-image-preview` — 1K image generation (16:9)
- `gemini-2.5-flash-preview-tts` — Multi-speaker voice narration
- `gemini-embedding-2-preview` — Multimodal story fingerprints

### Grounding and consistency

OmniWeave takes grounding seriously at multiple levels:

- **Visual grounding**: Every [IMAGE:] prompt is fully self-contained — restating the art style, character appearances, and setting. This prevents visual drift across the story.
- **Narrative grounding**: The StoryReviewer agent validates that speaker labels are consistent, image prompts match the narrative, and the story maintains internal coherence.
- **System instructions** include explicit grounding directives: "Base your story on internally consistent world-building. Character names, settings, and visual descriptions must remain consistent throughout."
- **Safety**: Gemini's built-in safety filters are active on all model calls. Firestore security rules enforce per-user data isolation and strict input validation.

### Challenges we ran into

**Multi-speaker TTS**: Gemini's TTS API supports max 2 speakers per call. We solved this by parsing the full script, building a global voice map, then chunking into 2-speaker segments streamed sequentially through WebAudio.

**Image consistency**: Early versions produced inconsistent illustrations. We solved this by requiring every image prompt to be fully self-contained — no relying on context from previous prompts.

**Firestore limits**: Base64 images exceed the 1MB document limit. We moved images into subcollections and strip base64 from the main document before saving.

**Audio caching**: We implemented a Firestore audio cache keyed by SHA-256 text hashes, enabling instant replay without regenerating TTS.

### Accomplishments we're proud of

- A single prompt produces text, 3-4 cinematic images, and multi-voice narration with no manual intervention
- The ADK multi-agent architecture cleanly separates writing, reviewing, image generation, speech synthesis, and embedding computation
- Embedding-based "More Like This" creates content discovery within personal libraries
- Full-stack deploys to Google Cloud with one shell script
- The frontend dynamically detects and connects to the ADK server, showing real-time agent activity

### What we learned

- Gemini's interleaved output capabilities are transformative for creative applications — streaming text with image markers, then generating visuals in parallel, creates a fundamentally different UX
- ADK's SequentialAgent and FunctionTool abstractions map naturally to creative production workflows — the write → review → produce pipeline mirrors how real creative teams operate
- Multimodal embeddings unlock retrieval without keyword search — embedding text and images together captures semantic similarity that text search misses

### What's next for OmniWeave

- Live API integration for real-time voice interaction
- Video generation using Veo for animated segments
- Collaborative multi-user stories
- Export to MP4 (stitching images + narration)

### Technologies Used

Google ADK for TypeScript, Google GenAI SDK, Gemini 3.1 Pro Preview, Gemini 3.1 Flash Image Preview, Gemini 2.5 Flash TTS, Gemini Embedding 2 Preview, Cloud Run, Cloud Firestore, Firebase Authentication, Firebase Hosting, Artifact Registry, Cloud Build, React 19, Vite, Tailwind CSS v4, Framer Motion, TypeScript, Express.js, Docker

### Category
Creative Storyteller

---

## Bonus Points Checklist

- [ ] Content piece (blog/podcast/video) with #GeminiLiveAgentChallenge
- [x] Automated Cloud Deployment: `deploy-all.sh` + `cloudbuild.yaml` in repo
- [ ] GDG membership: profile link at https://developers.google.com/community/gdg
