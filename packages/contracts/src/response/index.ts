export type ApiResponse<T = undefined> = {
  success: boolean;
  data?: T;
  message?: string;
};

export const respObj = <T>(params: { data?: T; message?: string }): ApiResponse<T> => {
  return { success: true, data: params.data, message: params.message ?? '' };
};

export const badRespObj = (params: { message: string }): ApiResponse<never> => {
  return { success: false, message: params.message };
};

export const returnData = <T>(data: T): { data: T } => {
  return { data };
};

export const returnMessage = (message: string): { message: string } => {
  return { message };
};
