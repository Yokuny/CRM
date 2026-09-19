import type { FieldDef, MigrationAction, MigrationPlan } from '@crm/contracts';
import type { DestructiveChange } from '@crm/field-engine';
import { z } from 'zod';
import { t } from '@/lib/helpers/translate.helper.js';

// Todos os tipos do FieldDef (@crm/contracts) — o `type` do formulário
// aceita qualquer um, porque um template pode trazer tipos criados por API.
const ALL_FIELD_TYPES = [
  'text',
  'number',
  'currency',
  'percent',
  'boolean',
  'date',
  'datetime',
  'select',
  'status',
  'document',
  'reference',
  'array',
  'group',
] as const satisfies ReadonlyArray<FieldDef['type']>;

// Tipos que a tela sabe criar/editar. Os demais (document/reference/array/
// group) só nascem por API — aparecem na lista, podem ser renomeados ou
// removidos, mas a config deles é preservada como veio.
export const EDITABLE_FIELD_TYPES = [
  'text',
  'number',
  'currency',
  'percent',
  'boolean',
  'date',
  'datetime',
  'select',
  'status',
] as const;
export type EditableFieldType = (typeof EDITABLE_FIELD_TYPES)[number];
export const isEditableType = (type: FieldDef['type']): type is EditableFieldType =>
  (EDITABLE_FIELD_TYPES as readonly string[]).includes(type);
export const hasOptions = (type: FieldDef['type']): type is 'select' | 'status' =>
  type === 'select' || type === 'status';

// O `reason` do diffFields é camelCase — fora do padrão de chave (regra 2 do
// dicionário), então a chave de cada um vem deste mapa.
export const CHANGE_REASON_KEYS: Record<DestructiveChange['reason'], string> = {
  fieldRemoved: 'field_removed',
  typeChanged: 'type_changed',
  optionRemoved: 'options_removed',
};

export const DEFAULT_STATUS_COLOR = '#3B82F6';
const DEFAULT_CURRENCY = { code: 'BRL', precision: 2 };
const DEFAULT_PERCENT_PRECISION = 2;

// ---------------------------------------------------------------------------
// Modelo do formulário
// ---------------------------------------------------------------------------

// `key`/`fieldId` vazios = item novo: o identificador é gerado a partir do
// rótulo só no envio (toFieldDefs). Item existente nunca troca de id — trocar
// seria remover + criar, uma mudança destrutiva.
export type OptionForm = { key: string; label: string; color: string };
export type FieldForm = {
  fieldId: string;
  label: string;
  type: FieldDef['type'];
  required: boolean;
  multiline: boolean;
  integer: boolean;
  multiple: boolean;
  options: OptionForm[];
};
export type TemplateForm = { name: string; stages: Array<{ value: string }>; fields: FieldForm[] };

export const emptyOption = (type: FieldDef['type']): OptionForm => ({
  key: '',
  label: '',
  color: type === 'status' ? DEFAULT_STATUS_COLOR : '',
});

export const emptyField = (): FieldForm => ({
  fieldId: '',
  label: '',
  type: 'text',
  required: false,
  multiline: false,
  integer: false,
  multiple: false,
  options: [],
});

export const toFieldForm = (def: FieldDef): FieldForm => ({
  fieldId: def.fieldId,
  label: def.label,
  type: def.type,
  required: def.required === true,
  multiline: def.type === 'text' && def.multiline === true,
  integer: def.type === 'number' && def.integer === true,
  multiple: def.type === 'select' && def.multiple === true,
  options:
    def.type === 'select'
      ? def.options.map((option) => ({ key: option.key, label: option.label, color: '' }))
      : def.type === 'status'
        ? [...def.options]
            .sort((a, b) => a.order - b.order)
            .map((option) => ({ key: option.key, label: option.label, color: option.color }))
        : [],
});

const requiredText = () => z.string().trim().min(1, t('fill_this_field'));

const optionFormSchema = z.object({ key: z.string(), label: requiredText(), color: z.string() });

const fieldFormSchema = z
  .object({
    fieldId: z.string(),
    label: requiredText().max(120),
    type: z.enum(ALL_FIELD_TYPES),
    required: z.boolean(),
    multiline: z.boolean(),
    integer: z.boolean(),
    multiple: z.boolean(),
    options: z.array(optionFormSchema),
  })
  .superRefine((field, ctx) => {
    if (hasOptions(field.type) && field.options.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: t('at_least_one_option') });
    }
  });

// Espelha as regras de createFieldTemplateSchema/bumpFieldTemplateSchema
// (@crm/contracts) no formato do formulário, com mensagens traduzidas; o
// back-end valida de novo o payload final.
export const templateFormSchema = (withStages: boolean) =>
  z.object({
    name: z.string().trim().min(3, t('name_length')).max(120, t('name_length')),
    stages: withStages
      ? z
          .array(z.object({ value: requiredText() }))
          .min(1, t('at_least_one_stage'))
          .refine(
            (stages) => new Set(stages.map((stage) => stage.value.trim())).size === stages.length,
            t('duplicate_stages'),
          )
      : z.array(z.object({ value: z.string() })),
    fields: z.array(fieldFormSchema).min(1, t('at_least_one_field')),
  });

// ---------------------------------------------------------------------------
// Formulário -> FieldDef[]
// ---------------------------------------------------------------------------

const asciiWords = (label: string): string[] =>
  label
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

// "Última visita" -> "ultimaVisita": casa com FIELD_ID_PATTERN
// (^[a-zA-Z][a-zA-Z0-9_]{0,59}$).
export const toFieldId = (label: string): string => {
  const camel = asciiWords(label)
    .map((word, index) =>
      index === 0 ? word.toLowerCase() : `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`,
    )
    .join('');
  return (/^[a-zA-Z]/.test(camel) ? camel : `field${camel}`).slice(0, 60);
};

// "Em andamento" -> "em_andamento": chave de opção e de tipo de processo.
export const toSnakeKey = (label: string): string =>
  asciiWords(label)
    .map((word) => word.toLowerCase())
    .join('_')
    .slice(0, 60) || 'item';

const claimUnique = (base: string, taken: Set<string>): string => {
  let candidate = base;
  for (let suffix = 2; taken.has(candidate); suffix++) candidate = `${base.slice(0, 57)}${suffix}`;
  taken.add(candidate);
  return candidate;
};

const toOptionKeys = (options: OptionForm[]): string[] => {
  const taken = new Set(options.map((option) => option.key).filter(Boolean));
  return options.map((option) => option.key || claimUnique(toSnakeKey(option.label), taken));
};

// Monta os FieldDef finais. Campo existente cujo tipo não mudou parte do
// FieldDef original, então config que a tela não mostra (order, pattern,
// min/max, timezone, precisão...) sobrevive à edição.
export const toFieldDefs = (forms: FieldForm[], originals: FieldDef[]): FieldDef[] => {
  const originalById = new Map(originals.map((def) => [def.fieldId, def]));
  const takenIds = new Set(forms.map((form) => form.fieldId).filter(Boolean));

  return forms.map((form): FieldDef => {
    const fieldId = form.fieldId || claimUnique(toFieldId(form.label), takenIds);
    const original = originalById.get(form.fieldId);
    const kept = original?.type === form.type ? original : undefined;
    const base = { fieldId, label: form.label.trim(), required: form.required };

    switch (form.type) {
      case 'text':
        return { ...(kept?.type === 'text' ? kept : {}), ...base, type: 'text', multiline: form.multiline };
      case 'number':
        return { ...(kept?.type === 'number' ? kept : {}), ...base, type: 'number', integer: form.integer };
      case 'currency':
        return { ...DEFAULT_CURRENCY, ...(kept?.type === 'currency' ? kept : {}), ...base, type: 'currency' };
      case 'percent':
        return {
          precision: DEFAULT_PERCENT_PRECISION,
          ...(kept?.type === 'percent' ? kept : {}),
          ...base,
          type: 'percent',
        };
      case 'boolean':
        return { ...base, type: 'boolean' };
      case 'date':
      case 'datetime':
        return { ...(kept?.type === form.type ? kept : {}), ...base, type: form.type };
      case 'select': {
        const keys = toOptionKeys(form.options);
        return {
          ...base,
          type: 'select',
          multiple: form.multiple,
          options: form.options.map((option, index) => ({ key: keys[index] as string, label: option.label.trim() })),
        };
      }
      case 'status': {
        const keys = toOptionKeys(form.options);
        return {
          ...base,
          type: 'status',
          options: form.options.map((option, index) => ({
            key: keys[index] as string,
            label: option.label.trim(),
            color: option.color || DEFAULT_STATUS_COLOR,
            order: index,
          })),
        };
      }
      default:
        // Tipo não editável aqui: só rótulo/obrigatoriedade mudam.
        if (!original) throw new Error(`campo ${fieldId} de tipo ${form.type} sem definição original`);
        return { ...original, label: base.label, required: base.required };
    }
  });
};

// ---------------------------------------------------------------------------
// Plano de migração (mudanças destrutivas)
// ---------------------------------------------------------------------------

// Pra onde os valores de um campo removido/com tipo trocado podem ir: outro
// campo da nova versão com o MESMO tipo do campo antigo (o valor é movido
// como está, sem conversão).
export const mapFieldTargets = (change: DestructiveChange, originals: FieldDef[], next: FieldDef[]): FieldDef[] => {
  const oldType = originals.find((def) => def.fieldId === change.fieldId)?.type;
  return next.filter((def) => def.fieldId !== change.fieldId && def.type === oldType);
};

// Opções que continuam existindo no campo, pra onde as removidas podem ir.
export const remainingOptions = (
  change: DestructiveChange,
  next: FieldDef[],
): Array<{ key: string; label: string }> => {
  const def = next.find((candidate) => candidate.fieldId === change.fieldId);
  return def?.type === 'select' || def?.type === 'status' ? def.options : [];
};

const isActionComplete = (change: DestructiveChange, action: MigrationAction | undefined): boolean => {
  if (!action) return false;
  if (action.action === 'mapField') return action.toFieldId.length > 0;
  if (action.action === 'mapOptions') {
    return change.reason === 'optionRemoved' && change.removedOptions.every((key) => !!action.mapping[key]);
  }
  return true;
};

export const isPlanComplete = (changes: DestructiveChange[], plan: Partial<MigrationPlan>): boolean =>
  changes.every((change) => isActionComplete(change, plan[change.fieldId]));

// Só as entradas das mudanças atuais — escolhas feitas pra uma mudança que
// o admin já desfez no formulário não vão pro back-end.
export const toMigrationPlan = (changes: DestructiveChange[], plan: Partial<MigrationPlan>): MigrationPlan =>
  Object.fromEntries(changes.map((change) => [change.fieldId, plan[change.fieldId] as MigrationAction]));
