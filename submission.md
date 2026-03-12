# OmniWeave — Devpost Submission

## Project Name
OmniWeave

## Elevator Pitch
A multimodal creative director that weaves text, AI-generated images, multi-voice narration, and ambient music into cinematic stories — powered by 6 Gemini models and Google ADK.

---

## Text Description

### Inspiration

The "text box" is the bottleneck of creative AI. You type a prompt, get a wall of text back, then manually copy it into other tools to generate images, voices, or presentations. The creative process is fragmented.

We asked: what if an AI could think like a creative director — planning the visuals, writing the script, casting the voices, and delivering a complete multimodal experience in a single fluid output stream?

OmniWeave is our answer. It's an AI agent that doesn't just write stories — it *produces* them, seamlessly interleaving cinematic text, AI-generated illustrations, and multi-voice narration into a cohesive, immersive experience.

### What it does

OmniWeave takes a simple text prompt and produces a complete multimodal story:

1. **Story Generation** — Gemini 3.1 Pro writes a cinematic script with speaker labels and image markers, streaming in real-time.

2. **Image Generation** — Each [IMAGE:] marker triggers Gemini 3.1 Flash Image Preview to generate a 1K resolution, 16:9 illustration with Ken Burns cinematic pan/zoom animation. Every image prompt is fully self-contained with art style and character descriptions restated for visual consistency.

3. **Multi-Voice Narration** — Gemini 2.5 Flash TTS reads the script with gender-aware character voices. The system detects character gender from names (50+ name database + suffix heuristics), maps female characters to Kore/Aoede, male to Fenrir/Charon, and narration to Zephyr. Audio streams in real-time via WebAudio API.

4. **Background Music** — Lyria RealTime generates mood-aware ambient music that plays under narration. The system extracts emotional keywords from the story text and maps them to music prompts (battle → epic orchestral, forest → enchanted ambient, romance → gentle strings).

5. **Multimodal Fingerprinting** — Gemini Embedding 2 Preview generates a high-dimensional vector from both the text prompt and the lead image together. This powers a "More Like This" similarity search across the public story library using cosine similarity.

6. **Public Library** — Zero-friction anonymous auth lets anyone save stories, write reviews, and discover similar stories. No sign-in required.

7. **Presentation Mode** — "Play Full Story" auto-advances through every text segment with narration and background music, creating a continuous cinematic experience.

8. **Audiobook Export** — Download the full narration as a single WAV file for offline listening.

### How we built it

**Frontend**: React 19 + Vite + Tailwind CSS v4 + Framer Motion. The frontend connects to the ADK agent server via `src/adkClient.ts`, which routes image generation and embedding computation through Cloud Run when available, with graceful fallback to direct client-side Gemini calls.

**Backend (ADK Agent Server)**: Built with Google ADK for TypeScript (`@google/adk`). The server implements a multi-agent architecture:

- **OmniWeaveDirector** — Root `LlmAgent` orchestrating the entire creative pipeline with four `FunctionTool` implementations for image generation, text-to-speech, embedding computation, and background music.
- **StoryPipeline** — `SequentialAgent` chaining two specialized sub-agents:
  - **StoryWriter** — Generates cinematic scripts with image markers
  - **StoryReviewer** — Validates speaker labels, image prompt consistency, and narrative quality
- The Express server exposes REST and SSE endpoints, deployed to Cloud Run via Docker.
- The frontend shows a real-time "ADK Agent Pipeline" activity log when the server is connected, making the multi-agent orchestration visible to users and judges.

**Google Cloud Services (6)**:
- Cloud Run — ADK agent server
- Cloud Firestore — Stories, users, audio cache
- Firebase Authentication — Anonymous auth (zero-friction)
- Firebase Hosting — Frontend static assets
- Artifact Registry — Docker images
- Cloud Build — CI/CD pipeline

**Gemini Models (6)**:
- `gemini-3.1-pro-preview` — Story generation and creative writing
- `gemini-3-flash-preview` — Agent reasoning, story writing, story reviewing
- `gemini-3.1-flash-image-preview` — 1K image generation (16:9) with Ken Burns animation
- `gemini-2.5-flash-preview-tts` — Gender-aware multi-speaker voice narration
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

Google ADK for TypeScript, Google GenAI SDK, Gemini 3.1 Pro Preview, Gemini 3.1 Flash Image Preview, Gemini 2.5 Flash TTS, Gemini Embedding 2 Preview, Lyria RealTime, Cloud Run, Cloud Firestore, Firebase Authentication, Firebase Hosting, Artifact Registry, Cloud Build, React 19, Vite, Tailwind CSS v4, Framer Motion, TypeScript, Express.js, Docker

### Category
Creative Storyteller

---

## Bonus Points Checklist

- [ ] Content piece (blog/podcast/video) with #GeminiLiveAgentChallenge
- [x] Automated Cloud Deployment: `deploy-all.sh` + `cloudbuild.yaml` in repo
- [ ] GDG membership: profile link at https://developers.google.com/community/gdg
