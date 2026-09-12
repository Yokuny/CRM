import { Router } from 'express';
import * as appointmentConfirmationController from '../controllers/appointmentConfirmation.controller.js';
import { appointmentConfirmationRateLimit } from '../middlewares/rateLimit.middleware.js';

// Totalmente público — nenhum validToken aqui (mesmo padrão de
// invite.router.ts), e nenhuma rota deste router aceita o identificador do
// agendamento como parâmetro: identificação exclusiva pelo token de
// confirmação (SCH-27).
export const appointmentConfirmationRouter = Router();

appointmentConfirmationRouter.get(
  '/:token',
  appointmentConfirmationRateLimit,
  appointmentConfirmationController.getByToken,
);
appointmentConfirmationRouter.post(
  '/:token/confirm',
  appointmentConfirmationRateLimit,
  appointmentConfirmationController.confirmByToken,
);
appointmentConfirmationRouter.post(
  '/:token/cancel',
  appointmentConfirmationRateLimit,
  appointmentConfirmationController.cancelByToken,
);
