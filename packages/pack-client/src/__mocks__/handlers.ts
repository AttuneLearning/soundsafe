// MSW handler set for the pack-client + consumer-app test flows.
//
// These mock the (future, M2) Cloudflare Worker endpoints so tests
// and Playwright E2E runs can exercise the full
// catalog → download → entitlement flow without hitting the real
// network.

import { HttpResponse, http } from 'msw';

export interface HelloPackFixtureBytes {
  pack_key_base64: string;
  manifest_bytes: Uint8Array;
  signature_bytes: Uint8Array;
  encrypted_files_json: string;
}

/**
 * Build the MSW handler set. The fixture is injected so production
 * test harnesses can plug in a real `sfx_test_fixtures::hello_pack`
 * byte bundle (dumped via a cargo example at setup time), while this
 * module stays platform-neutral.
 */
export function buildHelloPackHandlers(fixture: HelloPackFixtureBytes) {
  return [
    http.get('/latest.json', () =>
      HttpResponse.json({
        packs: { hello: '2026-04-20.1' },
        minAppVersion: '0.1.0',
      }),
    ),
    http.get('/packs/:packId/:version.zip', ({ params }): Response => {
      if (params.packId !== 'hello') {
        return new Response('pack not found', { status: 404 });
      }
      const buf = fixture.manifest_bytes.buffer.slice(
        fixture.manifest_bytes.byteOffset,
        fixture.manifest_bytes.byteOffset + fixture.manifest_bytes.byteLength,
      ) as ArrayBuffer;
      return new Response(buf, {
        status: 200,
        headers: { 'content-type': 'application/zip' },
      });
    }),
    http.post('/entitlement', async ({ request }) => {
      const auth = request.headers.get('authorization') ?? '';
      if (!auth.toLowerCase().startsWith('bearer ')) {
        return HttpResponse.text('missing bearer token', { status: 401 });
      }
      const { packId } = (await request.json()) as { packId?: string };
      if (packId !== 'hello') {
        return HttpResponse.text('entitlement denied', { status: 403 });
      }
      return HttpResponse.json({ packKeyBase64: fixture.pack_key_base64 });
    }),
  ];
}
