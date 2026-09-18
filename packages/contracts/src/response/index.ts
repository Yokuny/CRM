import type { ApiMessageKey } from './messages.js';

export * from './messages.js';

// `message` é sempre uma chave de tradução (messages.ts) — o front-end a
// traduz com `t()`. `''` só no sucesso sem mensagem (default de respObj).
export type ApiResponse<T = undefined> = {
  success: boolean;
  data?: T;
  message?: string;
};

export const respObj = <T>(params: { data?: T; message?: ApiMessageKey }): ApiResponse<T> => {
  return { success: true, data: params.data, message: params.message ?? '' };
};

export const badRespObj = (params: { message: ApiMessageKey }): ApiResponse<never> => {
  return { success: false, message: params.message };
};

export const returnData = <T>(data: T): { data: T } => {
  return { data };
};

export const returnMessage = (message: ApiMessageKey): { message: ApiMessageKey } => {
  return { message };
};
