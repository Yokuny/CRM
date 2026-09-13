import {
  cancelAppointmentSchema,
  createAppointmentSchema,
  createBlockSchema,
  idSchema,
  markAttendanceSchema,
  rescheduleAppointmentSchema,
} from '@crm/contracts';
import type { RequestHandler } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import * as appointmentController from '../controllers/appointment.controller.js';
import { checkRole } from '../middlewares/authorization.middleware.js';
import { tenantAssignmentCheck } from '../middlewares/tenantAssign.middleware.js';
import { validBody, validParams } from '../middlewares/validation.middleware.js';

// spec.md SCH-07: mesmo canOperate já usado em product.router.ts/order.router.ts.
const canOperate = checkRole(['admin', 'gestor', 'operador']);

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 42;

const blockIdParamSchema = z.object({ id: idSchema }).strict();
const appointmentIdParamSchema = z.object({ id: idSchema }).strict();

// SCH-29: `from`/`to` em hora de exibição (`to` EXCLUSIVO, design.md);
// `professional`/`space` opcionais. Faixa > 42 dias -> 400 aqui mesmo, antes
// de qualquer conversão pra UTC ou consulta ao banco.
const listAppointmentsQuerySchema = z
  .object({
    from: z.string().regex(DATE_REGEX, 'from inválida (YYYY-MM-DD)'),
    to: z.string().regex(DATE_REGEX, 'to inválida (YYYY-MM-DD)'),
    professional: idSchema.optional(),
    space: idSchema.optional(),
  })
  .strict()
  .refine(
    (query) => {
      const fromMs = Date.parse(`${query.from}T00:00:00.000Z`);
      const toMs = Date.parse(`${query.to}T00:00:00.000Z`);
      return toMs - fromMs <= MAX_RANGE_DAYS * 24 * 60 * 60 * 1000;
    },
    { message: `faixa de datas maior que ${MAX_RANGE_DAYS} dias`, path: ['to'] },
  );

const upcomingQuerySchema = z.object({ customer: idSchema }).strict();

// Mesmo workaround de validListOrdersQuery (order.router.ts): no Express 5,
// req.query é um getter sem cache — Object.assign de validQuery/
// validation.middleware.ts se perde antes do controller ler de novo. Aqui
// req.query é substituído por um valor gravável de fato.
const buildValidQuery = (schema: z.ZodType): RequestHandler => {
  return (req, _res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const message = result.error.issues
        .map((issue) => `${issue.path.join('.') || 'query'}: ${issue.message}`)
        .join('; ');
      next(Object.assign(new Error(message), { status: 400 }));
      return;
    }
    Object.defineProperty(req, 'query', { value: result.data, configurable: true, enumerable: true, writable: true });
    next();
  };
};

const validListAppointmentsQuery = buildValidQuery(listAppointmentsQuerySchema);
const validUpcomingQuery = buildValidQuery(upcomingQuerySchema);

export type AppointmentRouterDeps = { validToken: RequestHandler };

export const createAppointmentRouter = (deps: AppointmentRouterDeps): Router => {
  const router = Router();

  router.get(
    '/',
    deps.validToken,
    tenantAssignmentCheck,
    canOperate,
    validListAppointmentsQuery,
    appointmentController.listAppointments,
  );

  router.get(
    '/upcoming',
    deps.validToken,
    tenantAssignmentCheck,
    canOperate,
    validUpcomingQuery,
    appointmentController.getUpcoming,
  );

  router.post(
    '/',
    deps.validToken,
    tenantAssignmentCheck,
    canOperate,
    validBody(createAppointmentSchema),
    appointmentController.createAppointment,
  );

  router.post(
    '/blocks',
    deps.validToken,
    tenantAssignmentCheck,
    canOperate,
    validBody(createBlockSchema),
    appointmentController.createBlock,
  );

  router.delete(
    '/blocks/:id',
    deps.validToken,
    tenantAssignmentCheck,
    canOperate,
    validParams(blockIdParamSchema),
    appointmentController.deleteBlock,
  );

  router.post(
    '/:id/cancel',
    deps.validToken,
    tenantAssignmentCheck,
    canOperate,
    validParams(appointmentIdParamSchema),
    validBody(cancelAppointmentSchema),
    appointmentController.cancelAppointment,
  );

  router.post(
    '/:id/reschedule',
    deps.validToken,
    tenantAssignmentCheck,
    canOperate,
    validParams(appointmentIdParamSchema),
    validBody(rescheduleAppointmentSchema),
    appointmentController.rescheduleAppointment,
  );

  router.post(
    '/:id/attendance',
    deps.validToken,
    tenantAssignmentCheck,
    canOperate,
    validParams(appointmentIdParamSchema),
    validBody(markAttendanceSchema),
    appointmentController.markAttendance,
  );

  router.post(
    '/:id/confirmation-link',
    deps.validToken,
    tenantAssignmentCheck,
    canOperate,
    validParams(appointmentIdParamSchema),
    appointmentController.requestConfirmationLink,
  );

  return router;
};
