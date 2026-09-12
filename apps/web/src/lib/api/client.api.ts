import type { ApiResponse } from '@crm/contracts';

// Sem access token/Zustand (AD-014) — a única credencial é o cookie httpOnly
// que o próprio navegador anexa via credentials:'include'. Porte simplificado
// de ../DentalEase/DentalEase/src/lib/api/client.api.ts, sem o ramo de
// `authorization` header (não existe access token aqui).
const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

const CONNECTION_ERROR_MESSAGE = 'Não foi possível conectar ao servidor. Tente novamente.';

// Nunca lança: falha de rede vira um ApiResponse com success:false, para que
// toda tela leia `message` sem precisar de try/catch (FND-10/AC4).
export const request = async <T>(path: string, method: Method, body?: unknown): Promise<ApiResponse<T>> => {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return (await res.json()) as ApiResponse<T>;
  } catch {
    return { success: false, message: CONNECTION_ERROR_MESSAGE };
  }
};

export const get = <T>(path: string): Promise<ApiResponse<T>> => request<T>(path, 'GET');
export const post = <T>(path: string, body?: unknown): Promise<ApiResponse<T>> => request<T>(path, 'POST', body);
export const patch = <T>(path: string, body?: unknown): Promise<ApiResponse<T>> => request<T>(path, 'PATCH', body);
// T36 (scheduling): PUT /scheduling-settings (schedulingSettings.router.ts) é
// o primeiro endpoint deste app a usar PUT — os demais recursos usam
// PATCH (edição parcial) porque têm um id (`/professionals/:id`); scheduling
// settings é um único documento por tenant, sem id, então o back-end usa PUT
// (substituição do único recurso), não PATCH.
export const put = <T>(path: string, body?: unknown): Promise<ApiResponse<T>> => request<T>(path, 'PUT', body);
// T37 (scheduling): DELETE /appointments/blocks/:id (appointment.router.ts) é
// o primeiro endpoint deste app a usar DELETE — sem corpo, mesmo padrão de
// `get`. `delete` é palavra reservada, não pode nomear um binding
// (`export const delete = ...`), daí `del`.
export const del = <T>(path: string): Promise<ApiResponse<T>> => request<T>(path, 'DELETE');

// T42 (scheduling): a página pública de confirmação (`_public/appointment`)
// precisa distinguir 404 (link inválido) de 410 (expirado) — o único caso do
// app que depende do STATUS HTTP em si, não só do corpo `{success,message}`
// (errorHandler.middleware.ts sempre devolve o mesmo formato de corpo pra
// qualquer status 4xx/5xx). Função própria, não uma mudança em `request`/
// `get`: alterar o retorno de `get` quebraria os testes existentes que fazem
// `toEqual` estrito no shape de `ApiResponse` (client.api.unit.test.ts).
export type ApiResponseWithStatus<T> = ApiResponse<T> & { status: number };

export const getWithStatus = async <T>(path: string): Promise<ApiResponseWithStatus<T>> => {
  try {
    const res = await fetch(`${BASE_URL}${path}`, { method: 'GET', credentials: 'include' });
    const body = (await res.json()) as ApiResponse<T>;
    return { ...body, status: res.status };
  } catch {
    return { success: false, message: CONNECTION_ERROR_MESSAGE, status: 0 };
  }
};
