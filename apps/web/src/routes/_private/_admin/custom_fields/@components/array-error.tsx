import { type FieldPath, get, useFormState } from 'react-hook-form';
import type { TemplateForm } from '../@utils/template-form.utils.js';

// Erro de nível de array (min(1), etapas repetidas...) — o zodResolver grava
// em `<path>.root` ou direto em `<path>`, conforme o react-hook-form; mesma
// leitura dupla de kanban/add/index.tsx.
export function ArrayError({ name }: { name: FieldPath<TemplateForm> }) {
  const { errors } = useFormState<TemplateForm>({ name });
  const error = get(errors, name);
  const message: string | undefined = error?.root?.message ?? error?.message;
  return message ? <p className="font-medium text-destructive text-sm">{message}</p> : null;
}
