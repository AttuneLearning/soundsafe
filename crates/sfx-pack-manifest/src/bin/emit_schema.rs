//! Emit JSON Schema for the pack manifest types to stdout.
//!
//! Consumed by `packages/roadmap-schema/scripts/generate.mjs` to derive the
//! TS Zod types. This is the single source of truth for the manifest shape
//! (per ADR-016 stability rule).
//!
//! Invoke with:
//!   cargo run -p sfx-pack-manifest --bin emit-schema --features emit-schema
//!
//! Stdout is the JSON Schema document. Stderr is reserved for errors so the
//! generator script can pipe stdout directly without parsing prelude.

use schemars::schema_for;
use sfx_pack_manifest::Manifest;

fn main() {
    let schema = schema_for!(Manifest);
    let json = serde_json::to_string_pretty(&schema)
        .expect("manifest schema must serialize");
    println!("{json}");
}
