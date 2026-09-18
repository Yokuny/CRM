import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { t, translationKeys, WEEKDAY_KEYS } from './translate.helper.js';

// Teste-guarda das regras de apps/web/CLAUDE.md ("Tradução (t()) e datas"):
// varre todo apps/web/src (fora deste próprio arquivo) e trava (1) formato
// de chave, (2) `t('literal')`/`titleKey: '...'` apontando pra chave
// inexistente — `t()` devolve a própria chave quando ela falta (`?? key`),
// então esse erro NUNCA aparece como exceção em runtime — e (3) chave
// dinâmica montada por template (`t(\`prefixo.${x}\`)`), proibida pela regra 8.

const SRC_DIR = join(import.meta.dirname, '../../');
const KEY_FORMAT = /^[a-z0-9]+(_[a-z0-9]+)*$/;
const EXCLUDED_NAMES = new Set(['translate.helper.ts', 'translate.helper.unit.test.ts', 'routeTree.gen.ts']);

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(full));
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    if (EXCLUDED_NAMES.has(entry)) continue;
    files.push(full);
  }
  return files;
}

const SOURCE_FILES = collectSourceFiles(SRC_DIR);

describe('translate.helper — regras de chave (apps/web/CLAUDE.md)', () => {
  it('toda chave do dicionário é snake_case plana, sem ponto/namespace', () => {
    const bad = [...translationKeys].filter((key) => !KEY_FORMAT.test(key));
    expect(bad).toEqual([]);
  });

  it('todo item de WEEKDAY_KEYS existe no dicionário', () => {
    const missing = WEEKDAY_KEYS.filter((key) => !translationKeys.has(key));
    expect(missing).toEqual([]);
  });

  it('nenhum arquivo monta chave dinâmica com template string (regra 8 do CLAUDE.md)', () => {
    const offenders: string[] = [];
    for (const file of SOURCE_FILES) {
      const text = readFileSync(file, 'utf-8');
      if (/\bt\(`/.test(text)) offenders.push(relative(SRC_DIR, file));
    }
    expect(offenders).toEqual([]);
  });

  it("todo `t('literal')` (direto ou em ternário) e `titleKey: '...'` aponta pra uma chave existente", () => {
    // Chamada direta: t('key') ou t("key").
    const directCallRe = /\bt\(\s*(['"])([\w. ]+?)\1\s*\)/g;
    // Ternário: t(cond ? 'a' : 'b') — os dois ramos são chave (padrão usado
    // pra status booleano: active/inactive, human/bot, open/closed...).
    const ternaryCallRe = /\bt\([^()'"]*\?\s*(['"])([\w. ]+?)\1\s*:\s*(['"])([\w. ]+?)\3\s*\)/g;
    const titleKeyRe = /titleKey:\s*(['"])([\w.]+)\1/g;

    const missing: string[] = [];
    for (const file of SOURCE_FILES) {
      const text = readFileSync(file, 'utf-8');
      const rel = relative(SRC_DIR, file);
      for (const m of text.matchAll(directCallRe)) {
        if (!translationKeys.has(m[2])) missing.push(`${rel}: t('${m[2]}')`);
      }
      for (const m of text.matchAll(ternaryCallRe)) {
        if (!translationKeys.has(m[2])) missing.push(`${rel}: t(?: '${m[2]}')`);
        if (!translationKeys.has(m[4])) missing.push(`${rel}: t(?::'${m[4]}')`);
      }
      for (const m of text.matchAll(titleKeyRe)) {
        if (!translationKeys.has(m[2])) missing.push(`${rel}: titleKey: '${m[2]}'`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('t() devolve a própria chave quando ela não existe (comportamento documentado do fallback)', () => {
    expect(t('esta_chave_nao_existe')).toBe('esta_chave_nao_existe');
  });
});
