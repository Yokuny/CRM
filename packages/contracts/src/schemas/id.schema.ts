import { z } from 'zod';

export const idSchema = z.string().regex(/^[0-9a-f]{24}$/i, 'id inválido');
