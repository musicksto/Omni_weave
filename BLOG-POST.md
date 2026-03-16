# I Wired Up 9 Gemini Models to Make Stories Feel Like Movies. Here's What Happened.

*This article was created for the purposes of entering the [Gemini Live Agent Challenge](https://geminiliveagentchallenge.devpost.com/) hackathon.*

---

I got tired of AI storytelling being a text box. You type something, you get paragraphs back, and that's it. No pictures. No voices. No music. Just words on a screen.

So I spent three weeks building something different. **OmniWeave** takes a single prompt and turns it into a full cinematic experience -- illustrated scenes, multi-voice narration, ambient background music, even video clips. You can also just talk to it in real time through your mic and it narrates back while generating images on the fly.

[Try it live](https://gen-lang-client-0001923421.web.app) | [Source on GitHub](https://github.com/musicksto/Omni_weave)

---

## How It Actually Works

The backend runs on Cloud Run using Google's Agent Development Kit (ADK) for TypeScript. There are 9 Gemini models doing different jobs simultaneously:

| What it does | Model | How fast |
|---|---|---|
| Writes the story script | gemini-2.5-flash | ~6 seconds |
| Reviews it for consistency | gemini-2.5-flash-lite | ~1 second |
| Generates illustrations | gemini-3.1-flash-image-preview | ~12 seconds |
| Generates video clips | veo-3.1-fast | ~27 seconds |
| Narrates with distinct voices | Cloud TTS Chirp 3 HD (28 voices) | ~4s per chunk |
| Falls back if Cloud TTS is down | gemini-2.5-pro-preview-tts | ~8s per chunk |
| Powers the live voice mode | gemini-2.5-flash-native-audio | real-time |
| Creates story fingerprints | gemini-embedding-2 | ~0.5 seconds |
| Composes background music | lyria-realtime-exp | real-time |

The pipeline is an ADK `SequentialAgent`. The StoryWriter drafts 5 scenes with a CHARACTER SHEET at the top (art style, setting, full physical descriptions for each character). Then the StoryReviewer checks everything -- are speaker labels on every line? Do all 5 image prompts restate the character descriptions? Are the voices distinct? It fixes about 15% of stories silently before they reach the frontend.

```typescript
const storyPipeline = new SequentialAgent({
  name: 'StoryPipeline',
  subAgents: [storyWriterAgent, storyReviewerAgent],
});
```

Above that sits the OmniWeaveDirector with tools for image generation, TTS, embeddings, music, video, and a Graph RAG memory bank.

---

## The Hard Parts

### Getting Characters to Look the Same Across 5 Images

This was the biggest challenge. The image model has zero memory between calls. If you generate 5 images of "a samurai cat," you'll get 5 completely different cats.

My solution: the StoryWriter outputs a structured CHARACTER SHEET with exact physical details -- fur color, eye color, outfit, distinguishing features. Every single `[IMAGE:]` prompt copies those descriptions word for word. The image model gets a self-contained prompt each time with the full character spec baked in. It's repetitive, but it works.

### Voice Casting Without User Configuration

Cloud TTS Chirp 3 HD has 28 voices, but it only supports 2 speakers per API call. OmniWeave stories have a narrator plus 2-3 characters. So the system parses all speaker labels from the story, detects gender from character names (suffix heuristics plus a name database), picks voices from age-grouped pools, then chunks the text into 2-speaker segments that stream sequentially through a custom AudioStreamer for gapless playback.

An old wizard gets a deep gravelly voice. A young heroine gets something bright and warm. It just works without anyone picking from a dropdown.

### The Stale Closure Bug That Took Hours

The audio auto-advance system calls itself recursively -- when scene 1 finishes narrating, it triggers scene 2, and so on. But React closures capture state at render time. The callback would read `storyParts` from the initial render (an empty array) instead of the current value.

The fix was embarrassingly simple once I found it:

```typescript
const storyPartsRef = useRef<StoryPart[]>([]);
useEffect(() => { storyPartsRef.current = storyParts; }, [storyParts]);
// Always read storyPartsRef.current in callbacks, never storyParts
```

### Running Two Auth Modes on One Server

The ADK story pipeline uses Vertex AI with the Cloud Run service account. But the Live API, TTS, and Lyria music need API key auth with `vertexai: false`. These are two different auth modes running on the same Express server. Mix them up and things fail silently -- no error, just empty responses.

---

## Live Mode: Voice-Driven Storytelling

This is the part I'm most proud of. You click "Enter Live Mode," grant mic access, and start talking. The AI responds with an expressive voice -- not robotic TTS, but actual voice acting from the native audio model. While it's narrating, the frontend auto-generates images every few turns to illustrate the evolving story.

Under the hood it uses `gemini-2.5-flash-native-audio` through the Live API with context window compression (100K trigger, 80K sliding window) for unlimited session length, and session resumption for automatic reconnection if the WebSocket drops.

The tricky bit: the native audio model won't call tools mid-conversation. It only triggers tools during the initial greeting. So image generation during live storytelling is handled client-side -- the frontend watches the narration text and fires off image generation requests every 3 turns, prepending a style context from the first narration turn to keep visuals consistent.

---

## Memory Bank: Characters Remember You

Every saved story feeds a Graph RAG knowledge graph. Gemini 2.5 Flash extracts characters, locations, events, and motifs as graph nodes with traits and relationships. When you write a new story, OmniWeave queries the graph and injects matching character descriptions into the prompt. A samurai cat from last week's story shows up with the exact same emerald eyes and crimson obi.

---

## The Cinematic Player

The frontend is a full-viewport player that feels more like watching a movie than reading text. Each scene fills the screen with the illustration (Ken Burns pan animations, 4 variants), overlays the dialogue as subtitled captions with color-coded speaker badges, and plays narration plus ambient music simultaneously. You can toggle captions off to see the full artwork, navigate with arrow keys or the media bar, and export the whole thing as a styled HTML storybook.

Stories open with a cover page -- title over a blurred/darkened lead image, gold divider, "Powered by Gemini AI" badge. Users can save stories as public (visible in the gallery for everyone) or private (only visible to them).

---

## What I'd Do Differently

**Start with the preload screen.** I built the generation pipeline first and the loading UI last. Users stare at a blank screen for 30 seconds not knowing what's happening. The animated progress ring with "Did you know?" facts was a late addition that should have been day one.

**Test on mobile earlier.** The cinematic player looked gorgeous on desktop and was completely broken on a phone. Fixed it, but the responsive pass should have happened incrementally.

**Rate limit from the start.** I left all endpoints open for weeks during development. One accidental browser tab refresh loop burned through a surprising amount of API quota before I noticed.

---

## Stack

- **Frontend**: React 19, Vite, Framer Motion
- **Backend**: Google ADK for TypeScript, Express, Cloud Run
- **Cloud Services**: Cloud Run, Firestore, Firebase Storage, Firebase Auth, Firebase Hosting, Cloud TTS, Artifact Registry, Cloud Build
- **Deployment**: Automated via `deploy-all.sh` + `cloudbuild.yaml`

---

## Links

- **Live Demo**: [gen-lang-client-0001923421.web.app](https://gen-lang-client-0001923421.web.app)
- **Source Code**: [github.com/musicksto/Omni_weave](https://github.com/musicksto/Omni_weave)

Type "A samurai cat defending a moonlit temple" and watch 9 models compose your story in about 30 seconds.

*This article was created for the purposes of entering the [Gemini Live Agent Challenge](https://geminiliveagentchallenge.devpost.com/) hackathon.*
