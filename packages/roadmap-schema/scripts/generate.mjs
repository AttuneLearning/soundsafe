#!/usr/bin/env node
/**
 * Generate src/generated.ts from the Rust pack-manifest JSON Schema.
 *
 * Pipeline (per ADR-016 stability + plan §Rust↔TS boundary):
 *   1. cargo run -p sfx-pack-manifest --bin emit-schema --features emit-schema
 *      → JSON Schema for the Manifest type, on stdout.
 *   2. json-schema-to-zod converts it to a Zod source string.
 *   3. We wrap it with a header + write to src/generated.ts.
 *
 * Usage:
 *   node scripts/generate.mjs           # writes src/generated.ts
 *   node scripts/generate.mjs --check   # exits non-zero if generated.ts is stale
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jsonSchemaToZod } from 'json-schema-to-zod';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dirname, '..');
const repoRoot = resolve(pkgRoot, '..', '..');
const outFile = resolve(pkgRoot, 'src', 'generated.ts');

const args = new Set(process.argv.slice(2));
const checkOnly = args.has('--check');

function emitSchemaFromCargo() {
  // Suppress cargo's prelude on stderr by --quiet; capture stdout (the JSON).
  const stdout = execFileSync(
    'cargo',
    [
      'run',
      '--quiet',
      '-p',
      'sfx-pack-manifest',
      '--bin',
      'emit-schema',
      '--features',
      'emit-schema',
    ],
    { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  );
  return JSON.parse(stdout);
}

function buildGeneratedSource(schema) {
  const zodSrc = jsonSchemaToZod(schema, {
    name: 'Manifest',
    module: 'esm',
    type: true, // also emit a TS type
  });

  const header = [
    '// THIS FILE IS GENERATED — DO NOT EDIT BY HAND.',
    '// Source of truth: crates/sfx-pack-manifest (ADR-016).',
    '// Regenerate with: pnpm --filter @soundsafe/roadmap-schema generate',
    '',
    '/* eslint-disable */',
    '',
  ].join('\n');

  return `${header}\n${zodSrc}\n`;
}

function main() {
  let schema;
  try {
    schema = emitSchemaFromCargo();
  } catch (err) {
    console.error('Failed to emit schema from cargo. Is the Rust toolchain installed?');
    console.error(err?.message ?? err);
    process.exit(1);
  }
  const next = buildGeneratedSource(schema);

  if (checkOnly) {
    if (!existsSync(outFile)) {
      console.error(`generated.ts is missing at ${outFile}. Run \`pnpm --filter @soundsafe/roadmap-schema generate\`.`);
      process.exit(1);
    }
    const current = readFileSync(outFile, 'utf8');
    if (current !== next) {
      console.error('generated.ts is stale. Run `pnpm --filter @soundsafe/roadmap-schema generate` and commit the result.');
      process.exit(1);
    }
    console.log('generated.ts is up to date.');
    return;
  }

  writeFileSync(outFile, next, 'utf8');
  console.log(`Wrote ${outFile}`);
}

main();
