import { mkdirSync, readdirSync, readFileSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// AD-010: nenhum model Mongoose fora de packages/db é invariante sem dono
// automático. Este teste varre apps/** por `import ... from 'mongoose'` —
// packages/db é a única exceção permitida (não faz parte da varredura).
const REPO_ROOT = join(import.meta.dirname, '..', '..');
const APPS_ROOT = join(REPO_ROOT, 'apps');
const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist']);
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const MONGOOSE_IMPORT_PATTERN = /from\s+['"]mongoose['"]|require\(\s*['"]mongoose['"]\s*\)/;

const findSourceFiles = (dir: string): string[] => {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (EXCLUDED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...findSourceFiles(full));
    } else if (SOURCE_EXTENSIONS.has(extname(entry))) {
      results.push(full);
    }
  }
  return results;
};

const findMongooseImportOffenders = (root: string): string[] => {
  const offenders: string[] = [];
  for (const file of findSourceFiles(root)) {
    const content = readFileSync(file, 'utf8');
    if (MONGOOSE_IMPORT_PATTERN.test(content)) {
      offenders.push(relative(REPO_ROOT, file));
    }
  }
  return offenders;
};

describe('mongoose import boundary (AD-010)', () => {
  it('self-check: the pattern matches a real mongoose import (packages/db) and catches a synthetic offender under apps/**', () => {
    const dbModelContent = readFileSync(join(REPO_ROOT, 'packages', 'db', 'src', 'models', 'tenant.model.ts'), 'utf8');
    expect(MONGOOSE_IMPORT_PATTERN.test(dbModelContent)).toBe(true);

    const fixtureDir = join(APPS_ROOT, '__fixture__');
    const fixtureFile = join(fixtureDir, 'offender.ts');
    mkdirSync(fixtureDir, { recursive: true });
    writeFileSync(fixtureFile, "import mongoose from 'mongoose';\nexport const x = mongoose;\n");

    try {
      const offenders = findMongooseImportOffenders(APPS_ROOT);
      expect(offenders).toContain(relative(REPO_ROOT, fixtureFile));
    } finally {
      unlinkSync(fixtureFile);
      rmdirSync(fixtureDir);
    }
  });

  it('finds no `mongoose` import anywhere under apps/** — only packages/db may import it', () => {
    const offenders = findMongooseImportOffenders(APPS_ROOT);

    expect(offenders).toEqual([]);
  });
});
