import { mkdirSync, readdirSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { schemaRegistry, TENANT_FORBIDDEN_KEYS } from '@crm/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

// AD-010: o guardrail mais importante do projeto dá falso verde se um schema
// novo não for registrado. Este arquivo varre o filesystem em vez de
// confiar só no registry declarado (design.md, Risk "registry apodrece em
// silêncio").
const REPO_ROOT = join(import.meta.dirname, '..', '..');
const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist']);

const findSchemaFiles = (dir: string): string[] => {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (EXCLUDED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...findSchemaFiles(full));
    } else if (entry.endsWith('.schema.ts')) {
      results.push(full);
    }
  }
  return results;
};

// Retorna "arquivo:exportName" para todo export ZodType, sob `roots`, que
// não está (por referência de objeto, não por nome) no schemaRegistry.
const findUnregisteredSchemaExports = async (roots: string[]): Promise<string[]> => {
  const registered = new Set(schemaRegistry.map((entry) => entry.schema));
  const unregistered: string[] = [];

  for (const root of roots) {
    let files: string[];
    try {
      files = findSchemaFiles(root);
    } catch {
      continue; // root pode não existir (ex.: fixture já removido)
    }

    for (const file of files) {
      const mod: Record<string, unknown> = await import(pathToFileURL(file).href);
      for (const [exportName, value] of Object.entries(mod)) {
        if (value instanceof z.ZodType && !registered.has(value)) {
          unregistered.push(`${relative(REPO_ROOT, file)}:${exportName}`);
        }
      }
    }
  }

  return unregistered;
};

describe('schema registry completeness (AD-010)', () => {
  describe('self-check', () => {
    const fixtureDir = join(REPO_ROOT, 'tests', 'structural', '__fixture__');
    const fixtureFile = join(fixtureDir, 'unregistered.schema.ts');

    afterEach(() => {
      try {
        unlinkSync(fixtureFile);
        rmdirSync(fixtureDir);
      } catch {
        // já removido pelo próprio teste — nada a fazer.
      }
    });

    it('the sweep itself flags a Zod export that exists on disk but was never added to schemaRegistry', async () => {
      mkdirSync(fixtureDir, { recursive: true });
      writeFileSync(
        fixtureFile,
        "import { z } from 'zod';\nexport const unregisteredFixtureSchema = z.object({ foo: z.string() });\n",
      );

      const unregistered = await findUnregisteredSchemaExports([fixtureDir]);

      expect(unregistered).toEqual(['tests/structural/__fixture__/unregistered.schema.ts:unregisteredFixtureSchema']);
    });
  });

  it('has every ZodType export from every *.schema.ts under packages/ and apps/ registered in schemaRegistry', async () => {
    const unregistered = await findUnregisteredSchemaExports([join(REPO_ROOT, 'packages'), join(REPO_ROOT, 'apps')]);

    expect(unregistered).toEqual([]);
  });

  it('rejects every TENANT_FORBIDDEN_KEYS field name inside every registered object schema', () => {
    expect(schemaRegistry.length).toBeGreaterThan(0);

    for (const { name, schema } of schemaRegistry) {
      if (!(schema instanceof z.ZodObject)) continue;
      const keys = Object.keys(schema.shape).map((key) => key.toLowerCase());
      for (const forbidden of TENANT_FORBIDDEN_KEYS) {
        expect(keys, `${name} não deve aceitar a chave "${forbidden}"`).not.toContain(forbidden);
      }
    }
  });
});
