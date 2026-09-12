import type { ZodType } from 'zod';
import { acceptInviteSchema } from './schemas/acceptInvite.schema.js';
import { bumpFieldTemplateSchema } from './schemas/bumpFieldTemplate.schema.js';
import { cancelAppointmentSchema } from './schemas/cancelAppointment.schema.js';
import { createAppointmentSchema } from './schemas/createAppointment.schema.js';
import { createAsaasIntegrationSchema } from './schemas/createAsaasIntegration.schema.js';
import { createBlockSchema } from './schemas/createBlock.schema.js';
import { createChannelSchema } from './schemas/createChannel.schema.js';
import { createCustomerSchema } from './schemas/createCustomer.schema.js';
import { createFieldTemplateSchema } from './schemas/createFieldTemplate.schema.js';
import { createInviteSchema } from './schemas/createInvite.schema.js';
import { createProcessSchema } from './schemas/createProcess.schema.js';
import { createProductSchema } from './schemas/createProduct.schema.js';
import {
  createProfessionalSchema,
  scheduleWindowSchema,
  weeklyScheduleSchema,
} from './schemas/createProfessional.schema.js';
import { createSpaceSchema } from './schemas/createSpace.schema.js';
import { fieldDefSchema } from './schemas/fieldDef.schema.js';
import { findOrCreateCustomerInputSchema } from './schemas/findOrCreateCustomerInput.schema.js';
import { getProcessTemplateInputSchema } from './schemas/getProcessTemplateInput.schema.js';
import { idSchema } from './schemas/id.schema.js';
import { inviteTokenParamSchema } from './schemas/inviteToken.schema.js';
import { markAttendanceSchema } from './schemas/markAttendance.schema.js';
import { migrationActionSchema } from './schemas/migrationAction.schema.js';
import { openProcessInputSchema } from './schemas/openProcessInput.schema.js';
import { provisionTenantSchema } from './schemas/provisionTenant.schema.js';
import { rejectOrderSchema } from './schemas/rejectOrder.schema.js';
import { rescheduleAppointmentSchema } from './schemas/rescheduleAppointment.schema.js';
import { sendMessageSchema } from './schemas/sendMessage.schema.js';
import { setProcessFieldsInputSchema } from './schemas/setProcessFieldsInput.schema.js';
import { signinSchema } from './schemas/signin.schema.js';
import { updateCustomerSchema } from './schemas/updateCustomer.schema.js';
import { updateProcessStageSchema } from './schemas/updateProcessStage.schema.js';
import { updateProcessValuesSchema } from './schemas/updateProcessValues.schema.js';
import { updateProductSchema } from './schemas/updateProduct.schema.js';
import { updateProfessionalSchema } from './schemas/updateProfessional.schema.js';
import { updateSchedulingSettingsSchema } from './schemas/updateSchedulingSettings.schema.js';
import { updateSpaceSchema } from './schemas/updateSpace.schema.js';

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
  { name: 'createAsaasIntegrationSchema', schema: createAsaasIntegrationSchema },
  { name: 'createChannelSchema', schema: createChannelSchema },
  { name: 'createCustomerSchema', schema: createCustomerSchema },
  { name: 'updateCustomerSchema', schema: updateCustomerSchema },
  { name: 'createProcessSchema', schema: createProcessSchema },
  { name: 'createProductSchema', schema: createProductSchema },
  { name: 'updateProductSchema', schema: updateProductSchema },
  { name: 'createProfessionalSchema', schema: createProfessionalSchema },
  { name: 'updateProfessionalSchema', schema: updateProfessionalSchema },
  { name: 'scheduleWindowSchema', schema: scheduleWindowSchema },
  { name: 'weeklyScheduleSchema', schema: weeklyScheduleSchema },
  { name: 'createSpaceSchema', schema: createSpaceSchema },
  { name: 'updateSpaceSchema', schema: updateSpaceSchema },
  { name: 'updateSchedulingSettingsSchema', schema: updateSchedulingSettingsSchema },
  { name: 'createAppointmentSchema', schema: createAppointmentSchema },
  { name: 'rescheduleAppointmentSchema', schema: rescheduleAppointmentSchema },
  { name: 'cancelAppointmentSchema', schema: cancelAppointmentSchema },
  { name: 'markAttendanceSchema', schema: markAttendanceSchema },
  { name: 'createBlockSchema', schema: createBlockSchema },
  { name: 'rejectOrderSchema', schema: rejectOrderSchema },
  { name: 'sendMessageSchema', schema: sendMessageSchema },
  { name: 'updateProcessValuesSchema', schema: updateProcessValuesSchema },
  { name: 'updateProcessStageSchema', schema: updateProcessStageSchema },
  { name: 'getProcessTemplateInputSchema', schema: getProcessTemplateInputSchema },
  { name: 'findOrCreateCustomerInputSchema', schema: findOrCreateCustomerInputSchema },
  { name: 'openProcessInputSchema', schema: openProcessInputSchema },
  { name: 'setProcessFieldsInputSchema', schema: setProcessFieldsInputSchema },
];
