// @soundsafe/roadmap-schema — Zod schemas mirroring sfx-pack-manifest.
//
// Generation pipeline: scripts/generate.mjs runs `cargo run -p
// sfx-pack-manifest --bin emit-schema --features emit-schema`, converts the
// JSON Schema to Zod via json-schema-to-zod, and writes src/generated.ts.
// Source of truth lives in Rust (ADR-016 stability rule).
//
// CI runs `pnpm --filter @soundsafe/roadmap-schema generate:check` to fail
// on drift between the committed generated.ts and what the Rust types
// would produce now.

export {
  Manifest,
  PackFile,
  TierRequired,
  type Manifest as ManifestT,
  type PackFile as PackFileT,
  type TierRequired as TierRequiredT,
} from './generated.ts';
