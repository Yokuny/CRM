import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/**/*.unit.test.ts', 'apps/*/src/**/*.unit.test.ts', 'apps/*/src/**/*.unit.test.tsx'],
          passWithNoTests: true,
        },
      },
      {
        test: {
          name: 'integration',
          include: ['packages/db/src/**/*.int.test.ts', 'apps/crm-api/src/**/*.int.test.ts'],
          passWithNoTests: true,
          globalSetup: ['packages/db/tests/setup/globalSetup.ts'],
        },
      },
      {
        test: {
          name: 'e2e',
          include: ['apps/*/src/**/*.e2e.test.ts'],
          passWithNoTests: true,
        },
      },
      {
        test: {
          name: 'structural',
          include: ['tests/structural/*.structural.test.ts'],
          passWithNoTests: true,
        },
      },
    ],
  },
});
