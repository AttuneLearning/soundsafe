//! Soundsafe pack tooling CLI.
//!
//! Native-only (not compiled to WASM). Commands land in M1+:
//!   - `build`    — zip + manifest + encrypt + sign a staging directory.
//!   - `validate` — verify manifest signature, decrypt with provided key, schema-check.
//!   - `keygen`   — emit a fresh pack key + Ed25519 publisher key pair.

use clap::{Parser, Subcommand};

#[derive(Parser, Debug)]
#[command(name = "sfx-packtool", version, about = "Soundsafe pack tooling")]
struct Cli {
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand, Debug)]
enum Cmd {
    /// Build a pack from a staging directory.
    Build,
    /// Validate an existing pack.
    Validate,
    /// Generate a new pack key and publisher key pair.
    Keygen,
}

fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    match cli.cmd {
        Cmd::Build | Cmd::Validate | Cmd::Keygen => {
            anyhow::bail!("not implemented yet — lands in M1");
        }
    }
}
