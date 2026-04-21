// The decrypt worker loads a second WASM instance (per ADR-020).
// This module is the narrow contract the worker uses to talk to
// rust-core. Production wires it to the wasm-pack bundle; tests
// wire it to an in-memory mock.

export interface RustcoreBridge {
  /**
   * Verify the pack manifest against the bundled publisher public
   * key and return the verified `pack_id`. Throws on bad signature
   * or manifest JSON parse failure.
   */
  verifyManifest(manifestBytes: Uint8Array, signatureBytes: Uint8Array): Promise<string>;
  /** Install the pack key into the WASM vault. */
  setPackKey(packKeyBytes: Uint8Array): Promise<void>;
  /** Decrypt a single pack file; returns the plaintext bytes. */
  decryptFile(
    ciphertext: Uint8Array,
    nonce: Uint8Array,
    tag: Uint8Array,
  ): Promise<Uint8Array>;
  /** Forget the pack key. The vault's Zeroizing drop zeros the bytes. */
  clearPackKey(): Promise<void>;
}
