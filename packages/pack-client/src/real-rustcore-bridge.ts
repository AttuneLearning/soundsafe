// Concrete `RustcoreBridge` backed by the wasm-pack `pkg/` module
// emitted from `packages/rust-core`. Loaded dynamically so native
// test environments (happy-dom, node without wasm-pack) can fall
// back to the fake bridge in tests.

import type { RustcoreBridge } from './rustcore-bridge.js';

type RustcoreModule = {
  default: (input?: unknown) => Promise<unknown>;
  loadPackManifest: (m: Uint8Array, s: Uint8Array) => string;
  setPackKey: (bytes: Uint8Array) => void;
  clearPackKey: () => void;
  decryptFile: (c: Uint8Array, n: Uint8Array, t: Uint8Array) => Uint8Array;
  engineInit: (sr: number, bs: number, bpk: Uint8Array) => void;
};

export interface RealRustcoreBridgeConfig {
  /**
   * Loader that returns the wasm-pack-generated module. Using a
   * loader instead of a literal `import` keeps the dependency
   * dynamic so test bundles don't need to include the wasm.
   */
  loadModule: () => Promise<RustcoreModule>;
  sampleRate: number;
  blockSize: number;
  bundledPublicKey: Uint8Array;
}

/**
 * Construct a `RustcoreBridge` that forwards to the real WASM
 * surface. On the first call, the module is initialized and the
 * engine is booted with the caller's sample rate / block size /
 * bundled public key.
 */
export function createRealRustcoreBridge(config: RealRustcoreBridgeConfig): RustcoreBridge {
  let modulePromise: Promise<RustcoreModule> | null = null;

  async function mod(): Promise<RustcoreModule> {
    if (!modulePromise) {
      modulePromise = (async () => {
        const m = await config.loadModule();
        await m.default();
        m.engineInit(config.sampleRate, config.blockSize, config.bundledPublicKey);
        return m;
      })();
    }
    return modulePromise;
  }

  return {
    async verifyManifest(manifestBytes, signatureBytes) {
      const m = await mod();
      return m.loadPackManifest(manifestBytes, signatureBytes);
    },
    async setPackKey(bytes) {
      const m = await mod();
      m.setPackKey(bytes);
    },
    async clearPackKey() {
      const m = await mod();
      m.clearPackKey();
    },
    async decryptFile(ciphertext, nonce, tag) {
      const m = await mod();
      return m.decryptFile(ciphertext, nonce, tag);
    },
  };
}
