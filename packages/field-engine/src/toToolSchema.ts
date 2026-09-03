import type { FieldDef } from '@crm/contracts';

export type JsonSchema = {
  type: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean';
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
  enum?: string[];
  format?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
};

const OBJECT_ID_JSON_PATTERN = '^[0-9a-fA-F]{24}$';

const documentJsonSchema: JsonSchema = {
  type: 'object',
  properties: {
    assetId: { type: 'string' },
    filename: { type: 'string' },
    mime: { type: 'string' },
    size: { type: 'integer' },
  },
  required: ['assetId', 'filename', 'mime', 'size'],
  additionalProperties: false,
};

const objectSchema = (fields: FieldDef[]): JsonSchema => {
  const required = fields.filter((field) => field.required).map((field) => field.fieldId);
  const schema: JsonSchema = {
    type: 'object',
    properties: Object.fromEntries(fields.map((field) => [field.fieldId, nodeSchema(field)])),
    additionalProperties: false,
  };
  if (required.length > 0) schema.required = required;
  return schema;
};

const listOrSingle = (schema: JsonSchema, multiple: boolean | undefined): JsonSchema =>
  multiple ? { type: 'array', items: schema } : schema;

// Mapeamento recursivo escrito à mão (sem lib externa) — mesma travessia de
// `validate`. Nada aqui inventa campo: cada propriedade sai de um FieldDef
// declarado pelo tenant, então nenhum campo de plataforma (Tenant) entra no
// schema que vai para o modelo (AD-004/AD-010).
const nodeSchema = (def: FieldDef): JsonSchema => {
  switch (def.type) {
    case 'text': {
      const schema: JsonSchema = { type: 'string', description: def.label };
      if (def.minLength !== undefined) schema.minLength = def.minLength;
      if (def.maxLength !== undefined) schema.maxLength = def.maxLength;
      if (def.pattern !== undefined) schema.pattern = def.pattern;
      return schema;
    }
    case 'number': {
      const schema: JsonSchema = { type: def.integer ? 'integer' : 'number', description: def.label };
      if (def.min !== undefined) schema.minimum = def.min;
      if (def.max !== undefined) schema.maximum = def.max;
      return schema;
    }
    case 'currency':
      return { type: 'integer', description: `${def.label} (inteiro em centavos, ${def.code})` };
    case 'percent':
      return { type: 'number', description: def.label };
    case 'boolean':
      return { type: 'boolean', description: def.label };
    case 'date':
      return { type: 'string', format: 'date', description: def.label };
    case 'datetime':
      return { type: 'string', format: 'date-time', description: def.label };
    case 'select':
      return listOrSingle(
        { type: 'string', enum: def.options.map((option) => option.key), description: def.label },
        def.multiple,
      );
    case 'status':
      return { type: 'string', enum: def.options.map((option) => option.key), description: def.label };
    case 'document':
      return listOrSingle({ ...documentJsonSchema, description: def.label }, def.multiple);
    case 'reference':
      return listOrSingle(
        { type: 'string', pattern: OBJECT_ID_JSON_PATTERN, description: `${def.label} (${def.target})` },
        def.multiple,
      );
    case 'array':
      return { type: 'array', items: nodeSchema(def.of), description: def.label };
    case 'group':
      return { ...objectSchema(def.fields), description: def.label };
  }
};

export const toToolSchema = (fields: FieldDef[]): JsonSchema => objectSchema(fields);
