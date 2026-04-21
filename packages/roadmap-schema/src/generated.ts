// THIS FILE IS GENERATED — DO NOT EDIT BY HAND.
// Source of truth: crates/sfx-pack-manifest (ADR-016).
// Regenerate with: pnpm --filter @soundsafe/roadmap-schema generate

/* eslint-disable */

import { z } from "zod";

export const TierRequired = z.enum(["free","relaxation","interactive"]).describe("Required tier to play a pack. Mirrors the consumer-side tier ladder.");
export type TierRequired = z.infer<typeof TierRequired>;

export const PackFile = z.object({ "path": z.string().describe("Path inside the pack (e.g. \"audio/01-chewing.opus.enc\")."), "nonce": z.string().describe("AES-GCM nonce (12 bytes), base64."), "tag": z.string().describe("AES-GCM auth tag (16 bytes), base64."), "sha256": z.string().describe("SHA-256 of the *ciphertext*, base64."), "duration_ms": z.number().int().gte(0).describe("Duration of the decoded audio in milliseconds."), "label": z.string().describe("Human-readable label (used in the library UI).") }).describe("One audio file inside a pack. All bytes are base64 in the on-wire JSON.");
export type PackFile = z.infer<typeof PackFile>;

export const PackRoadmap = z.object({ "id": z.string(), "steps": z.any().describe("Roadmap step list — typed in `sfx-roadmap-engine` once the engine lands. For M0 we keep this as a JSON value to avoid coupling.") }).describe("A pre-built roadmap shipped with the pack (Tier-2 curated content).");
export type PackRoadmap = z.infer<typeof PackRoadmap>;

export const Manifest = z.object({ "pack_id": z.string(), "version": z.string(), "min_app_version": z.string(), "tier_required": TierRequired, "files": z.array(PackFile), "roadmaps": z.array(PackRoadmap).default([]), "content_warnings": z.array(z.string()).default([]), "therapist": z.any().describe("Reserved for therapist-plugin-authored content (ADR-004). v1 ignores this field but round-trips it through serde so plugin packs survive being touched by v1 tooling.").optional() }).describe("Top-level pack manifest.");
export type Manifest = z.infer<typeof Manifest>;
