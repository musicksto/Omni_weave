# OmniWeave Win Readiness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the shipped product, repo proof, and submission story line up closely enough that OmniWeave can defend a strong Gemini Live Agent Challenge submission.

**Architecture:** Route story generation through the ADK server when available, use real server events to drive the UI activity log, keep fallback direct mode intact, and tighten the repo/config surface so local verification and security claims are defensible. Prefer small, high-confidence changes over speculative new features.

**Tech Stack:** React 19, Vite, TypeScript, Firebase, Google GenAI SDK, Google ADK, Express

---

### Task 1: Make story generation genuinely ADK-backed in server mode

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/adkClient.ts`
- Modify: `server/agent.ts`
- Modify: `server/server.ts`

**Step 1: Write the failing test**

Create a small parser/helper test around streamed ADK text/image events so frontend event handling is testable outside the component.

**Step 2: Run test to verify it fails**

Run a targeted local test command for the helper.

**Step 3: Write minimal implementation**

- Extract story streaming/event handling helpers from `src/App.tsx`
- Use `generateStoryViaADK(...)` when ADK is available
- Populate the activity log from real SSE events instead of inferred labels
- Make the server prompt path clearly delegate story creation/review to the ADK pipeline

**Step 4: Run test to verify it passes**

Run the targeted helper test again.

**Step 5: Commit**

Not performing git commits in this session unless explicitly requested.

### Task 2: Keep direct mode working without weakening the ADK story

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/adkClient.ts`

**Step 1: Write the failing test**

Add a helper-level test for mode selection or event parsing edge cases.

**Step 2: Run test to verify it fails**

Run the helper test command and confirm the expected failure.

**Step 3: Write minimal implementation**

- Allow story generation to succeed in ADK mode without requiring a client-side Gemini key
- Keep direct mode behavior explicit and predictable when the server is unavailable
- Ensure UI error messages tell the user which mode failed

**Step 4: Run test to verify it passes**

Run the targeted helper test again.

**Step 5: Commit**

Not performing git commits in this session unless explicitly requested.

### Task 3: Fix repo truthfulness and verification friction

**Files:**
- Modify: `firestore.rules`
- Modify: `.env.example`
- Modify: `package.json`
- Modify: `tsconfig.json`
- Modify: `README.md`
- Modify: `submission.md`
- Modify: `DEPLOYMENT_GUIDE.md`

**Step 1: Write the failing test**

Use verification commands as the failure definition for config/build issues.

**Step 2: Run test to verify it fails**

Run:
- `npm run build`
- `npm run lint`

**Step 3: Write minimal implementation**

- Align env examples with actual client/runtime expectations
- Prevent root type-check from depending on `server/node_modules`
- Tighten Firestore read rules to match the privacy claim, or explicitly reword the product/docs if privacy is intentionally not per-user
- Rewrite README/submission/deployment proof copy so every technical claim is supported by code

**Step 4: Run test to verify it passes**

Re-run the same verification commands after any needed dependency refresh.

**Step 5: Commit**

Not performing git commits in this session unless explicitly requested.

### Task 4: Final verification and submission-readiness summary

**Files:**
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`

**Step 1: Write the failing test**

Use a final verification checklist as the expected bar.

**Step 2: Run test to verify it fails**

Confirm any unresolved build/runtime/doc gaps are still open before the final pass.

**Step 3: Write minimal implementation**

- Run the strongest local verification available
- Update planning files with concrete evidence
- Produce a ranked list of remaining gaps that still affect win probability

**Step 4: Run test to verify it passes**

Re-run all verification commands used in this session.

**Step 5: Commit**

Not performing git commits in this session unless explicitly requested.
