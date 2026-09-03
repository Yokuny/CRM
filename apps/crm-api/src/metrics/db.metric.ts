import { Histogram } from 'prom-client';

// Latência por operação de banco (FND-17) — reuso do padrão de
// .../src/repositories/user.repository.ts (timer por chamada de
// repositório), com um wrapper único em vez de try/timer/catch repetido em
// cada função — mesmo instrumento, menos boilerplate por repositório.
export const dbReqResTime = new Histogram({
  name: 'db_operation_duration_seconds',
  help: 'Duração das operações de banco em segundos',
  labelNames: ['operation', 'success'],
});

export const withDbTiming = async <T>(operation: string, fn: () => Promise<T>): Promise<T> => {
  const timer = dbReqResTime.startTimer();
  try {
    const result = await fn();
    timer({ operation, success: 'true' });
    return result;
  } catch (e) {
    timer({ operation, success: 'false' });
    throw e;
  }
};
