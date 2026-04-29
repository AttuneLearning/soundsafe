// Playwright init script that swaps out Web Audio + SAB + fetch with a
// deterministic shim. Loaded via `page.addInitScript` so it runs
// before the app's JS.
//
// The shim DOES NOT install `AudioContext` or `AudioWorkletNode`. By
// leaving them undefined we force `isWebAudioAvailable()` to return
// false and the consumer app falls back to its `AutoAckHost` +
// fake-rustcore branch, which makes the engine state machine
// deterministic without needing a real audio device or wasm-pack
// bundle in the headless browser.
//
// Fetch is stubbed for the two CDN endpoints `pack-client` calls
// (`/packs/<id>/latest.zip` and `/entitlement`) so the public
// `unlock(packId, jwt)` path resolves end-to-end against canned
// hello-pack bytes. The fake rustcore bridge decrypts the stub
// ciphertext to itself, which is sufficient for FS-ISS-011's
// state-machine assertions; bit-accurate audio belongs to M2.
//
// This file ships PURE JAVASCRIPT inside the template literal —
// `addInitScript` evaluates it in the page context as JS, so any
// TS-only syntax (`as any`, type annotations) would fail to parse.

export const SHIM_SCRIPT = `
(function () {
  if (globalThis.__soundsafeShimInstalled) return;
  globalThis.__soundsafeShimInstalled = true;

  // SharedArrayBuffer fallback so InMemoryHost / fast-ring SAB
  // allocation succeeds in environments without COOP/COEP.
  if (typeof globalThis.SharedArrayBuffer === 'undefined') {
    globalThis.SharedArrayBuffer = ArrayBuffer;
  }

  // Force AudioContext / AudioWorkletNode off so the consumer app's
  // \`isWebAudioAvailable()\` returns false and the AutoAckHost path
  // runs. (Chromium ships real implementations by default.)
  try { delete globalThis.AudioContext; } catch (_) {}
  try { delete globalThis.webkitAudioContext; } catch (_) {}
  try { delete globalThis.AudioWorkletNode; } catch (_) {}
  Object.defineProperty(globalThis, 'AudioContext', { value: undefined, configurable: true });
  Object.defineProperty(globalThis, 'AudioWorkletNode', { value: undefined, configurable: true });

  // --- /packs/:id/latest.zip + /entitlement stubs ----------------
  //
  // Stub bytes are fine — the fake rustcore in the consumer-app's
  // !isWebAudioAvailable branch returns 'hello' from verifyManifest
  // unconditionally and copies ciphertext through decryptFile. Real
  // crypto round-tripping is exercised by rust-core's wasm-bindgen
  // and native test suites.
  var stubEnvelope = {
    pack_id: 'hello',
    manifest_bytes_b64: btoa('{"pack_id":"hello"}'),
    signature_bytes_b64: btoa('\\u0000'.repeat(64)),
    files: [
      {
        path: 'audio/01-bark.opus.enc',
        ciphertext_b64: btoa('\\u0000'.repeat(256)),
        nonce_b64: btoa('\\u0000'.repeat(12)),
        tag_b64: btoa('\\u0000'.repeat(16)),
      },
    ],
  };
  // 32-byte stub key, base64.
  var stubKeyB64 = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=';

  var realFetch = globalThis.fetch && globalThis.fetch.bind(globalThis);
  globalThis.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || String(input);
    if (url.indexOf('/packs/') !== -1 && url.indexOf('/latest.zip') !== -1) {
      return Promise.resolve(new Response(JSON.stringify(stubEnvelope), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
    }
    if (url.indexOf('/entitlement') !== -1) {
      return Promise.resolve(new Response(JSON.stringify({ packKeyBase64: stubKeyB64 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
    }
    if (url.indexOf('/latest.json') !== -1) {
      return Promise.resolve(new Response(
        JSON.stringify({ packs: { hello: '2026-04-29.1' }, min_app_version: '0.1.0' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));
    }
    return realFetch
      ? realFetch(input, init)
      : Promise.resolve(new Response('', { status: 404 }));
  };
})();
`;
