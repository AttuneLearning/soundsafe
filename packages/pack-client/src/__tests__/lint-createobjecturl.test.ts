import { describe, it, expect } from 'vitest';
import { Linter } from 'eslint';

// ADR-025 rule body. Mirrors `eslint.config.js`; any divergence here
// is a bug the tests should catch.
const ADR_025_MESSAGE =
  'ADR-025: URL.createObjectURL() on an OPFS FileSystemFileHandle or the bytes it yields defeats the no-URL-addressing contract. Read plaintext directly into the AudioWorklet instead.';

function lint(source: string): Array<{ message: string; ruleId: string | null }> {
  const linter = new Linter();
  return linter.verify(source, {
    languageOptions: {
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: [
            "CallExpression[callee.object.name='URL'][callee.property.name='createObjectURL']",
            "CallExpression[callee.name='createObjectURL']",
          ].join(', '),
          message: ADR_025_MESSAGE,
        },
      ],
    },
  });
}

describe('ADR-025 lint rule', () => {
  it('fires on URL.createObjectURL(...)', () => {
    const src = 'const h = {}; URL.createObjectURL(h);';
    const out = lint(src);
    expect(out.some((m) => m.message.includes('ADR-025'))).toBe(true);
  });

  it('fires on a bare createObjectURL(...) call too', () => {
    const src = 'function createObjectURL(_h) {} createObjectURL({});';
    const out = lint(src);
    expect(out.some((m) => m.message.includes('ADR-025'))).toBe(true);
  });

  it('passes clean code that does not call createObjectURL', () => {
    const src = 'const bytes = new Uint8Array(8); const n = bytes.byteLength;';
    const out = lint(src);
    expect(out.filter((m) => m.message.includes('ADR-025'))).toEqual([]);
  });
});
