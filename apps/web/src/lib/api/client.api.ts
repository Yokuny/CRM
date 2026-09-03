import type { ApiResponse } from '@crm/contracts';

// Sem access token/Zustand (AD-014) — a única credencial é o cookie httpOnly
// que o próprio navegador anexa via credentials:'include'. Porte simplificado
// de ../DentalEase/DentalEase/src/lib/api/client.api.ts, sem o ramo de
// `authorization` header (não existe access token aqui).
const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

type Method = 'GET' | 'POST';

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
