// @soundsafe/roadmap-schema — Zod schemas mirroring sfx-pack-manifest.
//
// Generation pipeline (M1): cargo run -p sfx-pack-manifest --features
// emit-schema → JSON Schema → json-schema-to-zod → src/generated.ts.
// Source of truth lives in Rust (ADR-016 stability rule).
//
// M0 ships hand-written stubs that mirror the most-used types so the rest
// of the workspace can typecheck against them. They will be replaced by the
// generated schemas in M1.

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
