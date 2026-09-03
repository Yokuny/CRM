import type { Role } from '@crm/contracts';
import { queryOptions } from '@tanstack/react-query';
import { get } from '../lib/api/client.api.js';

// Espelha SessionView de apps/crm-api/src/services/auth.service.ts — a
// verdade fica no back-end; este tipo só descreve o que a tela consome.
export type SessionView = {
  tenant?: { id: string; name: string; status: string };
  user: { id: string; name: string; email: string };
  role: Role[];
};

export const sessionKeys = {
  all: ['session'] as const,
  detail: () => [...sessionKeys.all, 'detail'] as const,
};

// staleTime > 0: o guard de rota (_private.tsx, T30) chama
// ensureQueryData(sessionQuery) em todo beforeLoad — sem staleTime a sessão
// seria refeita a cada navegação privada. retry:false: uma sessão inválida
// deve falhar na primeira tentativa, nunca re-tentar e atrasar o redirect
// (Tech Decisions: guarda de rota sem loop).
export const sessionQuery = queryOptions({
  queryKey: sessionKeys.detail(),
  queryFn: async (): Promise<SessionView> => {
    const res = await get<SessionView>('/auth/session');
    if (!res.success || !res.data) {
      throw new Error(res.message ?? 'Sessão inválida.');
    }
    return res.data;
  },
  staleTime: 60_000,
  retry: false,
});
