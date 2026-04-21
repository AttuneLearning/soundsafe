// THIS FILE IS GENERATED — DO NOT EDIT BY HAND.
// Source of truth: crates/sfx-pack-manifest (ADR-016).
// Regenerate with: pnpm --filter @soundsafe/roadmap-schema generate
//
// NOTE for M0: this file is currently a hand-written placeholder mirroring
// the structure that the generator script will produce. The first run of
// `pnpm --filter @soundsafe/roadmap-schema generate` (which requires a
// working Rust toolchain) will overwrite it with the canonical generated
// output. The placeholder exists so the workspace typechecks and the
// roadmap-schema vitest suite can run before the generator has been run.

/* eslint-disable */

import { z } from 'zod';

export const TierRequired = z.enum(['free', 'relaxation', 'interactive']);
export type TierRequired = z.infer<typeof TierRequired>;

export const PackFile = z.object({
  path: z.string(),
  nonce: z.string(),
  tag: z.string(),
  sha256: z.string(),
  duration_ms: z.number().int().nonnegative(),
  label: z.string(),
});
export type PackFile = z.infer<typeof PackFile>;

export const Manifest = z.object({
  pack_id: z.string(),
  version: z.string(),
  min_app_version: z.string(),
  tier_required: TierRequired,
  files: z.array(PackFile),
  roadmaps: z.array(z.unknown()).default([]),
  content_warnings: z.array(z.string()).default([]),
  // Reserved for therapist-plugin content (ADR-004). Round-trip preserved.
  therapist: z.unknown().optional(),
});
export type Manifest = z.infer<typeof Manifest>;
