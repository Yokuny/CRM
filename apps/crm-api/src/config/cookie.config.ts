import { env } from './env.config.js';

// Portado literal de DentalEase-BackEnd/src/config/cookie.config.ts.
export const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV !== 'development',
  sameSite: (env.NODE_ENV !== 'development' ? 'none' : 'lax') as 'none' | 'lax',
  path: '/',
  maxAge: 4 * 86400 * 1000,
};

export const clearCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV !== 'development',
  sameSite: (env.NODE_ENV !== 'development' ? 'none' : 'lax') as 'none' | 'lax',
  path: '/',
};
