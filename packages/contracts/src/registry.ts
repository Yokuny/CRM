import type { ZodType } from 'zod';
import { acceptInviteSchema } from './schemas/acceptInvite.schema.js';
import { bumpFieldTemplateSchema } from './schemas/bumpFieldTemplate.schema.js';
import { createCustomerSchema } from './schemas/createCustomer.schema.js';
import { createFieldTemplateSchema } from './schemas/createFieldTemplate.schema.js';
import { createInviteSchema } from './schemas/createInvite.schema.js';
import { createProcessSchema } from './schemas/createProcess.schema.js';
import { fieldDefSchema } from './schemas/fieldDef.schema.js';
import { idSchema } from './schemas/id.schema.js';
import { inviteTokenParamSchema } from './schemas/inviteToken.schema.js';
import { migrationActionSchema } from './schemas/migrationAction.schema.js';
import { provisionTenantSchema } from './schemas/provisionTenant.schema.js';
import { signinSchema } from './schemas/signin.schema.js';
import { updateCustomerSchema } from './schemas/updateCustomer.schema.js';
import { updateProcessStageSchema } from './schemas/updateProcessStage.schema.js';
import { updateProcessValuesSchema } from './schemas/updateProcessValues.schema.js';

export const TENANT_FORBIDDEN_KEYS = [
  'tenant',
  'tenantid',
  'tenant_id',
  'orgid',
  'org_id',
  'clinic',
  'company',
] as const;

// T25 (teste estrutural) descobriu que idSchema e inviteTokenParamSchema —
// já existentes desde T5, também exportados de um *.schema.ts — nunca tinham
// sido registrados aqui. É exatamente o gap que a varredura estrutural
// existe para pegar (design.md, Risk "registry dá falso verde"); corrigido
// junto com o teste que o descobriu.
export const schemaRegistry: ReadonlyArray<{ name: string; schema: ZodType }> = [
  { name: 'provisionTenantSchema', schema: provisionTenantSchema },
  { name: 'createInviteSchema', schema: createInviteSchema },
  { name: 'acceptInviteSchema', schema: acceptInviteSchema },
  { name: 'signinSchema', schema: signinSchema },
  { name: 'idSchema', schema: idSchema },
  { name: 'inviteTokenParamSchema', schema: inviteTokenParamSchema },
  { name: 'fieldDefSchema', schema: fieldDefSchema },
  { name: 'migrationActionSchema', schema: migrationActionSchema },
  { name: 'createFieldTemplateSchema', schema: createFieldTemplateSchema },
  { name: 'bumpFieldTemplateSchema', schema: bumpFieldTemplateSchema },
  { name: 'createCustomerSchema', schema: createCustomerSchema },
  { name: 'updateCustomerSchema', schema: updateCustomerSchema },
  { name: 'createProcessSchema', schema: createProcessSchema },
  { name: 'updateProcessValuesSchema', schema: updateProcessValuesSchema },
  { name: 'updateProcessStageSchema', schema: updateProcessStageSchema },
];
