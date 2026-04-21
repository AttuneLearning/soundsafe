#!/usr/bin/env node
/**
 * Generate src/generated.ts from the Rust pack-manifest JSON Schema.
 *
 * Pipeline (per ADR-016 stability + plan §Rust↔TS boundary):
 *   1. cargo run -p sfx-pack-manifest --bin emit-schema --features emit-schema
 *      → JSON Schema for the Manifest type, on stdout.
 *   2. For each entry under `definitions`, emit `export const X = ...`
 *      using json-schema-to-zod. The top-level Manifest is emitted last,
 *      with a parserOverride that rewrites `$ref` nodes to identifier
 *      references (so `TierRequired` / `PackFile` stay as named schemas
 *      rather than being inlined into `z.any()`).
 *   3. Prepend a header and write to src/generated.ts.
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

/**
 * parserOverride that turns `$ref: "#/definitions/X"` into the bare
 * identifier `X`. json-schema-to-zod inserts the returned string verbatim
 * into the generated source, so returning `"TierRequired"` produces
 * `TierRequired` as a variable reference in the Zod expression.
 */
function refOverride(schema) {
  if (schema && typeof schema === 'object' && typeof schema.$ref === 'string') {
    const prefix = '#/definitions/';
    if (schema.$ref.startsWith(prefix)) {
      return schema.$ref.slice(prefix.length);
    }
  }
  return undefined;
}

function emitZod(schema) {
  return jsonSchemaToZod(schema, {
    module: 'none',
    parserOverride: refOverride,
  });
}

function buildGeneratedSource(schema) {
  const defs = schema.definitions ?? {};
  const defNames = Object.keys(defs);

  const blocks = [];

  for (const name of defNames) {
    const expr = emitZod(defs[name]);
    blocks.push(`export const ${name} = ${expr};`);
    blocks.push(`export type ${name} = z.infer<typeof ${name}>;`);
    blocks.push('');
  }

  const rootSchemaNoDefs = { ...schema };
  delete rootSchemaNoDefs.definitions;
  const rootExpr = emitZod(rootSchemaNoDefs);
  blocks.push(`export const Manifest = ${rootExpr};`);
  blocks.push(`export type Manifest = z.infer<typeof Manifest>;`);

  const header = [
    '// THIS FILE IS GENERATED — DO NOT EDIT BY HAND.',
    '// Source of truth: crates/sfx-pack-manifest (ADR-016).',
    '// Regenerate with: pnpm --filter @soundsafe/roadmap-schema generate',
    '',
    '/* eslint-disable */',
    '',
    'import { z } from "zod";',
    '',
  ].join('\n');

  return `${header}\n${blocks.join('\n')}\n`;
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
