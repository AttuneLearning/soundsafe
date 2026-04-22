// ESLint flat config for @soundsafe/pack-client.
//
// Enforces ADR-025: OPFS-sourced decrypted audio must never surface as a
// blob URL. The rule is conservative — it flags any call to
// `URL.createObjectURL` whose argument is a variable whose name carries
// the telltale OPFS suffix (`handle`, `FileHandle`, `fileHandle`, etc.).
// Tightening to full type-flow analysis is a follow-up once we move
// to typescript-eslint's typed-linting stack.

import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          // ADR-025: decrypted OPFS handles must never become blob URLs.
          selector: [
            "CallExpression[callee.object.name='URL'][callee.property.name='createObjectURL']",
            "CallExpression[callee.name='createObjectURL']",
          ].join(', '),
          message:
            'ADR-025: URL.createObjectURL() on an OPFS FileSystemFileHandle or the bytes it yields defeats the no-URL-addressing contract. Read plaintext directly into the AudioWorklet instead.',
        },
      ],
    },
  },
];
