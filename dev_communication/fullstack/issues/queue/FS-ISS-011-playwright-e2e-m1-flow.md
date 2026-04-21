# FS-ISS-011: Playwright E2E for the M1 flow

**Priority:** High
**Status:** QUEUE
**QA:** PENDING
**Created:** 2026-04-20
**Requested By:** Fullstack-Dev (per m1-phases.md M1.10)
**Assigned To:** Fullstack-Dev

## Description

End-to-end Playwright test exercising the full M1 flow from disclaimer to panic-fade. Audio is shimmed at the Web Audio boundary so CI can run headless without a sound card — test assertions read engine state from the `useAudioEngine` hook's public interface, not from real audio output.

This closes M1. When this test passes in CI, the M1 milestone is dev-complete and ready for the per-M exit review (all six specialized agents + adr-drift-detector + Adam's manual safety walkthrough).

## Acceptance Criteria

- [ ] `packages/consumer-app/e2e/m1-flow.spec.ts` covers:
  1. Open app → see disclaimer modal.
  2. Click "I understand" → disclaimer dismissed; workspace placeholder renders.
  3. Click "Load Hello Pack" → `engine.state` transitions to `idle` (pack loaded).
  4. Click "Play" → `engine.state` becomes `ramping` (3 s default ramp-up), then `playing`.
  5. Assert the ramp envelope is active (`levelDb` increases monotonically from `-Inf` during ramp).
  6. Press `Escape` → `engine.state` becomes `fading`.
  7. Wait ~600 ms → `engine.state` becomes `panicked`; `levelDb` is `-Inf`.
  8. Assert the Grounding button is now prominent (visible, high-contrast).
- [ ] Web Audio is shimmed. In the Playwright fixture, replace `AudioContext` with a mock that drives the worklet's `process()` on a timer rather than from a real audio card. This lets assertions about `engine.state` and `levelDb` fire deterministically.
- [ ] A second test exercising `Pause`: mid-play, click Pause → state becomes `idle`. Click Play → `ramping` again. No stuck states.
- [ ] A third test for disclaimer persistence: reload the page after acknowledging once → workspace renders directly, no disclaimer. (Tests the M0 localStorage `disclaimer-ack` persistence.)
- [ ] CI wiring:
  - New `e2e` job in `.github/workflows/ci.yml`.
  - Uses `pnpm exec playwright install --with-deps chromium` for headless browser install.
  - Runs `pnpm --filter @soundsafe/consumer-app exec playwright test`.
  - Job depends on the TypeScript job (so we don't run e2e if typecheck fails).
  - Passes on a fresh GitHub Actions runner with no retries.
- [ ] Accessibility smoke: `@axe-core/playwright` reports zero critical or serious violations on the M1 placeholder screen. (Full a11y audit is deferred to M2 when the Tier-3 workspace lands.)

## Notes

- The Web Audio shim is the trickiest part. Real `AudioContext` is finicky in headless Chromium. Approach: a Playwright page init script that replaces `window.AudioContext` with a minimal class that satisfies the interface `audio-graph-ts` uses and drives `process()` from `setInterval(16ms)` (so playhead advances at ~60 Hz of simulated wall time).
- Alternative approach: run Playwright with real Chromium audio (`--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`). Simpler but less deterministic. Try the shim first; if it's too fragile, fall back to flags.
- Do **not** assert on audio output via a mock audio sink that records samples. Overkill for M1; record tests belong to M2's signature transforms (golden-file snapshots).
- Don't gate CI on bundle size / worklet boot latency in this phase — those are M2 concerns once real content is flowing.

## Dependencies

- **M1.9 (FS-ISS-010)** — consumer-app integration must ship the flow that this test exercises.
- All prior M1 phases transitively via M1.9.

## M1 exit gate

When this issue is closed by Fullstack-QA, trigger the M1 exit review:

- Run all six specialized subagents (`.claude/agents/{dsp,safety,crypto,platform-boundary,accessibility,adr-drift}-reviewer`) against the M1 surface.
- Adam (LPC) does a manual safety walkthrough: disclaimer language feels right, panic UX feels reachable, ramp envelope feels appropriate, fade-to-silence is sudden-but-gentle.
- Draft `m2-phases.md` in parallel.

## Dev Handoff to QA

- [ ] Development Complete
- [ ] Awaiting QA
- [ ] Typecheck passed (`pnpm -r typecheck`)
- [ ] Unit tests passed (`pnpm test`)
- [ ] Integration tests passed (Playwright: 3 spec files green)
- [ ] UAT tests passed (manual walkthrough captured in Dev Response with screenshots or a loom)

## QA Verification Evidence

- QA Verdict:
- Coverage Assessment:
- Manual Review:
- Unblock Criteria (required if blocked):

## Completion

**Completed:**
**Notes:**
