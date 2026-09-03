import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'src-tauri', 'node_modules'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Vários efeitos aqui têm dep arrays afinadas de propósito (chaves
      // serializadas com join, refs). O aviso ainda aparece para revisão,
      // mas não quebra o build.
      'react-hooks/exhaustive-deps': 'warn',
      // Regra do React Compiler que condena setState síncrono dentro de efeito.
      // Aqui ela pega o padrão comum de busca de dados (limpar o estado no
      // early-return + ligar o flag de loading antes do fetch). Cumprir à risca
      // exigiria trocar a camada de dados por Suspense ou uma lib de fetching —
      // mudança arquitetural fora do escopo. Fica como aviso, visível.
      'react-hooks/set-state-in-effect': 'warn',
      // TanStack Virtual devolve funções que o compilador não consegue memoizar.
      // Nada a fazer do nosso lado.
      'react-hooks/incompatible-library': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // O padrão `catch {}` para ignorar JSON corrompido é intencional.
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
);
