import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Porte de ../DentalEase/DentalEase/src/lib/utils/cn.util.ts — mesmo
// comportamento (clsx + tailwind-merge resolve classes conflitantes), só o
// caminho do arquivo muda (Tasks: apps/web/src/lib/utils.ts, não
// lib/utils/cn.util.ts).
export const cn = (...inputs: ClassValue[]) => {
  return twMerge(clsx(inputs));
};
