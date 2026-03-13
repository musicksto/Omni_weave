# OmniWeave — Devpost Submission

## Project Name
OmniWeave

## Elevator Pitch
A multimodal creative director that weaves text, AI-generated images, multi-voice narration, and ambient music into cinematic stories — with real-time voice interaction via the Gemini Live API. Powered by 8 Gemini models, bidirectional streaming, and Google ADK.

---

## Text Description

### Inspiration

The "text box" is the bottleneck of creative AI. You type a prompt, get a wall of text back, then manually copy it into other tools to generate images, voices, or presentations. The creative process is fragmented.

We asked: what if an AI could think like a creative director — planning the visuals, writing the script, casting the voices, and delivering a complete multimodal experience in a single fluid output stream?

OmniWeave is our answer. It's an AI agent that doesn't just write stories — it *produces* them, seamlessly interleaving cinematic text, AI-generated illustrations, and multi-voice narration into a cohesive, immersive experience.

### What it does

OmniWeave offers two modes of creation:

**Live Mode (Gemini Live API)** — Speak directly to OmniWeave through bidirectional WebSocket streaming. Your voice is captured at 16kHz, streamed to Gemini Live via a Node.js WebSocket proxy, and the AI responds with expressive narration (24kHz audio), real-time text, and tool-generated illustrations — all in a continuous, multi-turn conversation. Interrupt, redirect, and collaborate with the AI narrator in real time. When you're done, save the conversation as a full story.

**Compose Mode (ADK Pipeline)** — Type a prompt and let the full production pipeline handle everything:

1. **Story Generation** — A Google ADK `StoryPipeline` streams a cinematic script in real time through `StoryWriter` (Gemini 3.1 Pro) and `StoryReviewer` (Gemini 3.1 Flash Lite), preserving speaker labels and image markers.

2. **Image Generation** — Each [IMAGE:] marker triggers Gemini 3.1 Flash Image Preview to generate a 1K resolution, 16:9 illustration with Ken Burns cinematic pan/zoom animation. Every image prompt is fully self-contained with art style and character descriptions restated for visual consistency.

3. **Multi-Voice Narration** — Gemini 2.5 Flash TTS reads the script with gender-aware character voices. The system detects character gender from names (50+ name database + suffix heuristics), maps female characters to Kore/Aoede, male to Fenrir/Charon, and narration to Zephyr. Audio streams in real-time via WebAudio API in the browser.

4. **Background Music** — Lyria RealTime generates mood-aware ambient music that plays under narration. The system extracts emotional keywords from the story text and maps them to music prompts (battle → epic orchestral, forest → enchanted ambient, romance → gentle strings).

5. **Multimodal Fingerprinting** — Gemini Embedding 2 Preview generates a high-dimensional vector from both the text prompt and the lead image together. This powers a "More Like This" similarity search across the user's private story library using cosine similarity.

6. **Private Library** — Zero-friction anonymous auth lets anyone save stories, write reviews, and revisit similar stories in a personal private library. No sign-in friction required.

7. **Presentation Mode** — "Play Full Story" auto-advances through every text segment with narration and background music, creating a continuous cinematic experience.

8. **Audiobook Export** — Download the full narration as a single WAV file for offline listening.

### How we built it

**Frontend**: React 19 + Vite + Tailwind CSS v4 + Framer Motion. The frontend connects to the ADK agent server via `src/adkClient.ts`. When Cloud Run is available, the live story generation path uses `/api/generate`, while image generation and embedding computation also route through Cloud Run. Narration and background music currently run browser-side for low-latency playback, with graceful direct-mode fallback when the ADK server is unavailable.

**Backend (ADK Agent Server)**: Built with Google ADK for TypeScript (`@google/adk`). The server implements a multi-agent architecture with two streaming protocols:

- **StoryPipeline** — `SequentialAgent` powering the `/api/generate` SSE endpoint:
  - **StoryWriter** — Generates cinematic scripts with image markers
  - **StoryReviewer** — Validates speaker labels, image prompt consistency, and narrative quality
- **OmniWeaveDirector** — Root `LlmAgent` scaffold with four `FunctionTool` implementations for image generation, text-to-speech, embedding computation, and background music.
- **Live API WebSocket Proxy** (`/api/live`) — Bidirectional streaming bridge between browser WebSocket and `ai.live.connect()`. The proxy:
  - Receives 16kHz PCM audio and text from the browser client
  - Forwards to `gemini-live-2.5-flash-preview` with `responseModalities: [AUDIO, TEXT]`
  - Streams Gemini's audio responses (24kHz PCM) and text back to the browser
  - Executes tool calls server-side (image generation, music) and returns results to both Gemini and the client
  - Maintains conversation history for "Save as Story" bridge
- The frontend shows a real-time "ADK Agent Pipeline" activity log when the server is connected, making the live multi-agent write → review flow visible to users and judges.

**Google Cloud Services (6)**:
- Cloud Run — ADK agent server
- Cloud Firestore — Stories, users, audio cache
- Firebase Authentication — Anonymous auth (zero-friction)
- Firebase Hosting — Frontend static assets
- Artifact Registry — Docker images
- Cloud Build — CI/CD pipeline

**Gemini Models (8)**:
- `gemini-live-2.5-flash-preview` — Live API bidi-streaming (voice-in, multimodal-out)
- `gemini-3.1-pro-preview` — Story generation and creative writing
- `gemini-3-flash-preview` — Agent reasoning and orchestration
- `gemini-3.1-flash-lite-preview` — Story review and validation
- `gemini-3.1-flash-image-preview` — 1K image generation (16:9) with Ken Burns animation
- `gemini-2.5-pro-preview-tts` — Gender-aware multi-speaker voice narration
- `gemini-embedding-2-preview` — Multimodal story fingerprints
- `lyria-realtime-exp` — Mood-aware ambient background music

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

**Privacy vs caching**: We experimented with shared audio caching, but removed it from the current build because it weakened the truthfulness of our private-library security story. The current version prioritizes isolation over cross-user cache reuse.

### Accomplishments we're proud of

- **Two creation modes**: real-time voice storytelling via Gemini Live API bidi-streaming, and a full ADK production pipeline for composed stories
- Real-time voice interaction with tool execution: speak a story idea, hear the AI narrator respond, see illustrations generated mid-conversation
- A single prompt produces text, 3-4 cinematic images, and multi-voice narration with no manual intervention
- The ADK multi-agent architecture cleanly separates writing and review in the compose story path
- Embedding-based "More Like This" creates content discovery within personal libraries
- Full-stack deploys to Google Cloud with one shell script
- The frontend dynamically detects and connects to the ADK server, showing real-time agent activity from the actual backend stream

### What we learned

- The Gemini Live API's bidirectional streaming with tool execution creates a fundamentally new creative interaction — users can speak story ideas and get real-time narration, illustrations, and music back in a single conversation
- Building a WebSocket proxy (browser ↔ Node.js ↔ Gemini Live) requires careful PCM audio format handling — 16kHz capture, 24kHz playback, and gapless scheduling via Web Audio API
- ADK's SequentialAgent and FunctionTool abstractions map naturally to creative production workflows — the write → review → produce pipeline mirrors how real creative teams operate
- Multimodal embeddings unlock retrieval without keyword search — embedding text and images together captures semantic similarity that text search misses

### What's next for OmniWeave

- Video generation using Veo for animated story segments
- Graph RAG memory bank for cross-story character continuity
- Collaborative multi-user storytelling sessions
- Export to MP4 (stitching images + narration + music)

### Technologies Used

Google ADK for TypeScript, Google GenAI SDK, Gemini Live API (bidi-streaming), Gemini 3.1 Pro Preview, Gemini Live 2.5 Flash Preview, Gemini 3.1 Flash Image Preview, Gemini 2.5 Pro TTS, Gemini Embedding 2 Preview, Lyria RealTime, WebSocket (ws), Cloud Run, Cloud Firestore, Firebase Authentication, Firebase Hosting, Artifact Registry, Cloud Build, React 19, Vite, Tailwind CSS v4, Framer Motion, Web Audio API, TypeScript, Express.js, Docker

### Category
Creative Storyteller

---

## Bonus Points Checklist

- [ ] Content piece (blog/podcast/video) with #GeminiLiveAgentChallenge
- [x] Automated Cloud Deployment: `deploy-all.sh` + `cloudbuild.yaml` in repo
- [ ] GDG membership: profile link at https://developers.google.com/community/gdg
