# Findings & Decisions

## Requirements
- Review the local OmniWeave codebase.
- Audit the live/current Gemini Live Agent Challenge page on Devpost.
- Judge whether the current project is in a strong position to win.
- Produce high-signal findings, risks, and next steps.

## Research Findings
- The repo is a Vite + React 19 + TypeScript frontend paired with a TypeScript Express server that wraps Google ADK.
- The project is explicitly positioned for the Gemini Live Agent Challenge under the "Creative Storyteller" category.
- The README markets a strong multimodal scope: story generation, image generation, TTS, Lyria music, and embeddings-based discovery.
- The repo is small and concentrated: main frontend logic appears to live in `src/App.tsx`, with the backend concentrated in `server/agent.ts` and `server/server.ts`.
- No dedicated test suite is present in the top-level file list, which raises verification risk for a competition submission.
- Current Devpost rules weight scoring as: Innovation & Multimodal UX 40%, Technical Implementation & Agent Architecture 30%, Demo & Presentation 30%.
- The Creative Storyteller category specifically requires Gemini interleaved/mixed output capabilities and agents hosted on Google Cloud.
- Devpost rules also require proof of Google Cloud deployment, an architecture diagram, and a demo video showing the actual software working in real time.
- Devpost overview currently shows the submission deadline as March 16, 2026 at 5:00 PM PDT.
- Devpost FAQ says Google Cloud proof can be either a quick screen recording of the app/deployment running on GCP or a repo link to code that clearly demonstrates Google Cloud service/API usage.
- Devpost FAQ also explicitly says the code repository must be public and the README must include clear spin-up instructions for judging eligibility/reproducibility.
- The repo already includes an architecture diagram, deployment guide, and deployment automation evidence, which helps with baseline submission completeness.
- The frontend currently appears to use direct client-side Gemini story generation even when the ADK server is available; the ADK server is only used for image generation and embeddings.
- `generateStoryViaADK` exists in `src/adkClient.ts` but is not referenced elsewhere, which suggests the advertised live ADK story pipeline is not the runtime path.
- The Firestore rules allow any authenticated user to read all stories and all story media, which conflicts with the README/submission claim of per-user isolation.
- Root-level verification is weak in the current workspace: `npm run build` failed due a missing Rollup optional native dependency, and `npm run lint` failed because the root TypeScript check includes `server/*` while `server/node_modules` is absent.
- Browser-based validation is limited in this workspace because the local Playwright skill runner exists but Playwright itself is not installed here.
- The repo has now been updated so the frontend uses the ADK `/api/generate` path for story generation when `VITE_ADK_SERVER_URL` is configured, instead of always using a direct browser-side Gemini story call.
- Story parsing was extracted into a small testable helper with passing local tests.
- Firestore reads are now private-by-owner, which required the app to stop querying all stories globally and instead scope library/similarity reads to the current user.
- Root verification is now reproducible in this workspace: frontend build passes, frontend type-check passes, backend type-check passes after installing server dependencies.
- The frontend production bundle still emits a large-chunk warning (`~1.23 MB` JS before gzip), which is a performance/polish issue rather than a correctness blocker.
- The configured live Cloud Run ADK URL responds to `/api/agent-info`, but the live deployed service has not yet been redeployed from this updated repo in this session.
- Deployment from this workspace is currently blocked by missing operator state, not code: Firebase CLI is not logged in, `gcloud` has no active project set, and `GOOGLE_API_KEY` is not present in the shell environment.
- `deploy-all.sh` now deploys Firestore rules as well as Hosting, and supports an optional `VITE_GEMINI_API_KEY` for browser-side narration/music in hosted demos.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Treat this as both a code review and submission-readiness audit | Winning depends on implementation quality plus fit to challenge criteria |
| Prioritize end-to-end demo strength over pure architecture neatness | Contest judges will care more about the live experience, reliability, and clarity of innovation |
| Emphasize category-fit truthfulness | Overclaiming ADK/live-agent behavior is more damaging than a smaller but accurate scope |
| Prefer a private-library product over a misleading public-library claim | The challenge is more forgiving of a smaller scope than of a contradictory codebase |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| `npm run build` failed because `@rollup/rollup-linux-x64-gnu` is missing from local `node_modules` | Treat as packaging/environment risk; verify with a fresh install before submission |
| `npm run lint` failed because root TypeScript checks `server/*` without server dependencies installed | Treat as repo usability risk; either document/setup server deps clearly or isolate root lint scope |
| `server/server.ts` used an outdated `runner.runAsync(...)` call shape for the installed `@google/adk` version | Updated the call to the object-parameter signature required by the current SDK |
| `.env.example` briefly contained concrete key values during a parallel hardening pass | Scrubbed immediately back to empty placeholders |
| Full-stack redeploy could not be executed from this session | Verified the exact blockers: missing Firebase login, unset gcloud project, missing `GOOGLE_API_KEY` in shell |

## Resources
- Repo root: `/mnt/c/Users/akiem/Downloads/OMNIWEAVE-FINAL-FIXED`
- Challenge URL: `https://geminiliveagentchallenge.devpost.com/`
- Key repo files: `README.md`, `submission.md`, `src/App.tsx`, `src/adkClient.ts`, `server/agent.ts`, `server/server.ts`
- Devpost rules page: `https://geminiliveagentchallenge.devpost.com/rules`
- Devpost overview page: `https://geminiliveagentchallenge.devpost.com/`
- Devpost FAQ: `https://geminiliveagentchallenge.devpost.com/details/faqs`
- Implementation plan: `docs/plans/2026-03-12-win-readiness.md`

## Visual/Browser Findings
- Devpost rules emphasize that the demo must show the real software in action, not mockups, and that proof of Google Cloud deployment must be visible in submission materials.
- Devpost overview emphasizes that Creative Storyteller entries should feel seamless and live, not disjointed or turn-based.
- The live configured Cloud Run endpoint is reachable at the currently configured ADK URL and returns agent-info JSON, but the production deployment still needs to be refreshed to reflect the new repo code.
