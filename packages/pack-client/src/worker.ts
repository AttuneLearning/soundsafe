// Dedicated decrypt-worker entry point (ADR-020).
//
// The main thread boots this worker with `new Worker(new URL('./worker.ts',
// import.meta.url), { type: 'module' })`, then posts an `unlock`
// message carrying the manifest bytes, signature, encrypted files, and
// pack key. The worker loads a second rust-core WASM instance and uses
// its `loadPack` composite entry — which verifies, decrypts, and
// zeroes the JS-side key buffer before returning.
//
// Out of the box the worker speaks only two message kinds:
//   - `unlock` → `{ kind: 'unlocked', decrypted }` | `{ kind:
//     'unlock-failed', error }`
//   - `ping`   → `{ kind: 'pong' }` (liveness check)

/// <reference lib="webworker" />

import type { DecryptedFile, UnlockRequest, WorkerResponse } from './worker-protocol.js';

type RustcoreModule = {
  default: (wasm?: string | URL) => Promise<unknown>;
  engineInit: (sr: number, block: number, bundledPk: Uint8Array) => void;
  loadPack: (
    manifestBytes: Uint8Array,
    signatureBytes: Uint8Array,
    packKeyBytes: Uint8Array,
    encryptedFilesJson: string,
  ) => string;
};

type WorkerSelf = DedicatedWorkerGlobalScope & {
  __soundsafeRustcoreLoader?: () => Promise<RustcoreModule>;
};

declare const self: WorkerSelf;

let rustcore: RustcoreModule | null = null;

async function loadRustcore(): Promise<RustcoreModule> {
  if (rustcore) return rustcore;
  // The host injects `__soundsafeRustcoreLoader` at worker-boot time
  // so this module doesn't hard-code the wasm-pack bundle path —
  // lets tests swap in a stub, and lets the consumer app point at
  // its own `pkg/` directory.
  const loader = self.__soundsafeRustcoreLoader;
  if (!loader) {
    throw new Error('decrypt worker: __soundsafeRustcoreLoader missing; host must install before posting unlock');
  }
  rustcore = await loader();
  await rustcore.default();
  return rustcore;
}

async function handleUnlock(req: UnlockRequest): Promise<WorkerResponse> {
  try {
    const mod = await loadRustcore();
    mod.engineInit(req.sampleRate, req.blockSize, req.bundledPublicKey);
    const json = mod.loadPack(
      req.manifestBytes,
      req.signatureBytes,
      req.packKeyBytes,
      req.encryptedFilesJson,
    );
    const decrypted = JSON.parse(json) as DecryptedFile[];
    return { kind: 'unlocked', packId: req.packId, decrypted };
  } catch (err) {
    return {
      kind: 'unlock-failed',
      packId: req.packId,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    // Defense in depth: even if rust-core failed to fill(0), clear
    // the worker-side key buffer.
    req.packKeyBytes.fill(0);
  }
}

self.onmessage = (ev: MessageEvent) => {
  const data = ev.data as { kind: string } & Record<string, unknown>;
  if (data.kind === 'ping') {
    (self.postMessage as (m: WorkerResponse) => void)({ kind: 'pong' });
    return;
  }
  if (data.kind === 'unlock') {
    void handleUnlock(data as unknown as UnlockRequest).then((resp) => {
      (self.postMessage as (m: WorkerResponse) => void)(resp);
    });
  }
};
