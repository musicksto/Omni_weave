# OmniWeave — Competition Audit

**Competition**: Gemini Live Agent Challenge
**Category**: Creative Storyteller
**Submission Deadline**: March 16, 2026, 5:00 PM PDT (3 days from today)
**Judging Period**: March 17 – April 3, 2026

---

## Stage One: Baseline Viability (Pass/Fail)

All submissions must include these 5 items. Failure = immediate disqualification.

| # | Requirement | Status | Evidence | Action Needed |
|---|-------------|--------|----------|---------------|
| 1 | **Text Description** (features, tech, data sources, findings) | PASS | `submission.md` — comprehensive, covers all sections | None |
| 2 | **Public Code Repository** with spin-up instructions in README | PASS | GitHub repo + `README.md` has Quick Start, Prerequisites, setup | Verify repo is PUBLIC before deadline |
| 3 | **Google Cloud Deployment Proof** (screen recording of GCP console OR code link) | **NEEDS WORK** | Deploy scripts exist (`deploy-all.sh`, `server/deploy.sh`, `cloudbuild.yaml`, `Dockerfile`) but **no screen recording of running deployment** | Record short screen capture showing Cloud Run service running in GCP console |
| 4 | **Architecture Diagram** | PASS | `server/architecture-adk.png` and `.svg` exist | Verify it shows Gemini → backend → database → frontend flow clearly |
| 5 | **Demo Video** (under 4 min, actual software, pitch, on YouTube/Vimeo) | **MISSING** | No demo video found in repo | **CRITICAL: Record and upload demo video** |

### Category-Specific Requirements (Creative Storyteller)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Uses Gemini's interleaved/mixed output capabilities | PASS | Text + images + audio interleaved in single output stream |
| Hosted on Google Cloud | PASS | Cloud Run (backend), Firebase Hosting (frontend) |
| Uses multimodal inputs and outputs | PASS | Text input → text + images + audio + music output; Live mode: voice input → voice + text + images output |
| Uses a Gemini model | PASS | 8 Gemini models used |
| Uses Google GenAI SDK or ADK | PASS | Both — ADK for agent architecture, GenAI SDK for direct calls |
| At least one Google Cloud service | PASS | 6 Google Cloud services |

---

## Stage Two: Weighted Criteria Scoring

### Criterion 1: Innovation & Multimodal User Experience (40% weight)

**Judges ask**: Does the project break the "text box" paradigm? Is interaction seamless? Does it have a distinct persona/voice? Is the experience "Live" and context-aware?

| Factor | Score Estimate | Assessment |
|--------|---------------|------------|
| **"Beyond Text" Factor** | 4.5/5 | Two creation modes (Live voice + Compose pipeline). Live mode is genuinely bidirectional — speak, interrupt, get audio + text + images back. Compose mode produces interleaved text/images/narration from a single prompt. |
| **Seamless media interleaving** | 4/5 | Text, images, and audio stream in real-time. Ken Burns animation on images. Gender-aware multi-voice narration. Background music. The flow is continuous, not turn-based. Minor gap: images take time to generate (network latency). |
| **Distinct persona/voice** | 4/5 | OmniWeave has a "creative director" persona. Multi-voice casting with gender detection. Narrator voice (Zephyr) is consistent. Could be stronger — no explicit "OmniWeave personality" in conversation. |
| **"Live" and context-aware** | 4/5 | Live mode maintains conversation history. Compose mode streams in real-time. StoryReviewer validates consistency. Embedding-based similarity search adds context awareness. |
| **Category execution (Storyteller)** | 4.5/5 | Best-in-class for Creative Storyteller: text + 3-4 images + multi-voice narration + ambient music + audiobook export, all from a single prompt. |

**Estimated subscore: 4.2/5**

**Strengths**:
- Two distinct creation modes (Live + Compose) — judges see breadth
- 8 models working together is impressive model diversity
- Full sensory output: text, images, voice, music
- Live mode with tool execution mid-conversation is genuinely novel

**Weaknesses / Improvement opportunities**:
- The NEW Split UI is visually distinctive but judges need to SEE it in the demo video
- Consider adding a brief "personality introduction" when Live mode connects (e.g., "I'm OmniWeave, your creative director...")
- The film sprocket pipeline is a unique UI element — make sure the demo video shows it

---

### Criterion 2: Technical Implementation & Agent Architecture (30% weight)

**Judges ask**: Effective use of GenAI SDK/ADK? Robust Google Cloud hosting? Sound agent logic? Graceful error handling? Hallucination avoidance? Evidence of grounding?

| Factor | Score Estimate | Assessment |
|--------|---------------|------------|
| **Google Cloud Native** | 5/5 | 6 Google Cloud services (Cloud Run, Firestore, Firebase Auth, Firebase Hosting, Artifact Registry, Cloud Build). ADK for TypeScript with SequentialAgent. Full deployment automation. |
| **GenAI SDK / ADK usage** | 5/5 | Both SDK and ADK used correctly. ADK `SequentialAgent` for StoryPipeline, `FunctionTool` for tools. GenAI SDK for direct model calls. |
| **System Design** | 4.5/5 | Clean separation: StoryWriter → StoryReviewer pipeline. WebSocket proxy for Live API. SSE streaming for compose. REST endpoints for tools. The architecture diagram documents this well. |
| **Error handling** | 4/5 | Retry logic (3 attempts) for image gen. Rate limit handling. Graceful fallback when ADK server unavailable (direct mode). Firestore error logging with auth context. Could add more user-visible error recovery. |
| **Grounding / Hallucination avoidance** | 4/5 | Self-contained image prompts prevent visual drift. StoryReviewer validates consistency. System instructions enforce grounding. Gemini safety filters active. Documented in submission. |

**Estimated subscore: 4.5/5**

**Strengths**:
- Deepest Google Cloud integration in the category (6 services, 8 models)
- ADK + GenAI SDK dual usage shows mastery
- StoryPipeline (SequentialAgent) is a textbook multi-agent pattern
- Live API WebSocket proxy is non-trivial engineering

**Weaknesses / Improvement opportunities**:
- ~~README says "7 models" in one place~~ — FIXED, all references now say 8
- The `OmniWeaveDirector` root agent appears to be a scaffold — clarify in submission whether it orchestrates or is expansion-only

---

### Criterion 3: Demo & Presentation (30% weight)

**Judges ask**: Clear problem/solution? Architecture diagram? Visual Cloud deployment proof? Actual working software?

| Factor | Score Estimate | Assessment |
|--------|---------------|------------|
| **Problem definition** | 4/5 | "The text box is the bottleneck of creative AI" — clear, relatable problem statement. |
| **Solution explanation** | 4.5/5 | Submission is thorough. Two modes, 8 models, 6 cloud services. Well-written. |
| **Architecture diagram** | 4/5 | Exists as PNG and SVG. Shows multi-agent flow. Verify it's up-to-date with current architecture. |
| **Cloud deployment proof** | **2/5** | Deploy scripts exist but **no screen recording** showing the app running on GCP. This is REQUIRED. |
| **"Live" Factor — actual working software** | **?/5** | **No demo video exists yet.** This is the most critical gap. |

**Estimated subscore: Currently 3/5 (missing video kills this criterion)**

**CRITICAL ACTIONS**:
1. **Record demo video** (under 4 minutes) showing:
   - Problem pitch (30 sec)
   - Live Mode demo — speak to OmniWeave, show tool execution mid-conversation (60 sec)
   - Compose Mode demo — type prompt, show streaming text + image generation + narration (60 sec)
   - Show the film sprocket pipeline, frame numbers, Split UI design (15 sec)
   - Show the story library, embedding visualization, similarity search (15 sec)
   - Architecture diagram walkthrough (20 sec)
   - Google Cloud deployment proof (20 sec)
2. **Record GCP console screen capture** (separate from demo) showing Cloud Run service running
3. Upload demo to YouTube (public, not unlisted)

---

## Stage Three: Bonus Points (up to +1.0)

| Bonus | Max Points | Status | Action |
|-------|-----------|--------|--------|
| **Content Publication** (blog/podcast/video about building with Google AI) | +0.6 | NOT DONE | Write a blog post or record a dev log video. Must include "created for the hackathon" language. Use #GeminiLiveAgentChallenge hashtag. Publish on public platform (Medium, Dev.to, YouTube). |
| **Automated Cloud Deployment** | +0.2 | DONE | `deploy-all.sh`, `server/deploy.sh`, `cloudbuild.yaml`, `Dockerfile` all in repo |
| **GDG Membership** | +0.2 | NOT DONE | Join a Google Developer Group and provide profile link |

**Current bonus: +0.2 / 1.0**
**Potential bonus: +1.0 / 1.0** (if blog + GDG membership completed)

---

## Score Projection

### Current State (without demo video)

| Criterion | Weight | Score | Weighted |
|-----------|--------|-------|----------|
| Innovation & Multimodal UX | 40% | 4.2 | 1.68 |
| Technical Implementation | 30% | 4.5 | 1.35 |
| Demo & Presentation | 30% | 2.0* | 0.60 |
| **Base Score** | | | **3.63** |
| Bonus | | | +0.2 |
| **Final Score** | | | **3.83 / 6.0** |

*Missing demo video tanks this criterion

### Projected State (with all actions completed)

| Criterion | Weight | Score | Weighted |
|-----------|--------|-------|----------|
| Innovation & Multimodal UX | 40% | 4.5 | 1.80 |
| Technical Implementation | 30% | 4.5 | 1.35 |
| Demo & Presentation | 30% | 4.5 | 1.35 |
| **Base Score** | | | **4.50** |
| Bonus | | | +1.0 |
| **Final Score** | | | **5.50 / 6.0** |

---

## Priority Action List (by impact)

### CRITICAL (must do before submission)
1. **Record demo video** — 4 minutes max, actual software, pitch, upload to YouTube (PUBLIC)
2. **Record GCP deployment proof** — short screen capture of Cloud Run console
3. **Verify repo is public** on GitHub
4. **Fix README model count** — says "7" in one place, submission says "8" (Live model is the 8th)

### HIGH (significant score boost)
5. **Write blog post** about building OmniWeave — publish on Medium or Dev.to (+0.6 bonus)
   - Include: "This project was created as an entry for the Gemini Live Agent Challenge hackathon"
   - Share on social media with #GeminiLiveAgentChallenge
6. **Join a GDG** and add profile link to submission (+0.2 bonus)

### MEDIUM (polish)
7. **Update architecture diagram** to reflect the Split UI redesign and all 8 models
8. **Add Live mode to README** — current README focuses on Compose mode, doesn't clearly show the Live API bidi-streaming path
9. **Test the deployed app** end-to-end on Cloud Run to ensure judges can reproduce

### LOW (nice to have)
10. Update submission.md to mention the Split UI redesign
11. Add demo video link to README once uploaded
12. Consider adding a personality greeting to Live mode ("Welcome to OmniWeave...")

---

## Competitive Edge Assessment

### What sets OmniWeave apart
- **8 Gemini models** in one project — likely highest model count in the competition
- **Two creation modes** (Live + Compose) — covers both "Live Agent" and "Creative Storyteller" ground
- **Full sensory output** — text + images + multi-voice narration + ambient music
- **Split UI design** — the dark frame / light canvas aesthetic is genuinely distinctive
- **Film sprocket pipeline** — unique visual element no other app will have
- **Frame numbers on images** — cinematic attention to detail

### Biggest risks
- **No demo video** — judges literally cannot evaluate you without this
- **Blog post** — missing +0.6 bonus points that could separate you from competitors
- **Deployment stability** — if judges can't run it, technical score suffers
