# FS-ISS-010: consumer-app M1 integration (disclaimer → play → panic flow)

**Priority:** High
**Status:** QUEUE
**QA:** PENDING
**Created:** 2026-04-20
**Requested By:** Fullstack-Dev (per m1-phases.md M1.9)
**Assigned To:** Fullstack-Dev

## Description

Replace the M0 placeholder in `@soundsafe/consumer-app` with the M1 user flow. A user acknowledges the disclaimer, chooses to load the "hello pack", presses Play, hears Gain-attenuated audio after the ramp-up, presses Esc (or clicks the panic button), and hears a 500 ms fade to silence.

This phase does **not** include the Tier-3 workspace (that's M2). It's a minimal functional demo that proves the full stack from React → platform → audio-graph-ts → rust-core → audio works end-to-end with safety rails enforced.

## Acceptance Criteria

- [ ] M0 placeholder screen replaced. After the disclaimer gate, the app renders a minimal "M1 Demo" view with:
  - A "Load Hello Pack" button that calls `packClient.unlock('hello', mockJwt)` and then `engine.loadRoadmap(starterRoadmap)`.
  - A Play / Pause button wired to `engine.play() / engine.pause()`.
  - The existing `<PanicStop />` button from M0 — now wired to `engine.panicStop()` instead of the inert console.info.
  - A small playhead readout and peak-level indicator using `useAudioEngine()` hook (real-time, via `useSyncExternalStore` + fast ring).
- [ ] The starter roadmap is one step: source `dog-bark` (from hello-pack), single Gain transform at `-12 dB`, 30-second Timer advance.
  - Synthetic "silence" is fine for M1 — the plaintext is 4096 zero bytes from the fixture. Audibility at Tier 3 comes in M2 with real pack content.
- [ ] The Esc keybind registered in M0 (`@soundsafe/platform` `KeybindService`) now calls `engine.panicStop()`. Confirm via manual test.
- [ ] After `PANIC_FADE_COMPLETE` fires, the UI shows a Grounding button prominent (visual affirmation the fade finished).
- [ ] SUDS UI is explicitly **deferred** to M2 — no SUDS input on this screen.
- [ ] No Tier-3 workspace components. The transform chain editor, library browser, safety dashboard — all M2.
- [ ] Vitest unit tests:
  - Disclaimer-gate integration: workspace doesn't render until disclaimer ack.
  - Panic-stop trigger: clicking the button and pressing Esc both invoke `engine.panicStop` (mock the engine).
  - Play-button state: disabled before `loadRoadmap`, enabled after.
- [ ] Full interactive verification deferred to M1.10 (Playwright E2E).

## Notes

- This is where the full Rust/WASM + TS stack is exercised against a running browser for the first time. Expect surprises — `cross-origin-isolated` headers on dev-server might need tweaking, `wasm-pack` output paths might need aliasing, AudioWorklet module registration might need adjustment. Document everything you hit in the issue's Dev Response.
- The "demo view" is intentionally ugly — it's not the Tier-3 mockup. Think "developer console that happens to render buttons."
- The hello pack uses synthetic silence. That's fine for wiring verification. You won't hear much; the level indicator should move when ramp-up starts and fade to silent post-panic.
- `mockJwt` comes from a test helper; in M2 it's replaced by a real Stripe + JWT flow.

## Dependencies

- **M1.7 (FS-ISS-008)** — AudioEngine + useAudioEngine hook.
- **M1.8 (FS-ISS-009)** — PackClient + MSW entitlement.

## Dev Handoff to QA

- [ ] Development Complete
- [ ] Awaiting QA
- [ ] Typecheck passed (`pnpm -r typecheck`)
- [ ] Unit tests passed (`pnpm --filter @soundsafe/consumer-app test`)
- [ ] Integration tests passed (manual flow, documented in Dev Response)
- [ ] UAT tests passed (deferred to M1.10 Playwright)

## QA Verification Evidence

- QA Verdict:
- Coverage Assessment:
- Manual Review:
- Unblock Criteria (required if blocked):

## Completion

**Completed:**
**Notes:**
